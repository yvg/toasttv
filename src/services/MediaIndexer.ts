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

    let count = 0
    for (const filePath of files) {
      try {
        const filename = getFilename(filePath)

        // Optimize: Check if file already exists in DB to reuse duration
        const existing = await this.repository.getByPath(filePath)

        let duration = 0
        if (existing) {
          duration = existing.durationSeconds
        } else {
          duration = await this.mediaProbe.getDuration(filePath)
        }

        const mediaType = this.detectMediaType(filename, isInterlude)

        const { start: dateStart, end: dateEnd } = this.detectDates(filename)

        await this.repository.upsertMedia({
          path: filePath,
          filename,
          durationSeconds: duration,
          isInterlude: mediaType === 'interlude',
          mediaType,
          dateStart, // Pass calculated seasonal dates
          dateEnd,
        })

        outPaths.push(filePath)
        count++

        if (!existing) {
          console.log(`Indexed: ${filename} (${duration}s) [${mediaType}]`)
        }
      } catch (error) {
        console.error(`Failed to index ${filePath}:`, error)
      }
    }

    return count
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
}
