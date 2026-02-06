/**
 * Playlist Engine - The "Brain" of ToastTV
 *
 * Manages playback sequence: shuffle, interlude injection, session timing.
 */

import type { ConfigRepository } from '../repositories/ConfigRepository'
import type { IMediaRepository } from '../repositories/IMediaRepository'
import type { IDateTimeProvider, MediaItem } from '../types'
import type { SessionManager } from './SessionManager'

import { ShuffleDeck } from '../utils/ShuffleDeck'

interface QueueState {
  queue: MediaItem[]
  showsSinceInterlude: number
  videosPlayed: number
  isQueueComplete: boolean
}

export class SystemDateTimeProvider implements IDateTimeProvider {
  now(): Date {
    return new Date()
  }

  today(): string {
    return new Date().toISOString().split('T')[0] ?? ''
  }
}

export class PlaylistEngine {
  // Queue buffer target for infinite sessions (maintain at least this many items)
  private static readonly QUEUE_BUFFER_SIZE = 5

  private queueState: QueueState = {
    queue: [],
    showsSinceInterlude: 0,
    videosPlayed: 0,
    isQueueComplete: false,
  }

  private cachedVideos: MediaItem[] = []
  private cachedInterludes: MediaItem[] = []
  private cachedSpecialVideos: MediaItem[] = [] // Intro/outro for lookup only
  private deck: ShuffleDeck<MediaItem> | null = null

  // Cache config for synchronous methods
  private cachedConfig = {
    interludeEnabled: true,
    interludeFrequency: 1,
    limitMinutes: 30,
    resetHour: 6,
    introVideoId: null as number | null,
    outroVideoId: null as number | null,
  }

  constructor(
    private readonly config: ConfigRepository,
    private readonly repository: IMediaRepository,
    private readonly session: SessionManager,
    private readonly dateTime: IDateTimeProvider
  ) {}

  get isSessionActive(): boolean {
    return this.session.active
  }

  get sessionInfo(): {
    startedAt: Date | null
    limitMinutes: number
    resetHour: number
    elapsedMs: number
    remainingMs: number
  } {
    const info = this.session.getInfo()
    return {
      startedAt: info.startedAt,
      limitMinutes: info.limitMinutes,
      resetHour: info.resetHour,
      elapsedMs: info.elapsedMs,
      remainingMs: info.remainingMs,
    }
  }

  // --- Quota passthrough methods ---

  getQuotaRemainingMinutes(): number | null {
    return this.session.getRemainingQuota()
  }

  isQuotaSkipped(): boolean {
    return this.session.isQuotaSkipped
  }

  skipQuotaForToday(): void {
    this.session.skipQuotaForToday()
    // If queue was already marked complete due to limit, reopen it
    this.queueState.isQueueComplete = false
  }

  /**
   * Start a new session: Re-rolls the queue completely.
   */
  async startSession(): Promise<MediaItem | null> {
    await this.refreshCache()
    this.resetQueueState()

    // Start session with current config
    this.session.start({
      limitMinutes: this.cachedConfig.limitMinutes,
      resetHour: this.cachedConfig.resetHour,
    })

    // Initialize Deck
    if (this.cachedVideos.length > 0) {
      this.deck = new ShuffleDeck(this.cachedVideos)
    }

    // Generate initial queue
    this.fillQueue()

    console.log('Session started')

    // Pop first item
    return this.popNext()
  }

  async getNextVideo(): Promise<MediaItem | null> {
    if (!this.session.active) return null

    // Refresh config to check for limit changes or frequency changes dynamically
    const appConfig = await this.config.get()
    this.updateCachedConfig(appConfig)

    // Check if session officially ended (time limit reached AND queue empty or just outro left? logic handled in fillQueue)
    // Actually, if queue is empty and isQueueComplete is true, we are done.
    if (this.queueState.queue.length === 0 && this.queueState.isQueueComplete) {
      return this.endSession()
    }

    // Refill queue if needed (for infinite sessions)
    this.fillQueue()

    return this.popNext()
  }

  async endSession(): Promise<MediaItem | null> {
    this.session.end()
    this.queueState.queue = []
    console.log('Session ended')
    return null
  }

  /**
   * Peek at the upcoming queue without advancing state.
   */
  peekQueue(count: number): MediaItem[] {
    return this.queueState.queue.slice(0, count)
  }

  /**
   * Shuffle the FUTURE queue (keep current playing, re-roll rest).
   * Used by Dashboard "Shuffle" button.
   */
  async shuffleQueue(): Promise<void> {
    // Clear current queue
    this.queueState.queue = []
    this.queueState.isQueueComplete = false

    // Reshuffle deck to ensure freshness
    this.deck?.reshuffle()

    // Define what "showsSinceInterlude" should be?
    // Maybe keep it as is, so we don't accidentally skip or double interlude.

    this.fillQueue()
  }

  getCurrentVideo(): MediaItem | null {
    // Managed by daemon since engine only supplies "next"
    return null
  }

  private popNext(): MediaItem | null {
    const next = this.queueState.queue.shift()
    if (next) {
      this.queueState.videosPlayed++
      if (!next.isInterlude) {
        this.queueState.showsSinceInterlude++
      } else {
        // If it's an interlude, we reset the counter
        this.queueState.showsSinceInterlude = 0
      }
      console.log(`Next video: ${next.filename}`)
    }
    return next ?? null
  }

  private resetQueueState(): void {
    this.queueState = {
      queue: [],
      showsSinceInterlude: 0,
      videosPlayed: 0,
      isQueueComplete: false,
    }
  }

  private fillQueue(): void {
    // If we've already marked queue as complete (finite session built), stop.
    if (this.queueState.isQueueComplete) return

    // Calculate current duration of queue
    let queueDuration = this.queueState.queue.reduce(
      (acc, item) => acc + item.durationSeconds,
      0
    )

    // Hard limit to prevent infinite loops if something goes wrong
    const SAFETY_LIMIT = 50
    let added = 0

    while (true) {
      // STOP CONDITIONS

      // 1. Finite Session Limit Reached?
      // If quota is skipped for today, treat as infinite session
      const isEffectivelyInfinite =
        this.session.isQuotaSkipped || this.cachedConfig.limitMinutes === 0
      const limitSeconds = this.cachedConfig.limitMinutes * 60

      if (!isEffectivelyInfinite && queueDuration >= limitSeconds) {
        // We reached the limit!
        // Append Outro if configured
        if (this.cachedConfig.outroVideoId) {
          const outro = this.findCachedItem(this.cachedConfig.outroVideoId)
          if (outro) this.queueState.queue.push(outro)
        }
        this.queueState.isQueueComplete = true
        break
      }

      // 2. Infinite Session Buffer Filled?
      if (
        this.cachedConfig.limitMinutes === 0 &&
        this.queueState.queue.length >= PlaylistEngine.QUEUE_BUFFER_SIZE
      ) {
        break
      }

      // 3. Safety Break
      if (added++ > SAFETY_LIMIT) break

      // GENERATION LOGIC

      // A. Initial Intro (Only at very start) - can work even without deck
      if (
        this.queueState.videosPlayed === 0 &&
        this.queueState.queue.length === 0 &&
        this.cachedConfig.introVideoId
      ) {
        const intro = this.findCachedItem(this.cachedConfig.introVideoId)
        if (intro) {
          this.queueState.queue.push(intro)
          queueDuration += intro.durationSeconds
          continue // Skip standard generation for this slot
        }
      }

      // If no deck (no regular videos), we can only do intro/outro
      if (!this.deck) {
        this.queueState.isQueueComplete = true
        break
      }

      // B. Interlude Due?
      // We need to simulate 'showsSinceInterlude' for the items currently IN THE QUEUE
      // The state.showsSinceInterlude tracks what has *played*.
      // We need to track what is *pending* to insert interludes correctly in the future.
      const virtualShowsSince = this.calculateVirtualShowsSinceInterlude()

      if (
        this.cachedConfig.interludeEnabled &&
        virtualShowsSince >= this.cachedConfig.interludeFrequency
      ) {
        const interlude = this.pickInterlude()
        if (interlude) {
          this.queueState.queue.push(interlude)
          queueDuration += interlude.durationSeconds
          continue
        }
      }

      // C. Standard Video from Deck
      const video = this.deck.draw()
      if (video) {
        this.queueState.queue.push(video)
        queueDuration += video.durationSeconds
      } else {
        // No videos? Stop.
        break
      }
    }
  }

  private calculateVirtualShowsSinceInterlude(): number {
    // Start with actual played state
    let count = this.queueState.showsSinceInterlude

    // Iterate through queue to update count
    for (const item of this.queueState.queue) {
      if (item.isInterlude) {
        count = 0
      } else {
        count++
      }
    }
    return count
  }

  private findCachedItem(id: number): MediaItem | undefined {
    return [
      ...this.cachedVideos,
      ...this.cachedInterludes,
      ...this.cachedSpecialVideos,
    ].find((m) => m.id === id)
  }

  private pickInterlude(): MediaItem | null {
    if (this.cachedInterludes.length === 0) return null
    const index = Math.floor(Math.random() * this.cachedInterludes.length)
    return this.cachedInterludes[index] ?? null
  }

  async refreshCache(): Promise<void> {
    const all = await this.repository.getAll()
    // Exclude interludes, intro, and outro from regular videos (they are handled specially)
    this.cachedVideos = all.filter(
      (m) =>
        !m.isInterlude &&
        m.mediaType !== 'intro' &&
        m.mediaType !== 'outro' &&
        m.mediaType !== 'offair'
    )
    // Special videos (intro/outro) are cached for lookup but not shuffled
    this.cachedSpecialVideos = all.filter(
      (m) => m.mediaType === 'intro' || m.mediaType === 'outro'
    )

    // Filter interludes by SEASON via repo.getInterludes() which handles SQL logic
    this.cachedInterludes = await this.repository.getInterludes(
      this.dateTime.today()
    )

    const appConfig = await this.config.get()
    this.updateCachedConfig(appConfig)

    console.log(
      `Cache refreshed: ${this.cachedVideos.length} videos, ${this.cachedInterludes.length} interludes. Limit=${this.cachedConfig.limitMinutes}m`
    )
  }

  private updateCachedConfig(
    appConfig: import('../repositories/ConfigRepository').AppConfig
  ): void {
    this.cachedConfig = {
      interludeEnabled: appConfig.interlude.enabled,
      interludeFrequency: appConfig.interlude.frequency,
      limitMinutes: appConfig.session.limitMinutes,
      resetHour: appConfig.session.resetHour,
      introVideoId: appConfig.session.introVideoId,
      outroVideoId: appConfig.session.outroVideoId,
    }
  }
}
