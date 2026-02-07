/**
 * Unit tests for FileWatcherService
 */

import { describe, expect, test, beforeEach, mock as bunMock } from 'bun:test'
import { mock, type MockProxy } from 'jest-mock-extended'
import { FileWatcherService } from '../src/services/FileWatcherService'
import type { FileWatcher, IFileSystem } from '../src/types'

describe('FileWatcherService', () => {
  let fs: MockProxy<IFileSystem>
  let service: FileWatcherService
  let capturedCallback:
    | ((event: 'add' | 'change' | 'remove', path: string) => void)
    | null

  const TEST_DIRECTORIES = ['/media/videos', '/media/interludes']
  const TEST_EXTENSIONS = ['.mp4', '.mkv'] as const

  beforeEach(() => {
    fs = mock<IFileSystem>()
    capturedCallback = null

    // Default: directories exist
    fs.exists.mockReturnValue(true)

    // Capture the callback passed to watch()
    fs.watch.mockImplementation((_dir, callback) => {
      capturedCallback = callback
      return { close: bunMock(() => {}) }
    })

    service = new FileWatcherService(fs, TEST_DIRECTORIES, TEST_EXTENSIONS)
  })

  test('start() watches all existing directories', () => {
    service.start()

    expect(fs.watch).toHaveBeenCalledTimes(2)
    expect(fs.watch).toHaveBeenCalledWith('/media/videos', expect.any(Function))
    expect(fs.watch).toHaveBeenCalledWith(
      '/media/interludes',
      expect.any(Function)
    )
  })

  test('start() skips non-existent directories', () => {
    // Only interludes directory exists
    fs.exists.mockImplementation((path) => path === '/media/interludes')

    service.start()

    expect(fs.watch).toHaveBeenCalledTimes(1)
    expect(fs.watch).toHaveBeenCalledWith(
      '/media/interludes',
      expect.any(Function)
    )
  })

  test('filters events by extension', async () => {
    const batchPromise = new Promise<string[]>((resolve) => {
      service.on('batch', resolve)
    })

    service.start()

    // Trigger events for various files
    capturedCallback?.('add', '/media/videos/show.mp4') // Should pass
    capturedCallback?.('add', '/media/videos/image.jpg') // Should be filtered
    capturedCallback?.('add', '/media/videos/outro.mkv') // Should pass

    // Advance timer (debounce) - use real setTimeout since service uses it internally
    await new Promise((r) => setTimeout(r, 2100))

    const batch = await batchPromise
    expect(batch).toHaveLength(2)
    expect(batch).toContain('/media/videos/show.mp4')
    expect(batch).toContain('/media/videos/outro.mkv')
  })

  test('debounces rapid events into single batch', async () => {
    let batchCount = 0
    service.on('batch', () => batchCount++)

    service.start()

    // Rapid-fire events
    capturedCallback?.('add', '/media/videos/a.mp4')
    capturedCallback?.('add', '/media/videos/b.mp4')
    capturedCallback?.('add', '/media/videos/c.mp4')

    // Wait for debounce
    await new Promise((r) => setTimeout(r, 2100))

    expect(batchCount).toBe(1) // Single batch despite 3 events
  })

  test('deduplicates same file path', async () => {
    const batchPromise = new Promise<string[]>((resolve) => {
      service.on('batch', resolve)
    })

    service.start()

    // Same file multiple times (e.g., rapid saves)
    capturedCallback?.('change', '/media/videos/show.mp4')
    capturedCallback?.('change', '/media/videos/show.mp4')
    capturedCallback?.('change', '/media/videos/show.mp4')

    await new Promise((r) => setTimeout(r, 2100))

    const batch = await batchPromise
    expect(batch).toHaveLength(1)
    expect(batch[0]).toBe('/media/videos/show.mp4')
  })

  test('stop() clears pending events', async () => {
    let batched = false
    service.on('batch', () => {
      batched = true
    })

    service.start()
    capturedCallback?.('add', '/media/videos/show.mp4')
    service.stop()

    await new Promise((r) => setTimeout(r, 2100))

    expect(batched).toBe(false) // Event was cleared, not batched
  })
})
