/**
 * DashboardEventService Tests
 *
 * Verifies SSE broadcasting and client management.
 */

import { describe, expect, test, beforeEach } from 'bun:test'
import { mock, type MockProxy } from 'jest-mock-extended'
import {
  DashboardEventService,
  type DashboardEvent,
} from '../src/services/DashboardEventService'

// Define the type locally if not exported, or just use structural matching
interface SSEWriter {
  write: (data: string) => void
  close: () => void
}

describe('DashboardEventService', () => {
  let service: DashboardEventService

  beforeEach(() => {
    service = new DashboardEventService()
  })

  test('clients are added and removed correctly', () => {
    const client1 = mock<SSEWriter>()
    const client2 = mock<SSEWriter>()

    service.addClient(client1)
    expect(service.clientCount).toBe(1)

    service.addClient(client2)
    expect(service.clientCount).toBe(2)

    service.removeClient(client1)
    expect(service.clientCount).toBe(1)
  })

  test('broadcast sends formatted SSE data to all clients', () => {
    const client1 = mock<SSEWriter>()
    const client2 = mock<SSEWriter>()

    service.addClient(client1)
    service.addClient(client2)

    const event: DashboardEvent = { type: 'paused' }
    service.broadcast(event)

    const expectedData = `data: ${JSON.stringify(event)}\n\n`

    expect(client1.write).toHaveBeenCalledWith(expectedData)
    expect(client2.write).toHaveBeenCalledWith(expectedData)
  })

  test('broadcast removes disconnected clients', () => {
    const activeClient = mock<SSEWriter>()
    const deadClient = mock<SSEWriter>()

    // deadClient throws on write
    deadClient.write.mockImplementation(() => {
      throw new Error('Closed')
    })

    service.addClient(activeClient)
    service.addClient(deadClient)
    expect(service.clientCount).toBe(2)

    service.broadcast({ type: 'paused' })

    // Dead client should be removed
    expect(service.clientCount).toBe(1)
    expect(activeClient.write).toHaveBeenCalled()
  })

  test('broadcastPlayingState deduplicates state', () => {
    const client = mock<SSEWriter>()
    service.addClient(client)

    // Initial broadcast
    service.broadcastPlayingState(true)
    expect(client.write).toHaveBeenCalledTimes(1)
    expect(client.write).toHaveBeenCalledWith(
      expect.stringContaining('"type":"playing"')
    )

    // Duplicate call - should be ignored
    service.broadcastPlayingState(true)
    expect(client.write).toHaveBeenCalledTimes(1)

    // Change state
    service.broadcastPlayingState(false)
    expect(client.write).toHaveBeenCalledTimes(2)
    expect(client.write).toHaveBeenCalledWith(
      expect.stringContaining('"type":"paused"')
    )
  })
})
