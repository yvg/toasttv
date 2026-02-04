/**
 * Settings Template
 *
 * Configuration page for session, interlude, VLC, and logo settings.
 * Uses pure HTMX for form submission and logo upload - no extensions.
 */

import type { AppConfig } from '../repositories/ConfigRepository'
import { renderLayout } from './layout'

export interface SettingsProps {
  config: AppConfig
  mediaDirectory: string
}

export function renderSettings(props: SettingsProps): string {
  const { config, mediaDirectory } = props
  const hasLogo = config.logo.imagePath !== null

  return renderLayout(
    'Settings',
    `
    <div class="settings">
      <h1>⚙️ Settings</h1>
      
      <form id="settings-form"
            hx-post="/api/config"
            hx-target="#toast-container"
            hx-swap="innerHTML">
        <!-- Logo Section (full-width, at top) -->
        <section class="settings-card">
          <div class="card-header">
            <h2>🖼️ Logo Overlay</h2>
            <label class="toggle">
              <input type="checkbox" id="logoEnabled" name="logoEnabled" value="true" ${config.logo.enabled ? 'checked' : ''}>
              <span class="toggle-slider"></span>
            </label>
          </div>
          
          <div class="logo-settings-grid">
            <div class="logo-controls">
              ${renderLogoUpload(hasLogo)}
              ${renderPositionGrid(config.logo.position)}
              ${renderOpacitySlider(config.logo.opacity)}
            </div>
            
            ${renderLogoPreview(hasLogo, config.logo.opacity, config.logo.position)}
          </div>
        </section>
        
        <div style="height: 1.5rem;"></div>
        
        <div class="settings-grid">
          <!-- Session Settings Card -->
          <section class="settings-card">
            <div class="card-header">
              <h2>🎬 Session</h2>
            </div>
            
            <div class="form-group">
              <label for="sessionLimit">Daily Limit (minutes)</label>
              <input type="number" 
                     id="sessionLimit" 
                     name="sessionLimit" 
                     value="${config.session.limitMinutes || ''}"
                     min="1"
                     placeholder="Unlimited">
              <span class="hint">Leave empty for unlimited daily watch time</span>
            </div>
            
            <div class="form-group">
              <label for="resetHour">New Day Starts At</label>
              <select id="resetHour" name="resetHour">
                ${renderHourOptions(config.session.resetHour)}
              </select>
              <span class="hint">Quota resets at this hour each day</span>
            </div>
            
            <p class="card-note">💡 Set intro, outro, and off-air screens in <a href="/library">Library</a></p>
          </section>
          
          <!-- Interlude Settings Card -->
          <section class="settings-card">
            <div class="card-header">
              <h2>🎞️ Interludes</h2>
              <label class="toggle">
                <input type="checkbox" id="interludeEnabled" name="interludeEnabled" value="true" ${config.interlude.enabled ? 'checked' : ''}>
                <span class="toggle-slider"></span>
              </label>
            </div>
            
            <div class="form-group">
              <label for="interludeFreq">Frequency</label>
              <select id="interludeFreq" name="interludeFrequency">
                ${[1, 2, 3, 4, 5]
                  .map(
                    (n) =>
                      `<option value="${n}" ${config.interlude.frequency === n ? 'selected' : ''}>Every ${n} video${n > 1 ? 's' : ''}</option>`
                  )
                  .join('')}
              </select>
              <span class="hint">Insert interlude after every N videos</span>
            </div>
          </section>
          
          <!-- VLC Connection Card -->
          <section class="settings-card">
            <div class="card-header">
              <h2>🔌 VLC Connection</h2>
            </div>
            
            <div class="form-row">
              <div class="form-group">
                <label for="vlcHost">Host</label>
                <input type="text" id="vlcHost" name="vlcHost" value="${config.vlc.host}">
              </div>
              <div class="form-group">
                <label for="vlcPort">Port</label>
                <input type="number" id="vlcPort" name="vlcPort" value="${config.vlc.port}" min="1" max="65535">
              </div>
            </div>
          </section>
          
          <!-- Media Management Card -->
          <section class="settings-card">
            <div class="card-header">
              <h2>📂 Media Library</h2>
            </div>
            
            <div class="form-group">
              <label>Media Directory</label>
              <code class="path-display">${mediaDirectory}</code>
            </div>
            
            <button type="button" class="btn btn-secondary"
                    hx-post="/api/rescan"
                    hx-target="#toast-container"
                    hx-swap="innerHTML">
              🔄 Rescan Library
            </button>
            <span class="hint">Scan for new files added via filesystem</span>
          </section>
          
          <!-- Server Card -->
          <section class="settings-card">
            <div class="card-header">
              <h2>🌐 Web Server</h2>
            </div>
            
            <div class="form-group">
              <label for="serverPort">Port</label>
              <input type="number" id="serverPort" name="serverPort" value="${config.server.port}" min="1" max="65535">
              <span class="hint">Default: 1993. Requires restart.</span>
            </div>
          </section>
        </div>
        
        <div class="form-actions-sticky">
          <button type="submit" class="btn btn-primary btn-large">
            💾 Save Settings
          </button>
        </div>
      </form>
    </div>
    
    <script>
      ${getSettingsScript()}
    </script>
  `
  )
}

function renderHourOptions(selectedHour: number): string {
  return Array.from({ length: 24 }, (_, h) => {
    const label =
      h === 0
        ? '12:00 AM'
        : h < 12
          ? `${h}:00 AM`
          : h === 12
            ? '12:00 PM'
            : `${h - 12}:00 PM`
    return `<option value="${h}" ${selectedHour === h ? 'selected' : ''}>${label}</option>`
  }).join('')
}

function renderLogoUpload(hasLogo: boolean): string {
  return `
    <div class="form-group" id="logo-upload-section">
      <label>Logo Image</label>
      <div class="logo-picker">
        ${hasLogo ? `<img src="/logo" alt="Current logo" class="logo-preview">` : `<div class="logo-placeholder">No logo</div>`}
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
  `
}

function renderPositionGrid(currentPosition: number): string {
  const positions = [
    { pos: 0, title: 'Top-Left', icon: '↖' },
    { pos: 2, title: 'Top-Right', icon: '↗' },
    { pos: 6, title: 'Bottom-Left', icon: '↙' },
    { pos: 8, title: 'Bottom-Right', icon: '↘' },
  ]

  return `
    <div class="form-group">
      <label>Position</label>
      <div class="position-grid corners-only">
        ${positions
          .map(
            (p) => `
          <button type="button" 
                  class="position-btn ${currentPosition === p.pos ? 'active' : ''}" 
                  data-position="${p.pos}" 
                  title="${p.title}"
                  onclick="selectPosition(this, ${p.pos})">${p.icon}</button>
        `
          )
          .join('')}
      </div>
      <input type="hidden" id="logoPosition" name="logoPosition" value="${currentPosition}">
    </div>
  `
}

function renderOpacitySlider(opacity: number): string {
  const percent = Math.round((opacity / 255) * 100)

  return `
    <div class="form-group">
      <label for="logoOpacity">Opacity: <span id="opacityValue">${percent}%</span></label>
      <input type="range" 
             id="logoOpacity" 
             name="logoOpacity" 
             value="${opacity}" 
             min="0" 
             max="255" 
             oninput="updateOpacityDisplay(this.value)">
    </div>
  `
}

function renderLogoPreview(
  hasLogo: boolean,
  opacity: number,
  position: number
): string {
  const isTop = position === 0 || position === 2
  const isLeft = position === 0 || position === 6

  return `
    <div class="logo-preview-area">
      <div class="logo-screen-preview" id="logoScreenPreview">
        <div class="screen-content">TV Screen</div>
        ${
          hasLogo
            ? `<img src="/logo" alt="Logo preview" class="screen-logo" id="screenLogo" 
                    style="opacity: ${opacity / 255}; ${isLeft ? 'left: 8px;' : 'right: 8px;'} ${isTop ? 'top: 8px;' : 'bottom: 8px;'}">`
            : ''
        }
      </div>
    </div>
  `
}

function getSettingsScript(): string {
  // Note: These JS functions are necessary for live preview updates
  // The form itself is submitted via htmx with standard form encoding
  return `
    // Position selection - updates hidden input and preview
    function selectPosition(btn, pos) {
      document.querySelectorAll('.position-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('logoPosition').value = pos;
      updateLogoPreview();
    }
    
    // Opacity display and preview
    function updateOpacityDisplay(value) {
      const percent = Math.round((value / 255) * 100);
      document.getElementById('opacityValue').textContent = percent + '%';
      updateLogoPreview();
    }
    
    // Update logo preview position and opacity
    function updateLogoPreview() {
      const logo = document.getElementById('screenLogo');
      if (!logo) return;
      
      const opacity = document.getElementById('logoOpacity').value / 255;
      const position = document.getElementById('logoPosition').value;
      
      logo.style.opacity = opacity;
      logo.style.top = (position === '0' || position === '2') ? '8px' : 'auto';
      logo.style.bottom = (position === '6' || position === '8') ? '8px' : 'auto';
      logo.style.left = (position === '0' || position === '6') ? '8px' : 'auto';
      logo.style.right = (position === '2' || position === '8') ? '8px' : 'auto';
    }
  `
}
