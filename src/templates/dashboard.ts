/**
 * Dashboard Template
 *
 * Main dashboard with unified hero card showing playback and controls.
 * Supports "TV Off" (Standby) and "TV On" (Active Session) states.
 * 
 * Uses HTMX for updates but with careful swap strategies to avoid
 * button responsiveness issues.
 */

import { renderLayout } from './layout'

export function renderDashboard(): string {
  return renderLayout(
    'Dashboard',
    `
    <div class="dashboard">
      <!-- 
        Main Dashboard Container 
        Poll every 2 seconds for state updates (not 500ms to avoid unresponsive buttons)
        Only swaps inner content, preserving container
      -->
      <section class="hero-card"
               id="dashboard-hero"
               hx-get="/partials/dashboard-state"
               hx-trigger="load, every 2s"
               hx-swap="innerHTML settle:0ms">
        
        <!-- Initial Loading State -->
        <div class="loading">
          <div style="font-size: 2rem; margin-bottom: 1rem;">📺</div>
          Connecting to TV...
        </div>
        
      </section>
    </div>
    
    <!-- Toast Container for Notifications -->
    <div id="toast-container"></div>
    
    <!-- Client-side countdown timer script -->
    <script>
      // Smooth client-side countdown for session timer
      (function() {
        let countdownInterval = null;
        
        function updateCountdowns() {
          const countdowns = document.querySelectorAll('[data-countdown-target]');
          countdowns.forEach(el => {
            const target = parseInt(el.dataset.countdownTarget, 10);
            const remaining = Math.max(0, target - Date.now());
            const mins = Math.floor(remaining / 60000);
            const secs = Math.floor((remaining % 60000) / 1000);
            el.textContent = mins + ':' + secs.toString().padStart(2, '0');
            
            // Update session bar fill if present
            const bar = el.closest('.session-bar');
            if (bar) {
              const fill = bar.querySelector('.session-bar-fill');
              const limitMins = parseInt(bar.dataset.limitMinutes || '30', 10);
              const limitMs = limitMins * 60 * 1000;
              const elapsed = limitMs - remaining;
              const pct = limitMs > 0 ? Math.min(100, (elapsed / limitMs) * 100) : 0;
              if (fill) fill.style.width = pct + '%';
              
              // Update critical/warning class
              if (mins < 5) {
                bar.classList.add('critical');
                bar.classList.remove('warning');
              } else if (mins < 10) {
                bar.classList.add('warning');
                bar.classList.remove('critical');
              }
            }
          });
        }
        
        // Run every second for smooth countdown
        if (countdownInterval) clearInterval(countdownInterval);
        countdownInterval = setInterval(updateCountdowns, 1000);
        
        // Also run on htmx swap
        document.body.addEventListener('htmx:afterSwap', updateCountdowns);
      })();
    </script>
  `
  )
}
