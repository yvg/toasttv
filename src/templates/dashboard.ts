/**
 * Dashboard Template
 *
 * Main dashboard with unified hero card showing playback and controls.
 * Uses SSE for real-time updates - client owns the progress timer.
 */

import { renderLayout } from './layout'

export function renderDashboard(): string {
  return renderLayout(
    'Dashboard',
    `
    <div class="dashboard">
      <!-- Main Dashboard Container - Updated via SSE -->
      <section class="hero-card" id="dashboard-hero">
        <!-- Initial Loading State - Will be replaced by SSE sync -->
        <div class="loading" id="loading-state">
          <div style="font-size: 2rem; margin-bottom: 1rem;">📺</div>
          Connecting to TV...
        </div>
        
        <!-- TV Off State (hidden initially) -->
        <div id="tv-off-state" style="display: none;">
          <div class="tv-off-state">
            <!-- SMPTE Color Bars -->
            <div class="smpte-bars">
              <div class="smpte-row smpte-main">
                <div style="background: #c0c0c0; flex: 1;"></div>
                <div style="background: #c0c000; flex: 1;"></div>
                <div style="background: #00c0c0; flex: 1;"></div>
                <div style="background: #00c000; flex: 1;"></div>
                <div style="background: #c000c0; flex: 1;"></div>
                <div style="background: #c00000; flex: 1;"></div>
                <div style="background: #0000c0; flex: 1;"></div>
              </div>
              <div class="smpte-row smpte-mid">
                <div style="background: #0000c0; flex: 1;"></div>
                <div style="background: #131313; flex: 1;"></div>
                <div style="background: #c000c0; flex: 1;"></div>
                <div style="background: #131313; flex: 1;"></div>
                <div style="background: #00c0c0; flex: 1;"></div>
                <div style="background: #131313; flex: 1;"></div>
                <div style="background: #c0c0c0; flex: 1;"></div>
              </div>
              <div class="smpte-row smpte-bottom">
                <div style="background: #00214c; flex: 1.5;"></div>
                <div style="background: #fff; flex: 1.5;"></div>
                <div style="background: #32006a; flex: 1.5;"></div>
                <div style="background: #131313; flex: 4;"></div>
                <div style="background: #090909; flex: 0.5;"></div>
                <div style="background: #1d1d1d; flex: 0.5;"></div>
              </div>
              <div class="smpte-overlay"></div>
            </div>
            
            <div class="tv-off-content">
              <button class="btn btn-primary hero-btn-power" style="font-size: 1.25rem; padding: 0.875rem 2rem;"
                      hx-post="/api/session/start"
                      hx-swap="none">
                ⏻ POWER ON
              </button>
            </div>
          </div>
        </div>
        
        <!-- Off-Air State (quota exhausted) -->
        <div id="off-air-state" style="display: none;">
          <div class="off-air-card">
            <div class="off-air-icon">🌙</div>
            <h2 class="off-air-title">OFF AIR</h2>
            <p class="off-air-message">Daily limit reached</p>
            <p class="off-air-loop">🔁 Playing on loop</p>
            <button class="btn btn-primary off-air-btn"
                    hx-post="/api/skip-quota"
                    hx-swap="none">
              Skip Limit Today
            </button>
            <p class="off-air-reset">Limit resumes at <span id="reset-hour">6:00</span></p>
          </div>
        </div>
        
        <!-- TV On State (hidden initially) -->
        <div id="tv-on-state" style="display: none;">
          <div class="now-playing-hero">
            <!-- Session Timer Bar -->
            <div class="session-bar" id="session-bar">
              <div class="session-bar-fill" id="session-fill" style="width: 0%"></div>
              <div class="session-bar-content">
                <span class="session-label">Broadcast Ends In</span>
                <span class="session-time" id="session-time">--:--</span>
              </div>
            </div>

            <!-- Main TV Content -->
            <div class="tv-preview">
              <div class="tv-status" id="status-badge">
                <span class="tv-status-icon" id="status-icon">▶</span>
                <span id="status-text">ON AIR</span>
              </div>
              
              <div class="tv-content">
                <h2 class="tv-title" id="track-title">Loading...</h2>
                <div class="tv-progress">
                  <div class="tv-progress-bar">
                    <div class="tv-progress-fill" id="progress-fill" style="width: 0%"></div>
                  </div>
                  <div class="tv-time" id="time-display">0:00 / 0:00</div>
                </div>
              </div>
            </div>

            <!-- Controls -->
            <div class="hero-controls">
              <button class="hero-btn" id="play-pause-btn" hx-post="/api/pause" hx-swap="none" title="Pause">
                <svg viewBox="0 0 24 24" fill="currentColor" id="play-pause-icon">
                  <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
                </svg>
              </button>

              <button class="hero-btn" hx-post="/api/skip" hx-swap="none" title="Skip">
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
              </button>
              
              <div style="width: 1px; background: rgba(255,255,255,0.2); margin: 0 0.5rem;"></div>

              <button class="hero-btn hero-btn-shuffle" hx-post="/api/session/shuffle" hx-swap="none" title="Shuffle Queue">
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"/></svg>
              </button>

              <button class="hero-btn hero-btn-power" hx-post="/api/session/stop" hx-confirm="End broadcast?" hx-swap="none" title="Power Off">
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 3h-2v10h2V3zm4.83 2.17l-1.42 1.42C17.99 7.86 19 9.81 19 12c0 3.87-3.13 7-7 7s-7-3.13-7-7c0-2.19 1.01-4.14 2.58-5.42L6.17 5.17C4.23 6.82 3 9.26 3 12c0 4.97 4.03 9 9 9s9-4.03 9-9c0-2.74-1.23-5.18-3.17-6.83z"/></svg>
              </button>
            </div>

            <!-- Up Next -->
            <div class="up-next" id="up-next-section" style="display: none;">
              <details open>
                <summary class="up-next-summary">
                  <span class="up-next-label">UP NEXT</span>
                  <span class="up-next-title" id="up-next-title"></span>
                  <span class="up-next-arrow">▼</span>
                </summary>
                <div class="up-next-list" id="up-next-list"></div>
              </details>
            </div>
          </div>
        </div>
      </section>
    </div>
    
    <!-- Toast Container for Notifications -->
    <div id="toast-container"></div>
    
    <!-- SSE Client Script -->
    <script>
    (function() {
      'use strict';
      
      // --- State ---
      let position = 0;
      let duration = 0;
      let isPlaying = false;
      let trackId = null;
      let sessionRemainingMs = 0;
      let sessionLimitMs = 0;
      let timer = null;
      let sessionTimer = null;
      
      // --- DOM Elements ---
      const loadingState = document.getElementById('loading-state');
      const tvOffState = document.getElementById('tv-off-state');
      const tvOnState = document.getElementById('tv-on-state');
      const statusBadge = document.getElementById('status-badge');
      const statusIcon = document.getElementById('status-icon');
      const statusText = document.getElementById('status-text');
      const trackTitle = document.getElementById('track-title');
      const progressFill = document.getElementById('progress-fill');
      const timeDisplay = document.getElementById('time-display');
      const sessionBar = document.getElementById('session-bar');
      const sessionFill = document.getElementById('session-fill');
      const sessionTime = document.getElementById('session-time');
      const sessionLabel = document.querySelector('.session-label'); // Add selector for label
      const playPauseIcon = document.getElementById('play-pause-icon');
      const upNextSection = document.getElementById('up-next-section');
      const upNextTitle = document.getElementById('up-next-title');
      const upNextList = document.getElementById('up-next-list');
      const offAirState = document.getElementById('off-air-state');
      const resetHourEl = document.getElementById('reset-hour');
      
      // --- Debug logging helper ---
      function ts() {
        return new Date().toISOString().slice(11, 23);
      }
      function log(category, msg) {
        console.log('[' + ts() + '] ' + category + ': ' + msg);
      }
      
      // --- SSE Connection ---
      let eventSource = null;
      let reconnectAttempts = 0;
      
      function connect() {
        eventSource = new EventSource('/events/dashboard');
        
        eventSource.onopen = function() {
          reconnectAttempts = 0;
          log('SSE', 'connected');
        };
        
        eventSource.onmessage = function(e) {
          try {
            const event = JSON.parse(e.data);
            handleEvent(event);
          } catch (err) {
            console.error('SSE parse error:', err);
          }
        };
        
        eventSource.onerror = function() {
          eventSource.close();
          reconnectAttempts++;
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
          log('SSE', 'reconnecting in ' + delay + 'ms');
          setTimeout(connect, delay);
        };
      }
      
      // --- Event Handlers ---
      function handleEvent(event) {
        log('SSE', 'received: ' + event.type + ' ' + (event.filename || event.trackId || ''));
        switch (event.type) {
          case 'sync':
            handleSync(event);
            break;
          case 'trackStart':
            handleTrackStart(event);
            break;
          case 'paused':
            handlePaused();
            break;
          case 'playing':
            handlePlaying();
            break;
          case 'sessionStart':
            handleSessionStart(event);
            break;
          case 'sessionEnd':
            handleSessionEnd();
            break;
          case 'queueUpdate':
            handleQueueUpdate(event);
            break;
        }
      }
      
      function handleSync(event) {
        log('SSE', 'sync: pos=' + event.position + ' dur=' + event.duration + ' playing=' + event.isPlaying + ' offAir=' + event.isOffAir);
        // Hide loading
        loadingState.style.display = 'none';
        
        // Check for off-air mode first
        if (event.isOffAir) {
          showOffAir(event.resetHour);
          return;
        }
        
        if (!event.sessionActive) {
          showTvOff();
          return;
        }
        
        // Show TV on
        showTvOn();
        
        // Set initial state
        trackId = event.trackId;
        position = event.position;
        duration = event.duration;
        isPlaying = event.isPlaying;
        sessionRemainingMs = event.sessionRemainingMs;
        
        // Update UI
        trackTitle.textContent = event.filename || 'No video';
        updateProgressBar();
        updateStatusBadge();
        updateSessionTimer();
        handleQueueUpdate(event);
        
        // Start timers
        if (isPlaying) startTimer();
        startSessionTimer();
      }
      
      function handleTrackStart(event) {
        log('SSE', 'trackStart: ' + event.filename + ' dur=' + event.duration);
        trackId = event.trackId;
        position = 0;
        duration = event.duration;
        isPlaying = true;
        
        trackTitle.textContent = event.filename;
        updateProgressBar();
        updateStatusBadge();
        startTimer();
        // Update queue if present
        if (event.queue) {
          handleQueueUpdate(event);
        }
      }
      
      function handlePaused() {
        isPlaying = false;
        stopTimer();
        updateStatusBadge();
      }
      
      function handlePlaying() {
        isPlaying = true;
        startTimer();
        updateStatusBadge();
      }
      
      function handleSessionStart(event) {
        sessionRemainingMs = event.sessionRemainingMs;
        showTvOn();
        startSessionTimer();
        // Update queue if present
        if (event.queue) {
          handleQueueUpdate(event);
        }
      }
      
      function handleSessionEnd() {
        stopTimer();
        stopSessionTimer();
        showTvOff();
      }
      
      function handleQueueUpdate(event) {
        if (!event.queue || event.queue.length === 0) {
          upNextSection.style.display = 'none';
          return;
        }
        
        upNextSection.style.display = 'block';
        upNextTitle.textContent = event.queue[0].filename;
        upNextList.innerHTML = event.queue.map((item, i) => 
          '<div class="up-next-item' + (item.isInterlude ? ' interlude' : '') + '">' +
            '<span class="up-next-index">' + (i + 1) + '</span>' +
            '<span class="up-next-item-title">' + item.filename + '</span>' +
          '</div>'
        ).join('');
      }
      
      // --- UI Updates ---
      function showTvOff() {
        tvOffState.style.display = 'block';
        tvOnState.style.display = 'none';
        offAirState.style.display = 'none';
        loadingState.style.display = 'none';
      }
      
      function showTvOn() {
        tvOffState.style.display = 'none';
        tvOnState.style.display = 'block';
        offAirState.style.display = 'none';
        loadingState.style.display = 'none';
      }
      
      function showOffAir(resetHour) {
        tvOffState.style.display = 'none';
        tvOnState.style.display = 'none';
        offAirState.style.display = 'block';
        loadingState.style.display = 'none';
        if (resetHourEl) resetHourEl.textContent = resetHour + ':00';
      }
      
      function updateStatusBadge() {
        if (isPlaying) {
          statusBadge.className = 'tv-status playing';
          statusIcon.textContent = '▶';
          statusText.textContent = 'ON AIR';
          playPauseIcon.innerHTML = '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>';
        } else {
          statusBadge.className = 'tv-status paused';
          statusIcon.textContent = '⏸';
          statusText.textContent = 'PAUSED';
          playPauseIcon.innerHTML = '<path d="M8 5v14l11-7z"/>';
        }
      }
      
      function updateProgressBar() {
        const pct = duration > 0 ? (position / duration) * 100 : 0;
        progressFill.style.width = Math.min(100, pct) + '%';
        timeDisplay.textContent = formatTime(position) + ' / ' + formatTime(duration);
      }
      
      function updateSessionTimer() {
        if (sessionRemainingMs <= 0) {
          if (sessionLabel) sessionLabel.textContent = 'Broadcast';
          sessionTime.textContent = 'Ending Soon';
          sessionFill.style.width = '100%';
          sessionBar.className = 'session-bar critical';
          return;
        }

        if (sessionLabel) sessionLabel.textContent = 'Broadcast Ends In';
        const mins = Math.floor(sessionRemainingMs / 60000);
        const secs = Math.floor((sessionRemainingMs % 60000) / 1000);
        sessionTime.textContent = mins + ':' + secs.toString().padStart(2, '0');
        
        // Update fill (assumes 30 min limit if not specified)
        if (sessionLimitMs > 0) {
          const elapsed = sessionLimitMs - sessionRemainingMs;
          const pct = Math.min(100, (elapsed / sessionLimitMs) * 100);
          sessionFill.style.width = pct + '%';
        }
        
        // Warning/critical states
        if (mins < 5) {
          sessionBar.className = 'session-bar critical';
        } else if (mins < 10) {
          sessionBar.className = 'session-bar warning';
        } else {
          sessionBar.className = 'session-bar';
        }
      }
      
      function formatTime(secs) {
        const m = Math.floor(secs / 60);
        const s = Math.floor(secs % 60);
        return m + ':' + s.toString().padStart(2, '0');
      }
      
      // --- Timers ---
      function startTimer() {
        stopTimer();
        timer = setInterval(function() {
          if (isPlaying && position < duration) {
            position++;
            updateProgressBar();
          }
        }, 1000);
      }
      
      function stopTimer() {
        if (timer) {
          clearInterval(timer);
          timer = null;
        }
      }
      
      function startSessionTimer() {
        stopSessionTimer();
        sessionTimer = setInterval(function() {
          if (sessionRemainingMs > 0) {
            sessionRemainingMs -= 1000;
            updateSessionTimer();
          }
        }, 1000);
      }
      
      function stopSessionTimer() {
        if (sessionTimer) {
          clearInterval(sessionTimer);
          sessionTimer = null;
        }
      }
      
      // --- Start ---
      connect();
    })();
    </script>
  `
  )
}
