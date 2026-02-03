/**
 * HDMI-CEC Client
 *
 * Listens for CEC events from TV remote via cec-client.
 * Maps remote buttons to daemon actions.
 */

import type { Subprocess } from 'bun'

export type CECCallback = () => void | Promise<void>

export class CECClient {
  private process: Subprocess<'ignore', 'pipe', 'inherit'> | null = null
  private running = false

  private onPowerOnCallback: CECCallback | null = null
  private keyCallbacks: Map<string, CECCallback> = new Map()

  async start(): Promise<void> {
    if (this.running) return

    console.log('Starting CEC listener...')

    // Start cec-client in monitoring mode
    this.process = Bun.spawn(['cec-client', '-d', '1'], {
      stdout: 'pipe',
      stderr: 'inherit',
    })

    this.running = true

    // Read stdout line by line
    this.readOutput()
  }

  async stop(): Promise<void> {
    this.running = false
    if (this.process) {
      this.process.kill()
      this.process = null
    }
    console.log('CEC listener stopped')
  }

  onPowerOn(callback: CECCallback): void {
    this.onPowerOnCallback = callback
  }

  onKeyPress(key: string, callback: CECCallback): void {
    this.keyCallbacks.set(key.toLowerCase(), callback)
  }

  private async readOutput(): Promise<void> {
    if (!this.process?.stdout) return

    const reader = this.process.stdout.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (this.running) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        this.handleCECLine(line)
      }
    }
  }

  private handleCECLine(line: string): void {
    // Detect TV power on
    if (line.includes('standby') && line.includes('>> 0f:')) {
      // Ignore standby
    } else if (line.includes('power on') || line.includes('>> 0f:04')) {
      console.log('CEC: TV Power On detected')
      this.onPowerOnCallback?.()
    }

    // Detect key presses
    // Format: "key pressed: right (4)"
    const keyMatch = line.match(/key pressed: (\w+)/i)
    if (keyMatch) {
      const key = keyMatch[1]?.toLowerCase()
      if (key) {
        console.log(`CEC: Key pressed - ${key}`)
        const callback = this.keyCallbacks.get(key)
        callback?.()
      }
    }
  }
}

// Key mappings for common remotes
export const CEC_KEYS = {
  RIGHT: 'right',
  LEFT: 'left',
  UP: 'up',
  DOWN: 'down',
  SELECT: 'select',
  PLAY: 'play',
  PAUSE: 'pause',
  STOP: 'stop',
  FORWARD: 'forward',
  BACKWARD: 'backward',
} as const
