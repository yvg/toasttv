/**
 * Local Dev Server for ToastTV
 *
 * Mocks GitHub release endpoints so VMs can curl-install from your Mac.
 *
 * Usage:
 *   bun run scripts/dev-server.ts
 *
 * Then in VM:
 *   curl -fsSL http://<mac-ip>:3000/yvg/toasttv/main/scripts/install.sh | VERSION=dev sudo bash
 */

import { file } from 'bun'
import { join } from 'path'
import { networkInterfaces } from 'os'

// Get local IP address
function getLocalIP(): string {
  const nets = networkInterfaces()
  for (const name of Object.keys(nets)) {
    const iface = nets[name]
    if (!iface) continue
    for (const net of iface) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address
      }
    }
  }
  return 'localhost'
}

const LOCAL_IP = getLocalIP()

const PORT = 3000
const PROJECT_ROOT = join(import.meta.dir, '..')

void Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url)
    const path = url.pathname

    console.log(`[dev-server] ${req.method} ${path}`)

    // GitHub API: Latest release
    if (path === '/repos/yvg/toasttv/releases/latest') {
      return Response.json({ tag_name: 'dev' })
    }

    // Tarball download
    if (path.match(/\/releases\/download\/.*\/toasttv-.*\.tar\.gz/)) {
      const tarball = file(join(PROJECT_ROOT, 'dist/toasttv-dev.tar.gz'))
      if (await tarball.exists()) {
        return new Response(tarball, {
          headers: { 'Content-Type': 'application/gzip' },
        })
      }
      return new Response("Tarball not found. Run 'make pack' first.", {
        status: 404,
      })
    }

    // install.sh
    if (path === '/install.sh') {
      const script = file(join(PROJECT_ROOT, 'scripts/install.sh'))
      if (await script.exists()) {
        return new Response(script, {
          headers: { 'Content-Type': 'text/plain' },
        })
      }
      return new Response('install.sh not found', { status: 404 })
    }

    return new Response('Not Found', { status: 404 })
  },
})

console.log(`
╔════════════════════════════════════════════════════════════════════════════╗
║  ToastTV Dev Server                                                        ║
╠════════════════════════════════════════════════════════════════════════════╣
║                                                                            ║
║  In your VM, run:                                                          ║
║                                                                            ║
║  curl -fsSL http://${LOCAL_IP}:${PORT}/install.sh \\                          ║
║    | sudo LOCAL_SERVER=http://${LOCAL_IP}:${PORT} bash                        ║
║                                                                            ║
╚════════════════════════════════════════════════════════════════════════════╝
`)
