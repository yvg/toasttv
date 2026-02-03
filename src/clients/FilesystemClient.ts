/**
 * Filesystem and Media Probe Clients
 *
 * Thin wrappers around OS/CLI tools to enable mocking in tests.
 */

import { Glob } from 'bun'
import { existsSync, statSync } from 'node:fs'
import { basename, extname } from 'node:path'
import type { IFileSystem, IMediaProbe } from '../types'

export class FilesystemClient implements IFileSystem {
  listFiles(directory: string, extensions: readonly string[], excludePaths: string[] = []): string[] {
    const files: string[] = []
    
    // Ensure strict absolute path comparison
    // We assume 'directory' might be relative, but glob.scanSync(absolute: true) returns full paths.
    // We must resolve excludePaths relative to CWD if they are relative.
    const path = require('node:path')
    const absExcludes = excludePaths.map((p) => path.resolve(p))

    for (const ext of extensions) {
      const glob = new Glob(`**/*${ext}`)
      for (const file of glob.scanSync({ cwd: directory, absolute: true })) {
        // file is absolute. absExcludes are absolute.
        if (!absExcludes.some((p) => file.startsWith(p))) {
          files.push(file)
        }
      }
    }

    return files.sort()
  }

  exists(path: string): boolean {
    return existsSync(path)
  }
}

export class FFProbeClient implements IMediaProbe {
  async getDuration(filePath: string): Promise<number> {
    const proc = Bun.spawn([
      'ffprobe',
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      filePath,
    ])

    const output = await new Response(proc.stdout).text()
    const exitCode = await proc.exited

    if (exitCode !== 0) {
      throw new Error(`ffprobe failed for ${filePath}`)
    }

    return Math.floor(parseFloat(output.trim()) || 0)
  }

  static async checkAvailable(): Promise<boolean> {
    try {
      const proc = Bun.spawn(['ffprobe', '-version'])
      await proc.exited
      return true
    } catch {
      return false
    }
  }
}

export function getFilename(path: string): string {
  return basename(path)
}

export function getExtension(path: string): string {
  return extname(path).toLowerCase()
}
