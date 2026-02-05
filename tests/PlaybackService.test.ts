/**
 * PlaybackService Tests
 *
 * Tests for playback control and Player interaction.
 */

import { describe, expect, test, beforeEach } from 'bun:test'
import { mock, type MockProxy } from 'jest-mock-extended'
import { PlaybackService } from '../src/services/PlaybackService'
import type { PlaylistEngine } from '../src/services/PlaylistEngine'
import type { IMediaPlayer, MediaItem, PlaybackStatus } from '../src/types'
import type { ConfigService } from '../src/services/ConfigService'
import type { IMediaRepository } from '../src/repositories/IMediaRepository'
import type { DashboardEventService } from '../src/services/DashboardEventService'

// Builder for MediaItem
const createMediaItemBuilder = (override?: Partial<MediaItem>): MediaItem => ({
  id: 1,
  path: '/media/show.mp4',
  filename: 'show.mp4',
  durationSeconds: 600,
  isInterlude: false,
  mediaType: 'video',
  dateStart: null,
  dateEnd: null,
  ...override,
})

describe('PlaybackService', () => {
  let player: MockProxy<IMediaPlayer>
  let engine: MockProxy<PlaylistEngine>
  let config: MockProxy<ConfigService>
  let media: MockProxy<IMediaRepository>
  let events: MockProxy<DashboardEventService>
  let service: PlaybackService

  beforeEach(() => {
    player = mock<IMediaPlayer>()
    engine = mock<PlaylistEngine>()
    config = mock<ConfigService>()
    media = mock<IMediaRepository>()
    events = mock<DashboardEventService>()

    // Default setups
    // Default setups
    player.connect.mockResolvedValue()
    player.disconnect.mockResolvedValue()
    player.play.mockResolvedValue()
    player.pause.mockResolvedValue()
    player.stop.mockResolvedValue()
    player.setLoop.mockResolvedValue()
    player.enqueue.mockResolvedValue()

    // Default engine state
    // @ts-ignore
    engine.isSessionActive = false
    // @ts-ignore
    engine.sessionInfo = {
      startedAt: null,
      limitMinutes: 30,
      elapsedMs: 0,
    }

    config.get.mockResolvedValue({
      session: { offAirAssetId: null },
    } as any)

    service = new PlaybackService({ player, engine, config, media, events })
  })

  test('startSession() starts engine and plays first video', async () => {
    const video = createMediaItemBuilder()
    engine.startSession.mockResolvedValue(video)
    engine.peekQueue.mockReturnValue([])

    await service.startSession()

    expect(engine.startSession).toHaveBeenCalled()
    expect(player.play).toHaveBeenCalledWith(video.path)
    expect(player.setLoop).toHaveBeenCalledWith(false)
    expect(events.broadcast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'sessionStart',
      })
    )
  })

  test('startSession() does nothing if already active', async () => {
    // @ts-ignore
    engine.isSessionActive = true

    await service.startSession()

    expect(engine.startSession).not.toHaveBeenCalled()
  })

  test('endSession() stops player and ends engine session', async () => {
    // @ts-ignore
    engine.isSessionActive = true

    await service.endSession()

    expect(engine.endSession).toHaveBeenCalled()
    expect(player.stop).toHaveBeenCalled()
    expect(events.broadcast).toHaveBeenCalledWith({ type: 'sessionEnd' })
  })

  test('skip() plays next video from engine', async () => {
    const nextVideo = createMediaItemBuilder({ id: 2, filename: 'next.mp4' })
    engine.getNextVideo.mockResolvedValue(nextVideo)
    engine.peekQueue.mockReturnValue([])

    await service.skip()

    expect(engine.getNextVideo).toHaveBeenCalled()
    expect(player.play).toHaveBeenCalledWith(nextVideo.path)
  })

  test('pause() delegates to Player and broadcasts state', async () => {
    player.getStatus.mockResolvedValue({
      isPlaying: false,
      currentFile: 'test.mp4',
      positionSeconds: 10,
      durationSeconds: 100,
      state: 'paused',
    })

    await service.pause()

    expect(player.pause).toHaveBeenCalled()
    expect(events.broadcastPlayingState).toHaveBeenCalledWith(false)
  })

  test('stop() stops Player and ends session', async () => {
    await service.stop()

    expect(player.stop).toHaveBeenCalled()
    expect(engine.endSession).toHaveBeenCalled()
    expect(events.broadcast).toHaveBeenCalledWith({ type: 'sessionEnd' })
  })

  test('getStatus() returns Player status', async () => {
    const status: PlaybackStatus = {
      isPlaying: true,
      currentFile: '/media/show.mp4',
      positionSeconds: 30,
      durationSeconds: 600,
      state: 'playing',
    }
    player.getStatus.mockResolvedValue(status)

    const result = await service.getStatus()

    expect(result).toEqual(status)
  })

  test('getStatus() returns null on Player error', async () => {
    player.getStatus.mockRejectedValue(new Error('Player not connected'))

    const result = await service.getStatus()

    expect(result).toBeNull()
  })

  test('peekQueue() returns upcoming videos', () => {
    const videos = [
      createMediaItemBuilder({ id: 1 }),
      createMediaItemBuilder({ id: 2 }),
    ]
    engine.peekQueue.mockReturnValue(videos)

    const result = service.peekQueue(2)

    expect(result).toEqual(videos)
    expect(engine.peekQueue).toHaveBeenCalledWith(2)
  })

  test('shuffleQueue() delegates to engine', async () => {
    engine.peekQueue.mockReturnValue([])

    await service.shuffleQueue()

    expect(engine.shuffleQueue).toHaveBeenCalled()
    expect(events.broadcast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'queueUpdate',
      })
    )
  })

  test('getCurrentMedia() returns current video after play', async () => {
    const video = createMediaItemBuilder()
    engine.startSession.mockResolvedValue(video)
    engine.peekQueue.mockReturnValue([])

    expect(service.getCurrentMedia()).toBeNull()

    await service.startSession()

    expect(service.getCurrentMedia()).toEqual(video)
  })

  test('isSessionActive reflects engine state', () => {
    // @ts-ignore
    engine.isSessionActive = true
    expect(service.isSessionActive).toBe(true)

    // @ts-ignore
    engine.isSessionActive = false
    expect(service.isSessionActive).toBe(false)
  })
})
