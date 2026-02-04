/**
 * Session Manager
 *
 * Owns session lifecycle state: active status, timing, limits.
 * Includes daily quota tracking with configurable reset hour.
 */

import type { IDateTimeProvider } from '../types'

export interface SessionConfig {
  limitMinutes: number
  resetHour: number
}

export interface SessionInfo {
  isActive: boolean
  startedAt: Date | null
  limitMinutes: number
  resetHour: number
  elapsedMs: number
  remainingMs: number
  isExpired: boolean
  // Daily quota info
  minutesWatchedToday: number
  dailyQuotaRemaining: number | null // null = unlimited
}

export class SessionManager {
  private isActive = false
  private startedAt: Date | null = null
  private limitMinutes = 30
  private resetHour = 6

  // Daily quota tracking
  private minutesWatchedToday = 0
  private lastResetDate = ''
  private quotaSkippedForToday = false

  constructor(private readonly dateTime: IDateTimeProvider) {}

  /**
   * Start a new session with the given configuration.
   * Checks for daily reset before starting.
   */
  start(config: SessionConfig): void {
    this.checkAndResetIfNeeded(config.resetHour)

    this.isActive = true
    this.startedAt = this.dateTime.now()
    this.limitMinutes = config.limitMinutes
    this.resetHour = config.resetHour
  }

  /**
   * End the current session.
   * Accumulates watched time to daily quota.
   */
  end(): void {
    if (this.isActive && this.startedAt) {
      const elapsed = this.dateTime.now().getTime() - this.startedAt.getTime()
      const minutes = Math.floor(elapsed / 60000)
      this.addWatchedTime(minutes)
    }

    this.isActive = false
    this.startedAt = null
  }

  /**
   * Check if reset time has passed on a new day and reset quota.
   */
  checkAndResetIfNeeded(resetHour: number): void {
    const now = this.dateTime.now()
    const todayDate = this.getLocalDate(now)
    const currentHour = now.getHours()

    // Determine the "quota date" - which day's quota we're using
    // Before reset hour: still using yesterday's quota
    // After reset hour: using today's quota
    const quotaDate =
      currentHour >= resetHour ? todayDate : this.getPreviousDate(todayDate)

    if (this.lastResetDate !== quotaDate) {
      this.minutesWatchedToday = 0
      this.lastResetDate = quotaDate
      this.quotaSkippedForToday = false // Reset skip flag on new quota day
    }
  }

  /**
   * Add watched time to daily quota.
   */
  addWatchedTime(minutes: number): void {
    this.minutesWatchedToday += minutes
  }

  /**
   * Get remaining daily quota in minutes.
   * Returns null for unlimited sessions (limitMinutes = 0).
   */
  getRemainingQuota(): number | null {
    if (this.limitMinutes === 0) return null
    return Math.max(0, this.limitMinutes - this.minutesWatchedToday)
  }

  /**
   * Check if daily quota is exhausted.
   */
  get quotaExhausted(): boolean {
    if (this.quotaSkippedForToday) return false
    if (this.limitMinutes === 0) return false
    return this.minutesWatchedToday >= this.limitMinutes
  }

  /**
   * Skip quota limit for the rest of today.
   * Flag resets automatically at next daily reset.
   */
  skipQuotaForToday(): void {
    this.quotaSkippedForToday = true
  }

  /**
   * Check if quota is currently skipped for today.
   */
  get isQuotaSkipped(): boolean {
    return this.quotaSkippedForToday
  }

  /**
   * Get current session information.
   */
  getInfo(): SessionInfo {
    const now = this.dateTime.now()
    const elapsedMs = this.startedAt
      ? now.getTime() - this.startedAt.getTime()
      : 0

    const limitMs = this.limitMinutes * 60 * 1000
    const remainingMs =
      limitMs > 0 ? Math.max(0, limitMs - elapsedMs) : Infinity
    const isExpired = this.limitMinutes > 0 && elapsedMs >= limitMs

    return {
      isActive: this.isActive,
      startedAt: this.startedAt,
      limitMinutes: this.limitMinutes,
      resetHour: this.resetHour,
      elapsedMs,
      remainingMs,
      isExpired,
      minutesWatchedToday: this.minutesWatchedToday,
      dailyQuotaRemaining: this.getRemainingQuota(),
    }
  }

  /**
   * Check if session is currently active.
   */
  get active(): boolean {
    return this.isActive
  }

  /**
   * Check if the session has exceeded its time limit.
   * Returns false for infinite sessions (limitMinutes = 0).
   */
  get expired(): boolean {
    if (!this.isActive || !this.startedAt || this.limitMinutes === 0) {
      return false
    }
    const elapsed = this.dateTime.now().getTime() - this.startedAt.getTime()
    return elapsed >= this.limitMinutes * 60 * 1000
  }

  // --- Private helpers ---

  private getLocalDate(date: Date): string {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  private getPreviousDate(dateStr: string): string {
    const date = new Date(dateStr)
    date.setDate(date.getDate() - 1)
    return this.getLocalDate(date)
  }
}
