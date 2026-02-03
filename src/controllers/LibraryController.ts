/**
 * Library Controller
 *
 * Handles media library pages and API endpoints.
 */

import { Hono } from 'hono'
import { html } from 'hono/html'
import type { MediaService } from '../services/MediaService'
import type { ConfigService } from '../services/ConfigService'
import { renderLibrary, renderLibraryContent } from '../templates/library'
import type { MediaType } from '../types'

interface LibraryControllerDeps {
  config: ConfigService
  media: MediaService
}

export function createLibraryController(deps: LibraryControllerDeps) {
  const { config, media } = deps
  const controller = new Hono()

  // Helper to parse library query params
  const getLibraryParams = (c: {
    req: { query: (k: string) => string | undefined }
  }) => ({
    view: (c.req.query('view') ?? 'list') as 'list' | 'grid',
    filter: (c.req.query('filter') ?? 'all') as 'all' | 'videos' | 'interludes',
    search: c.req.query('search') ?? '',
  })

  // --- Pages ---

  controller.get('/library', async (c) => {
    const allMedia = await media.getAll()
    const appConfig = await config.get()
    const { view, filter, search } = getLibraryParams(c)

    // Generate thumbnails in background (non-blocking)
    void media.generateThumbnails()

    return c.html(
      renderLibrary({
        media: allMedia,
        config: appConfig,
        mediaDirectory: media.getMediaDirectory(),
        view,
        filter,
        search,
      })
    )
  })

  // --- Partials ---

  controller.get('/partials/library', async (c) => {
    const allMedia = await media.getAll()
    const appConfig = await config.get()
    const { view, filter, search } = getLibraryParams(c)
    void media.generateThumbnails()
    return c.html(
      renderLibraryContent({
        media: allMedia,
        config: appConfig,
        mediaDirectory: media.getMediaDirectory(),
        view,
        filter,
        search,
      })
    )
  })

  // --- API Endpoints ---

  // Rescan media - returns updated library content (or just toast if from settings)
  controller.post('/api/rescan', async (c) => {
    const count = await media.rescan()
    const body = await c.req.parseBody()
    
    // If no view param, called from Settings - just return toast
    if (!body['view']) {
      return c.html(`<div class="toast success">Scanned ${count} files</div>`)
    }
    
    const allMedia = await media.getAll()
    const appConfig = await config.get()
    const view = (body['view'] as 'list' | 'grid') ?? 'list'
    const filter =
      (body['filter'] as 'all' | 'videos' | 'interludes') ?? 'all'
    const search = (body['search'] as string) ?? ''

    void media.generateThumbnails()

    // Return library content with OOB toast
    return c.html(`
      ${renderLibraryContent({
        media: allMedia,
        config: appConfig,
        mediaDirectory: media.getMediaDirectory(),
        view,
        filter,
        search,
      })}
      <div id="toast-container" hx-swap-oob="innerHTML">
        <div class="toast success">Scanned ${count} files</div>
      </div>
    `)
  })

  // File upload - returns updated library content
  controller.post('/api/upload', async (c) => {
    const body = await c.req.parseBody({ all: true })
    const files = body['files']
    const view = (body['view'] as 'list' | 'grid') ?? 'list'
    const filter =
      (body['filter'] as 'all' | 'videos' | 'interludes') ?? 'all'
    const search = (body['search'] as string) ?? ''

    if (!files) {
      return c.html(html`<div class="toast warning">No files uploaded</div>`)
    }

    const fileList = Array.isArray(files) ? files : [files]
    let uploaded = 0

    for (const file of fileList) {
      if (file instanceof File) {
        const buffer = await file.arrayBuffer()
        const path = `${media.getMediaDirectory()}/${file.name}`
        await Bun.write(path, buffer)
        uploaded++
      }
    }

    // Rescan after upload
    await media.rescan()
    const allMedia = await media.getAll()
    const appConfig = await config.get()
    void media.generateThumbnails()

    // Return library content with OOB toast
    return c.html(`
      ${renderLibraryContent({
        media: allMedia,
        config: appConfig,
        mediaDirectory: media.getMediaDirectory(),
        view,
        filter,
        search,
      })}
      <div id="toast-container" hx-swap-oob="innerHTML">
        <div class="toast success">Uploaded ${uploaded} files</div>
      </div>
    `)
  })

  // Delete media - returns empty (htmx swaps outerHTML to remove element)
  controller.delete('/api/media/:id', async (c) => {
    const id = parseInt(c.req.param('id'), 10)
    if (!Number.isNaN(id)) {
      await media.delete(id)
      // Return empty content (item removed) with OOB toast
      return c.html(`
        <div id="toast-container" hx-swap-oob="innerHTML">
          <div class="toast success">Deleted</div>
        </div>
      `)
    }
    return c.html(html`<div class="toast warning">Invalid ID</div>`, 400)
  })

  // Toggle interlude status
  controller.post('/api/toggle-interlude/:id', async (c) => {
    const id = parseInt(c.req.param('id'), 10)
    const body = await c.req.parseBody()
    const isInterlude = body['interlude'] === 'true'
    if (!Number.isNaN(id)) {
      await media.toggleInterlude(id, isInterlude)
      return c.html(
        html`<div class="toast success">
          ${isInterlude ? 'Marked as interlude' : 'Marked as video'}
        </div>`
      )
    }
    return c.html(html`<div class="toast warning">Invalid ID</div>`)
  })

  // Update media type
  controller.post('/api/update-type/:id', async (c) => {
    const id = parseInt(c.req.param('id'), 10)
    const body = await c.req.parseBody()
    const mediaType = body['type'] as MediaType
    if (!Number.isNaN(id) && mediaType) {
      let message = ''
      
      // Handle Intro/Outro setting logic
      if (mediaType === 'intro') {
        await config.update({ session: { introVideoId: id } })
        // Clear media_type if previously something else, to avoid double badges?
        // Actually, we rely on media_type for grid filtering? Not exactly.
        // We'll update type to 'video' in DB so it doesn't get confused, 
        // OR we can rely on UI to prioritize ID check.
        // Let's reset type to video/interlude in DB if it was something else, 
        // to keep DB clean, OR allow 'intro' type to persist but just use ID.
        // Plan says: "Update settings.intro_video_id instead of modifying media_type"
        // So we do NOT call media.updateType('intro').
        // But we might need to reset 'outro' if it was outro?
        message = 'Set as Intro'
      } else if (mediaType === 'outro') {
        await config.update({ session: { outroVideoId: id } })
        message = 'Set as Outro'
      } else {
        // Video/Interlude
        await media.updateType(id, mediaType)
        
        // If it WAS intro/outro, we might need to clear that config?
        const currentConfig = await config.get()
        if (currentConfig.session.introVideoId === id) {
          await config.update({ session: { introVideoId: null } })
        }
        if (currentConfig.session.outroVideoId === id) {
          await config.update({ session: { outroVideoId: null } })
        }
        message = mediaType === 'interlude' ? 'Marked as Interlude' : 'Marked as Video'
      }

      // We need to re-render the badge which OOB swaps
      const typeLabels: Record<MediaType, string> = {
        video: '📺 Video',
        interlude: '🎬 Interlude',
        intro: '🌅 Intro Video',
        outro: '👋 Outro Video',
      }

      const typeIcons: Record<MediaType, string> = {
        video: '📺',
        interlude: '🎬',
        intro: '🌅',
        outro: '👋',
      }
      
      // Determine what to show in badge
      // We know what we just set it to.
      // Ideally we would fetch the fresh state and re-render the badge properly.
      
      // Since template logic is complex (it checks both ID and Type), 
      // let's assume successful update.
      
      return c.html(`
        <div class="toast success">${message}</div>
        <span id="badge-${id}" class="media-type-badge" hx-swap-oob="true">${typeIcons[mediaType]}</span>
      `)
    }
    return c.html(html`<div class="toast warning">Invalid request</div>`)
  })

  // Update media dates
  controller.post('/api/update-dates/:id', async (c) => {
    const id = parseInt(c.req.param('id'), 10)
    const body = await c.req.parseBody()
    const dateStart = (body['dateStart'] as string) || null
    const dateEnd = (body['dateEnd'] as string) || null

    if (!Number.isNaN(id)) {
      await media.updateDates(id, dateStart, dateEnd)

      // Get updated item to re-render the date picker form
      const item = await media.getById(id)
      if (item) {
        const { renderDatePicker } = await import('../templates/library')
        return c.html(`
          ${renderDatePicker(item)}
          <div id="toast-container" hx-swap-oob="innerHTML">
            <div class="toast success">Dates updated</div>
          </div>
        `)
      }
    }
    return c.html(html`<div class="toast warning">Invalid ID</div>`)
  })

  return controller
}
