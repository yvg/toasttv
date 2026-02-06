/**
 * Playback Service
 *
 * Handles session control, player playback, and the playback loop.
 * Delegates to MpvClient (via IMediaPlayer) and PlaylistEngine.
 */

import type { PlaylistEngine } from './PlaylistEngine'
import type { MediaItem, PlaybackStatus, IMediaPlayer } from '../types'
import type { DashboardEventService } from './DashboardEventService'
import type { ConfigService } from './ConfigService'
import type { IMediaRepository } from '../repositories/IMediaRepository'
import { logger } from '../utils/logger'

export interface PlaybackServiceDeps {
  player: IMediaPlayer
  engine: PlaylistEngine
  config: ConfigService
  media: IMediaRepository
  events?: DashboardEventService
}

export class PlaybackService {
  private currentVideo: MediaItem | null = null
  private running = false
  private offAirMode = false

  private readonly player: IMediaPlayer
  private readonly engine: PlaylistEngine
  private readonly config: ConfigService
  private readonly media: IMediaRepository
  private events?: DashboardEventService

  constructor(deps: PlaybackServiceDeps) {
    this.player = deps.player
    this.engine = deps.engine
    this.config = deps.config
    this.media = deps.media
    this.events = deps.events
  }

  /**
   * Set the event service for SSE dashboard updates.
   * Called by server after daemon creates the base service.
   */
  setEventService(events: DashboardEventService): void {
    this.events = events
  }

  // --- Session Info ---

  get isSessionActive(): boolean {
    return this.engine.isSessionActive
  }

  get isOffAir(): boolean {
    return this.offAirMode
  }

  get sessionInfo(): {
    startedAt: Date | null
    limitMinutes: number
    resetHour: number
    elapsedMs: number
    remainingMs: number
  } {
    return this.engine.sessionInfo
  }

  /**
   * Get daily quota remaining in minutes (null = unlimited)
   */
  get quotaRemainingMinutes(): number | null {
    return this.engine.getQuotaRemainingMinutes()
  }

  /**
   * Check if quota is currently skipped for today
   */
  get isQuotaSkipped(): boolean {
    return this.engine.isQuotaSkipped()
  }

  /**
   * Skip quota for today and exit off-air mode
   */
  async skipQuotaAndResume(): Promise<void> {
    this.engine.skipQuotaForToday()

    if (this.offAirMode) {
      this.offAirMode = false
      await this.player.setLoop(false)

      // Start a fresh session
      const firstVideo = await this.engine.startSession()
      if (firstVideo) {
        await this.playVideo(firstVideo)

        // Broadcast session start for dashboard refresh
        this.events?.broadcast({
          type: 'sessionStart',
          sessionRemainingMs: this.engine.sessionInfo.remainingMs,
          queue: this.peekQueue(10).map((v) => ({
            id: v.id,
            filename: v.filename,
            isInterlude: v.isInterlude,
          })),
        })

        // Pre-queue second video for gapless playback
        const secondVideo = this.engine.peekQueue(1)[0]
        if (secondVideo) {
          await this.player.enqueue(secondVideo.path)
          logger.info(`Pre-queued: ${secondVideo.filename}`)
        }
      }
    } else {
      // If just expired but not yet in off-air loop (rare race), ensure we continue
      this.events?.broadcast({
        type: 'sessionStart',
        sessionRemainingMs: this.engine.sessionInfo.remainingMs,
        queue: this.peekQueue(10).map((v) => ({
          id: v.id,
          filename: v.filename,
          isInterlude: v.isInterlude,
        })),
      })
    }
  }

  // --- Playback Control ---

  /**
   * Start a new viewing session
   */
  async startSession(): Promise<void> {
    if (this.engine.isSessionActive) {
      console.warn('Session already active')
      return
    }

    // Ensure Player loop is disabled for normal session
    await this.player.setLoop(false)

    // Exit off-air mode if active
    this.offAirMode = false

    const firstVideo = await this.engine.startSession()

    // Emit session start event with queue
    this.events?.resetPlayingState()
    const remaining =
      this.engine.sessionInfo.limitMinutes * 60 * 1000 -
      this.engine.sessionInfo.elapsedMs
    const queue = this.peekQueue(10).map((v) => ({
      id: v.id,
      filename: v.filename,
      isInterlude: v.isInterlude,
    }))
    this.events?.broadcast({
      type: 'sessionStart',
      sessionRemainingMs: remaining,
      queue,
    })

    if (firstVideo) {
      await this.playVideo(firstVideo)
    }
  }

  /**
   * End the current session
   */
  async endSession(): Promise<void> {
    await this.engine.endSession()
    await this.player.stop()
    this.events?.resetPlayingState()
    this.events?.broadcast({ type: 'sessionEnd' })
    console.log('Session ended')
  }

  /**
   * Skip to next video
   */
  async skip(): Promise<void> {
    const next = await this.engine.getNextVideo()
    if (next) {
      await this.playVideo(next)
    }
  }

  /**
   * Play next video (used by playback loop)
   */
  async playNext(): Promise<void> {
    const next = await this.engine.getNextVideo()
    if (next) {
      await this.playVideo(next)
    }
  }

  /**
   * Pause playback
   */
  async pause(): Promise<void> {
    await this.player.pause()
    // Check actual state and emit
    const status = await this.player.getStatus()
    this.events?.broadcastPlayingState(status.isPlaying)
  }

  /**
   * Stop playback and end session
   */
  async stop(): Promise<void> {
    await this.player.stop()
    await this.engine.endSession()
    this.offAirMode = false
    this.events?.resetPlayingState()
    this.events?.broadcast({ type: 'sessionEnd' })
  }

  // --- Status ---

  /**
   * Get current playback status from player
   */
  async getStatus(): Promise<PlaybackStatus | null> {
    try {
      return await this.player.getStatus()
    } catch {
      return null
    }
  }

  /**
   * Get upcoming videos in queue
   */
  peekQueue(count = 5): MediaItem[] {
    return this.engine.peekQueue(count)
  }

  /**
   * Alias for peekQueue (legacy)
   */
  getQueue(count = 5): MediaItem[] {
    return this.peekQueue(count)
  }

  /**
   * Shuffle upcoming queue
   */
  async shuffleQueue(): Promise<void> {
    await this.engine.shuffleQueue()
    // Emit queue update
    const queue = this.peekQueue(10).map((v) => ({
      id: v.id,
      filename: v.filename,
      isInterlude: v.isInterlude,
    }))
    this.events?.broadcast({ type: 'queueUpdate', queue })
  }

  /**
   * Get currently playing video
   */
  getCurrentMedia(): MediaItem | null {
    return this.currentVideo
  }

  getSessionInfo() {
    return this.engine.sessionInfo
  }

  // --- Internal ---

  private async playVideo(video: MediaItem): Promise<void> {
    this.currentVideo = video
    await this.player.play(video.path)

    // Refresh logo on each video (MPV clears overlays on track change)
    try {
      const appConfig = await this.config.get()
      if (appConfig.logo) {
        await this.player.updateLogo({
          filePath: appConfig.logo.imagePath,
          opacity: appConfig.logo.opacity,
          position: appConfig.logo.position,
          x: appConfig.logo.x,
          y: appConfig.logo.y,
        })
      }
    } catch (e) {
      logger.error('Failed to apply logo:', e)
    }

    // Emit track start event with updated queue
    const queue = this.peekQueue(10).map((v) => ({
      id: v.id,
      filename: v.filename,
      isInterlude: v.isInterlude,
    }))
    this.events?.broadcast({
      type: 'trackStart',
      trackId: video.id,
      filename: video.filename,
      duration: video.durationSeconds,
      queue,
    })

    // PRE-QUEUE NEXT
    // When manually playing a video (start/skip), we must ensure the NEXT video is queued
    // otherwise player will stop after this one.
    const nextInQueue = this.engine.peekQueue(1)[0]
    if (nextInQueue) {
      await this.player.enqueue(nextInQueue.path)
      logger.info(`Pre-queued (manual play): ${nextInQueue.filename}`)
    } else {
      // If no more videos, try to enqueue off-air loop?
      const appConfig = await this.config.get()
      if (appConfig.session.offAirAssetId) {
        const offAirMedia = await this.media.getById(
          appConfig.session.offAirAssetId
        )
        if (offAirMedia) {
          await this.player.enqueue(offAirMedia.path)
          logger.info(
            `Pre-queued off-air (manual play): ${offAirMedia.filename}`
          )
        }
      }
    }
  }

  // NOTE: "Last video badge" feature removed - runtime logo control not fully supported in simple overlay

  /**
   * Enter off-air mode - play the configured off-air asset on loop
   */
  private async enterOffAirMode(): Promise<void> {
    const appConfig = await this.config.get()
    const offAirAssetId = appConfig.session.offAirAssetId

    if (!offAirAssetId) {
      logger.info('No off-air asset configured, stopping playback')
      await this.player.stop()
      return
    }

    const mediaItem = await this.media.getById(offAirAssetId)
    if (!mediaItem) {
      logger.warn(`Off-air asset ID ${offAirAssetId} not found`)
      await this.player.stop()
      return
    }

    this.offAirMode = true
    this.currentVideo = mediaItem
    logger.info(`Entering off-air mode with: ${mediaItem.filename}`)

    // Play with loop enabled
    await this.player.play(mediaItem.path)
    await this.player.setLoop(true)

    // Broadcast off-air state to frontend
    this.events?.broadcast({
      type: 'sync',
      sessionActive: false,
      isOffAir: true,
      resetHour: this.engine.sessionInfo.resetHour,
      trackId: mediaItem.id,
      filename: mediaItem.filename,
      duration: mediaItem.durationSeconds,
      position: 0,
      isPlaying: true,
      sessionRemainingMs: 0,
      queue: [],
    })
  }

  // --- Lifecycle ---

  /**
   * Connect to player
   */
  async connect(): Promise<void> {
    await this.player.connect()
  }

  /**
   * Disconnect from player
   */
  async disconnect(): Promise<void> {
    await this.player.disconnect()
  }

  /**
   * Start the playback loop (non-blocking)
   */
  startLoop(): void {
    this.running = true
    void this.runPlaybackLoop()
  }

  /**
   * Stop the playback loop
   */
  stopLoop(): void {
    this.running = false
  }

  /**
   * Main playback loop - monitors player and handles track transitions.
   * This is a "Sync Loop" that detects when player auto-advances to the next
   * queued video, then immediately enqueues the following video to maintain
   * a seamless playback buffer.
   */
  private async runPlaybackLoop(): Promise<void> {
    // Track state for transition detection
    let lastPosition = 0
    let disconnectedLogged = false
    let lastIsPlaying = false

    while (this.running) {
      // In off-air mode, just keep looping (player handles the loop)
      if (this.offAirMode) {
        await Bun.sleep(1000)
        continue
      }

      if (!this.engine.isSessionActive) {
        await Bun.sleep(1000)
        continue
      }

      try {
        const status = await this.player.getStatus()
        disconnectedLogged = false // Connection active

        // Detect Pause/Resume changes
        if (status.isPlaying !== lastIsPlaying) {
          // If we have a current video, broadcast the state change
          if (this.currentVideo) {
            this.events?.broadcast({
              type: status.isPlaying ? 'playing' : 'paused',
            })
          }
          lastIsPlaying = status.isPlaying
        }

        // Calculate dynamic "late in video" threshold based on actual video duration
        const expectedDuration = this.currentVideo?.durationSeconds ?? 30
        const lateThreshold = Math.max(expectedDuration * 0.5, 3) // At least 50% through OR 3s minimum

        // Detect track transition by comparing positions.
        // A real transition = position went from "late" to "early" (position reset)
        // OR: Player position exceeds our expected duration (Player auto-advanced)
        const wasLateInVideo = lastPosition > lateThreshold
        const nowEarlyInVideo = status.positionSeconds < 3
        const positionReset =
          wasLateInVideo && nowEarlyInVideo && status.isPlaying

        // Also detect when player jumps beyond our expected video (it moved to next)
        const playerBeyondExpected =
          status.positionSeconds > expectedDuration + 5 && status.isPlaying

        // Detect manual track change via player UI (filename mismatch)
        const fileMismatch =
          status.currentFile &&
          this.currentVideo &&
          status.isPlaying &&
          !decodeURIComponent(status.currentFile).includes(
            this.currentVideo.filename
          )

        const wasPlaying = this.currentVideo !== null

        // If player stopped entirely (not playing, nothing enqueued), session may be over
        if (
          !status.isPlaying &&
          status.state !== 'paused' &&
          wasPlaying &&
          lastPosition > 3
        ) {
          // Wait a moment to confirm player truly stopped (not just buffering between tracks)
          await Bun.sleep(800)
          const recheck = await this.player.getStatus()
          if (!recheck.isPlaying && recheck.state !== 'paused') {
            // Player has stopped - session complete
            logger.info(
              'Player stopped, session complete, entering off-air mode'
            )
            await this.enterOffAirMode()
            lastPosition = 0
            continue
          }
        }

        // Transition detection: position reset OR player beyond expected OR file mismatch
        if (
          (positionReset || playerBeyondExpected || fileMismatch) &&
          status.isPlaying
        ) {
          logger.debug(
            'Loop',
            `Track transition detected (reset=${positionReset}, beyond=${playerBeyondExpected}, mismatch=${fileMismatch})`
          )

          // Advance our internal state
          const next = await this.engine.getNextVideo()

          if (next) {
            // Update internal state to match Player
            this.currentVideo = next
            lastPosition = status.positionSeconds // Reset position tracking
            disconnectedLogged = false

            // Broadcast track change
            const queue = this.peekQueue(10).map((v) => ({
              id: v.id,
              filename: v.filename,
              isInterlude: v.isInterlude,
            }))
            this.events?.broadcast({
              type: 'trackStart',
              trackId: next.id,
              filename: next.filename,
              duration: next.durationSeconds,
              queue,
            })

            // Refresh logo (MPV clears overlays on track change)
            try {
              const appConfig = await this.config.get()
              if (appConfig.logo) {
                await this.player.updateLogo({
                  filePath: appConfig.logo.imagePath,
                  opacity: appConfig.logo.opacity,
                  position: appConfig.logo.position,
                  x: appConfig.logo.x,
                  y: appConfig.logo.y,
                })
              }
            } catch (e) {
              logger.error('Failed to refresh logo:', e)
            }

            // PRE-QUEUE: Immediately enqueue the following video
            const upcoming = this.engine.peekQueue(1)[0]
            if (upcoming) {
              await this.player.enqueue(upcoming.path)
              logger.info(`Pre-queued: ${upcoming.filename}`)
            } else {
              // No more videos - enqueue off-air if available
              const appConfig = await this.config.get()
              if (appConfig.session.offAirAssetId) {
                const offAirMedia = await this.media.getById(
                  appConfig.session.offAirAssetId
                )
                if (offAirMedia) {
                  await this.player.enqueue(offAirMedia.path)
                  logger.info(`Pre-queued off-air: ${offAirMedia.filename}`)
                }
              }
            }
          } else {
            // No next video - enter off-air mode
            logger.info('Session complete, entering off-air mode')
            await this.enterOffAirMode()
          }
        } else {
          // No transition - just update tracking
          lastPosition = status.positionSeconds
        }
      } catch (error: any) {
        const msg = error?.message || String(error)
        const isPlayerError =
          msg.includes('Not connected') || msg.includes('ECONNREFUSED')

        if (isPlayerError) {
          if (!disconnectedLogged) {
            console.error(
              `❌ Player Connection Lost: ${msg}\n   -> Please restart MPV/Player manually to resume playback.`
            )
            disconnectedLogged = true
          }
          await Bun.sleep(5000)
          continue
        }
        logger.error('Playback loop error:', error)
      }

      await Bun.sleep(500)
    }
  }
}
