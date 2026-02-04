/**
 * VLC Remote Control Client
 *
 * Connects to VLC's telnet-based RC interface for programmatic control.
 * Uses Bun's native TCP socket API.
 */

import type { Socket } from 'bun'
import type { IVlcController, PlaybackStatus, VlcConfig } from '../types'

export class VlcConnectionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'VlcConnectionError'
  }
}

export class VlcClient implements IVlcController {
  private socket: Socket<unknown> | null = null
  private connected = false
  private responseBuffer = ''

  constructor(private readonly config: VlcConfig) {}

  get isConnected(): boolean {
    return this.connected
  }

  async connect(): Promise<void> {
    let attempts = 0

    while (attempts < this.config.maxReconnectAttempts) {
      try {
        await this.attemptConnection()
        console.log(
          `Connected to VLC at ${this.config.host}:${this.config.port}`
        )
        return
      } catch (error) {
        attempts++
        console.warn(
          `VLC connection attempt ${attempts} failed. Retrying in ${this.config.reconnectDelayMs}ms...`
        )
        await Bun.sleep(this.config.reconnectDelayMs)
      }
    }

    throw new VlcConnectionError(
      `Failed to connect to VLC after ${this.config.maxReconnectAttempts} attempts`
    )
  }

  private attemptConnection(): Promise<void> {
    return new Promise((resolve, reject) => {
      Bun.connect({
        hostname: this.config.host,
        port: this.config.port,
        socket: {
          open: (socket) => {
            this.socket = socket
            this.connected = true
            resolve()
          },
          data: (_socket, data) => {
            this.responseBuffer += data.toString()
          },
          close: () => {
            this.connected = false
          },
          error: (_socket, error) => {
            this.connected = false
            reject(error)
          },
        },
      })
    })
  }

  async disconnect(): Promise<void> {
    if (this.socket) {
      this.socket.end()
      this.socket = null
    }
    this.connected = false
    console.log('Disconnected from VLC')
  }

  private async sendCommand(command: string): Promise<string> {
    if (!this.connected || !this.socket) {
      throw new VlcConnectionError('Not connected to VLC')
    }

    this.responseBuffer = ''
    this.socket.write(`${command}\n`)

    // Wait for response
    await Bun.sleep(100)
    return this.responseBuffer.trim()
  }

  async play(path: string): Promise<void> {
    await this.sendCommand('clear')
    await this.sendCommand(`add ${path}`)
    await this.sendCommand('play')
    console.log(`Playing: ${path}`)
  }

  async enqueue(path: string): Promise<void> {
    await this.sendCommand(`enqueue ${path}`)
  }

  async clear(): Promise<void> {
    await this.sendCommand('clear')
  }

  async pause(): Promise<void> {
    await this.sendCommand('pause')
  }

  async stop(): Promise<void> {
    await this.sendCommand('stop')
  }

  async next(): Promise<void> {
    await this.sendCommand('next')
  }

  async setLoop(enabled: boolean): Promise<void> {
    // VLC RC uses 'loop on/off' to enable/disable loop mode
    await this.sendCommand(enabled ? 'loop on' : 'loop off')
    console.log(`Loop ${enabled ? 'enabled' : 'disabled'}`)
  }

  async getStatus(): Promise<PlaybackStatus> {
    // VLC's RC interface can be flaky. We send commands one at a time
    // and parse only the first numeric value from each response.

    const parseFirstNumber = (s: string): number => {
      const match = s.match(/\d+/)
      return match ? parseInt(match[0], 10) : 0
    }

    // Parse state from 'status' command
    // Output format: ( state playing ) or ( state paused ) or ( state stop )
    const statusResponse = await this.sendCommand('status')
    let state: 'playing' | 'paused' | 'stopped' = 'stopped'
    if (statusResponse.includes('state playing')) state = 'playing'
    else if (statusResponse.includes('state paused')) state = 'paused'

    const isPlaying = state === 'playing'

    // get_time returns current position in seconds
    const positionResponse = await this.sendCommand('get_time')
    const positionSeconds = parseFirstNumber(positionResponse)

    // get_length returns total duration in seconds
    // NOTE: This can be unreliable during track transitions.
    // The UI should prefer the cached duration from MediaItem when available.
    const lengthResponse = await this.sendCommand('get_length')
    const durationSeconds = parseFirstNumber(lengthResponse)

    // get_title for display (optional, often empty)
    const titleResponse = await this.sendCommand('get_title')

    return {
      isPlaying,
      state,
      currentFile: null, // We track this in PlaybackService
      positionSeconds,
      durationSeconds,
    }
  }

  /**
   * Set logo overlay.
   * @param path Path to logo image file (PNG with transparency recommended)
   * @param opacity 0-255 (0 = fully opaque, 255 = fully transparent in VLC)
   * @param position 0-8 (grid: 0=top-left, 2=top-right, 6=bottom-left, 8=bottom-right)
   */
}
