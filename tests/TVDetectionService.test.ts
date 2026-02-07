/**
 * TVDetectionService Tests
 *
 * Tests for TV detection orchestration with CEC and heartbeat.
 */

import { describe, expect, test } from 'bun:test'
import { mock } from 'jest-mock-extended'
import { TVDetectionService } from '../src/services/TVDetectionService'
import type { CECClient } from '../src/clients/CECClient'

type Callback = () => void

describe('TVDetectionService', () => {
  test('should call onTVActive callback when CEC reports active source', async () => {
    const mockCec = mock<CECClient>()

    let activeCallback: Callback = () => {}
    mockCec.onActiveSource.mockImplementation((cb: Callback) => {
      activeCallback = cb
    })
    mockCec.getPowerState.mockResolvedValue('unknown')

    const service = new TVDetectionService({
      cec: mockCec,
      config: {
        cecEnabled: true,
        heartbeatIntervalMs: 0, // Disable heartbeat for test
      },
    })

    let tvActiveCallbackCalled = false
    service.onTVActive(() => {
      tvActiveCallbackCalled = true
    })

    await service.start()

    // Simulate CEC active source event
    activeCallback()

    expect(tvActiveCallbackCalled).toBe(true)
    expect(service.isActive).toBe(true)

    service.stop()
  })

  test('should call onTVInactive callback when CEC reports standby', async () => {
    const mockCec = mock<CECClient>()

    let activeCallback: Callback = () => {}
    let standbyCallback: Callback = () => {}
    mockCec.onActiveSource.mockImplementation((cb: Callback) => {
      activeCallback = cb
    })
    mockCec.onStandby.mockImplementation((cb: Callback) => {
      standbyCallback = cb
    })
    mockCec.getPowerState.mockResolvedValue('unknown')

    const service = new TVDetectionService({
      cec: mockCec,
      config: {
        cecEnabled: true,
        heartbeatIntervalMs: 0,
      },
    })

    let tvInactiveCallbackCalled = false
    service.onTVInactive(() => {
      tvInactiveCallbackCalled = true
    })

    await service.start()

    // First make TV active
    activeCallback()

    // Then simulate CEC standby event
    standbyCallback()

    expect(tvInactiveCallbackCalled).toBe(true)
    expect(service.isActive).toBe(false)

    service.stop()
  })

  test('should not call callbacks when state does not change', async () => {
    const mockCec = mock<CECClient>()

    let activeCallback: Callback = () => {}
    mockCec.onActiveSource.mockImplementation((cb: Callback) => {
      activeCallback = cb
    })
    mockCec.getPowerState.mockResolvedValue('unknown')

    const service = new TVDetectionService({
      cec: mockCec,
      config: {
        cecEnabled: true,
        heartbeatIntervalMs: 0,
      },
    })

    let callCount = 0
    service.onTVActive(() => {
      callCount++
    })

    await service.start()

    // Simulate multiple active events
    activeCallback()
    activeCallback() // Second call should be ignored (already active)
    activeCallback() // Third call should also be ignored

    // Should only be called once since state didn't change after first call
    expect(callCount).toBe(1)

    service.stop()
  })

  test('should work with null clients', async () => {
    const service = new TVDetectionService({
      cec: null,
      config: {
        cecEnabled: false,
        heartbeatIntervalMs: 0,
      },
    })

    // Should not throw
    await service.start()

    expect(service.isActive).toBe(false)

    service.stop()
  })

  test('should initialize isActive to false', () => {
    const service = new TVDetectionService({
      cec: null,
      config: {
        cecEnabled: false,
        heartbeatIntervalMs: 0,
      },
    })

    expect(service.isActive).toBe(false)
  })

  test('should auto-start session when initial CEC power query returns on', async () => {
    const mockCec = mock<CECClient>()
    mockCec.getPowerState.mockResolvedValue('on')

    const service = new TVDetectionService({
      cec: mockCec,
      config: {
        cecEnabled: true,
        heartbeatIntervalMs: 0,
      },
    })

    let tvActiveCallbackCalled = false
    service.onTVActive(() => {
      tvActiveCallbackCalled = true
    })

    await service.start()

    // Should auto-activate based on initial power query
    expect(tvActiveCallbackCalled).toBe(true)
    expect(service.isActive).toBe(true)

    service.stop()
  })
})
