/**
 * SettingsController Tests
 *
 * Verifies API endpoints for config updates and validation.
 */

import { describe, expect, test, beforeEach } from 'bun:test'
import { mock, type MockProxy } from 'jest-mock-extended'
import { createSettingsController } from '../src/controllers/SettingsController'
import type { ConfigService } from '../src/services/ConfigService'
import type { MediaService } from '../src/services/MediaService'
import { Hono } from 'hono'

describe('SettingsController', () => {
  let configService: MockProxy<ConfigService>
  let mediaService: MockProxy<MediaService>
  let app: Hono

  beforeEach(() => {
    configService = mock<ConfigService>()
    mediaService = mock<MediaService>()

    const controller = createSettingsController({
      config: configService,
      media: mediaService,
    })

    app = new Hono()
    app.route('/', controller)
  })

  test('POST /api/config parses form data correctly', async () => {
    const formData = new FormData()
    formData.append('serverPort', '8080')
    formData.append('sessionLimit', '120')
    formData.append('interludeEnabled', 'true')
    formData.append('interludeFrequency', '2')
    formData.append('mpvSocket', '/tmp/updated.sock')
    formData.append('logoOpacity', '255')

    const req = new Request('http://localhost/api/config', {
      method: 'POST',
      body: formData,
    })

    const res = await app.request(req)

    expect(res.status).toBe(200)

    // Verify update call
    expect(configService.update).toHaveBeenCalledWith(
      expect.objectContaining({
        server: { port: 8080 },
        session: expect.objectContaining({ limitMinutes: 120 }),
        interlude: { enabled: true, frequency: 2 },
        mpv: expect.objectContaining({ ipcSocket: '/tmp/updated.sock' }),
        logo: expect.objectContaining({ opacity: 255 }),
      })
    )
  })

  test('POST /api/config handles invalid numbers securely', async () => {
    const formData = new FormData()
    formData.append('serverPort', 'invalid') // should fallback
    formData.append('sessionLimit', '') // should determine 0 or fallback
    formData.append('logoX', 'NaN')

    const req = new Request('http://localhost/api/config', {
      method: 'POST',
      body: formData,
    })

    await app.request(req)

    expect(configService.update).toHaveBeenCalledWith(
      expect.objectContaining({
        server: { port: 1993 }, // fallback
        session: expect.objectContaining({ limitMinutes: 0 }),
        logo: expect.objectContaining({ x: 8 }), // fallback
      })
    )
  })

  test('GET /api/config returns JSON', async () => {
    configService.get.mockResolvedValue({
      server: { port: 3000 },
    } as any)

    const req = new Request('http://localhost/api/config')
    const res = await app.request(req)

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toEqual({ server: { port: 3000 } })
  })
})
