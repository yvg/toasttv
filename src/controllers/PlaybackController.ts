/**
 * Playback Controller
 *
 * Handles playback-related API endpoints.
 * NOTE: The dashboard hero uses /partials/dashboard-state (DashboardController).
 */

import { Hono } from 'hono'
import { html } from 'hono/html'
import type { PlaybackService } from '../services/PlaybackService'
import type { MediaService } from '../services/MediaService'

interface PlaybackControllerDeps {
  playback: PlaybackService
  media: MediaService
}

export function createPlaybackController(deps: PlaybackControllerDeps) {
  const { playback } = deps
  const controller = new Hono()

  // --- API Endpoints ---

  controller.post('/api/session/start', async (c) => {
    await playback.startSession()
    return c.html(html`<div class="toast success">Session started</div>`)
  })

  controller.post('/api/skip', async (c) => {
    await playback.skip()
    return c.html(html`<div class="toast success">Skipped</div>`)
  })

  controller.post('/api/pause', async (c) => {
    await playback.pause()
    return c.html(html`<div class="toast success">Toggled pause</div>`)
  })

  controller.post('/api/session/stop', async (c) => {
    await playback.stop()
    return c.html(html`<div class="toast warning">Session stopped</div>`)
  })

  // Skip daily quota and resume normal playback
  controller.post('/api/skip-quota', async (c) => {
    await playback.skipQuotaAndResume()
    return c.html(
      html`<div class="toast success">Quota skipped for today</div>`
    )
  })

  return controller
}
