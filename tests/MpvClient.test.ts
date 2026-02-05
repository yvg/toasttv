/**
 * MpvClient Tests
 *
 * Tests connection logic and status parsing by mocking Bun.connect.
 * Tests for MpvClient.
 */

import { describe, expect, test, spyOn, beforeEach, afterEach } from 'bun:test'
import { MpvClient } from '../src/clients/MpvClient'
import type { Socket, SocketHandler } from 'bun'

describe('MpvClient', () => {
  let client: MpvClient
  let mockSocket: any
  let socketHandler: SocketHandler<any> | undefined
  let connectSpy: any

  const CONFIG = {
    ipcSocket: '/tmp/test.sock',
    maxReconnectAttempts: 2,
    reconnectDelayMs: 10,
  }

  beforeEach(() => {
    // Reset state
    client = new MpvClient(CONFIG)
    mockSocket = {
      write: (data: string) => {
        // Parse JSON IPC Request
        const payload = JSON.parse(data)
        const request_id = payload.request_id
        const command = payload.command // ["get_property", "pause"]

        let responseData: any = null
        let error = 'success'

        if (command && command[0] === 'get_property') {
          const prop = command[1]
          if (prop === 'pause') responseData = false
          else if (prop === 'path') responseData = '/videos/test.mp4'
          else if (prop === 'time-pos') responseData = 120
          else if (prop === 'duration') responseData = 600
          else if (prop === 'idle-active') responseData = false
        }

        const responseIdx = {
          request_id,
          error,
          data: responseData,
        }

        // Simulate incoming data
        if (socketHandler?.data) {
          socketHandler.data(
            mockSocket,
            Buffer.from(JSON.stringify(responseIdx) + '\n')
          )
        }
      },
      end: () => {
        if (socketHandler?.close) socketHandler.close(mockSocket)
      },
    }

    // Spy on Bun.connect
    connectSpy = spyOn(Bun, 'connect').mockImplementation((options: any) => {
      // Capture the handler provided by MpvClient
      socketHandler = options.socket

      // Simulate async connection success
      setTimeout(() => {
        if (socketHandler?.open) {
          socketHandler.open(mockSocket)
        }
      }, 0)

      return Promise.resolve(mockSocket)
    })
  })

  afterEach(() => {
    connectSpy.mockRestore()
  })

  test('connect() retries and eventually fails if socket errors', async () => {
    // Override mock to simulate failure
    connectSpy.mockImplementation((options: any) => {
      socketHandler = options.socket
      setTimeout(() => {
        const err = new Error('Connection refused')
        if (socketHandler?.error) socketHandler.error(mockSocket, err)
      }, 0)
      return Promise.resolve(mockSocket)
    })

    // Should throw after retries
    try {
      await client.connect()
      expect(true).toBe(false) // Should fail
    } catch (e: any) {
      expect(e.message).toContain('Failed to connect')
    }

    // 2 attempts = 2 calls
    expect(connectSpy).toHaveBeenCalledTimes(2)
  })

  test('connect() succeeds on open', async () => {
    await client.connect()
    expect(client.isConnected).toBe(true)
  })

  test('getStatus() parses valid MPV response', async () => {
    await client.connect()

    const status = await client.getStatus()

    expect(status.isPlaying).toBe(true) // pause=false, idle=false
    expect(status.state).toBe('playing')
    expect(status.currentFile).toBe('/videos/test.mp4')
    expect(status.positionSeconds).toBe(120)
    expect(status.durationSeconds).toBe(600)
  })

  test('getStatus() handles paused state', async () => {
    // Adjust mock behavior for this test
    mockSocket.write = (data: string) => {
      const payload = JSON.parse(data)
      const request_id = payload.request_id
      const command = payload.command

      let responseData: any = null

      if (command && command[0] === 'get_property') {
        const prop = command[1]
        if (prop === 'pause')
          responseData = true // PAUSED
        else if (prop === 'path') responseData = '/videos/test.mp4'
        else responseData = 0
      }

      const responseIdx = { request_id, error: 'success', data: responseData }
      if (socketHandler?.data)
        socketHandler.data(
          mockSocket,
          Buffer.from(JSON.stringify(responseIdx) + '\n')
        )
    }

    await client.connect()
    const status = await client.getStatus()

    expect(status.isPlaying).toBe(false)
    expect(status.state).toBe('paused')
  })
})
