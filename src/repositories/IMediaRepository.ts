/**
 * Media Repository Interface
 *
 * Defines the contract for media persistence operations.
 * Implementations can use SQLite, PostgreSQL, or any other storage.
 */

import type { MediaItem, MediaType } from '../types'

/**
 * Input type for creating/updating media items.
 * Omits the auto-generated id field.
 */
export type MediaItemInput = Omit<MediaItem, 'id'>

export interface IMediaRepository {
  /**
   * Initialize the repository (create tables, run migrations, etc.)
   */
  initialize(): Promise<void>

  /**
   * Close the repository connection
   */
  close(): Promise<void>

  // --- Read Operations ---

  /**
   * Get all media items sorted by filename
   */
  getAll(): Promise<MediaItem[]>

  /**
   * Get a single media item by ID
   */
  getById(id: number): Promise<MediaItem | null>

  /**
   * Get all videos (mediaType === 'video')
   */
  getAllVideos(): Promise<MediaItem[]>

  /**
   * Get interludes active on a given date
   * @param currentDate - YYYY-MM-DD format
   */
  getInterludes(currentDate: string): Promise<MediaItem[]>

  /**
   * Get media item by type (for singletons like intro/outro)
   */
  getByType(type: MediaType): Promise<MediaItem | null>

  // --- Write Operations ---

  /**
   * Insert or update a media item by path
   * On conflict, preserves user settings (type, dates)
   */
  upsertMedia(item: MediaItemInput): Promise<void>

  /**
   * Delete a media item by ID
   */
  deleteMedia(id: number): Promise<void>

  /**
   * Toggle interlude status for a media item
   */
  toggleInterlude(id: number, isInterlude: boolean): Promise<void>

  /**
   * Update the media type for an item
   */
  updateMediaType(id: number, mediaType: MediaType): Promise<void>

  /**
   * Reset all items of a given type back to 'video'
   * Used when setting a new intro/outro (singleton pattern)
   */
  resetMediaType(mediaType: MediaType): Promise<void>

  /**
   * Update scheduling dates for an interlude
   */
  updateDates(
    id: number,
    dateStart: string | null,
    dateEnd: string | null
  ): Promise<void>

  /**
   * Remove all media entries whose paths are not in the given list
   * Used during rescan to clean up deleted files
   */
  removeNotInPaths(validPaths: string[]): Promise<number>

  // --- Settings (DB-First Config) ---

  /**
   * Get a configuration value by key
   */
  getSetting(key: string): Promise<string | null>

  /**
   * Set a configuration value
   */
  setSetting(key: string, value: string): Promise<void>

  /**
   * Get all configuration settings as a key-value map
   */
  getAllSettings(): Promise<Record<string, string>>
}
