/**
 * Events Controller
 *
 * SSE endpoint for real-time dashboard updates.
 */

import type { Context } from 'hono'
import type { PlaybackService } from '../services/PlaybackService'
import type {
  DashboardEventService,
  SyncEvent,
} from '../services/DashboardEventService'
import { logger } from '../utils/logger'

export class EventsController {
  constructor(
    private readonly playback: PlaybackService,
    private readonly events: DashboardEventService
  ) {}

  /**
   * SSE endpoint for dashboard updates
   * GET /events/dashboard
   */
  async handleDashboardSSE(c: Context): Promise<Response> {
    // Build initial sync event
    const syncEvent = await this.buildSyncEvent()

    // Create SSE stream
    const stream = new ReadableStream({
      start: (controller) => {
        const encoder = new TextEncoder()

        const writer = {
          write: (data: string) => {
            try {
              controller.enqueue(encoder.encode(data))
            } catch {
              // Stream closed
            }
          },
          close: () => {
            try {
              controller.close()
            } catch {
              // Already closed
            }
          },
        }

        // Send initial sync
        writer.write(`data: ${JSON.stringify(syncEvent)}\n\n`)

        // Register for future events
        this.events.addClient(writer)

        // Handle disconnect via abort signal
        c.req.raw.signal.addEventListener('abort', () => {
          this.events.removeClient(writer)
        })

        // Heartbeat every 30s to keep connection alive
        const heartbeat = setInterval(() => {
          try {
            writer.write(': heartbeat\n\n')
          } catch {
            clearInterval(heartbeat)
          }
        }, 30000)

        c.req.raw.signal.addEventListener('abort', () => {
          clearInterval(heartbeat)
        })
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  }

  /**
   * Build initial sync event with current state
   */
  private async buildSyncEvent(): Promise<SyncEvent> {
    const session = this.playback.sessionInfo
    const currentVideo = this.playback.getCurrentMedia()
    const status = await this.playback.getStatus()
    const queue = this.playback.peekQueue(10)

    const sessionActive = session.startedAt !== null
    const limitMs = session.limitMinutes * 60 * 1000
    const remainingMs = Math.max(0, limitMs - session.elapsedMs)

    const syncEvent: SyncEvent = {
      type: 'sync',
      sessionActive,
      isOffAir: this.playback.isOffAir,
      resetHour: session.resetHour,
      trackId: currentVideo?.id ?? null,
      filename: currentVideo?.filename ?? null,
      duration: currentVideo?.durationSeconds ?? 0,
      position: status?.positionSeconds ?? 0,
      isPlaying: status?.isPlaying ?? false,
      sessionRemainingMs: remainingMs,
      queue: queue.map((v) => ({
        id: v.id,
        filename: v.filename,
        isInterlude: v.isInterlude,
      })),
    }

    logger.debug(
      'SSE',
      `sync: ${syncEvent.filename} pos=${syncEvent.position} dur=${syncEvent.duration}`
    )
    return syncEvent
  }
}
