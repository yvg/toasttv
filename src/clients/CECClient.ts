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

    // Use higher debug level to capture raw hex codes
    // -d 8 gives full traffic, -d 1 gives human-readable but less complete
    const debugLevel = process.env.CEC_DEBUG === 'verbose' ? '8' : '8'

    this.process = Bun.spawn(['cec-client', '-d', debugLevel], {
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
    // Verbose logging for debugging - log all TRAFFIC lines
    if (line.includes('>>') || line.includes('<<') || line.includes('key')) {
      console.log(`CEC RAW: ${line}`)
    }

    // Detect TV power on
    if (line.includes('standby') && line.includes('>> 0f:')) {
      // Ignore standby
    } else if (line.includes('power on') || line.includes('>> 0f:04')) {
      console.log('CEC: TV Power On detected')
      this.onPowerOnCallback?.()
    }

    // Method 1: Parse text format (some TVs output this)
    // Format: "key pressed: right (4)"
    const keyMatch = line.match(/key pressed: (\w+)/i)
    if (keyMatch) {
      const key = keyMatch[1]?.toLowerCase()
      if (key) {
        this.handleKeyPress(key)
        return
      }
    }

    // Method 2: Parse raw CEC hex codes (more common)
    // Format: ">> 01:44:XX" where 44 is User Control Pressed, XX is key code
    const rawMatch = line.match(/>> \w+:44:([0-9a-f]{2})/i)
    if (rawMatch) {
      const keyCode = parseInt(rawMatch[1] ?? '', 16)
      const keyName = CEC_KEY_CODES[keyCode]
      if (keyName) {
        this.handleKeyPress(keyName)
      }
    }
  }

  private handleKeyPress(key: string): void {
    console.log(`CEC: Key pressed - ${key}`)
    const callback = this.keyCallbacks.get(key)
    callback?.()
  }
}

// Raw CEC key codes (hex) to key names
// Reference: https://www.cec-o-matic.com/
const CEC_KEY_CODES: Record<number, string> = {
  0x00: 'select',
  0x01: 'up',
  0x02: 'down',
  0x03: 'left',
  0x04: 'right',
  0x09: 'root_menu',
  0x0d: 'exit',
  0x20: 'number_0',
  0x21: 'number_1',
  0x22: 'number_2',
  0x23: 'number_3',
  0x24: 'number_4',
  0x25: 'number_5',
  0x26: 'number_6',
  0x27: 'number_7',
  0x28: 'number_8',
  0x29: 'number_9',
  0x44: 'play',
  0x45: 'stop',
  0x46: 'pause',
  0x47: 'record',
  0x48: 'rewind',
  0x49: 'fast_forward',
  0x4a: 'eject',
  0x4b: 'forward',
  0x4c: 'backward',
}

// Key mappings for API use
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
