/**
 * ToastTV Main Entry Point
 *
 * Starts both the daemon (VLC control) and the web server (admin UI).
 */

import { ToastTVDaemon } from './daemon'
import { createServer } from './server'

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 1993

async function main(): Promise<void> {
  console.log('🍞 ToastTV starting...')

  const daemon = new ToastTVDaemon('./data/config.json')

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('Received SIGTERM, shutting down...')
    await daemon.stop()
    process.exit(0)
  })

  process.on('SIGINT', async () => {
    console.log('Received SIGINT, shutting down...')
    await daemon.stop()
    process.exit(0)
  })

  try {
    // Initialize daemon (but don't auto-start session)
    await daemon.start()

    // Create and start web server
    const { app, playbackService } = createServer(daemon)

    console.log(`🌐 Admin UI: http://localhost:${PORT}`)

    Bun.serve({
      port: PORT,
      fetch: app.fetch,
      idleTimeout: 0, // Disable timeout for SSE connections
    })

    // Run playback loop in background (owned by PlaybackService)
    playbackService.startLoop()
  } catch (error) {
    console.error('Fatal error:', error)
    await daemon.stop()
    process.exit(1)
  }
}

main()
