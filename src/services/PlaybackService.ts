/**
 * Playback Service
 *
 * Handles session control, VLC playback, and the playback loop.
 * Delegates to VlcClient and PlaylistEngine.
 */

import type { PlaylistEngine } from './PlaylistEngine'
import type { MediaItem, PlaybackStatus, IVlcController } from '../types'

export class PlaybackService {
  private currentVideo: MediaItem | null = null
  private running = false

  constructor(
    private readonly vlc: IVlcController,
    private readonly engine: PlaylistEngine
  ) {}

  // --- Session Info ---

  get isSessionActive(): boolean {
    return this.engine.isSessionActive
  }

  get sessionInfo(): {
    startedAt: Date | null
    limitMinutes: number
    elapsedMs: number
  } {
    return this.engine.sessionInfo
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

    const firstVideo = await this.engine.startSession()
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
  }

  /**
   * Stop playback and end session
   */
  async stop(): Promise<void> {
    await this.vlc.stop()
    await this.engine.endSession()
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
      if (!this.engine.isSessionActive) {
        stoppedCount = 0
        await Bun.sleep(1000)
        continue
      }

      try {
        const status = await this.vlc.getStatus()

        // Check if video finished (stopped or near end)
        const isFinished =
          !status.isPlaying &&
          this.currentVideo &&
          (status.durationSeconds === 0 || // VLC closed/stopped
            status.positionSeconds >= status.durationSeconds - 1) // Near end

        if (isFinished) {
          stoppedCount++
          // Wait for 2 consecutive stopped checks to avoid false triggers
          if (stoppedCount >= 2) {
            const next = await this.engine.getNextVideo()
            if (next) {
              await this.playVideo(next)
              stoppedCount = 0
            } else {
              console.log('Session complete')
            }
          }
        } else {
          stoppedCount = 0
        }
      } catch (error) {
        console.error('Playback loop error:', error)
      }

      await Bun.sleep(500)
    }
  }
}
