import { Hono } from 'hono'
import type { PlaybackService } from '../services/PlaybackService'
import type { MediaService } from '../services/MediaService'
import { renderDashboardHero } from '../templates/hero'

interface DashboardControllerDeps {
  playback: PlaybackService
  media: MediaService
}

export function createDashboardController({ playback, media }: DashboardControllerDeps) {
  const app = new Hono()

  app.get('/partials/dashboard-state', async (c) => {
    const status = await playback.getStatus()
    const sessionInfo = playback.getSessionInfo()
    const currentVideo = await playback.getCurrentMedia()
    const queue = playback.peekQueue(10) // Peek next 10 items for the rail
    
    // HTML for the Hero Card (Now Playing + Queue)
    const html = renderDashboardHero({
        status, 
        sessionInfo,
        currentVideo,
        queue
    })

    return c.html(html)
  })

  // Shuffle Action
  app.post('/api/session/shuffle', async (c) => {
    await playback.shuffleQueue()
    // Return empty string or re-render partial? 
    // Best to re-render the hero to show new queue immediately
    // Or just let the poller pick it up? 
    // To be responsive: trigger a refresh.
    // For now, let's just return 200 OK and let the poller update (client-side triggers?)
    // Actually, returning the new state immediately is best for UX.
    return c.redirect('/partials/dashboard-state') 
    // But htmx uses swap. so redirect might load full page?
    // Let's call the logic directly.
  })

  return app
}
