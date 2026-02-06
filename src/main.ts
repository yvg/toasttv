/**
 * ToastTV Main Entry Point
 *
 * Starts both the daemon (media player control) and the web server (admin UI).
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
    // 1. Initialize daemon components (Sync/Fast)
    await daemon.init()

    // 2. Start background services (Scanning, MPV connection, creates services)
    console.log('Starting background services...')
    await daemon.start()

    // 3. Create web server (requires services from daemon.start())
    const { app, playbackService } = createServer(daemon)

    console.log(`🌐 Admin UI: http://localhost:${PORT}`)

    // 4. Start listening
    Bun.serve({
      port: PORT,
      fetch: app.fetch,
      idleTimeout: 0, // Disable timeout for SSE connections
    })

    // 5. Run playback loop in background
    playbackService.startLoop()
  } catch (error) {
    console.error('Fatal error:', error)
    await daemon.stop()
    process.exit(1)
  }
}

main()
