import * as path from 'node:path'
import type { Socket } from 'bun'
import type {
  IMediaPlayer,
  PlaybackStatus,
  PlayerConfig,
  LogoConfig,
} from '../types'

/**
 * MPV Client
 * Controls mpv via JSON IPC over Unix Socket.
 * Implements IMediaPlayer interface.
 */
export class MpvClient implements IMediaPlayer {
  private socket: Socket<unknown> | null = null
  private connected = false
  private requestId = 0
  private pendingRequests = new Map<
    number,
    { resolve: (val: any) => void; reject: (err: Error) => void }
  >()
  private eventListeners = new Set<(event: any) => void>()

  // Config uses "ipcSocket"
  constructor(private readonly config: PlayerConfig) {}

  get isConnected(): boolean {
    return this.connected
  }

  async connect(): Promise<void> {
    const socketPath = this.config.ipcSocket
    let attempts = 0

    while (attempts < this.config.maxReconnectAttempts) {
      try {
        await this.attemptConnection(socketPath)
        console.log(`Connected to MPV at ${socketPath}`)
        return
      } catch (error) {
        attempts++
        // Silent retry for development smoothness
        await Bun.sleep(this.config.reconnectDelayMs)
      }
    }

    // In dev, we might want to auto-spawn mpv, but for now just fail
    throw new Error(`Failed to connect to MPV at ${socketPath}`)
  }

  private attemptConnection(path: string): Promise<void> {
    return new Promise((resolve, reject) => {
      Bun.connect({
        unix: path,
        socket: {
          open: (socket) => {
            this.socket = socket
            this.connected = true
            resolve()
          },
          data: (_socket, data) => {
            this.handleData(data)
          },
          close: () => {
            this.connected = false
            console.log('MPV Disconnected')
          },
          error: (_socket, error) => {
            this.connected = false
            reject(error)
          },
        },
      })
    })
  }

  private handleData(data: Buffer) {
    const lines = data.toString().split('\n')
    for (const line of lines) {
      if (!line.trim()) continue
      try {
        const msg = JSON.parse(line)
        if (msg.request_id) {
          const resolver = this.pendingRequests.get(msg.request_id)
          if (resolver) {
            if (msg.error && msg.error !== 'success') {
              resolver.reject(new Error(`MPV Error: ${msg.error}`))
            } else {
              resolver.resolve(msg.data)
            }
            this.pendingRequests.delete(msg.request_id)
          }
        } else if (msg.event) {
          // Handle events if needed (end-file, property-change)
        }
      } catch (e) {
        // partial JSON or ignore
      }
    }
  }

  async disconnect(): Promise<void> {
    if (this.socket) {
      this.socket.end()
      this.socket = null
    }
    this.connected = false
  }

  /**
   * Send a command to MPV
   * @param args Command arguments (e.g. ["loadfile", "video.mp4"])
   */
  private send(args: any[]): Promise<any> {
    if (!this.connected || !this.socket) {
      // Auto-reconnect logic could go here
      return Promise.reject(new Error('Not connected to MPV'))
    }

    return new Promise((resolve, reject) => {
      this.requestId++
      const req = {
        command: args,
        request_id: this.requestId,
      }
      this.pendingRequests.set(this.requestId, { resolve, reject })
      this.socket!.write(JSON.stringify(req) + '\n')
    })
  }

  async play(path: string): Promise<void> {
    // "loadfile" "path" "replace" -> stops current, plays new
    await this.send(['loadfile', path, 'replace'])
    console.log(`MPV Playing: ${path}`)
    // Ensure not paused
    await this.send(['set_property', 'pause', false])
  }

  async enqueue(path: string): Promise<void> {
    // "loadfile" "path" "append"
    await this.send(['loadfile', path, 'append'])
  }

  async clear(): Promise<void> {
    // Stop and clear playlist
    await this.send(['stop'])
    await this.send(['playlist-clear'])
  }

  async pause(): Promise<void> {
    // Toggle pause? Or strictly pause?
    // Cycle pause to toggle state
    await this.send(['cycle', 'pause'])
  }

  async stop(): Promise<void> {
    await this.send(['stop'])
  }

  async next(): Promise<void> {
    // "playlist-next"
    await this.send(['playlist-next'])
  }

  async setLoop(enabled: boolean): Promise<void> {
    // mpv property "loop-file" or "loop-playlist"
    // Set loop-playlist property
    await this.send(['set_property', 'loop-playlist', enabled ? 'inf' : 'no'])
  }

  async getStatus(): Promise<PlaybackStatus> {
    try {
      // Get multiple properties in batch?
      // Multi-command or individual? Individual is fine for local IPC.
      const pause = await this.send(['get_property', 'pause']).catch(
        () => false
      ) // true/false
      const path = await this.send(['get_property', 'path']).catch(() => null)
      const timePos = await this.send(['get_property', 'time-pos']).catch(
        () => 0
      )
      const duration = await this.send(['get_property', 'duration']).catch(
        () => 0
      )
      const idle = await this.send(['get_property', 'idle-active']).catch(
        () => false
      )

      let state: 'playing' | 'paused' | 'stopped' = 'stopped'
      if (idle || !path) {
        state = 'stopped'
      } else if (pause) {
        state = 'paused'
      } else {
        state = 'playing'
      }

      return {
        isPlaying: state === 'playing',
        state,
        currentFile: path,
        positionSeconds: Math.floor(timePos || 0),
        durationSeconds: Math.floor(duration || 0),
      }
    } catch (e) {
      // Connection lost or error
      return {
        isPlaying: false,
        state: 'stopped',
        currentFile: null,
        positionSeconds: 0,
        durationSeconds: 0,
      }
    }
  }

  async updateLogo(config: LogoConfig): Promise<void> {
    // 1. Remove existing logo filter if any
    try {
      await this.send(['vf', 'remove', '@logo'])
    } catch (e) {
      // Filter might not exist, ignore error
    }

    if (!config.filePath) return

    // 2. Calculate values
    // Opacity: 0-255 -> 0.0-1.0
    const alpha = (config.opacity / 255).toFixed(2)

    // Position Mapping
    // margin_x / margin_y from config
    const mx = config.x || 0
    const my = config.y || 0

    let xExpr = `${mx}`
    let yExpr = `${my}`

    // Position constants
    // 0=Center, 1=Left, 2=Right, 4=Top, 8=Bottom
    // 5=Top-Left, 6=Top-Right, 9=Bottom-Left, 10=Bottom-Right
    switch (config.position) {
      case 0: // Center
        xExpr = `(main_w-overlay_w)/2`
        yExpr = `(main_h-overlay_h)/2`
        break
      case 1: // Left
        xExpr = `${mx}`
        yExpr = `(main_h-overlay_h)/2`
        break
      case 2: // Right
        xExpr = `main_w-overlay_w-${mx}`
        yExpr = `(main_h-overlay_h)/2`
        break
      case 4: // Top
        xExpr = `(main_w-overlay_w)/2`
        yExpr = `${my}`
        break
      case 8: // Bottom
        xExpr = `(main_w-overlay_w)/2`
        yExpr = `main_h-overlay_h-${my}`
        break
      case 5: // Top-Left
        xExpr = `${mx}`
        yExpr = `${my}`
        break
      case 6: // Top-Right
        xExpr = `main_w-overlay_w-${mx}`
        yExpr = `${my}`
        break
      case 9: // Bottom-Left
        xExpr = `${mx}`
        yExpr = `main_h-overlay_h-${my}`
        break
      case 10: // Bottom-Right
        xExpr = `main_w-overlay_w-${mx}`
        yExpr = `main_h-overlay_h-${my}`
        break
      default:
        // Default to Top-Left or custom if unknown
        xExpr = `${mx}`
        yExpr = `${my}`
    }

    // Escaping path for mpv/ffmpeg
    // MUST use absolute path for movie filter to be safe
    // Also remove ./ prefix if present just in case before resolve, though resolve handles it
    const absPath = path.resolve(config.filePath)
    // Replace backslashes with forward slashes for ffmpeg on windows? Mac needed? strict escaping?
    // FFmpeg inside MPV expects: match ' with '\''
    // And if path has : it must be escaped as \: inside filter string?
    // Let's stick to ' escaping for now.
    const safePath = absPath.replace(/'/g, "'\\''")

    // Filter Graph Construction
    // 1. movie='path' [logo]
    // 2. [logo] format=rgba, colorchannelmixer=aa=ALPHA [logo_alpha]
    // 3. [in][logo_alpha] overlay=x=...:y=... [out]

    // Filter Graph Construction
    // 1. movie='path' [logo]
    // 2. [logo] format=rgba, colorchannelmixer=aa=ALPHA [logo_ready]
    // 3. [in][logo_ready] overlay=x=...:y=... [out]

    // Use optimized path if possible, fallback to original
    let finalPath = safePath
    try {
      if (absPath) {
        // We need the raw path for ffmpeg, not the escaped one
        finalPath = await this.ensureOptimizedLogo(absPath)
        // Escape the new path
        finalPath = finalPath.replace(/'/g, "'\\''")
      }
    } catch (e) {
      console.error('Logo optimization failed, using original:', e)
    }

    const filter = `movie='${finalPath}'[logo];[logo]format=rgba,colorchannelmixer=aa=${alpha}[logo_ready];[in][logo_ready]overlay=x=${xExpr}:y=${yExpr}[out]`

    console.log(`[MpvClient] Setting logo:`, { config, filter })

    try {
      await this.send(['vf', 'add', `@logo:lavfi=[${filter}]`])
    } catch (e) {
      console.error('Failed to set logo overlay:', e)
    }
  }

  /**
   * Pre-scales the logo to a fixed height (120px) to avoid expensive
   * real-time scaling filters in MPV (which kill HW decoding on Pi).
   */
  private async ensureOptimizedLogo(sourcePath: string): Promise<string> {
    const ext = path.extname(sourcePath)
    const base = path.basename(sourcePath, ext)
    const fs = require('node:fs') // Lazy load

    // Save to /tmp to avoid file permission/persistence issues?
    // Or save next to original if writable. Let's try /tmp for safety and speed.
    const destPath = `/tmp/${base}-optimized.png`

    // If source is missing, throw
    if (!fs.existsSync(sourcePath)) return sourcePath

    try {
      // ffmpeg -y -i source -vf "scale=iw*min(1\,120/ih):-1" dest
      // Caps height at 120px, but allows smaller logos (like 80px) to pass through untouched.
      const proc = Bun.spawn([
        'ffmpeg',
        '-y',
        '-v',
        'error',
        '-i',
        sourcePath,
        '-vf',
        'scale=iw*min(1\\,120/ih):-1',
        destPath,
      ])

      await proc.exited

      if (proc.exitCode === 0) {
        console.log(`[MpvClient] Logo optimized to ${destPath}`)
        return destPath
      } else {
        console.warn(`[MpvClient] FFmpeg failed with code ${proc.exitCode}`)
        return sourcePath
      }
    } catch (e) {
      console.warn('[MpvClient] Failed to spawn ffmpeg:', e)
      return sourcePath
    }
  }
}
