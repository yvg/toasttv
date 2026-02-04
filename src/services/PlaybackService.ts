/**
 * Playback Service
 *
 * Handles session control, VLC playback, and the playback loop.
 * Delegates to VlcClient and PlaylistEngine.
 */

import type { PlaylistEngine } from './PlaylistEngine'
import type { MediaItem, PlaybackStatus, IVlcController } from '../types'
import type { DashboardEventService } from './DashboardEventService'
import type { ConfigService } from './ConfigService'
import type { IMediaRepository } from '../repositories/IMediaRepository'
import { logger } from '../utils/logger'

export interface PlaybackServiceDeps {
  vlc: IVlcController
  engine: PlaylistEngine
  config: ConfigService
  media: IMediaRepository
  events?: DashboardEventService
}

export class PlaybackService {
  private currentVideo: MediaItem | null = null
  private running = false
  private offAirMode = false

  private readonly vlc: IVlcController
  private readonly engine: PlaylistEngine
  private readonly config: ConfigService
  private readonly media: IMediaRepository
  private readonly events?: DashboardEventService

  constructor(deps: PlaybackServiceDeps) {
    this.vlc = deps.vlc
    this.engine = deps.engine
    this.config = deps.config
    this.media = deps.media
    this.events = deps.events
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
      await this.vlc.setLoop(false)

      // Start a fresh session
      const firstVideo = await this.engine.startSession()
      if (firstVideo) {
        await this.playVideo(firstVideo)
      }
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

    // Ensure VLC loop is disabled for normal session
    await this.vlc.setLoop(false)

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
    await this.vlc.stop()
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
    await this.vlc.pause()
    // Check actual state and emit
    const status = await this.vlc.getStatus()
    this.events?.broadcastPlayingState(status.isPlaying)
  }

  /**
   * Stop playback and end session
   */
  async stop(): Promise<void> {
    await this.vlc.stop()
    await this.engine.endSession()
    this.offAirMode = false
    this.events?.resetPlayingState()
    this.events?.broadcast({ type: 'sessionEnd' })
  }

  // --- Status ---

  /**
   * Get current playback status from VLC
   */
  async getStatus(): Promise<PlaybackStatus | null> {
    try {
      return await this.vlc.getStatus()
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
    await this.vlc.play(video.path)

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
  }

  /**
   * Enter off-air mode - play the configured off-air asset on loop
   */
  private async enterOffAirMode(): Promise<void> {
    const appConfig = await this.config.get()
    const offAirAssetId = appConfig.session.offAirAssetId

    if (!offAirAssetId) {
      logger.info('No off-air asset configured, stopping playback')
      await this.vlc.stop()
      return
    }

    const mediaItem = await this.media.getById(offAirAssetId)
    if (!mediaItem) {
      logger.warn(`Off-air asset ID ${offAirAssetId} not found`)
      await this.vlc.stop()
      return
    }

    this.offAirMode = true
    this.currentVideo = mediaItem
    logger.info(`Entering off-air mode with: ${mediaItem.filename}`)

    // Play with loop enabled
    await this.vlc.play(mediaItem.path)
    await this.vlc.setLoop(true)

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
   * Connect to VLC
   */
  async connect(): Promise<void> {
    await this.vlc.connect()
  }

  /**
   * Disconnect from VLC
   */
  async disconnect(): Promise<void> {
    await this.vlc.disconnect()
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
   * Main playback loop - monitors VLC and advances to next video
   */
  private async runPlaybackLoop(): Promise<void> {
    let stoppedCount = 0

    while (this.running) {
      // In off-air mode, just keep looping (VLC handles the loop)
      if (this.offAirMode) {
        await Bun.sleep(1000)
        continue
      }

      if (!this.engine.isSessionActive) {
        stoppedCount = 0
        await Bun.sleep(1000)
        continue
      }

      try {
        const status = await this.vlc.getStatus()

        // Video finished = not playing and we expected something to be playing
        const isFinished = !status.isPlaying && this.currentVideo !== null

        if (isFinished) {
          stoppedCount++
          logger.debug('Loop', `stopped count=${stoppedCount}`)

          // Wait for 2 consecutive checks to avoid brief pauses
          if (stoppedCount >= 2) {
            logger.debug('Loop', 'advancing to next video')
            const next = await this.engine.getNextVideo()
            if (next) {
              await this.playVideo(next)
              stoppedCount = 0
            } else {
              // Session complete - enter off-air mode
              logger.info('Session complete, entering off-air mode')
              await this.enterOffAirMode()
              stoppedCount = 0
            }
          }
        } else {
          stoppedCount = 0
        }
      } catch (error) {
        logger.error('Playback loop error:', error)
      }

      await Bun.sleep(500)
    }
  }
}
