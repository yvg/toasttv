/**
 * Unit tests for MediaIndexer
 */

import { describe, expect, test, beforeEach } from 'bun:test'
import { mock, type MockProxy } from 'jest-mock-extended'
import { MediaIndexer } from '../src/services/MediaIndexer'
import type { IMediaRepository } from '../src/repositories/IMediaRepository'
import type {
  IFileSystem,
  IMediaProbe,
  MediaConfig,
  InterludeConfig,
} from '../src/types'

describe('MediaIndexer', () => {
  let repo: MockProxy<IMediaRepository>
  let fs: MockProxy<IFileSystem>
  let probe: MockProxy<IMediaProbe>
  let indexer: MediaIndexer

  const mediaConfig: MediaConfig = {
    directory: '/media/videos',
    supportedExtensions: ['.mp4', '.mkv'],
    databasePath: ':memory:',
  }

  const interludeConfig: InterludeConfig = {
    enabled: true,
    frequency: 2,
    directory: '/media/interludes',
  }

  beforeEach(() => {
    repo = mock<IMediaRepository>()
    fs = mock<IFileSystem>()
    probe = mock<IMediaProbe>()

    // Default mocks
    repo.upsertMedia.mockResolvedValue()
    repo.removeNotInPaths.mockResolvedValue(0)
    fs.exists.mockReturnValue(true)
    fs.listFiles.mockReturnValue([]) // Default to empty list
    probe.getDuration.mockResolvedValue(60)

    indexer = new MediaIndexer(mediaConfig, interludeConfig, repo, fs, probe)
  })

  test('scanAll indexes videos and interludes', async () => {
    // Setup file listing with simpler matchers
    // We can check calls later, just set return values for now if specific matchers fail
    fs.listFiles
      .mockReturnValueOnce([
        '/media/videos/show1.mp4',
        '/media/videos/show2.mp4',
      ])
      .mockReturnValueOnce(['/media/interludes/bump.mp4'])

    probe.getDuration.mockResolvedValue(1200)

    const result = await indexer.scanAll()

    expect(result).toBe(3) // 2 videos + 1 interlude
    expect(repo.upsertMedia).toHaveBeenCalledTimes(3)
    // Verify video call
    expect(repo.upsertMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        filename: 'show1.mp4',
        mediaType: 'video',
        isInterlude: false,
      })
    )
    // Verify interlude call
    expect(repo.upsertMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        filename: 'bump.mp4',
        mediaType: 'interlude',
        isInterlude: true,
      })
    )
  })

  test('scanAll handles missing directory', async () => {
    fs.exists.calledWith(mediaConfig.directory).mockReturnValue(false)
    // fs.listFiles default is [] which is fine

    const result = await indexer.scanAll()

    expect(result).toBe(0)
    expect(repo.upsertMedia).not.toHaveBeenCalled()
  })

  test('scanAll marks interludes correctly', async () => {
    fs.listFiles
      .mockReturnValueOnce(['/media/videos/show.mp4'])
      .mockReturnValueOnce(['/media/interludes/bump.mp4'])

    await indexer.scanAll()

    expect(repo.upsertMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        filename: 'show.mp4',
        isInterlude: false,
      })
    )
    expect(repo.upsertMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        filename: 'bump.mp4',
        isInterlude: true,
      })
    )
  })

  test('scanAll detects seasonal dates from filenames', async () => {
    // First call is video dir -> empty
    // Second call is interlude dir -> files
    fs.listFiles
      .mockReturnValueOnce([])
      .mockReturnValueOnce([
        '/media/interludes/penny_xmas.mp4',
        '/media/interludes/penny_summer.mp4',
      ])

    await indexer.scanAll()

    // Verify Xmas
    expect(repo.upsertMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        filename: 'penny_xmas.mp4',
        dateStart: '12-01',
        dateEnd: '12-26',
      })
    )

    // Verify Summer
    expect(repo.upsertMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        filename: 'penny_summer.mp4',
        dateStart: '06-01',
        dateEnd: '08-31',
      })
    )
  })

  test('scanAll detects special media types', async () => {
    fs.listFiles
      .mockReturnValueOnce([
        '/media/videos/mylogo_intro.mp4',
        '/media/videos/other_intro.mp4',
        '/media/videos/sleepy_bedtime.mp4',
        '/media/videos/credits_outro.mp4',
      ])
      .mockReturnValueOnce([])

    await indexer.scanAll()

    // Verify Intro 1
    expect(repo.upsertMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        filename: 'mylogo_intro.mp4',
        mediaType: 'intro',
        isInterlude: false,
      })
    )

    // Verify Intro 2 (Should now be intro, not video - BUG FIX)
    expect(repo.upsertMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        filename: 'other_intro.mp4',
        mediaType: 'intro',
        isInterlude: false,
      })
    )

    // Verify Bedtime -> maps to offair
    expect(repo.upsertMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        filename: 'sleepy_bedtime.mp4',
        mediaType: 'offair',
        isInterlude: false,
      })
    )

    // Verify Outro
    expect(repo.upsertMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        filename: 'credits_outro.mp4',
        mediaType: 'outro',
        isInterlude: false,
      })
    )
  })
})
