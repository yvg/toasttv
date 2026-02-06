/**
 * Local Dev Server for ToastTV
 *
 * Mocks GitHub release endpoints so VMs can curl-install from your Mac.
 * Auto-detects version from package.json.
 *
 * Usage:
 *   make serve-local
 *
 * Then in VM:
 *   curl -fsSL http://<mac-ip>:3000/install.sh | sudo LOCAL_SERVER=http://<mac-ip>:3000 bash
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
  idleTimeout: 0, // Disable timeout for slow downloads
  async fetch(req) {
    const url = new URL(req.url)
    const path = url.pathname

    console.log(`[dev-server] ${req.method} ${path}`)

    // GitHub API: Latest release - return actual version from package.json
    if (path === '/repos/yvg/toasttv/releases/latest') {
      const pkg = await file(join(PROJECT_ROOT, 'package.json')).json()
      return Response.json({ tag_name: pkg.version })
    }

    // Tarball download (App or Media)
    const mediaMatch = path.match(/\/releases\/download\/.*\/media\.tar\.gz/)
    const appMatch = path.match(/\/releases\/download\/.*\/toasttv-.*\.tar\.gz/)

    if (appMatch || mediaMatch) {
      let filename: string
      if (mediaMatch) {
        filename = 'media.tar.gz'
      } else {
        // Use actual version from package.json
        const pkg = await file(join(PROJECT_ROOT, 'package.json')).json()
        filename = `toasttv-${pkg.version}.tar.gz`
      }
      const tarball = file(join(PROJECT_ROOT, `dist/${filename}`))

      if (await tarball.exists()) {
        console.log(`[dev-server] Serving ${filename} (${tarball.size} bytes)`)
        return new Response(tarball, {
          headers: {
            'Content-Type': 'application/gzip',
            'Content-Length': tarball.size.toString(),
          },
        })
      }
      return new Response(`${filename} not found. Run 'make pack' first.`, {
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
ToastTV Dev Server running at http://${LOCAL_IP}:${PORT}

In your VM, run:

  curl -fsSL http://${LOCAL_IP}:${PORT}/install.sh | sudo LOCAL_SERVER=http://${LOCAL_IP}:${PORT} bash
`)
