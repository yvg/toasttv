/**
 * Session Manager
 * 
 * Owns session lifecycle state: active status, timing, limits.
 * Separates session concerns from queue generation (PlaylistEngine).
 */

import type { IDateTimeProvider } from '../types'

export interface SessionConfig {
  limitMinutes: number
}

export interface SessionInfo {
  isActive: boolean
  startedAt: Date | null
  limitMinutes: number
  elapsedMs: number
  remainingMs: number
  isExpired: boolean
}

export class SessionManager {
  private isActive = false
  private startedAt: Date | null = null
  private limitMinutes = 30

  constructor(
    private readonly dateTime: IDateTimeProvider
  ) {}

  /**
   * Start a new session with the given configuration.
   */
  start(config: SessionConfig): void {
    this.isActive = true
    this.startedAt = this.dateTime.now()
    this.limitMinutes = config.limitMinutes
  }

  /**
   * End the current session.
   */
  end(): void {
    this.isActive = false
    this.startedAt = null
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
    const remainingMs = limitMs > 0 ? Math.max(0, limitMs - elapsedMs) : Infinity
    const isExpired = this.limitMinutes > 0 && elapsedMs >= limitMs

    return {
      isActive: this.isActive,
      startedAt: this.startedAt,
      limitMinutes: this.limitMinutes,
      elapsedMs,
      remainingMs,
      isExpired,
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
}
