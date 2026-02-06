/**
 * SQLite Media Repository
 *
 * Uses Bun's built-in SQLite for zero-dependency persistence.
 * Implements IMediaRepository for dependency injection.
 */

import { Database } from 'bun:sqlite'
import type { MediaItem, MediaType } from '../types'
import type { IMediaRepository, MediaItemInput } from './IMediaRepository'

// Base schema without media_type (for backwards compatibility)
const BASE_SCHEMA = `
CREATE TABLE IF NOT EXISTS media (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT UNIQUE NOT NULL,
  filename TEXT NOT NULL,
  duration_seconds INTEGER NOT NULL,
  is_interlude INTEGER NOT NULL DEFAULT 0,
  date_start TEXT,
  date_end TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_media_interlude ON media(is_interlude);
`

export class MediaRepository implements IMediaRepository {
  private db: Database | null = null

  constructor(private readonly dbPath: string) {}

  async initialize(): Promise<void> {
    this.db = new Database(this.dbPath, { create: true })

    // Create base schema first
    this.db.exec(BASE_SCHEMA)

    //Create settings table
    this.db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    `)

    // Migration: add media_type column if missing
    const columns = this.db.prepare('PRAGMA table_info(media)').all() as Array<{
      name: string
    }>
    const hasMediaType = columns.some((c) => c.name === 'media_type')

    if (!hasMediaType) {
      this.db.exec(
        `ALTER TABLE media ADD COLUMN media_type TEXT NOT NULL DEFAULT 'video'`
      )
      // Migrate existing interludes
      this.db.exec(
        `UPDATE media SET media_type = 'interlude' WHERE is_interlude = 1`
      )
      console.log('Migrated database to include media_type column')
    }

    // Now create index on media_type (column guaranteed to exist)
    this.db.exec(
      `CREATE INDEX IF NOT EXISTS idx_media_type ON media(media_type);`
    )

    console.log(`Initialized media database at ${this.dbPath}`)
  }

  async getSetting(key: string): Promise<string | null> {
    if (!this.db) throw new Error('Repository not initialized')
    const row = this.db
      .prepare('SELECT value FROM settings WHERE key = ?')
      .get(key) as { value: string } | null
    return row?.value ?? null
  }

  async setSetting(key: string, value: string): Promise<void> {
    if (!this.db) throw new Error('Repository not initialized')
    this.db
      .prepare(
        'INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
      )
      .run(key, value)
  }

  async getAllSettings(): Promise<Record<string, string>> {
    if (!this.db) throw new Error('Repository not initialized')
    const rows = this.db
      .prepare('SELECT key, value FROM settings')
      .all() as Array<{
      key: string
      value: string
    }>
    return rows.reduce(
      (acc, row) => ({ ...acc, [row.key]: row.value }),
      {} as Record<string, string>
    )
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close()
      this.db = null
    }
  }

  async getAllVideos(): Promise<MediaItem[]> {
    if (!this.db) throw new Error('Repository not initialized')

    const stmt = this.db.prepare(`
      SELECT id, path, filename, duration_seconds, is_interlude, media_type, date_start, date_end
      FROM media WHERE media_type = 'video'
    `)

    const rows = stmt.all() as Array<Record<string, unknown>>
    return rows.map((row) => this.rowToMediaItem(row))
  }

  async getInterludes(currentDate: string): Promise<MediaItem[]> {
    if (!this.db) throw new Error('Repository not initialized')

    // Logic handles:
    // 1. Permanent items (dates are null)
    // 2. Simple ranges (Start <= End): e.g. 03-01 to 05-31. Current must be between.
    // 3. Wrap-around ranges (Start > End): e.g. 12-01 to 02-28. Current must be >= Start OR <= End.
    // NOTE: We assume dates are stored as 'MM-DD' or 'YYYY-MM-DD'. We compare substrings.

    // SQLite substr(date, 6, 5) extracts 'MM-DD' from 'YYYY-MM-DD'.
    // If stored as 'MM-DD', we use it directly.
    // Current date passed in is YYYY-MM-DD. We extract MM-DD.

    const stmt = this.db.prepare(`
      SELECT id, path, filename, duration_seconds, is_interlude, media_type, date_start, date_end
      FROM media
      WHERE media_type = 'interlude'
        AND (
          (date_start IS NULL AND date_end IS NULL)
          OR (
             -- Case A: Simple Range (Start <= End)
             date_start <= date_end 
             AND strftime('%m-%d', ?1) BETWEEN date_start AND date_end
          )
          OR (
             -- Case B: Wrap-around Range (Start > End, e.g. Winter)
             date_start > date_end
             AND (strftime('%m-%d', ?1) >= date_start OR strftime('%m-%d', ?1) <= date_end)
          )
        )
    `)

    const rows = stmt.all(currentDate) as Array<Record<string, unknown>>
    return rows.map((row) => this.rowToMediaItem(row))
  }

  async getAll(): Promise<MediaItem[]> {
    if (!this.db) throw new Error('Repository not initialized')

    const stmt = this.db.prepare(`
      SELECT id, path, filename, duration_seconds, is_interlude, media_type, date_start, date_end
      FROM media ORDER BY filename
    `)

    const rows = stmt.all() as Array<Record<string, unknown>>
    return rows.map((row) => this.rowToMediaItem(row))
  }

  async getByType(type: MediaType): Promise<MediaItem | null> {
    if (!this.db) throw new Error('Repository not initialized')

    const stmt = this.db.prepare(`
      SELECT id, path, filename, duration_seconds, is_interlude, media_type, date_start, date_end
      FROM media WHERE media_type = ?
    `)

    const row = stmt.get(type) as Record<string, unknown> | null
    return row ? this.rowToMediaItem(row) : null
  }

  async upsertMedia(item: MediaItemInput): Promise<void> {
    if (!this.db) throw new Error('Repository not initialized')

    // On conflict:
    // 1. Always update filename and duration (file system truth)
    // 2. If 'excluded.is_interlude' is 1 (file is in interlude folder), FORCE update to interlude.
    //    (Directory authority overrides manual 'Video' setting).
    // 3. Otherwise, preserve existing is_interlude (User might have manually tagged a Video as Interlude).
    // 4. Same logic for media_type apploes.

    // Note: We use CASE statements for selective updates.
    // AND: We use COALESCE for dates to "backfill" defaults (from indexer) without overriding user settings.

    const stmt = this.db.prepare(`
      INSERT INTO media (path, filename, duration_seconds, is_interlude, media_type, date_start, date_end)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
      ON CONFLICT(path) DO UPDATE SET
        filename = excluded.filename,
        duration_seconds = excluded.duration_seconds,
        is_interlude = CASE 
          WHEN excluded.is_interlude = 1 THEN 1 
          ELSE media.is_interlude 
        END,
        media_type = CASE 
          WHEN excluded.media_type = 'interlude' THEN 'interlude' 
          ELSE media.media_type 
        END,
        date_start = COALESCE(media.date_start, excluded.date_start),
        date_end = COALESCE(media.date_end, excluded.date_end)
    `)

    stmt.run(
      item.path,
      item.filename,
      item.durationSeconds,
      item.isInterlude ? 1 : 0,
      item.mediaType,
      item.dateStart,
      item.dateEnd
    )
  }

  async deleteMedia(id: number): Promise<void> {
    if (!this.db) throw new Error('Repository not initialized')

    const stmt = this.db.prepare('DELETE FROM media WHERE id = ?')
    stmt.run(id)
  }

  async toggleInterlude(id: number, isInterlude: boolean): Promise<void> {
    if (!this.db) throw new Error('Repository not initialized')

    const stmt = this.db.prepare(
      'UPDATE media SET is_interlude = ?, media_type = ? WHERE id = ?'
    )
    stmt.run(isInterlude ? 1 : 0, isInterlude ? 'interlude' : 'video', id)
  }

  async updateMediaType(id: number, mediaType: MediaType): Promise<void> {
    if (!this.db) throw new Error('Repository not initialized')

    const isInterlude = mediaType === 'interlude'
    const stmt = this.db.prepare(
      'UPDATE media SET media_type = ?, is_interlude = ? WHERE id = ?'
    )
    stmt.run(mediaType, isInterlude ? 1 : 0, id)
  }

  async resetMediaType(mediaType: MediaType): Promise<void> {
    if (!this.db) throw new Error('Repository not initialized')

    // Reset all items of this type back to 'video'
    const stmt = this.db.prepare(
      'UPDATE media SET media_type = ?, is_interlude = 0 WHERE media_type = ?'
    )
    stmt.run('video', mediaType)
  }

  async getById(id: number): Promise<MediaItem | null> {
    if (!this.db) throw new Error('Repository not initialized')

    const stmt = this.db.prepare(`
      SELECT id, path, filename, duration_seconds, is_interlude, media_type, date_start, date_end
      FROM media WHERE id = ?
    `)
    const row = stmt.get(id) as Record<string, unknown> | null
    return row ? this.rowToMediaItem(row) : null
  }

  async getByPath(path: string): Promise<MediaItem | null> {
    if (!this.db) throw new Error('Repository not initialized')

    const stmt = this.db.prepare(`
      SELECT id, path, filename, duration_seconds, is_interlude, media_type, date_start, date_end
      FROM media WHERE path = ?
    `)
    const row = stmt.get(path) as Record<string, unknown> | null
    return row ? this.rowToMediaItem(row) : null
  }

  async updateDates(
    id: number,
    dateStart: string | null,
    dateEnd: string | null
  ): Promise<void> {
    if (!this.db) throw new Error('Repository not initialized')

    const stmt = this.db.prepare(
      'UPDATE media SET date_start = ?, date_end = ? WHERE id = ?'
    )
    stmt.run(dateStart, dateEnd, id)
  }

  private rowToMediaItem(row: Record<string, unknown>): MediaItem {
    const mediaType = (row.media_type as MediaType) ?? 'video'
    return {
      id: row.id as number,
      path: row.path as string,
      filename: row.filename as string,
      durationSeconds: row.duration_seconds as number,
      isInterlude: Boolean(row.is_interlude),
      mediaType,
      dateStart: (row.date_start as string) ?? null,
      dateEnd: (row.date_end as string) ?? null,
    }
  }

  async removeNotInPaths(validPaths: string[]): Promise<number> {
    if (!this.db) throw new Error('Repository not initialized')

    if (validPaths.length === 0) {
      // Remove all entries
      const countResult = this.db
        .prepare('SELECT COUNT(*) as count FROM media')
        .get() as { count: number }
      this.db.exec('DELETE FROM media')
      console.log(`Removed ${countResult.count} stale entries (no valid paths)`)
      return countResult.count
    }

    // Get all current paths in DB
    const allPaths = this.db.prepare('SELECT path FROM media').all() as Array<{
      path: string
    }>
    const validPathSet = new Set(validPaths)

    let removed = 0
    for (const { path } of allPaths) {
      if (!validPathSet.has(path)) {
        this.db.prepare('DELETE FROM media WHERE path = ?').run(path)
        console.log(`Removed stale entry: ${path}`)
        removed++
      }
    }

    if (removed > 0) {
      console.log(`Removed ${removed} stale entries from database`)
    }
    return removed
  }
}
