/**
 * ConfigRepository Tests
 *
 * Verifies mapping between flat DB keys and nested AppConfig.
 */

import { describe, expect, test, beforeEach } from 'bun:test'
import { mock, type MockProxy } from 'jest-mock-extended'
import { ConfigRepository } from '../src/repositories/ConfigRepository'
import type { IMediaRepository } from '../src/repositories/IMediaRepository'

describe('ConfigRepository', () => {
  let mediaRepo: MockProxy<IMediaRepository>
  let configRepo: ConfigRepository

  beforeEach(() => {
    mediaRepo = mock<IMediaRepository>()
    configRepo = new ConfigRepository() // uses defaults for bootstrap
  })

  test('get() returns defaults when repo not initialized', async () => {
    const config = await configRepo.get()
    expect(config.server.port).toBe(1993)
  })

  test('get() hydration from flat settings', async () => {
    // Mock default seeding call first
    mediaRepo.getAllSettings.mockResolvedValue({})

    await configRepo.initialize(mediaRepo)

    // Then mock the get() call
    mediaRepo.getAllSettings.mockResolvedValue({
      'server.port': '8080',
      'session.limitMinutes': '120',
      'interlude.enabled': 'false',
      'mpv.ipcSocket': '/tmp/test.sock',
      'session.resetHour': '6',
      'interlude.frequency': '1',
      'logo.enabled': 'true',
      'logo.position': '2',
      'logo.x': '8',
      'logo.y': '8',
    })

    const config = await configRepo.get()

    expect(config.server.port).toBe(8080)
    expect(config.session.limitMinutes).toBe(120)
    expect(config.interlude.enabled).toBe(false)
    expect(config.mpv.ipcSocket).toBe('/tmp/test.sock')
    expect(config.logo.opacity).toBe(128)
  })

  test('update() saves partial changes to flat settings', async () => {
    mediaRepo.getAllSettings.mockResolvedValue({})
    await configRepo.initialize(mediaRepo)

    await configRepo.update({
      session: { limitMinutes: 45 },
      interlude: { enabled: true },
    })

    expect(mediaRepo.setSetting).toHaveBeenCalledWith(
      'session.limitMinutes',
      '45'
    )
    expect(mediaRepo.setSetting).toHaveBeenCalledWith(
      'interlude.enabled',
      'true'
    )

    // Ensure checks pass
    expect(mediaRepo.setSetting).toHaveBeenCalledWith(
      'session.limitMinutes',
      '45'
    )
    expect(mediaRepo.setSetting).toHaveBeenCalledWith(
      'interlude.enabled',
      'true'
    )
  })

  test('seedDefaults() populates empty settings', async () => {
    mediaRepo.getAllSettings.mockResolvedValue({}) // Empty DB

    await configRepo.initialize(mediaRepo)

    // Should call setSetting for all defaults
    expect(mediaRepo.setSetting).toHaveBeenCalledWith('server.port', '1993')
    expect(mediaRepo.setSetting).toHaveBeenCalledWith(
      'session.limitMinutes',
      '30'
    )
    expect(mediaRepo.setSetting).toHaveBeenCalledWith(
      'mpv.ipcSocket',
      '/tmp/toasttv-mpv.sock'
    )
  })
})
