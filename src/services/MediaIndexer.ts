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

interface ConventionDetectionOpts {
  detectIntro: boolean
  detectOutro: boolean
}

export class MediaIndexer {
  constructor(
    private readonly mediaConfig: MediaConfig,
    private readonly interludeConfig: InterludeConfig,
    private readonly repository: IMediaRepository,
    private readonly filesystem: IFileSystem,
    private readonly mediaProbe: IMediaProbe
  ) {}

  async scanAll(): Promise<number> {
    const videoPaths: string[] = []
    const interludePaths: string[] = []

    // Check if intro/outro already assigned - only apply convention if not
    const existingIntro = await this.repository.getByType('intro')
    const existingOutro = await this.repository.getByType('outro')
    const detectionOpts: ConventionDetectionOpts = {
      detectIntro: existingIntro === null,
      detectOutro: existingOutro === null,
    }

    // Scan videos (exclude interlude directory to prevent double counting)
    const videoCount = await this.scanDirectory(
      this.mediaConfig.directory,
      false,
      videoPaths,
      detectionOpts,
      [this.interludeConfig.directory]
    )

    // Scan interludes
    const interludeCount = await this.scanDirectory(
      this.interludeConfig.directory,
      true,
      interludePaths,
      detectionOpts
    )

    // Remove DB entries for files that no longer exist
    const allValidPaths = [...videoPaths, ...interludePaths]
    const removed = await this.repository.removeNotInPaths(allValidPaths)

    const total = videoCount + interludeCount
    console.log(
      `Indexed ${total} files (${videoCount} videos, ${interludeCount} interludes), removed ${removed} stale`
    )
    return total
  }

  private async scanDirectory(
    directory: string,
    isInterlude: boolean,
    outPaths: string[],
    detectionOpts: ConventionDetectionOpts,
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
        const duration = await this.mediaProbe.getDuration(filePath)
        const filename = getFilename(filePath)
        const mediaType = this.detectMediaType(filename, isInterlude, detectionOpts)

        // Once we've detected an intro/outro, disable further detection for that type
        if (mediaType === 'intro') detectionOpts.detectIntro = false
        if (mediaType === 'outro') detectionOpts.detectOutro = false

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
        console.log(`Indexed: ${filename} (${duration}s) [${mediaType}]`)
      } catch (error) {
        console.error(`Failed to index ${filePath}:`, error)
      }
    }

    return count
  }

  /**
   * Detect media type from filename conventions.
   * Patterns: `_intro` → intro, `_outro` → outro
   * Only applies if detection is enabled (no existing intro/outro in DB).
   */
  private detectMediaType(
    filename: string,
    isInterlude: boolean,
    opts: ConventionDetectionOpts
  ): MediaType {
    const lower = filename.toLowerCase()
    if (opts.detectIntro && lower.includes('_intro')) return 'intro'
    if (opts.detectOutro && lower.includes('_outro')) return 'outro'
    return isInterlude ? 'interlude' : 'video'
  }

  async refresh(): Promise<number> {
    return this.scanAll()
  }

  private detectDates(filename: string): { start: string | null; end: string | null } {
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
