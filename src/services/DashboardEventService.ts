/**
 * Dashboard Event Service
 *
 * Manages SSE connections for dashboard real-time updates.
 * Broadcasts events to all connected clients.
 */

import { logger } from '../utils/logger'

export interface SyncEvent {
  type: 'sync'
  sessionActive: boolean
  isOffAir: boolean
  resetHour: number
  trackId: number | null
  filename: string | null
  duration: number
  position: number
  isPlaying: boolean
  sessionRemainingMs: number
  queue: Array<{ id: number; filename: string; isInterlude: boolean }>
}

export interface TrackStartEvent {
  type: 'trackStart'
  trackId: number
  filename: string
  duration: number
  queue: Array<{ id: number; filename: string; isInterlude: boolean }>
}

export interface PausedEvent {
  type: 'paused'
}

export interface PlayingEvent {
  type: 'playing'
}

export interface SessionStartEvent {
  type: 'sessionStart'
  sessionRemainingMs: number
  queue: Array<{ id: number; filename: string; isInterlude: boolean }>
}

export interface SessionEndEvent {
  type: 'sessionEnd'
}

export interface QueueUpdateEvent {
  type: 'queueUpdate'
  queue: Array<{ id: number; filename: string; isInterlude: boolean }>
}

export type DashboardEvent =
  | SyncEvent
  | TrackStartEvent
  | PausedEvent
  | PlayingEvent
  | SessionStartEvent
  | SessionEndEvent
  | QueueUpdateEvent

type SSEWriter = {
  write: (data: string) => void
  close: () => void
}

export class DashboardEventService {
  private clients: Set<SSEWriter> = new Set()
  private lastPlayingState: boolean | null = null

  /**
   * Add a new SSE client connection
   */
  addClient(writer: SSEWriter): void {
    this.clients.add(writer)
    logger.debug('SSE', `client connected (total: ${this.clients.size})`)
  }

  /**
   * Remove a disconnected SSE client
   */
  removeClient(writer: SSEWriter): void {
    this.clients.delete(writer)
    logger.debug('SSE', `client disconnected (total: ${this.clients.size})`)
  }

  /**
   * Get number of connected clients
   */
  get clientCount(): number {
    return this.clients.size
  }

  /**
   * Broadcast an event to all connected clients
   */
  broadcast(event: DashboardEvent): void {
    if (this.clients.size === 0) return

    const detail =
      event.type === 'trackStart' ? (event as TrackStartEvent).filename : ''
    logger.debug('SSE', `broadcast: ${event.type} ${detail}`)
    const data = this.formatSSE(event)

    for (const client of this.clients) {
      try {
        client.write(data)
      } catch {
        // Client disconnected, will be cleaned up
        this.clients.delete(client)
      }
    }
  }

  /**
   * Broadcast playing state change (with deduplication)
   */
  broadcastPlayingState(isPlaying: boolean): void {
    if (this.lastPlayingState === isPlaying) return
    this.lastPlayingState = isPlaying
    this.broadcast({ type: isPlaying ? 'playing' : 'paused' })
  }

  /**
   * Reset playing state tracking (on session start/end)
   */
  resetPlayingState(): void {
    this.lastPlayingState = null
  }

  /**
   * Format event as SSE message
   */
  private formatSSE(event: DashboardEvent): string {
    return `data: ${JSON.stringify(event)}\n\n`
  }
}
