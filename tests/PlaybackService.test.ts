/**
 * PlaybackService Tests
 *
 * Tests for playback control and VLC interaction.
 */

import { describe, expect, test, mock, beforeEach } from 'bun:test'
import { PlaybackService } from '../src/services/PlaybackService'
import type { PlaylistEngine } from '../src/services/PlaylistEngine'
import type { IVlcController, MediaItem, PlaybackStatus } from '../src/types'

describe('PlaybackService', () => {
  // Create mock video
  const mockVideo: MediaItem = {
    id: 1,
    path: '/media/show.mp4',
    filename: 'show.mp4',
    durationSeconds: 600,
    isInterlude: false,
    mediaType: 'video',
    dateStart: null,
    dateEnd: null,
  }

  // Create mock VLC controller
  function createMockVlc(): IVlcController & { _playCalls: string[] } {
    const playCalls: string[] = []
    return {
      _playCalls: playCalls,
      connect: mock(() => Promise.resolve()),
      disconnect: mock(() => Promise.resolve()),
      play: mock((path: string) => {
        playCalls.push(path)
        return Promise.resolve()
      }),
      pause: mock(() => Promise.resolve()),
      stop: mock(() => Promise.resolve()),
      next: mock(() => Promise.resolve()),
      enqueue: mock(() => Promise.resolve()),
      setLoop: mock(() => Promise.resolve()),
      getStatus: mock(() =>
        Promise.resolve({
          isPlaying: true,
          currentFile: '/media/show.mp4',
          positionSeconds: 30,
          durationSeconds: 600,
        })
      ),
    }
  }

  // Create mock PlaylistEngine
  function createMockEngine(
    options: { isActive?: boolean; queue?: MediaItem[] } = {}
  ): PlaylistEngine {
    const queue = [...(options.queue ?? [mockVideo])]
    let isActive = options.isActive ?? false

    return {
      isSessionActive: isActive,
      sessionInfo: {
        startedAt: isActive ? new Date() : null,
        limitMinutes: 30,
        elapsedMs: 0,
      },
      startSession: mock(() => {
        isActive = true
        return Promise.resolve(queue[0] ?? null)
      }),
      endSession: mock(() => {
        isActive = false
        return Promise.resolve()
      }),
      getNextVideo: mock(() => {
        const next = queue.shift()
        return Promise.resolve(next ?? null)
      }),
      peekQueue: mock((count: number) => queue.slice(0, count)),
      shuffleQueue: mock(() => Promise.resolve()),
    } as unknown as PlaylistEngine
  }

  // Create mock ConfigService
  function createMockConfig() {
    return {
      get: mock(() =>
        Promise.resolve({
          session: { offAirAssetId: null },
        })
      ),
    }
  }

  // Create mock MediaRepository
  function createMockMedia() {
    return {
      getById: mock(() => Promise.resolve(null)),
    }
  }

  // Helper to create PlaybackService with deps
  function createService(
    vlc: ReturnType<typeof createMockVlc>,
    engine: PlaylistEngine
  ) {
    return new PlaybackService({
      vlc,
      engine,
      // Test mocks - using any for simplicity in test context
      config:
        createMockConfig() as unknown as import('../src/services/PlaybackService').PlaybackServiceDeps['config'],
      media:
        createMockMedia() as unknown as import('../src/services/PlaybackService').PlaybackServiceDeps['media'],
    })
  }

  test('startSession() starts engine and plays first video', async () => {
    const vlc = createMockVlc()
    const engine = createMockEngine({ queue: [mockVideo] })
    const service = createService(vlc, engine)

    await service.startSession()

    expect(engine.startSession).toHaveBeenCalled()
    expect(vlc._playCalls).toContain('/media/show.mp4')
  })

  test('startSession() does nothing if already active', async () => {
    const vlc = createMockVlc()
    const engine = createMockEngine({ isActive: true })
    const service = createService(vlc, engine)

    // Override isSessionActive to return true
    Object.defineProperty(engine, 'isSessionActive', { value: true })

    await service.startSession()

    expect(engine.startSession).not.toHaveBeenCalled()
  })

  test('endSession() stops VLC and ends engine session', async () => {
    const vlc = createMockVlc()
    const engine = createMockEngine({ isActive: true })
    const service = createService(vlc, engine)

    await service.endSession()

    expect(engine.endSession).toHaveBeenCalled()
    expect(vlc.stop).toHaveBeenCalled()
  })

  test('skip() plays next video from engine', async () => {
    const secondVideo: MediaItem = {
      ...mockVideo,
      id: 2,
      filename: 'next.mp4',
      path: '/media/next.mp4',
    }
    const vlc = createMockVlc()
    const engine = createMockEngine({ queue: [mockVideo, secondVideo] })
    const service = createService(vlc, engine)

    await service.skip()

    expect(engine.getNextVideo).toHaveBeenCalled()
    expect(vlc._playCalls.length).toBeGreaterThan(0)
  })

  test('pause() delegates to VLC', async () => {
    const vlc = createMockVlc()
    const engine = createMockEngine()
    const service = createService(vlc, engine)

    await service.pause()

    expect(vlc.pause).toHaveBeenCalled()
  })

  test('stop() stops VLC and ends session', async () => {
    const vlc = createMockVlc()
    const engine = createMockEngine()
    const service = createService(vlc, engine)

    await service.stop()

    expect(vlc.stop).toHaveBeenCalled()
    expect(engine.endSession).toHaveBeenCalled()
  })

  test('getStatus() returns VLC status', async () => {
    const vlc = createMockVlc()
    const engine = createMockEngine()
    const service = createService(vlc, engine)

    const status = await service.getStatus()

    expect(status).not.toBeNull()
    expect(status?.isPlaying).toBe(true)
    expect(status?.positionSeconds).toBe(30)
  })

  test('getStatus() returns null on VLC error', async () => {
    const vlc = createMockVlc()
    vlc.getStatus = mock(() => Promise.reject(new Error('VLC not connected')))
    const engine = createMockEngine()
    const service = createService(vlc, engine)

    const status = await service.getStatus()

    expect(status).toBeNull()
  })

  test('peekQueue() returns upcoming videos', () => {
    const videos = [mockVideo, { ...mockVideo, id: 2 }, { ...mockVideo, id: 3 }]
    const vlc = createMockVlc()
    const engine = createMockEngine({ queue: videos })
    const service = createService(vlc, engine)

    const queue = service.peekQueue(2)

    expect(engine.peekQueue).toHaveBeenCalledWith(2)
  })

  test('shuffleQueue() delegates to engine', async () => {
    const vlc = createMockVlc()
    const engine = createMockEngine()
    const service = createService(vlc, engine)

    await service.shuffleQueue()

    expect(engine.shuffleQueue).toHaveBeenCalled()
  })

  test('getCurrentMedia() returns current video after play', async () => {
    const vlc = createMockVlc()
    const engine = createMockEngine({ queue: [mockVideo] })
    const service = createService(vlc, engine)

    // Before playing, should be null
    expect(service.getCurrentMedia()).toBeNull()

    // Start session plays first video
    await service.startSession()

    // Now should have current video
    expect(service.getCurrentMedia()).not.toBeNull()
    expect(service.getCurrentMedia()?.filename).toBe('show.mp4')
  })

  test('isSessionActive reflects engine state', () => {
    const vlc = createMockVlc()
    const engine = createMockEngine({ isActive: false })
    const service = createService(vlc, engine)

    expect(service.isSessionActive).toBe(false)

    // Change engine state
    Object.defineProperty(engine, 'isSessionActive', { value: true })

    expect(service.isSessionActive).toBe(true)
  })
})
