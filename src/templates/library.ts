/**
 * Library Template
 *
 * Media library with grid/list views, filtering, search, and file management.
 * Uses pure HTMX for all interactions - no page reloads or inline JS.
 */

import type { MediaItem, MediaType } from '../types'
import type { AppConfig } from '../repositories/ConfigRepository'
import { renderLayout } from './layout'
import { formatTime } from './utils'

export interface LibraryProps {
  media: MediaItem[]
  config?: AppConfig
  mediaDirectory: string
  view: 'list' | 'grid'
  filter: 'all' | 'videos' | 'interludes'
  search: string
}

/**
 * Full library page with layout wrapper.
 * Used for initial page load.
 */
export function renderLibrary(props: LibraryProps): string {
  return renderLayout('Library', renderLibraryContent(props))
}

/**
 * Library content partial without layout.
 * Used for htmx partial updates (search, filter changes).
 */
export function renderLibraryContent(props: LibraryProps): string {
  const { media, config, mediaDirectory, view, filter, search } = props

  // Apply filter
  let filteredMedia = media
  if (filter === 'videos') {
    filteredMedia = media.filter((m) => !m.isInterlude)
  } else if (filter === 'interludes') {
    filteredMedia = media.filter((m) => m.isInterlude)
  }

  // Apply search
  if (search) {
    const searchLower = search.toLowerCase()
    filteredMedia = filteredMedia.filter((m) =>
      m.filename.toLowerCase().includes(searchLower)
    )
  }

  const videos = filteredMedia.filter((m) => !m.isInterlude)
  const interludes = filteredMedia.filter((m) => m.isInterlude)

  // Build content based on filter
  let mediaContent = ''
  if (filter === 'all') {
    mediaContent = `
      <div class="${view === 'grid' ? 'media-grid' : 'media-list'}">
        ${filteredMedia.length === 0 ? '<p class="empty-list">No media files</p>' : filteredMedia.map((item) => renderMediaItem(item, view, config)).join('')}
      </div>
    `
  } else if (filter === 'videos') {
    mediaContent = renderMediaSection('Videos', '📺', videos, view, config)
  } else {
    mediaContent = renderMediaSection('Interludes', '🎬', interludes, view, config)
  }

  return `
    <div class="library" id="library-content">
      <h1>Media Library (${filteredMedia.length})</h1>
      
      <!-- Toolbar -->
      <div class="library-toolbar">
        <div class="search-box">
          <input type="text" 
                 id="search-input"
                 name="search"
                 placeholder="Search..." 
                 value="${search}"
                 autocomplete="off"
                 hx-get="/partials/library"
                 hx-trigger="input changed delay:300ms"
                 hx-target="#library-content"
                 hx-swap="outerHTML"
                 hx-include="[name='view'],[name='filter']">
          <input type="hidden" name="view" value="${view}">
          <input type="hidden" name="filter" value="${filter}">
          ${search ? `<button type="button" class="search-clear" 
                              hx-get="/partials/library?view=${view}&filter=${filter}" 
                              hx-target="#library-content" 
                              hx-swap="outerHTML">×</button>` : ''}
        </div>
        
        <div class="filter-buttons"
             hx-boost="true"
             hx-target="#library-content"
             hx-swap="outerHTML"
             hx-push-url="false">
          <a href="/partials/library?view=${view}&filter=all&search=${search}" class="btn btn-small ${filter === 'all' ? 'active' : ''}">All Media</a>
          <a href="/partials/library?view=${view}&filter=videos&search=${search}" class="btn btn-small ${filter === 'videos' ? 'active' : ''}">📺 Videos</a>
          <a href="/partials/library?view=${view}&filter=interludes&search=${search}" class="btn btn-small ${filter === 'interludes' ? 'active' : ''}">🎬 Interludes</a>
        </div>
        
        <div class="view-buttons"
             hx-boost="true"
             hx-target="#library-content"
             hx-swap="outerHTML"
             hx-push-url="false">
          <a href="/partials/library?view=list&filter=${filter}&search=${search}" class="btn btn-small ${view === 'list' ? 'active' : ''}" title="List view">☰</a>
          <a href="/partials/library?view=grid&filter=${filter}&search=${search}" class="btn btn-small ${view === 'grid' ? 'active' : ''}" title="Grid view">⊞</a>
        </div>
      </div>
      
      <!-- Upload Dropzone -->
      <div class="dropzone"
           hx-post="/api/upload"
           hx-target="#library-content"
           hx-swap="outerHTML"
           hx-encoding="multipart/form-data"
           hx-trigger="drop"
           ondragover="event.preventDefault(); this.classList.add('dragover')"
           ondragleave="this.classList.remove('dragover')"
           ondrop="this.classList.remove('dragover')">
        <div class="dropzone-content">
          <span class="dropzone-icon">📂</span>
          <span class="dropzone-text">Drop video files here</span>
          <span class="dropzone-or">or</span>
          <label class="btn btn-primary">
            Choose Files
            <input type="file" 
                   name="files" 
                   multiple 
                   accept="video/*"
                   style="display: none"
                   hx-trigger="change"
                   hx-post="/api/upload"
                   hx-target="#library-content"
                   hx-swap="outerHTML"
                   hx-encoding="multipart/form-data">
          </label>
        </div>
        <input type="hidden" name="view" value="${view}">
        <input type="hidden" name="filter" value="${filter}">
        <input type="hidden" name="search" value="${search}">
      </div>

      <div id="media-container">
        ${filteredMedia.length === 0 
          ? `<div class="empty-state">
               <span class="empty-icon">📺</span>
               <p>No videos yet</p>
               <p class="empty-hint">Drop files above or add to <code>${mediaDirectory}</code></p>
             </div>`
          : mediaContent}
      </div>
    </div>
  `
}

/**
 * Render a single media item.
 * Exported for OOB swap updates.
 */
export function renderMediaItem(item: MediaItem, view: 'list' | 'grid', config?: AppConfig): string {
  const status = getDateStatus(item)
  const thumbnailUrl = `/thumbnails/${item.id}.jpg`
  
  // Determine effective media type for UI
  let displayType = item.mediaType
  if (config) {
    if (config.session.introVideoId === item.id) displayType = 'intro'
    else if (config.session.outroVideoId === item.id) displayType = 'outro'
  }

  if (view === 'grid') {
    return `
      <div class="media-card ${item.isInterlude ? 'interlude-card' : ''}" id="media-${item.id}">
        <div class="media-card-thumb" style="background-image: url('${thumbnailUrl}')">
          <span class="media-card-duration">${formatTime(item.durationSeconds)}</span>
          ${status ? `<span class="status-pill ${status.class}">${status.label}</span>` : ''}
          <span class="media-type-badge" id="badge-${item.id}">${MEDIA_TYPE_ICONS[displayType]}</span>
        </div>
        <div class="media-card-info">
          <span class="media-card-name">${item.filename}</span>
        </div>
        <div class="media-card-actions">
          ${renderTypeSelect(item, displayType)}
          ${renderDeleteButton(item)}
        </div>
      </div>
    `
  }

  return `
    <div class="media-item ${item.isInterlude ? 'interlude-item' : ''}" id="media-${item.id}">
      <div class="media-item-main">
        <div class="media-thumb" style="background-image: url('${thumbnailUrl}')"></div>
        <span class="media-icon" id="badge-${item.id}">${MEDIA_TYPE_ICONS[displayType]}</span>
        <span class="media-name">${item.filename}</span>
        ${status ? `<span class="status-pill ${status.class}">${status.label}</span>` : ''}
        <span class="media-duration">${formatTime(item.durationSeconds)}</span>
        ${renderTypeSelect(item, displayType)}
        ${renderDeleteButton(item)}
      </div>
      ${renderDatePicker(item, displayType)}
    </div>
  `
}

import { isSeasonalActive } from '../utils/date'

// ... existing imports

function getDateStatus(item: MediaItem): { label: string; class: string } | null {
  if (!item.isInterlude) return null
  
  if (!item.dateStart && !item.dateEnd) return { label: 'Always', class: 'active' }
  
  if (item.dateStart && item.dateEnd) {
    if (isSeasonalActive(item.dateStart, item.dateEnd)) {
      return { label: 'Active', class: 'active' }
    }
    return { label: 'Inactive', class: 'expired' } // Renamed from Expired
  }
  
  return { label: 'Partial', class: 'scheduled' }
}

const MEDIA_TYPE_ICONS: Record<MediaType, string> = {
  video: '📺',
  interlude: '🎬',
  intro: '🌅',
  outro: '👋',
}

function renderTypeSelect(item: MediaItem, displayType: MediaType): string {
  return `
    <select class="type-select" 
            id="select-${item.id}"
            name="type"
            autocomplete="off"
            hx-post="/api/update-type/${item.id}"
            hx-trigger="change"
            hx-target="#toast-container"
            hx-swap="innerHTML">
      <option value="video" ${displayType === 'video' ? 'selected' : ''}>📺 Video</option>
      <option value="interlude" ${displayType === 'interlude' ? 'selected' : ''}>🎬 Interlude</option>
      <option value="intro" ${displayType === 'intro' ? 'selected' : ''}>🌅 Intro</option>
      <option value="outro" ${displayType === 'outro' ? 'selected' : ''}>👋 Outro</option>
    </select>
  `
}

function renderDeleteButton(item: MediaItem): string {
  return `
    <button class="btn btn-danger btn-small"
            hx-delete="/api/media/${item.id}"
            hx-target="#media-${item.id}"
            hx-swap="outerHTML"
            hx-confirm="Delete ${item.filename}?">
      ✕
    </button>
  `
}

export function renderDatePicker(item: MediaItem, displayType: MediaType = item.mediaType): string {
  if (displayType !== 'interlude') return ''

  return `
    <form class="media-item-dates date-picker-container" id="dates-${item.id}"
          hx-post="/api/update-dates/${item.id}"
          hx-trigger="change"
          hx-target="#dates-${item.id}"
          hx-swap="outerHTML">
      <input type="text" 
             class="date-input-compact" 
             name="dateStart"
             value="${item.dateStart ?? ''}" 
             placeholder="MM-DD"
             pattern="\\d{2}-\\d{2}"
             title="Format: MM-DD (e.g. 12-01)">
      <span class="date-separator">→</span>
      <input type="text" 
             class="date-input-compact" 
             name="dateEnd"
             value="${item.dateEnd ?? ''}" 
             placeholder="MM-DD"
             pattern="\\d{2}-\\d{2}"
             title="Format: MM-DD (e.g. 02-28)">
      ${item.dateStart || item.dateEnd ? `
        <button type="button" class="btn-clear-date"
                hx-post="/api/update-dates/${item.id}"
                hx-vals='{"dateStart": "", "dateEnd": ""}'
                hx-target="#dates-${item.id}"
                hx-swap="outerHTML"
                title="Clear Schedule">
          ✕
        </button>
      ` : ''}
    </form>
  `
}

function renderMediaSection(
  title: string,
  icon: string,
  items: MediaItem[],
  view: 'list' | 'grid',
  config?: AppConfig
): string {
  return `
    <section class="media-section">
      <h2>${icon} ${title} (${items.length})</h2>
      <div class="${view === 'grid' ? 'media-grid' : 'media-list'}">
        ${items.length === 0 ? '<p class="empty-list">No files matching filter</p>' : items.map((item) => renderMediaItem(item, view, config)).join('')}
      </div>
    </section>
  `
}
