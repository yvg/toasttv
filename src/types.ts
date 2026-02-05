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
  readonly state: 'playing' | 'paused' | 'stopped'
  readonly currentFile: string | null
  readonly positionSeconds: number
  readonly durationSeconds: number
}

// --- Configuration ---

export interface PlayerConfig {
  readonly ipcSocket: string
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
  readonly x?: number
  readonly y?: number
}

export interface MediaConfig {
  readonly directory: string
  readonly supportedExtensions: readonly string[]
  readonly databasePath: string
}

export interface ToastTVConfig {
  readonly mpv: PlayerConfig
  readonly media: MediaConfig
  readonly session: SessionConfig
  readonly interlude: InterludeConfig
  readonly logo: LogoConfig
}

// --- Interfaces for DI ---

export interface IMediaPlayer {
  readonly isConnected: boolean
  connect(): Promise<void>
  disconnect(): Promise<void>

  play(path: string): Promise<void>
  enqueue(path: string): Promise<void>
  clear(): Promise<void>
  pause(): Promise<void>
  stop(): Promise<void>
  next(): Promise<void>
  setLoop(enabled: boolean): Promise<void>
  getStatus(): Promise<PlaybackStatus>
  updateLogo(config: LogoConfig): Promise<void>
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
