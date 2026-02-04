/**
 * Logger Utility
 *
 * Provides timestamped debug logging that can be enabled/disabled.
 * Enabled by default in dev mode (NODE_ENV !== 'production').
 */

const IS_DEV = process.env.NODE_ENV !== 'production'

// Can be overridden via environment variable
const DEBUG_ENABLED =
  process.env.DEBUG === 'true' || (IS_DEV && process.env.DEBUG !== 'false')

function timestamp(): string {
  return new Date().toISOString().slice(11, 23)
}

export const logger = {
  /**
   * Debug log with timestamp (only in dev mode or when DEBUG=true)
   */
  debug(category: string, message: string, ...args: unknown[]): void {
    if (!DEBUG_ENABLED) return
    console.log(`[${timestamp()}] ${category}: ${message}`, ...args)
  },

  /**
   * Info log with timestamp (always shown)
   */
  info(message: string, ...args: unknown[]): void {
    console.log(`[${timestamp()}] ${message}`, ...args)
  },

  /**
   * Warning log with timestamp (always shown)
   */
  warn(message: string, ...args: unknown[]): void {
    console.warn(`[${timestamp()}] ⚠️ ${message}`, ...args)
  },

  /**
   * Error log with timestamp (always shown)
   */
  error(message: string, ...args: unknown[]): void {
    console.error(`[${timestamp()}] ❌ ${message}`, ...args)
  },

  /**
   * Check if debug logging is enabled
   */
  get isDebugEnabled(): boolean {
    return DEBUG_ENABLED
  },
}
