/**
 * File Watcher Service
 *
 * Watches media directories for file changes and batches them
 * using debouncing to avoid overwhelming the indexer.
 * Per ARCHITECTURE.md: This is a Service (stateful), not a Client.
 */

import { EventEmitter } from 'node:events'
import type { FileWatcher, IFileSystem } from '../types'

export class FileWatcherService extends EventEmitter {
  private watchers: FileWatcher[] = []
  private pending: Set<string> = new Set()
  private debounceTimer: Timer | null = null
  private readonly debounceMs = 2000 // Wait 2s after last event

  constructor(
    private readonly filesystem: IFileSystem,
    private readonly directories: string[],
    private readonly extensions: readonly string[]
  ) {
    super()
  }

  start(): void {
    for (const dir of this.directories) {
      if (!this.filesystem.exists(dir)) {
        console.warn(`FileWatcher: Skipping non-existent directory: ${dir}`)
        continue
      }

      try {
        const watcher = this.filesystem.watch(dir, (_event, path) => {
          // Filter by extension
          if (!this.extensions.some((ext) => path.endsWith(ext))) return

          this.pending.add(path)
          this.resetDebounce()
        })
        this.watchers.push(watcher)
        console.log(`FileWatcher: Watching ${dir}`)
      } catch (e) {
        console.error(`FileWatcher: Failed to watch ${dir}:`, e)
      }
    }
  }

  private resetDebounce(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer)

    this.debounceTimer = setTimeout(() => {
      const batch = [...this.pending]
      this.pending.clear()
      if (batch.length > 0) {
        this.emit('batch', batch)
      }
    }, this.debounceMs)
  }

  stop(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }
    for (const w of this.watchers) w.close()
    this.watchers = []
    this.pending.clear()
    console.log('FileWatcher: Stopped')
  }
}
