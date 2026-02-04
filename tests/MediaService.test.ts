/**
 * MediaService Tests
 *
 * Verifies media sorting logic and singleton enforcement (intro/outro).
 */

import { describe, expect, test, beforeEach } from 'bun:test'
import { mock, type MockProxy } from 'jest-mock-extended'
import { MediaService } from '../src/services/MediaService'
import type { IMediaRepository } from '../src/repositories/IMediaRepository'
import type { MediaIndexer } from '../src/services/MediaIndexer'
import type { ConfigService } from '../src/services/ConfigService'
import type { ThumbnailClient } from '../src/clients/ThumbnailClient'
import type { MediaItem } from '../src/types'

// Builder
const createItem = (id: number, filename: string): MediaItem => ({
  id,
  filename,
  path: `/videos/${filename}`,
  durationSeconds: 60,
  isInterlude: false,
  mediaType: 'video',
  dateStart: null,
  dateEnd: null,
})

describe('MediaService', () => {
  let repo: MockProxy<IMediaRepository>
  let indexer: MockProxy<MediaIndexer>
  let config: MockProxy<ConfigService>
  let thumbnails: MockProxy<ThumbnailClient>
  let service: MediaService

  beforeEach(() => {
    repo = mock<IMediaRepository>()
    indexer = mock<MediaIndexer>()
    config = mock<ConfigService>()
    thumbnails = mock<ThumbnailClient>()

    service = new MediaService(repo, indexer, config, thumbnails)
  })

  test('getAll() sorts correctly: Intro -> Outro -> Alphabetical', async () => {
    const items = [
      createItem(1, 'zebra.mp4'),
      createItem(2, 'apple.mp4'),
      createItem(3, 'intro.mp4'),
      createItem(4, 'outro.mp4'),
      createItem(5, 'beta.mp4'),
    ]

    repo.getAll.mockResolvedValue(items)

    // Config defines 3 as intro, 4 as outro
    config.get.mockResolvedValue({
      session: {
        introVideoId: 3,
        outroVideoId: 4,
      },
    } as any)

    const sorted = await service.getAll()

    // Expected order:
    // 1. Intro (3)
    // 2. Outro (4)
    // 3. Alphabetical (2: apple, 5: beta, 1: zebra)

    expect(sorted[0].id).toBe(3) // Intro
    expect(sorted[1].id).toBe(4) // Outro
    expect(sorted[2].id).toBe(2) // Apple
    expect(sorted[3].id).toBe(5) // Beta
    expect(sorted[4].id).toBe(1) // Zebra
  })

  test('updateType() enforces singleton for intro', async () => {
    await service.updateType(10, 'intro')

    // Should reset other intros first
    expect(repo.resetMediaType).toHaveBeenCalledWith('intro')
    // Should clear dates
    expect(repo.updateDates).toHaveBeenCalledWith(10, null, null)
    // Then set new type
    expect(repo.updateMediaType).toHaveBeenCalledWith(10, 'intro')
  })

  test('updateType() enforces singleton for outro', async () => {
    await service.updateType(11, 'outro')

    expect(repo.resetMediaType).toHaveBeenCalledWith('outro')
    expect(repo.updateDates).toHaveBeenCalledWith(11, null, null)
    expect(repo.updateMediaType).toHaveBeenCalledWith(11, 'outro')
  })

  test('updateType() allows multiple videos/interludes', async () => {
    await service.updateType(12, 'video')

    expect(repo.resetMediaType).not.toHaveBeenCalled()
    expect(repo.updateMediaType).toHaveBeenCalledWith(12, 'video')
  })
})
