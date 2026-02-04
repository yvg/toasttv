/**
 * Settings Controller
 *
 * Handles settings page and configuration API endpoints.
 */

import { Hono } from 'hono'
import { html } from 'hono/html'
import type { ConfigService } from '../services/ConfigService'
import type { AppConfig, DeepPartial } from '../repositories/ConfigRepository'
import { renderSettings } from '../templates/settings'
import type { MediaService } from '../services/MediaService'

interface SettingsControllerDeps {
  config: ConfigService
  media: MediaService
}

export function createSettingsController(deps: SettingsControllerDeps) {
  const { config, media } = deps
  const controller = new Hono()

  // --- Pages ---

  controller.get('/settings', async (c) => {
    const currentConfig = await config.get()
    return c.html(
      renderSettings({
        config: currentConfig,
        mediaDirectory: media.getMediaDirectory(),
      })
    )
  })

  // --- API Endpoints ---

  // Get config
  controller.get('/api/config', async (c) => {
    return c.json(await config.get())
  })

  // Update config - parses flat form fields into nested config
  controller.post('/api/config', async (c) => {
    const body = await c.req.parseBody()

    // Parse form fields into config structure
    const sessionLimit = body['sessionLimit'] as string
    const resetHour = body['resetHour'] as string

    const partial: DeepPartial<AppConfig> = {
      server: {
        port: parseInt(body['serverPort'] as string, 10) || 1993,
      },
      session: {
        limitMinutes: sessionLimit ? parseInt(sessionLimit, 10) : 0,
        resetHour: parseInt(resetHour, 10) || 6,
        // offAirAssetId is set via Library page, not Settings
      },
      interlude: {
        enabled: body['interludeEnabled'] === 'true',
        frequency: parseInt(body['interludeFrequency'] as string, 10) || 3,
      },
      vlc: {
        host: (body['vlcHost'] as string) || 'localhost',
        port: parseInt(body['vlcPort'] as string, 10) || 8080,
      },
      logo: {
        enabled: body['logoEnabled'] === 'true',
        opacity: parseInt(body['logoOpacity'] as string, 10) || 200,
        position: parseInt(body['logoPosition'] as string, 10) || 2,
      },
    }

    await config.update(partial)
    return c.html(html`<div class="toast success">Settings saved</div>`)
  })

  // Logo upload - returns updated logo section
  controller.post('/api/upload-logo', async (c) => {
    const body = await c.req.parseBody()
    const file = body['file']

    if (!(file instanceof File)) {
      return c.html(html`<div class="toast warning">No file uploaded</div>`)
    }

    // Move file I/O to service layer
    const logoPath = await media.uploadLogo(file)

    // Update config with logo path
    await config.update({ logo: { imagePath: logoPath } })

    // Return updated logo section with OOB toast
    // Cache bust the logo URL to show new image
    const cacheBust = Date.now()
    return c.html(`
      <div class="form-group" id="logo-upload-section">
        <label>Logo Image</label>
        <div class="logo-picker">
          <img src="/logo?t=${cacheBust}" alt="Current logo" class="logo-preview">
          <label class="btn btn-primary btn-small">
            Choose
            <input type="file" 
                   id="logoFile"
                   accept="image/*"
                   style="display: none"
                   hx-post="/api/upload-logo"
                   hx-trigger="change"
                   hx-target="#logo-upload-section"
                   hx-swap="outerHTML"
                   hx-encoding="multipart/form-data"
                   name="file">
          </label>
        </div>
      </div>
      <div id="toast-container" hx-swap-oob="innerHTML">
        <div class="toast success">Logo uploaded</div>
      </div>
    `)
  })

  // Serve logo
  controller.get('/logo', async (c) => {
    const currentConfig = await config.get()
    const logoPath = currentConfig.logo.imagePath

    if (!logoPath) {
      return c.notFound()
    }

    try {
      const file = Bun.file(logoPath)
      return new Response(file)
    } catch {
      return c.notFound()
    }
  })

  return controller
}
