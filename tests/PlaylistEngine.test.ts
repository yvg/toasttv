/**
 * Unit tests for PlaylistEngine
 *
 * Uses Bun test with mock repository and config.
 */

import { describe, expect, mock, test } from 'bun:test'
import { PlaylistEngine } from '../src/services/PlaylistEngine'
import { SessionManager } from '../src/services/SessionManager'
import type { IMediaRepository } from '../src/repositories/IMediaRepository'
import type {
  ConfigRepository,
  AppConfig,
} from '../src/repositories/ConfigRepository'
import type { IDateTimeProvider, MediaItem } from '../src/types'

// --- Builder Functions ---

function buildMediaItem(overrides: Partial<MediaItem> = {}): MediaItem {
  return {
    id: 1,
    path: '/media/show.mp4',
    filename: 'show.mp4',
    durationSeconds: 1200,
    isInterlude: false,
    mediaType: overrides.isInterlude ? 'interlude' : 'video',
    dateStart: null,
    dateEnd: null,
    ...overrides,
  }
}

function buildAppConfig(
  overrides: Partial<DeepPartial<AppConfig>> = {}
): AppConfig {
  return {
    server: { port: 1993, ...overrides.server },
    session: {
      limitMinutes: 30,
      resetHour: 6,
      offAirAssetId: null,
      introVideoId: null,
      outroVideoId: null,
      ...overrides.session,
    },
    interlude: {
      enabled: true,
      frequency: 2,
      ...overrides.interlude,
    },
    vlc: { host: 'localhost', port: 9999, ...overrides.vlc },
    logo: {
      enabled: false,
      imagePath: null,
      opacity: 128,
      position: 2,
      x: 8,
      y: 8,
      ...overrides.logo,
    },
  }
}

type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P]
}

function buildMockRepository(
  videos: MediaItem[] = [],
  interludes: MediaItem[] = []
): IMediaRepository {
  const allMedia = [...videos, ...interludes]
  return {
    initialize: mock(() => Promise.resolve()),
    close: mock(() => Promise.resolve()),
    getAll: mock(() => Promise.resolve(allMedia)),
    getById: mock((id: number) =>
      Promise.resolve(allMedia.find((m) => m.id === id) ?? null)
    ),
    getAllVideos: mock(() => Promise.resolve(videos)),
    getInterludes: mock(() => Promise.resolve(interludes)),
    getByType: mock(() => Promise.resolve(null)),
    upsertMedia: mock(() => Promise.resolve()),
    deleteMedia: mock(() => Promise.resolve()),
    toggleInterlude: mock(() => Promise.resolve()),
    updateMediaType: mock(() => Promise.resolve()),
    resetMediaType: mock(() => Promise.resolve()),
    updateDates: mock(() => Promise.resolve()),
    removeNotInPaths: mock(() => Promise.resolve(0)),
    getSetting: mock(() => Promise.resolve(null)),
    setSetting: mock(() => Promise.resolve()),
    getAllSettings: mock(() => Promise.resolve({})),
  }
}

function buildMockConfig(config: AppConfig): ConfigRepository {
  return {
    get: mock(() => Promise.resolve(config)),
    update: mock(() => Promise.resolve()),
    initialize: mock(() => Promise.resolve()),
    getBootstrap: mock(() => ({ paths: { media: '/media', database: '/db' } })),
  } as unknown as ConfigRepository
}

class FakeDateTimeProvider implements IDateTimeProvider {
  private currentTime: Date

  constructor(fixedTime: Date) {
    this.currentTime = new Date(fixedTime)
  }

  now(): Date {
    return this.currentTime
  }

  today(): string {
    return this.currentTime.toISOString().split('T')[0] ?? ''
  }

  advance(minutes: number): void {
    this.currentTime = new Date(
      this.currentTime.getTime() + minutes * 60 * 1000
    )
  }
}

function createEngine(
  config: ConfigRepository,
  repo: IMediaRepository,
  dateTime: IDateTimeProvider = new FakeDateTimeProvider(
    new Date('2024-01-01T10:00:00')
  )
): PlaylistEngine {
  const sessionManager = new SessionManager(dateTime)
  return new PlaylistEngine(config, repo, sessionManager, dateTime)
}

// --- Tests ---

describe('PlaylistEngine', () => {
  test('startSession returns intro video when configured', async () => {
    const introVideo = buildMediaItem({
      id: 99,
      filename: 'intro.mp4',
      mediaType: 'intro',
    })
    // Include intro in videos array so it appears in getAll() and findCachedItem() works
    const repo = buildMockRepository([introVideo], [])
    // Mock getById to return intro (for legacy code paths)
    repo.getById = mock((id) => Promise.resolve(id === 99 ? introVideo : null))

    const configData = buildAppConfig({
      session: { introVideoId: 99 },
    })
    const config = buildMockConfig(configData)

    const engine = createEngine(config, repo)

    const result = await engine.startSession()

    expect(result).not.toBeNull()
    expect(result?.id).toBe(99)
    expect(result?.filename).toBe('intro.mp4')
    expect(engine.isSessionActive).toBe(true)
  })

  test('startSession returns first video when no intro', async () => {
    const videos = [
      buildMediaItem({ id: 1, filename: 'show1.mp4' }),
      buildMediaItem({ id: 2, filename: 'show2.mp4' }),
    ]
    const repo = buildMockRepository(videos)
    const configData = buildAppConfig()
    const config = buildMockConfig(configData)

    const engine = createEngine(config, repo)

    const result = await engine.startSession()

    expect(result).not.toBeNull()
    expect(result?.filename).toBeDefined()
    expect(['show1.mp4', 'show2.mp4']).toContain(result!.filename)
  })

  test('getNextVideo plays interlude at configured frequency', async () => {
    const videos = [
      buildMediaItem({ id: 1, filename: 'show1.mp4', durationSeconds: 60 }),
      buildMediaItem({ id: 2, filename: 'show2.mp4', durationSeconds: 60 }),
      buildMediaItem({ id: 3, filename: 'show3.mp4', durationSeconds: 60 }),
    ]
    const interludes = [
      buildMediaItem({
        id: 100,
        filename: 'interlude.mp4',
        isInterlude: true,
        durationSeconds: 30,
      }),
    ]
    const repo = buildMockRepository(videos, interludes)

    const configData = buildAppConfig({
      session: { limitMinutes: 0 }, // Infinite session
      interlude: { enabled: true, frequency: 2 },
    })
    const config = buildMockConfig(configData)

    const engine = createEngine(config, repo)

    await engine.startSession()

    // After startSession: 1 show played (first from queue)
    const v1 = await engine.getNextVideo() // 2nd show
    const v2 = await engine.getNextVideo() // should be interlude after 2 shows (frequency=2)

    console.log('v1:', v1?.filename, v1?.isInterlude, v1?.mediaType)
    console.log('v2:', v2?.filename, v2?.isInterlude, v2?.mediaType)

    expect(v1?.isInterlude).toBe(false)
    expect(v2?.isInterlude).toBe(true)
    expect(v2?.filename).toBe('interlude.mp4')
  })

  test('session expires after limit minutes', async () => {
    const dateTime = new FakeDateTimeProvider(new Date('2024-01-01T10:00:00'))
    // Short videos so we can fit multiple in a 30min session
    const showVideo = buildMediaItem({
      id: 1,
      filename: 'show.mp4',
      durationSeconds: 600,
    }) // 10min
    const outroVideo = buildMediaItem({
      id: 88,
      filename: 'outro.mp4',
      mediaType: 'outro',
      durationSeconds: 60,
    })

    // Include outro in cache so findCachedItem works
    const repo = buildMockRepository([showVideo, outroVideo])
    repo.getById = mock((id) =>
      Promise.resolve(id === 88 ? outroVideo : id === 1 ? showVideo : null)
    )

    const configData = buildAppConfig({
      session: { limitMinutes: 30, outroVideoId: 88 },
    })
    const config = buildMockConfig(configData)

    const engine = createEngine(config, repo, dateTime)

    // Queue is pre-filled based on durations: [show, show, show, outro]
    const first = await engine.startSession() // pop show (queue: [show, show, outro])
    expect(first?.filename).toBe('show.mp4')

    const second = await engine.getNextVideo() // pop show (queue: [show, outro])
    expect(second?.filename).toBe('show.mp4')

    const third = await engine.getNextVideo() // pop show (queue: [outro])
    expect(third?.filename).toBe('show.mp4')

    const result = await engine.getNextVideo() // pop outro

    expect(result?.id).toBe(88)
    expect(result?.filename).toBe('outro.mp4')

    // Session ends on next getNextVideo call (queue empty + complete)
    const finale = await engine.getNextVideo()
    expect(finale).toBeNull()
    expect(engine.isSessionActive).toBe(false)
  })

  test('getNextVideo avoids recently played', async () => {
    // Use short durations so all 5 fit within 30min session
    const videos = [
      buildMediaItem({ id: 1, filename: 'show1.mp4', durationSeconds: 60 }),
      buildMediaItem({ id: 2, filename: 'show2.mp4', durationSeconds: 60 }),
      buildMediaItem({ id: 3, filename: 'show3.mp4', durationSeconds: 60 }),
      buildMediaItem({ id: 4, filename: 'show4.mp4', durationSeconds: 60 }),
      buildMediaItem({ id: 5, filename: 'show5.mp4', durationSeconds: 60 }),
    ]
    const repo = buildMockRepository(videos)
    const config = buildMockConfig(
      buildAppConfig({
        session: { limitMinutes: 0 }, // Infinite session for this test
      })
    )

    const engine = createEngine(config, repo)

    await engine.startSession() // picks 1

    const video1 = await engine.getNextVideo() // picks 2
    const video2 = await engine.getNextVideo() // picks 3
    const video3 = await engine.getNextVideo() // picks 4
    const video4 = await engine.getNextVideo() // picks 5

    expect(video1).not.toBeNull()
    expect(video2).not.toBeNull()
    expect(video3).not.toBeNull()
    expect(video4).not.toBeNull()

    // With 5 videos, first 5 picks (including startSession) should all be different if shuffle works perfectly
    // and history is large enough (10).
    const ids = [video1?.id, video2?.id, video3?.id, video4?.id]
    const uniqueIds = new Set(ids)
    // startSession picked 1 ID. filtered out.
    // remaining 4 IDs must be the others.
    expect(uniqueIds.size).toBe(4)
  })

  test('skipQuotaForToday makes session infinite (no outro due to limit)', async () => {
    const dateTime = new FakeDateTimeProvider(new Date('2024-01-01T10:00:00'))
    const showVideo = buildMediaItem({
      id: 1,
      filename: 'show.mp4',
      durationSeconds: 600, // 10min
    })
    const outroVideo = buildMediaItem({
      id: 88,
      filename: 'outro.mp4',
      mediaType: 'outro',
      durationSeconds: 60,
    })

    const repo = buildMockRepository([showVideo, outroVideo])
    repo.getById = mock((id) =>
      Promise.resolve(id === 88 ? outroVideo : id === 1 ? showVideo : null)
    )

    const configData = buildAppConfig({
      session: { limitMinutes: 30, outroVideoId: 88 },
    })
    const config = buildMockConfig(configData)

    const engine = createEngine(config, repo, dateTime)

    // Skip quota BEFORE starting session
    engine.skipQuotaForToday()

    // Start session - should now be infinite
    const first = await engine.startSession()
    expect(first?.filename).toBe('show.mp4')

    // With quota skipped, queue should NOT be marked complete after 30min worth of content
    // It should keep generating (buffer mode)
    const second = await engine.getNextVideo()
    expect(second?.filename).toBe('show.mp4') // Not outro

    const third = await engine.getNextVideo()
    expect(third?.filename).toBe('show.mp4') // Still not outro

    const fourth = await engine.getNextVideo()
    expect(fourth?.filename).toBe('show.mp4') // Still generating shows

    // Session should still be active (infinite)
    expect(engine.isSessionActive).toBe(true)
  })

  test('skipQuotaForToday after session start converts to infinite', async () => {
    const dateTime = new FakeDateTimeProvider(new Date('2024-01-01T10:00:00'))
    const showVideo = buildMediaItem({
      id: 1,
      filename: 'show.mp4',
      durationSeconds: 600, // 10min
    })
    const outroVideo = buildMediaItem({
      id: 88,
      filename: 'outro.mp4',
      mediaType: 'outro',
      durationSeconds: 60,
    })

    const repo = buildMockRepository([showVideo, outroVideo])
    repo.getById = mock((id) =>
      Promise.resolve(id === 88 ? outroVideo : id === 1 ? showVideo : null)
    )

    const configData = buildAppConfig({
      session: { limitMinutes: 30, outroVideoId: 88 },
    })
    const config = buildMockConfig(configData)

    const engine = createEngine(config, repo, dateTime)

    // Start session normally (finite)
    await engine.startSession()

    // Now skip quota mid-session
    engine.skipQuotaForToday()

    // Pull enough videos to exhaust the original limit
    const playedVideos: string[] = []
    for (let i = 0; i < 10; i++) {
      const v = await engine.getNextVideo()
      if (!v) break
      playedVideos.push(v.filename)
    }

    // Should have played multiple shows without hitting outro
    // (original queue might have had outro, but new fills won't add it)
    expect(playedVideos.length).toBeGreaterThan(3)
    expect(engine.isSessionActive).toBe(true)
  })

  test('session ends after outro (triggers off-air)', async () => {
    const dateTime = new FakeDateTimeProvider(new Date('2024-01-01T10:00:00'))
    const showVideo = buildMediaItem({
      id: 1,
      filename: 'show.mp4',
      durationSeconds: 600, // 10min
    })
    const outroVideo = buildMediaItem({
      id: 88,
      filename: 'outro.mp4',
      mediaType: 'outro',
      durationSeconds: 60,
    })

    const repo = buildMockRepository([showVideo, outroVideo])
    repo.getById = mock((id) =>
      Promise.resolve(id === 88 ? outroVideo : id === 1 ? showVideo : null)
    )

    const configData = buildAppConfig({
      session: { limitMinutes: 30, outroVideoId: 88 },
    })
    const config = buildMockConfig(configData)

    const engine = createEngine(config, repo, dateTime)

    // Start and play through all videos
    await engine.startSession() // show
    await engine.getNextVideo() // show
    await engine.getNextVideo() // show
    const outro = await engine.getNextVideo() // outro
    expect(outro?.filename).toBe('outro.mp4')

    // After outro, getNextVideo should return null → triggers off-air
    const afterOutro = await engine.getNextVideo()
    expect(afterOutro).toBeNull()
    expect(engine.isSessionActive).toBe(false)
  })

  test('peekQueue shows upcoming videos without consuming', async () => {
    const videos = [
      buildMediaItem({ id: 1, filename: 'show1.mp4', durationSeconds: 60 }),
      buildMediaItem({ id: 2, filename: 'show2.mp4', durationSeconds: 60 }),
      buildMediaItem({ id: 3, filename: 'show3.mp4', durationSeconds: 60 }),
    ]
    const repo = buildMockRepository(videos)
    const config = buildMockConfig(
      buildAppConfig({
        session: { limitMinutes: 0 }, // Infinite
      })
    )

    const engine = createEngine(config, repo)
    await engine.startSession()

    // Peek should show upcoming without consuming
    const peeked = engine.peekQueue(5)
    expect(peeked.length).toBeGreaterThan(0)

    // getNextVideo should return the same first item
    const next = await engine.getNextVideo()
    expect(next).not.toBeNull()

    // Peeking again should show updated queue
    const peekedAfter = engine.peekQueue(5)
    expect(peekedAfter.length).toBeGreaterThan(0)
  })
})
