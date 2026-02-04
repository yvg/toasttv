/**
 * ToastTV Admin Web Server
 *
 * Slimmed-down server that mounts controllers.
 * All route logic is in controllers/.
 */

import { Hono } from 'hono'
import { serveStatic } from 'hono/bun'
import type { ToastTVDaemon } from './daemon'
import { renderDashboard } from './templates/dashboard'
import { ConfigService } from './services/ConfigService'
import { MediaService } from './services/MediaService'
import { PlaybackService } from './services/PlaybackService'
import { DashboardEventService } from './services/DashboardEventService'
import { ThumbnailClient } from './clients/ThumbnailClient'
import { createPlaybackController } from './controllers/PlaybackController'
import { createLibraryController } from './controllers/LibraryController'
import { createSettingsController } from './controllers/SettingsController'
import { createDashboardController } from './controllers/DashboardController'
import { EventsController } from './controllers/EventsController'

export interface ServerResult {
  app: Hono
  playbackService: PlaybackService
}

export function createServer(daemon: ToastTVDaemon): ServerResult {
  const app = new Hono()

  // --- Create Services ---
  const configService = new ConfigService(daemon.getConfigManager())
  const thumbnailClient = new ThumbnailClient()
  const dashboardEventService = new DashboardEventService()

  const mediaService = new MediaService(
    daemon.getRepository(),
    daemon.getIndexer(),
    configService,
    thumbnailClient
  )

  const playbackService = new PlaybackService({
    vlc: daemon.getVlc(),
    engine: daemon.getEngine(),
    config: configService,
    media: daemon.getRepository(),
    events: dashboardEventService,
  })

  // --- Mount Static Files ---
  app.use('/*', serveStatic({ root: './public' }))
  app.use('/thumbnails/*', serveStatic({ root: './data' }))

  // --- Mount Controllers ---
  const playbackController = createPlaybackController({
    playback: playbackService,
    media: mediaService,
  })

  const libraryController = createLibraryController({
    config: configService,
    media: mediaService,
    playlist: daemon.getEngine(),
  })

  const settingsController = createSettingsController({
    config: configService,
    media: mediaService,
  })

  const dashboardController = createDashboardController({
    playback: playbackService,
    media: mediaService,
  })

  const eventsController = new EventsController(
    playbackService,
    dashboardEventService
  )

  // Mount all controllers at root
  app.route('/', playbackController)
  app.route('/', libraryController)
  app.route('/', settingsController)
  app.route('/', dashboardController)

  // SSE endpoint for real-time dashboard updates
  app.get('/events/dashboard', (c) => eventsController.handleDashboardSSE(c))

  // --- Dashboard (home page) ---
  app.get('/', (c) => {
    return c.html(renderDashboard())
  })

  return { app, playbackService }
}
