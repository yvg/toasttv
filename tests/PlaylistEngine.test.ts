/**
 * PlaylistEngine Tests
 *
 * Verifies queue generation, session limits, and interlude logic.
 */

import { describe, expect, test, beforeEach } from 'bun:test'
import { mock, type MockProxy } from 'jest-mock-extended'
import { PlaylistEngine } from '../src/services/PlaylistEngine'
import type { IMediaRepository } from '../src/repositories/IMediaRepository'
import type { ConfigRepository } from '../src/repositories/ConfigRepository'
import type { SessionManager } from '../src/services/SessionManager'
import type { IDateTimeProvider, MediaItem } from '../src/types'

// Builder for MediaItem
const createVideo = (
  id: number,
  override: Partial<MediaItem> = {}
): MediaItem => ({
  id,
  path: `/videos/${id}.mp4`,
  filename: `${id}.mp4`,
  durationSeconds: 600,
  mediaType: 'video',
  isInterlude: false,
  dateStart: null,
  dateEnd: null,
  ...override,
})

describe('PlaylistEngine', () => {
  let repo: MockProxy<IMediaRepository>
  let configRepo: MockProxy<ConfigRepository>
  let session: MockProxy<SessionManager>
  let dateTime: MockProxy<IDateTimeProvider>
  let engine: PlaylistEngine
  let originalRandom: () => number

  beforeEach(() => {
    originalRandom = Math.random
    // Mock random for deterministic shuffle
    // Returning 0.1 usually keeps array mostly in order depending on shuffle impl
    Math.random = () => 0.1

    repo = mock<IMediaRepository>()
    configRepo = mock<ConfigRepository>()
    session = mock<SessionManager>()
    dateTime = mock<IDateTimeProvider>()

    // Default Config
    configRepo.get.mockResolvedValue({
      session: {
        limitMinutes: 60,
        introVideoId: null,
        outroVideoId: null,
        resetHour: 6,
      },
      interlude: {
        enabled: true,
        frequency: 2,
      },
    } as any)

    // Default Repo
    repo.getAll.mockReturnValue(Promise.resolve([]))
    repo.getInterludes.mockReturnValue(Promise.resolve([]))
    repo.getAllVideos.mockReturnValue(Promise.resolve([]))
    // @ts-ignore
    repo.getSetting.mockResolvedValue(null)
    repo.setSetting.mockResolvedValue()

    // Default Session
    // @ts-ignore
    session.active = true
    session.getInfo.mockReturnValue({
      startedAt: new Date(),
      limitMinutes: 60,
      resetHour: 6,
      elapsedMs: 0,
      remainingMs: 3600000,
    } as any)

    // Default DateTime
    dateTime.today.mockReturnValue('2023-01-01')

    engine = new PlaylistEngine(configRepo, repo, session, dateTime)
  })

  test('startSession() builds queue and returns first video', async () => {
    const video1 = createVideo(1)
    repo.getAll.mockReturnValue(Promise.resolve([video1]))

    const first = await engine.startSession()

    expect(first).toEqual(video1)
  })

  test('startSession() handles intro video', async () => {
    const video1 = createVideo(1)
    const intro = createVideo(99, { filename: 'intro.mp4', mediaType: 'intro' })

    // Mock getAll to return everything (intro + video)
    repo.getAll.mockReturnValue(Promise.resolve([video1, intro]))

    configRepo.get.mockResolvedValue({
      session: { limitMinutes: 60, introVideoId: 99 },
      interlude: { enabled: true, frequency: 2 },
    } as any)

    const first = await engine.startSession()

    expect(first).toEqual(intro)

    // Queue should have video1 next
    const next = await engine.getNextVideo()
    expect(next).toEqual(video1)
  })

  test('getNextVideo() respects interlude frequency', async () => {
    const v1 = createVideo(1)
    const v2 = createVideo(2)
    const v3 = createVideo(3)
    const interlude = createVideo(100, {
      isInterlude: true,
      mediaType: 'interlude',
    })

    // getAll returns all videos
    repo.getAll.mockReturnValue(Promise.resolve([v1, v2, v3]))
    // getInterludes returns available interludes
    repo.getInterludes.mockReturnValue(Promise.resolve([interlude]))

    // Frequency 2
    configRepo.get.mockResolvedValue({
      session: { limitMinutes: 60 },
      interlude: { enabled: true, frequency: 2 },
    } as any)

    // Start session = video 1 (count 1)
    await engine.startSession()

    const second = await engine.getNextVideo() // video 2 (count 2)
    expect(second).not.toBeNull()
    expect(second?.mediaType).toBe('video')
    expect(second?.isInterlude).toBe(false)

    const third = await engine.getNextVideo() // should be interlude
    expect(third).toEqual(interlude)

    const fourth = await engine.getNextVideo() // video 3 (count 1)
    expect(fourth).not.toBeNull()
    expect(fourth?.mediaType).toBe('video')
  })

  test('endSession() clears state', async () => {
    const v1 = createVideo(1)
    repo.getAll.mockReturnValue(Promise.resolve([v1]))

    await engine.startSession()
    await engine.endSession()

    expect(session.end).toHaveBeenCalled()
    expect(engine.peekQueue(1)).toEqual([])
  })

  test('handles empty repository gracefully', async () => {
    repo.getAll.mockReturnValue(Promise.resolve([]))

    const first = await engine.startSession()
    // If no items, startSession returns null (or intro if configured)
    expect(first).toBeNull()
  })

  test('skipQuota() forces infinite session', async () => {
    // Mock session behavior
    // @ts-ignore
    session.isQuotaSkipped = true

    engine.skipQuotaForToday()

    expect(session.skipQuotaForToday).toHaveBeenCalled()
    expect(engine.isQuotaSkipped()).toBe(true)
  })

  test('excludes special types (offair) from regular rotation', async () => {
    const v1 = createVideo(1)
    const offair = createVideo(2, {
      mediaType: 'offair',
      filename: 'sleep_offair.mp4',
    })

    // Repository returns both
    repo.getAll.mockReturnValue(Promise.resolve([v1, offair]))

    await engine.startSession()

    // First video should be v1
    const first = await engine.getNextVideo()
    expect(first).toEqual(v1)

    // Next should be null (offair excluded) - or if queue is empty/done
    // Since we only have 1 valid video in deck, deck.draw() will eventually return null
    // But since session maintains queue, we check that offair NEVER appears.

    // We can peek queue to be sure
    const queue = engine.peekQueue(10)
    const hasOffair = queue.some((m) => m.mediaType === 'offair')
    expect(hasOffair).toBe(false)
  })
})
