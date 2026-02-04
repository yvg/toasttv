/**
 * ToastTV Type Definitions
 *
 * Core interfaces and types used across the application.
 * All external dependencies should implement these interfaces for DI.
 */

// --- Media Types ---

export type MediaType = 'video' | 'interlude' | 'intro' | 'outro' | 'offair'

export interface MediaItem {
  readonly id: number
  readonly path: string
  readonly filename: string
  readonly durationSeconds: number
  readonly isInterlude: boolean // Kept for compatibility - true if type is interlude
  readonly mediaType: MediaType
  readonly dateStart: string | null
  readonly dateEnd: string | null
}

export interface PlaybackStatus {
  readonly isPlaying: boolean
  readonly currentFile: string | null
  readonly positionSeconds: number
  readonly durationSeconds: number
}

// --- Configuration ---

export interface VlcConfig {
  readonly host: string
  readonly port: number
  readonly reconnectDelayMs: number
  readonly maxReconnectAttempts: number
}

export interface SessionConfig {
  readonly limitMinutes: number
  readonly introVideoId: number | null
  readonly outroVideoId: number | null
}

export interface InterludeConfig {
  readonly enabled: boolean
  readonly frequency: number
  readonly directory: string
}

export interface LogoConfig {
  readonly filePath: string | null
  readonly opacity: number
  readonly position: number
}

export interface MediaConfig {
  readonly directory: string
  readonly supportedExtensions: readonly string[]
  readonly databasePath: string
}

export interface ToastTVConfig {
  readonly vlc: VlcConfig
  readonly media: MediaConfig
  readonly session: SessionConfig
  readonly interlude: InterludeConfig
  readonly logo: LogoConfig
}

// --- Interfaces for DI ---

export interface IVlcController {
  connect(): Promise<void>
  disconnect(): Promise<void>
  play(path: string): Promise<void>
  pause(): Promise<void>
  stop(): Promise<void>
  next(): Promise<void>
  enqueue(path: string): Promise<void>
  setLoop(enabled: boolean): Promise<void>
  getStatus(): Promise<PlaybackStatus>
}

export interface IFileSystem {
  listFiles(
    directory: string,
    extensions: readonly string[],
    excludePaths?: string[]
  ): string[]
  exists(path: string): boolean
}

export interface IMediaProbe {
  getDuration(filePath: string): Promise<number>
}

export interface IDateTimeProvider {
  now(): Date
  today(): string // YYYY-MM-DD
}

// --- Default Config ---

export const defaultConfig: ToastTVConfig = {
  vlc: {
    host: 'localhost',
    port: 9999,
    reconnectDelayMs: 2000,
    maxReconnectAttempts: 10,
  },
  media: {
    directory: '/media/videos',
    supportedExtensions: ['.mp4', '.mkv', '.avi', '.webm'],
    databasePath: '/var/lib/toasttv/media.db',
  },
  session: {
    limitMinutes: 30,
    introVideoId: null,
    outroVideoId: null,
  },
  interlude: {
    enabled: true,
    frequency: 2,
    directory: '/media/interludes',
  },
  logo: {
    filePath: null,
    opacity: 200,
    position: 6,
  },
}
