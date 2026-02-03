import type { PlaybackStatus, MediaItem } from '../types'

export interface HeroProps {
  status: PlaybackStatus | null
  sessionInfo: {
    startedAt: Date | null
    limitMinutes: number
    elapsedMs: number
  }
  currentVideo: MediaItem | null
  queue: MediaItem[]
}

export function renderDashboardHero(props: HeroProps): string {
    if (!props.sessionInfo.startedAt) {
        return renderTvOff()
    }
    return renderTvOn(props)
}

function renderTvOff(): string {
  return `
    <div class="tv-off-state" style="text-align: center; padding: 4rem 2rem;">
        <div class="static-noise" style="width: 100px; height: 100px; background: repeating-radial-gradient(#000 0 0.0001%, #222 0 0.0002%); margin: 0 auto 2rem; border-radius: 50%; box-shadow: 0 0 20px rgba(255,255,255,0.1);"></div>
        <h1 style="font-size: 2.5rem; margin-bottom: 1rem; text-transform: uppercase; letter-spacing: 2px;">TV OFF</h1>
        <p style="color: var(--text-secondary); margin-bottom: 2rem;">System is in standby mode.</p>
        
        <button class="btn btn-primary" style="font-size: 1.5rem; padding: 1rem 3rem; background: var(--nick-green); color: black; border: 3px solid black; box-shadow: 6px 6px 0 rgba(0,0,0,0.5);"
                hx-post="/api/session/start"
                hx-swap="none">
            ⏻ POWER ON
        </button>
    </div>
  `
}

function renderTvOn(props: HeroProps): string {
    const { currentVideo, queue, sessionInfo } = props
    
    // Default status when VLC is not responding
    const status = props.status ?? {
      isPlaying: false,
      currentFile: null,
      positionSeconds: 0,
      durationSeconds: 0
    }
    
    // Calculate session progress
    const limitMs = sessionInfo.limitMinutes * 60 * 1000
    const progressPercent = limitMs > 0 ? Math.min(100, (sessionInfo.elapsedMs / limitMs) * 100) : 0
    const remainingMs = Math.max(0, limitMs - sessionInfo.elapsedMs)
    
    // Format remaining time as MM:SS
    const remainingMins = Math.floor(remainingMs / 1000 / 60)
    const remainingSecs = Math.floor((remainingMs / 1000) % 60)
    const remainingFormatted = `${remainingMins}:${remainingSecs.toString().padStart(2, '0')}`
    
    // For critical status
    const remainingTotalMins = Math.ceil(remainingMs / 1000 / 60)

    return `
    <div class="now-playing-hero">
        <!-- Session Timer Top Bar with client-side countdown -->
        ${limitMs > 0 ? `
            <div class="session-bar ${remainingTotalMins < 5 ? 'critical' : remainingTotalMins < 10 ? 'warning' : ''}" data-limit-minutes="${sessionInfo.limitMinutes}">
                <div class="session-bar-fill" style="width: ${progressPercent}%"></div>
                <div class="session-bar-content">
                    <span class="session-label">Broadcast Ends In</span>
                    <span class="session-time" 
                          data-countdown-target="${Date.now() + remainingMs}"
                          data-countdown-format="mm:ss">
                        ${remainingFormatted}
                    </span>
                </div>
            </div>
        ` : ''}

        <!-- Main TV Content -->
        <div class="tv-preview">
            <div class="tv-status ${status.isPlaying ? 'playing' : 'paused'}">
                <span class="tv-status-icon">${status.isPlaying ? '▶' : '⏸'}</span>
                ${status.isPlaying ? 'ON AIR' : 'PAUSED'}
            </div>
            
            <div class="tv-content">
                ${currentVideo ? `
                    <h2 class="tv-title">${currentVideo.filename}</h2>
                    <div class="tv-progress">
                        <div class="tv-progress-bar">
                            <div class="tv-progress-fill" style="width: ${Math.min(100, (status.positionSeconds / currentVideo.durationSeconds) * 100)}%"></div>
                        </div>
                        <div class="tv-time">
                            ${formatTime(status.positionSeconds)} / ${formatTime(currentVideo.durationSeconds)}
                        </div>
                    </div>
                ` : `
                   <span class="tv-ready-count">📺</span>
                   <span class="tv-ready-prompt">Tuning in...</span>
                `}
            </div>
        </div>

        <!-- Controls -->
        <div class="hero-controls">
            ${status.isPlaying 
                ? `<button class="hero-btn" hx-post="/api/pause" hx-swap="none" title="Pause">
                     <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                   </button>`
                : `<button class="hero-btn" hx-post="/api/pause" hx-swap="none" title="Play">
                     <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                   </button>`
            }

            <button class="hero-btn" hx-post="/api/skip" hx-swap="none" title="Skip">
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
            </button>
            
            <div style="width: 1px; background: rgba(255,255,255,0.2); margin: 0 0.5rem;"></div>

            <button class="hero-btn hero-btn-shuffle" 
                    hx-post="/api/session/shuffle" 
                    hx-swap="none"
                    title="Shuffle Queue">
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"/></svg>
            </button>

            <button class="hero-btn hero-btn-power" 
                    hx-post="/api/session/stop" 
                    hx-confirm="End broadcast?"
                    hx-swap="none"
                    title="Power Off">
                <!-- Power icon instead of square -->
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 3h-2v10h2V3zm4.83 2.17l-1.42 1.42C17.99 7.86 19 9.81 19 12c0 3.87-3.13 7-7 7s-7-3.13-7-7c0-2.19 1.01-4.14 2.58-5.42L6.17 5.17C4.23 6.82 3 9.26 3 12c0 4.97 4.03 9 9 9s9-4.03 9-9c0-2.74-1.23-5.18-3.17-6.83z"/></svg>
            </button>
        </div>

        <!-- UP NEXT RAIL -->
        ${renderUpNextRail(queue)}
    </div>
    `
}

function renderUpNextRail(queue: MediaItem[]): string {
    if (queue.length === 0) return ''

    return `
    <div class="up-next">
        <details open>
            <summary class="up-next-summary">
                <span class="up-next-label">UP NEXT</span>
                <span class="up-next-title">${queue.length} items queued</span>
                <span class="up-next-arrow">▼</span>
            </summary>
            
            <div class="up-next-list">
                ${queue.map((item, index) => `
                    <div class="up-next-item ${item.isInterlude ? 'interlude' : ''}">
                        <div class="up-next-thumb">
                            <img src="/thumbnails/${item.id}.jpg" 
                                 alt="" 
                                 loading="lazy"
                                 onerror="this.parentElement.innerHTML='${item.isInterlude ? '🎬' : '📼'}'">
                        </div>
                        <div class="up-next-index">${index + 1}</div>
                        <div class="up-next-item-title">${item.filename}</div>
                        <div class="up-next-item-duration">${formatTime(item.durationSeconds)}</div>
                    </div>
                `).join('')}
            </div>
        </details>
    </div>
    `
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}
