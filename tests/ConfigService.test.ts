/**
 * ConfigService Tests
 *
 * Tests for configuration business logic and validation.
 */

import { describe, expect, test, mock, beforeEach } from 'bun:test'
import { ConfigService } from '../src/services/ConfigService'
import type {
  ConfigRepository,
  AppConfig,
} from '../src/repositories/ConfigRepository'

describe('ConfigService', () => {
  // Create a mock ConfigRepository
  function createMockRepo(initialConfig: Partial<AppConfig> = {}) {
    const defaultConfig: AppConfig = {
      server: { port: 1993 },
      session: { limitMinutes: 30, introVideoId: null, outroVideoId: null },
      interlude: { enabled: true, frequency: 2 },
      mpv: { ipcSocket: '/tmp/test.sock' },
      logo: { enabled: false, imagePath: null, opacity: 200, position: 2 },
      ...initialConfig,
    } as AppConfig

    let config = { ...defaultConfig }
    const updateFn = mock((partial: Partial<AppConfig>) => {
      config = { ...config, ...partial }
      return Promise.resolve()
    })

    return {
      get: mock(() => Promise.resolve(config)),
      update: updateFn,
      getBootstrap: mock(() => ({
        paths: {
          media: '/media/videos',
          database: '/data/media.db',
        },
      })),
      _getUpdateCalls: () => updateFn.mock.calls,
    }
  }

  test('get() returns config from repository', async () => {
    const mockRepo = createMockRepo()
    const service = new ConfigService(mockRepo as unknown as ConfigRepository)

    const config = await service.get()

    expect(mockRepo.get).toHaveBeenCalled()
    expect(config.session.limitMinutes).toBe(30)
  })

  test('update() delegates to repository', async () => {
    const mockRepo = createMockRepo()
    const service = new ConfigService(mockRepo as unknown as ConfigRepository)

    await service.update({ session: { limitMinutes: 60 } })

    expect(mockRepo.update).toHaveBeenCalled()
  })

  test('setSessionLimit() validates positive number', async () => {
    const mockRepo = createMockRepo()
    const service = new ConfigService(mockRepo as unknown as ConfigRepository)

    await service.setSessionLimit(45)

    expect(mockRepo.update).toHaveBeenCalledWith({
      session: { limitMinutes: 45 },
    })
  })

  test('setSessionLimit() allows zero (infinite)', async () => {
    const mockRepo = createMockRepo()
    const service = new ConfigService(mockRepo as unknown as ConfigRepository)

    await service.setSessionLimit(0)

    expect(mockRepo.update).toHaveBeenCalledWith({
      session: { limitMinutes: 0 },
    })
  })

  test('setSessionLimit() rejects negative', async () => {
    const mockRepo = createMockRepo()
    const service = new ConfigService(mockRepo as unknown as ConfigRepository)

    await expect(service.setSessionLimit(-5)).rejects.toThrow(
      'Session limit cannot be negative'
    )
  })

  test('setInterludeConfig() validates frequency >= 1', async () => {
    const mockRepo = createMockRepo()
    const service = new ConfigService(mockRepo as unknown as ConfigRepository)

    await service.setInterludeConfig(true, 3)

    expect(mockRepo.update).toHaveBeenCalledWith({
      interlude: { enabled: true, frequency: 3 },
    })
  })

  test('setInterludeConfig() rejects frequency < 1', async () => {
    const mockRepo = createMockRepo()
    const service = new ConfigService(mockRepo as unknown as ConfigRepository)

    await expect(service.setInterludeConfig(true, 0)).rejects.toThrow(
      'Interlude frequency must be at least 1'
    )
  })

  test('setLogoConfig() enables logo with settings', async () => {
    const mockRepo = createMockRepo()
    const service = new ConfigService(mockRepo as unknown as ConfigRepository)

    await service.setLogoConfig('/path/to/logo.png', 150, 3)

    expect(mockRepo.update).toHaveBeenCalledWith({
      logo: {
        imagePath: '/path/to/logo.png',
        opacity: 150,
        position: 3,
        enabled: true,
      },
    })
  })

  test('disableLogo() sets enabled to false', async () => {
    const mockRepo = createMockRepo()
    const service = new ConfigService(mockRepo as unknown as ConfigRepository)

    await service.disableLogo()

    expect(mockRepo.update).toHaveBeenCalledWith({ logo: { enabled: false } })
  })

  test('getMediaDirectory() returns path from bootstrap', () => {
    const mockRepo = createMockRepo()
    const service = new ConfigService(mockRepo as unknown as ConfigRepository)

    const dir = service.getMediaDirectory()

    expect(dir).toBe('/media/videos')
    expect(mockRepo.getBootstrap).toHaveBeenCalled()
  })

  test('getDatabasePath() returns path from bootstrap', () => {
    const mockRepo = createMockRepo()
    const service = new ConfigService(mockRepo as unknown as ConfigRepository)

    const path = service.getDatabasePath()

    expect(path).toBe('/data/media.db')
  })
})
