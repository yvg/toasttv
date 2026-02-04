/**
 * SessionManager Tests
 *
 * Tests for session lifecycle management.
 */

import { describe, expect, test, beforeEach } from 'bun:test'
import { mock, type MockProxy } from 'jest-mock-extended'
import { SessionManager } from '../src/services/SessionManager'
import type { IDateTimeProvider } from '../src/types'

describe('SessionManager', () => {
  let dateTime: MockProxy<IDateTimeProvider>
  let manager: SessionManager
  let currentTime: Date

  // Helper to simulate time passing
  const advanceTime = (ms: number) => {
    currentTime = new Date(currentTime.getTime() + ms)
    dateTime.now.mockReturnValue(currentTime)
    dateTime.today.mockReturnValue(
      currentTime.toISOString().split('T')[0] ?? ''
    )
  }

  const setTime = (date: Date) => {
    currentTime = date
    dateTime.now.mockReturnValue(currentTime)
    dateTime.today.mockReturnValue(
      currentTime.toISOString().split('T')[0] ?? ''
    )
  }

  beforeEach(() => {
    dateTime = mock<IDateTimeProvider>()
    const start = new Date('2026-02-03T10:00:00Z')
    setTime(start)
    manager = new SessionManager(dateTime)
  })

  test('starts inactive', () => {
    expect(manager.active).toBe(false)
    expect(manager.expired).toBe(false)

    const info = manager.getInfo()
    expect(info.isActive).toBe(false)
    expect(info.startedAt).toBeNull()
    expect(info.elapsedMs).toBe(0)
  })

  test('start() activates session', () => {
    manager.start({ limitMinutes: 30, resetHour: 6 })

    expect(manager.active).toBe(true)
    expect(manager.expired).toBe(false)

    const info = manager.getInfo()
    expect(info.isActive).toBe(true)
    expect(info.startedAt).not.toBeNull()
    expect(info.limitMinutes).toBe(30)
  })

  test('end() deactivates session', () => {
    manager.start({ limitMinutes: 30, resetHour: 6 })
    manager.end()

    expect(manager.active).toBe(false)
    expect(manager.expired).toBe(false)

    const info = manager.getInfo()
    expect(info.isActive).toBe(false)
    expect(info.startedAt).toBeNull()
  })

  test('tracks elapsed time correctly', () => {
    manager.start({ limitMinutes: 30, resetHour: 6 })

    // Advance 5 minutes
    advanceTime(5 * 60 * 1000)

    const info = manager.getInfo()
    expect(info.elapsedMs).toBe(5 * 60 * 1000)
    expect(info.remainingMs).toBe(25 * 60 * 1000)
    expect(info.isExpired).toBe(false)
  })

  test('expires after time limit', () => {
    manager.start({ limitMinutes: 30, resetHour: 6 })

    // Advance 30 minutes
    advanceTime(30 * 60 * 1000)

    expect(manager.expired).toBe(true)

    const info = manager.getInfo()
    expect(info.isExpired).toBe(true)
    expect(info.remainingMs).toBe(0)
  })

  test('infinite session (limitMinutes=0) never expires', () => {
    manager.start({ limitMinutes: 0, resetHour: 6 })

    // Advance 24 hours
    advanceTime(24 * 60 * 60 * 1000)

    expect(manager.expired).toBe(false)

    const info = manager.getInfo()
    expect(info.isExpired).toBe(false)
    expect(info.remainingMs).toBe(Infinity)
  })

  test('remainingMs decreases over time', () => {
    manager.start({ limitMinutes: 10, resetHour: 6 })

    expect(manager.getInfo().remainingMs).toBe(10 * 60 * 1000)

    advanceTime(3 * 60 * 1000) // 3 minutes
    expect(manager.getInfo().remainingMs).toBe(7 * 60 * 1000)

    advanceTime(7 * 60 * 1000) // 7 more minutes (total 10)
    expect(manager.getInfo().remainingMs).toBe(0)
    expect(manager.getInfo().isExpired).toBe(true)
  })

  // --- Quota Exhaustion Tests ---

  test('quotaExhausted returns true when limit reached', () => {
    manager.start({ limitMinutes: 30, resetHour: 6 })
    expect(manager.quotaExhausted).toBe(false)

    // Simulate watching 30 minutes
    manager.addWatchedTime(30)
    expect(manager.quotaExhausted).toBe(true)
  })

  test('quotaExhausted returns false when skipped', () => {
    manager.start({ limitMinutes: 30, resetHour: 6 })
    manager.addWatchedTime(30) // Exhaust quota

    expect(manager.quotaExhausted).toBe(true)

    manager.skipQuotaForToday()
    expect(manager.quotaExhausted).toBe(false) // Skipped!
    expect(manager.isQuotaSkipped).toBe(true)
  })

  test('quotaExhausted returns false for infinite session', () => {
    manager.start({ limitMinutes: 0, resetHour: 6 }) // Infinite
    manager.addWatchedTime(1000) // Watch a lot

    expect(manager.quotaExhausted).toBe(false) // Infinite never exhausts
  })

  // --- Daily Reset Tests ---

  test('daily reset at resetHour clears quota', () => {
    // Start at 10:00 (after 6:00 reset hour)
    setTime(new Date('2026-02-03T10:00:00'))
    manager = new SessionManager(dateTime) // Re-init with new time context if needed, but manager calls dateTime.now()

    manager.start({ limitMinutes: 30, resetHour: 6 })
    manager.addWatchedTime(30)
    manager.end()
    expect(manager.quotaExhausted).toBe(true)

    // Next day at 10:00 (after reset hour)
    setTime(new Date('2026-02-04T10:00:00'))

    manager.start({ limitMinutes: 30, resetHour: 6 })

    // Quota should be fresh
    expect(manager.quotaExhausted).toBe(false)
    expect(manager.getRemainingQuota()).toBe(30)
  })

  test('before resetHour uses previous day quota', () => {
    // Start at 05:00 (before 6:00 reset hour)
    setTime(new Date('2026-02-03T05:00:00'))

    manager.start({ limitMinutes: 30, resetHour: 6 })
    manager.addWatchedTime(20)
    manager.end()

    // Still 05:00, same quota day
    manager.start({ limitMinutes: 30, resetHour: 6 })
    expect(manager.getRemainingQuota()).toBe(10) // 30 - 20
  })

  test('skipQuotaForToday resets on new quota day', () => {
    setTime(new Date('2026-02-03T10:00:00'))

    manager.start({ limitMinutes: 30, resetHour: 6 })
    manager.skipQuotaForToday()
    expect(manager.isQuotaSkipped).toBe(true)
    manager.end()

    // Next day after reset hour
    setTime(new Date('2026-02-04T10:00:00'))

    manager.start({ limitMinutes: 30, resetHour: 6 })

    // Skip flag should be reset
    expect(manager.isQuotaSkipped).toBe(false)
  })

  test('skipQuotaForToday persists within same day', () => {
    setTime(new Date('2026-02-03T10:00:00'))

    manager.start({ limitMinutes: 30, resetHour: 6 })
    manager.skipQuotaForToday()
    manager.end()

    // Later same day
    setTime(new Date('2026-02-03T18:00:00'))

    manager.start({ limitMinutes: 30, resetHour: 6 })

    // Skip flag should persist
    expect(manager.isQuotaSkipped).toBe(true)
  })
})
