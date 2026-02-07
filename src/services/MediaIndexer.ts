/**
 * Media Indexer Service
 *
 * Scans media directories and updates the repository index.
 * Supports convention-based intro/outro detection via filename patterns.
 */

import type { IMediaRepository } from '../repositories/IMediaRepository'
import { getFilename } from '../clients/FilesystemClient'
import type {
  IFileSystem,
  IMediaProbe,
  InterludeConfig,
  MediaConfig,
  MediaType,
} from '../types'

export class MediaIndexer {
  private scanInProgress = false

  constructor(
    private readonly mediaConfig: MediaConfig,
    private readonly interludeConfig: InterludeConfig,
    private readonly repository: IMediaRepository,
    private readonly filesystem: IFileSystem,
    private readonly mediaProbe: IMediaProbe
  ) {}

  async scanAll(): Promise<number> {
    if (this.scanInProgress) {
      console.log('Scan already in progress, skipping')
      return 0
    }
    this.scanInProgress = true

    try {
      const videoPaths: string[] = []
      const interludePaths: string[] = []

      // Scan videos (exclude interlude directory to prevent double counting)
      const videoCount = await this.scanDirectory(
        this.mediaConfig.directory,
        false,
        videoPaths,
        [this.interludeConfig.directory]
      )

      // Scan interludes
      const interludeCount = await this.scanDirectory(
        this.interludeConfig.directory,
        true,
        interludePaths
      )

      // Remove DB entries for files that no longer exist
      const allValidPaths = [...videoPaths, ...interludePaths]
      const removed = await this.repository.removeNotInPaths(allValidPaths)

      const total = videoCount + interludeCount
      console.log(
        `Indexed ${total} files (${videoCount} videos, ${interludeCount} interludes), removed ${removed} stale`
      )
      return total
    } finally {
      this.scanInProgress = false
    }
  }

  private async scanDirectory(
    directory: string,
    isInterlude: boolean,
    outPaths: string[],
    excludePaths: string[] = []
  ): Promise<number> {
    if (!this.filesystem.exists(directory)) {
      console.warn(`Directory not found: ${directory}`)
      return 0
    }

    const files = this.filesystem.listFiles(
      directory,
      this.mediaConfig.supportedExtensions,
      excludePaths
    )

    if (files.length === 0) return 0

    // 1. Batch lookup existing entries
    const existingMap = await this.repository.getByPaths(files)

    // 2. Separate new files from existing ones
    const newFiles: string[] = []
    const existingFiles: string[] = []

    for (const filePath of files) {
      if (existingMap.has(filePath)) {
        existingFiles.push(filePath)
      } else {
        newFiles.push(filePath)
      }
    }

    // 3. Parallel probe new files with concurrency limit
    const CONCURRENCY = 4 // Pi Zero 2 W has 4 cores
    const durations = await this.probeParallel(newFiles, CONCURRENCY)

    // 4. Build items for batch upsert
    const itemsToUpsert: Array<{
      path: string
      filename: string
      durationSeconds: number
      isInterlude: boolean
      mediaType: MediaType
      dateStart: string | null
      dateEnd: string | null
    }> = []

    // Add new files
    for (let i = 0; i < newFiles.length; i++) {
      const filePath = newFiles[i]
      if (!filePath) continue // TypeScript guard
      const filename = getFilename(filePath)
      const duration = durations[i] ?? 0
      const mediaType = this.detectMediaType(filename, isInterlude)
      const { start: dateStart, end: dateEnd } = this.detectDates(filename)

      itemsToUpsert.push({
        path: filePath,
        filename,
        durationSeconds: duration,
        isInterlude: mediaType === 'interlude',
        mediaType,
        dateStart,
        dateEnd,
      })

      console.log(`Indexed: ${filename} (${duration}s) [${mediaType}]`)
    }

    // Add existing files (reuse duration, but still include in outPaths)
    for (const filePath of existingFiles) {
      const existing = existingMap.get(filePath)
      if (existing) {
        // No need to re-upsert existing files unless we want to update them
        outPaths.push(filePath)
      }
    }

    // 5. Batch upsert new files
    if (itemsToUpsert.length > 0) {
      await this.repository.upsertBatch(itemsToUpsert)
    }

    // Add new file paths to outPaths
    outPaths.push(...newFiles)

    return files.length
  }

  /**
   * Probe multiple files in parallel with concurrency limit
   */
  private async probeParallel(
    files: string[],
    concurrency: number
  ): Promise<number[]> {
    const results: number[] = []

    for (let i = 0; i < files.length; i += concurrency) {
      const batch = files.slice(i, i + concurrency)
      const batchResults = await Promise.all(
        batch.map(async (filePath) => {
          try {
            return await this.mediaProbe.getDuration(filePath)
          } catch (error) {
            console.error(`Failed to probe ${filePath}:`, error)
            return 0
          }
        })
      )
      results.push(...batchResults)
    }

    return results
  }

  /**
   * Detect media type from filename conventions.
   * Patterns:
   * - `_intro` or `_splash` → intro
   * - `_outro` → outro
   * - `_bedtime` or `_offair` → offair
   */
  private detectMediaType(filename: string, isInterlude: boolean): MediaType {
    const lower = filename.toLowerCase()
    if (lower.includes('_intro') || lower.includes('_splash')) return 'intro'
    if (lower.includes('_outro')) return 'outro'
    if (lower.includes('_bedtime') || lower.includes('_offair')) return 'offair'
    return isInterlude ? 'interlude' : 'video'
  }

  async refresh(): Promise<number> {
    return this.scanAll()
  }

  private detectDates(filename: string): {
    start: string | null
    end: string | null
  } {
    const lower = filename.toLowerCase()

    // Seasonal definitions (MM-DD)
    if (lower.includes('xmas') || lower.includes('christmas')) {
      return { start: '12-01', end: '12-26' }
    }
    if (lower.includes('halloween')) {
      return { start: '10-01', end: '10-31' }
    }
    if (lower.includes('easter')) {
      return { start: '03-20', end: '04-30' }
    }
    if (lower.includes('spring')) {
      return { start: '03-01', end: '05-31' }
    }
    if (lower.includes('summer')) {
      return { start: '06-01', end: '08-31' }
    }
    if (lower.includes('autumn') || lower.includes('fall')) {
      return { start: '09-01', end: '11-30' }
    }
    if (lower.includes('winter')) {
      return { start: '12-01', end: '02-28' }
    }

    return { start: null, end: null }
  }

  // --- File Watcher Integration ---

  private watcher: import('./FileWatcherService').FileWatcherService | null =
    null

  /**
   * Start watching media directories for changes
   */
  startWatching(): void {
    if (this.watcher) return // Already watching

    // Dynamically import to avoid circular dependency
    const { FileWatcherService } = require('./FileWatcherService')

    const watcher = new FileWatcherService(
      this.filesystem,
      [this.mediaConfig.directory, this.interludeConfig.directory],
      this.mediaConfig.supportedExtensions
    )

    watcher.on('batch', (paths: string[]) => {
      this.indexBatch(paths).catch(console.error)
    })

    watcher.start()
    this.watcher = watcher
    console.log('MediaIndexer: File watcher started')
  }

  /**
   * Stop watching media directories
   */
  stopWatching(): void {
    if (this.watcher) {
      this.watcher.stop()
      this.watcher = null
      console.log('MediaIndexer: File watcher stopped')
    }
  }

  /**
   * Index a batch of changed file paths (from file watcher)
   */
  async indexBatch(paths: string[]): Promise<number> {
    if (paths.length === 0) return 0

    // Filter to existing files only (removes may report deleted files)
    const existingPaths = paths.filter((p) => this.filesystem.exists(p))
    const deletedPaths = paths.filter((p) => !this.filesystem.exists(p))

    // Remove deleted files from DB
    if (deletedPaths.length > 0) {
      const removed = await this.repository.removeByPaths(deletedPaths)
      console.log(`MediaIndexer: Removed ${removed} deleted files`)
    }

    if (existingPaths.length === 0) return 0

    // Check which files are new vs existing
    const existingMap = await this.repository.getByPaths(existingPaths)
    const newPaths = existingPaths.filter((p) => !existingMap.has(p))

    if (newPaths.length === 0) return 0

    // Probe new files
    const durations = await this.probeParallel(newPaths, 4)

    const items: Array<{
      path: string
      filename: string
      durationSeconds: number
      isInterlude: boolean
      mediaType: MediaType
      dateStart: string | null
      dateEnd: string | null
    }> = []

    for (let i = 0; i < newPaths.length; i++) {
      const filePath = newPaths[i]
      if (!filePath) continue
      const filename = getFilename(filePath)
      const duration = durations[i] ?? 0
      const isInterlude = filePath.startsWith(this.interludeConfig.directory)
      const mediaType = this.detectMediaType(filename, isInterlude)
      const { start: dateStart, end: dateEnd } = this.detectDates(filename)

      items.push({
        path: filePath,
        filename,
        durationSeconds: duration,
        isInterlude: mediaType === 'interlude',
        mediaType,
        dateStart,
        dateEnd,
      })

      console.log(`Indexed (watch): ${filename} (${duration}s) [${mediaType}]`)
    }

    if (items.length > 0) {
      await this.repository.upsertBatch(items)
    }

    return items.length
  }
}
