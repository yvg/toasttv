/**
 * MediaRepository Tests
 *
 * Integration tests using in-memory SQLite database.
 */

import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { MediaRepository } from '../src/repositories/MediaRepository'
import type { MediaItemInput } from '../src/repositories/IMediaRepository'

describe('MediaRepository', () => {
  let repo: MediaRepository

  beforeEach(async () => {
    // Use in-memory DB for each test
    repo = new MediaRepository(':memory:')
    await repo.initialize()
  })

  afterEach(async () => {
    await repo.close()
  })

  test('initializes with correct schema', async () => {
    const settings = await repo.getAllSettings()
    expect(settings).toEqual({})
    const videos = await repo.getAllVideos()
    expect(videos).toEqual([])
  })

  test('upsertMedia inserts and updates videos', async () => {
    const input: MediaItemInput = {
      path: '/videos/test.mp4',
      filename: 'test.mp4',
      durationSeconds: 60,
      isInterlude: false,
      mediaType: 'video',
      dateStart: null,
      dateEnd: null,
    }

    await repo.upsertMedia(input)

    const all = await repo.getAll()
    expect(all).toHaveLength(1)
    expect(all[0]?.filename).toBe('test.mp4')
    expect(all[0]?.mediaType).toBe('video')

    // Update duration
    await repo.upsertMedia({ ...input, durationSeconds: 120 })

    const updated = await repo.getAll()
    expect(updated).toHaveLength(1)
    expect(updated[0]?.durationSeconds).toBe(120)
  })

  test('getInterludes filters by date correctly', async () => {
    await repo.upsertMedia({
      path: '/int/always.mp4',
      filename: 'always.mp4',
      durationSeconds: 10,
      isInterlude: true,
      mediaType: 'interlude',
      dateStart: null,
      dateEnd: null,
    })

    await repo.upsertMedia({
      path: '/int/winter.mp4',
      filename: 'winter.mp4',
      durationSeconds: 10,
      isInterlude: true,
      mediaType: 'interlude',
      dateStart: '12-01',
      dateEnd: '02-28',
    })

    // Test date in winter range
    const winterList = await repo.getInterludes('2023-01-15')
    expect(winterList.map((i) => i.filename)).toContain('winter.mp4')
    expect(winterList.map((i) => i.filename)).toContain('always.mp4')

    // Test date outside winter range
    const summerList = await repo.getInterludes('2023-07-15')
    expect(summerList.map((i) => i.filename)).not.toContain('winter.mp4')
    expect(summerList.map((i) => i.filename)).toContain('always.mp4')
  })

  test('settings management', async () => {
    await repo.setSetting('theme', 'dark')
    expect(await repo.getSetting('theme')).toBe('dark')

    await repo.setSetting('theme', 'light')
    expect(await repo.getSetting('theme')).toBe('light')

    const all = await repo.getAllSettings()
    expect(all).toEqual({ theme: 'light' })
  })

  test('removeNotInPaths cleans up stale entries', async () => {
    await repo.upsertMedia({
      path: '/keep.mp4',
      filename: 'keep.mp4',
      durationSeconds: 10,
      isInterlude: false,
      mediaType: 'video',
      dateStart: null,
      dateEnd: null,
    })

    await repo.upsertMedia({
      path: '/remove.mp4',
      filename: 'remove.mp4',
      durationSeconds: 10,
      isInterlude: false,
      mediaType: 'video',
      dateStart: null,
      dateEnd: null,
    })

    const removedCount = await repo.removeNotInPaths(['/keep.mp4'])

    expect(removedCount).toBe(1)
    const all = await repo.getAll()
    expect(all).toHaveLength(1)
    expect(all[0]?.path).toBe('/keep.mp4')
  })

  test('conflicting upsert preserves user settings', async () => {
    // Insert as Video
    await repo.upsertMedia({
      path: '/test.mp4',
      filename: 'test.mp4',
      durationSeconds: 10,
      isInterlude: false,
      mediaType: 'video',
      dateStart: null,
      dateEnd: null,
    })

    // User manually changes to Interlude via method
    const id = (await repo.getAll())[0]?.id ?? 0
    await repo.toggleInterlude(id, true)

    // Re-scan (Upsert) as Video (file system says it's a video)
    await repo.upsertMedia({
      path: '/test.mp4',
      filename: 'test.mp4',
      durationSeconds: 10,
      isInterlude: false, // Indexer says false
      mediaType: 'video',
      dateStart: null,
      dateEnd: null,
    })

    // Should remain Interlude because User override (in DB) persists if FS says "Video" (default)
    // Logic: if excluded.is_interlude = 0 (Video), keep existing.

    const item = (await repo.getAll())[0]
    expect(item?.isInterlude).toBe(true)
    expect(item?.mediaType).toBe('interlude')
  })
})
