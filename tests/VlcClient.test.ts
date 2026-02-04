/**
 * VlcClient Tests
 *
 * Tests connection logic and status parsing by mocking Bun.connect.
 */

import { describe, expect, test, spyOn, beforeEach, afterEach } from 'bun:test'
import { VlcClient, VlcConnectionError } from '../src/clients/VlcClient'
import type { Socket, SocketHandler } from 'bun'

describe('VlcClient', () => {
  let client: VlcClient
  let mockSocket: any
  let socketHandler: SocketHandler<any> | undefined
  let connectSpy: any

  const CONFIG = {
    host: 'localhost',
    port: 4212,
    password: 'test',
    maxReconnectAttempts: 2,
    reconnectDelayMs: 10,
  }

  beforeEach(() => {
    // Reset state
    client = new VlcClient(CONFIG)
    mockSocket = {
      write: (data: string) => {
        // Determine response based on command
        const cmd = data.trim()
        let response = ''

        if (cmd === 'status') {
          response =
            '( new input: file:///videos/test.mp4 ) ( audio volume: 100 ) ( state playing )'
        } else if (cmd === 'get_time') {
          response = '120'
        } else if (cmd === 'get_length') {
          response = '600'
        } else if (cmd === 'get_title') {
          response = 'test.mp4'
        } else {
          response = '>'
        }

        // Simulate incoming data
        if (socketHandler?.data) {
          socketHandler.data(mockSocket, Buffer.from(response + '\r\n> '))
        }
      },
      end: () => {
        if (socketHandler?.close) socketHandler.close(mockSocket)
      },
    }

    // Spy on Bun.connect
    connectSpy = spyOn(Bun, 'connect').mockImplementation((options: any) => {
      // Capture the handler provided by VlcClient
      socketHandler = options.socket

      // Simulate async connection success
      setTimeout(() => {
        if (socketHandler?.open) {
          socketHandler.open(mockSocket)
        }
      }, 0)

      // Return dummy promise/socket (not actually used by VlcClient logic which relies on callbacks)
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
    // Note: VlcClient logic catches error from attemptConnection promise rejection
    try {
      await client.connect()
      expect(true).toBe(false) // Should fail
    } catch (e) {
      expect(e).toBeInstanceOf(VlcConnectionError)
    }

    // 2 attempts = 2 calls
    expect(connectSpy).toHaveBeenCalledTimes(2)
  })

  test('connect() succeeds on open', async () => {
    await client.connect()
    expect(client.isConnected).toBe(true)
  })

  test('getStatus() parses valid VLC response', async () => {
    await client.connect()

    const status = await client.getStatus()

    expect(status.isPlaying).toBe(true)
    expect(status.state).toBe('playing')
    expect(status.currentFile).toBe('file:///videos/test.mp4')
    expect(status.positionSeconds).toBe(120)
    expect(status.durationSeconds).toBe(600)
  })

  test('getStatus() handles paused state', async () => {
    // Adjust mock behavior for this test
    mockSocket.write = (data: string) => {
      const cmd = data.trim()
      let response = ''
      if (cmd === 'status') {
        response = '( state paused )'
      } else {
        response = '0'
      }
      if (socketHandler?.data)
        socketHandler.data(mockSocket, Buffer.from(response))
    }

    await client.connect()
    const status = await client.getStatus()

    expect(status.isPlaying).toBe(false)
    expect(status.state).toBe('paused')
  })
})
