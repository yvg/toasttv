/**
 * Unit tests for MediaIndexer
 */

import { describe, expect, mock, test } from 'bun:test'
import { MediaIndexer } from '../src/services/MediaIndexer'
import type { IMediaRepository } from '../src/repositories/IMediaRepository'
import type {
  IFileSystem,
  IMediaProbe,
  InterludeConfig,
  MediaConfig,
} from '../src/types'

// --- Builder Functions ---

function buildMediaConfig(overrides: Partial<MediaConfig> = {}): MediaConfig {
  return {
    directory: '/media/videos',
    supportedExtensions: ['.mp4', '.mkv'],
    databasePath: ':memory:',
    ...overrides,
  }
}

function buildInterludeConfig(
  overrides: Partial<InterludeConfig> = {}
): InterludeConfig {
  return {
    enabled: true,
    frequency: 2,
    directory: '/media/interludes',
    ...overrides,
  }
}

/**
 * Creates a mock IMediaRepository with all required methods.
 * Pass overrides to customize specific method behaviors.
 */
function buildMockRepo(
  overrides: Partial<IMediaRepository> = {}
): IMediaRepository {
  return {
    initialize: mock(() => Promise.resolve()),
    close: mock(() => Promise.resolve()),
    getAll: mock(() => Promise.resolve([])),
    getById: mock(() => Promise.resolve(null)),
    getAllVideos: mock(() => Promise.resolve([])),
    getInterludes: mock(() => Promise.resolve([])),
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
    ...overrides,
  }
}

// --- Tests ---

describe('MediaIndexer', () => {
  test('scanAll indexes videos and interludes', async () => {
    const upsertedItems: unknown[] = []

    const mockRepo = buildMockRepo({
      upsertMedia: mock((item) => {
        upsertedItems.push(item)
        return Promise.resolve()
      }),
    })

    const mockFs: IFileSystem = {
      exists: mock(() => true),
      listFiles: mock((dir: string) => {
        if (dir.includes('interludes')) {
          return ['/media/interludes/bump.mp4']
        }
        return ['/media/videos/show1.mp4', '/media/videos/show2.mp4']
      }),
    }

    const mockProbe: IMediaProbe = {
      getDuration: mock(() => Promise.resolve(1200)),
    }

    const indexer = new MediaIndexer(
      buildMediaConfig(),
      buildInterludeConfig(),
      mockRepo,
      mockFs,
      mockProbe
    )

    const result = await indexer.scanAll()

    expect(result).toBe(3) // 2 videos + 1 interlude
    expect(upsertedItems.length).toBe(3)
  })

  test('scanAll handles missing directory', async () => {
    const mockRepo = buildMockRepo()

    const mockFs: IFileSystem = {
      exists: mock(() => false),
      listFiles: mock(() => []),
    }

    const mockProbe: IMediaProbe = {
      getDuration: mock(() => Promise.resolve(0)),
    }

    const indexer = new MediaIndexer(
      buildMediaConfig(),
      buildInterludeConfig(),
      mockRepo,
      mockFs,
      mockProbe
    )

    const result = await indexer.scanAll()

    expect(result).toBe(0)
  })

  test('scanAll marks interludes correctly', async () => {
    const upsertedItems: Array<{ isInterlude: boolean; filename: string }> = []

    const mockRepo = buildMockRepo({
      upsertMedia: mock((item) => {
        upsertedItems.push(item as { isInterlude: boolean; filename: string })
        return Promise.resolve()
      }),
    })

    const mockFs: IFileSystem = {
      exists: mock(() => true),
      listFiles: mock((dir: string, _ext: unknown, exclude?: string[]) => {
        if (dir.includes('interludes')) {
          return ['/media/interludes/bump.mp4']
        }
        // Imitate exclusion logic slightly to verify it passes checks
        if (exclude && exclude.some(p => '/media/videos/show.mp4'.startsWith(p))) {
            return []
        }
        return ['/media/videos/show.mp4']
      }),
    }

    const mockProbe: IMediaProbe = {
      getDuration: mock(() => Promise.resolve(60)),
    }

    const indexer = new MediaIndexer(
      buildMediaConfig(),
      buildInterludeConfig(),
      mockRepo,
      mockFs,
      mockProbe
    )

    await indexer.scanAll()

    const video = upsertedItems.find((i) => i.filename === 'show.mp4')
    const interlude = upsertedItems.find((i) => i.filename === 'bump.mp4')

    expect(interlude?.isInterlude).toBe(true)
  })

  test('scanAll detects seasonal dates from filenames', async () => {
    const upsertedItems: any[] = []

    const mockRepo = buildMockRepo({
      upsertMedia: mock((item) => {
        upsertedItems.push(item)
        return Promise.resolve()
      }),
    })

    const mockFs: IFileSystem = {
      exists: mock(() => true),
      listFiles: mock((dir: string, _ext: unknown, excludePaths?: string[]) => {
          // Identify if we are scanning videos or interludes based on the dir string
          // In the real code, indexer calls scanDirectory twice.
          // 1. Videos (exclude interludes)
          // 2. Interludes
          
          if (dir.includes('interludes')) {
              return ['/media/interludes/penny_xmas.mp4', '/media/interludes/penny_summer.mp4']
          }
           return []
      }),
    }

    const mockProbe: IMediaProbe = {
      getDuration: mock(() => Promise.resolve(60)),
    }

    const indexer = new MediaIndexer(
      buildMediaConfig(),
      buildInterludeConfig(),
      mockRepo,
      mockFs,
      mockProbe
    )

    await indexer.scanAll()

    const xmas = upsertedItems.find((i) => i.filename === 'penny_xmas.mp4')
    const summer = upsertedItems.find((i) => i.filename === 'penny_summer.mp4')

    expect(xmas.dateStart).toBe('12-01')
    expect(xmas.dateEnd).toBe('12-26')
    
    expect(summer.dateStart).toBe('06-01')
    expect(summer.dateEnd).toBe('08-31')
  })
})
