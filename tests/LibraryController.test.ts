/**
 * LibraryController Tests
 *
 * Verifies library management, particularly the complex coordination
 * between MediaService and ConfigService when updating media types.
 */

import { describe, expect, test, beforeEach } from 'bun:test'
import { mock, type MockProxy } from 'jest-mock-extended'
import { createLibraryController } from '../src/controllers/LibraryController'
import type { ConfigService } from '../src/services/ConfigService'
import type { MediaService } from '../src/services/MediaService'
import type { PlaylistEngine } from '../src/services/PlaylistEngine'
import { Hono } from 'hono'

describe('LibraryController', () => {
  let configService: MockProxy<ConfigService>
  let mediaService: MockProxy<MediaService>
  let playlistEngine: MockProxy<PlaylistEngine>
  let app: Hono

  beforeEach(() => {
    configService = mock<ConfigService>()
    mediaService = mock<MediaService>()
    playlistEngine = mock<PlaylistEngine>()

    const controller = createLibraryController({
      config: configService,
      media: mediaService,
      playlist: playlistEngine,
    })

    app = new Hono()
    app.route('/', controller)
  })

  test('POST /api/update-type sets Intro and updates Config', async () => {
    // When setting as intro
    const formData = new FormData()
    formData.append('type', 'intro')

    const req = new Request('http://localhost/api/update-type/100', {
      method: 'POST',
      body: formData,
    })

    await app.request(req)

    // It should update config to point session.introVideoId to 100
    expect(configService.update).toHaveBeenCalledWith({
      session: { introVideoId: 100 },
    })
  })

  test('POST /api/update-type sets Outro and updates Config', async () => {
    const formData = new FormData()
    formData.append('type', 'outro')

    const req = new Request('http://localhost/api/update-type/200', {
      method: 'POST',
      body: formData,
    })

    await app.request(req)

    expect(configService.update).toHaveBeenCalledWith({
      session: { outroVideoId: 200 },
    })
  })

  test('POST /api/update-type sets regular Video and clears Config if needed', async () => {
    // Setup: Config thinks ID 300 is currently the Intro
    configService.get.mockResolvedValue({
      session: { introVideoId: 300 },
    } as any)

    // Request: Change ID 300 to regular 'video'
    const formData = new FormData()
    formData.append('type', 'video')

    const req = new Request('http://localhost/api/update-type/300', {
      method: 'POST',
      body: formData,
    })

    await app.request(req)

    // Should update media type
    expect(mediaService.updateType).toHaveBeenCalledWith(300, 'video')

    // AND should clear the introVideoId from config
    expect(configService.update).toHaveBeenCalledWith({
      session: { introVideoId: null },
    })
  })

  test('POST /api/rescan triggers media rescan and playlist refresh', async () => {
    mediaService.rescan.mockResolvedValue(5)

    const formData = new FormData() // empty body (triggered from settings)

    const req = new Request('http://localhost/api/rescan', {
      method: 'POST',
      body: formData,
    })

    const res = await app.request(req)

    expect(mediaService.rescan).toHaveBeenCalled()
    expect(playlistEngine.refreshCache).toHaveBeenCalled()
    expect(await res.text()).toContain('Scanned 5 files')
  })
})
