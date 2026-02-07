/**
 * TV Detection Service
 *
 * Orchestrates CEC client to detect TV state.
 * Provides reliable start/stop detection with CEC power query heartbeat.
 */

import type { CECClient } from '../clients/CECClient'
import { logger } from '../utils/logger'

export type TVStateCallback = () => void | Promise<void>

export interface TVDetectionConfig {
  cecEnabled: boolean
  heartbeatIntervalMs: number
}

export interface TVDetectionDeps {
  cec: CECClient | null
  config: TVDetectionConfig
}

const DEFAULT_CONFIG: TVDetectionConfig = {
  cecEnabled: true,
  heartbeatIntervalMs: 30000,
}

export class TVDetectionService {
  private readonly cec: CECClient | null
  private readonly config: TVDetectionConfig

  private tvActive = false
  private running = false
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null

  private onTVActiveCallback: TVStateCallback | null = null
  private onTVInactiveCallback: TVStateCallback | null = null

  constructor(deps: TVDetectionDeps) {
    this.cec = deps.cec
    this.config = { ...DEFAULT_CONFIG, ...deps.config }
  }

  /**
   * Register callback for when TV becomes active (watching ToastTV).
   */
  onTVActive(callback: TVStateCallback): void {
    this.onTVActiveCallback = callback
  }

  /**
   * Register callback for when TV becomes inactive (off or different input).
   */
  onTVInactive(callback: TVStateCallback): void {
    this.onTVInactiveCallback = callback
  }

  /**
   * Check if TV is currently considered active.
   */
  get isActive(): boolean {
    return this.tvActive
  }

  /**
   * Start the detection service.
   * Wires up CEC callbacks, starts heartbeat polling.
   */
  async start(): Promise<void> {
    if (this.running) return

    logger.info('TV Detection Service starting...')

    this.running = true

    // Wire up CEC callbacks
    if (this.cec && this.config.cecEnabled) {
      this.cec.onPowerOn(() => {
        logger.info('TVDetection: CEC power on → TV active')
        this.setActive(true)
      })

      this.cec.onActiveSource(() => {
        logger.info('TVDetection: CEC active source → TV active')
        this.setActive(true)
      })

      this.cec.onStandby(() => {
        logger.info('TVDetection: CEC standby → TV inactive')
        this.setActive(false)
      })

      this.cec.onInactiveSource(() => {
        logger.info('TVDetection: CEC inactive source → TV inactive')
        this.setActive(false)
      })
    }

    // Start heartbeat polling for reliable stop detection
    this.startHeartbeat()

    // Check initial state via CEC power query
    await this.checkInitialState()

    logger.info('TV Detection Service started')
  }

  /**
   * Stop the detection service.
   */
  stop(): void {
    this.running = false
    this.stopHeartbeat()
    logger.info('TV Detection Service stopped')
  }

  private setActive(active: boolean): void {
    if (this.tvActive === active) return

    this.tvActive = active

    if (active) {
      logger.info('TV state changed: ACTIVE')
      void this.onTVActiveCallback?.()
    } else {
      logger.info('TV state changed: INACTIVE')
      void this.onTVInactiveCallback?.()
    }
  }

  private startHeartbeat(): void {
    if (this.heartbeatTimer) return

    const intervalMs = this.config.heartbeatIntervalMs
    if (intervalMs <= 0) {
      logger.info('Heartbeat disabled (interval <= 0)')
      return
    }

    logger.info(`Starting heartbeat polling every ${intervalMs}ms`)

    this.heartbeatTimer = setInterval(() => {
      void this.heartbeatCheck()
    }, intervalMs)
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  private async heartbeatCheck(): Promise<void> {
    if (!this.running) return

    // Only check if we think TV is active (to detect missed stop events)
    if (!this.tvActive) return

    // Query TV power state via CEC
    if (this.cec && this.config.cecEnabled) {
      const powerState = await this.cec.getPowerState()

      if (powerState === 'standby') {
        logger.warn(
          'Heartbeat: CEC reports TV standby (missed event), marking inactive'
        )
        this.setActive(false)
      } else if (powerState === 'unknown') {
        // CEC power query returned unknown, no action needed
      }
    }
  }

  private async checkInitialState(): Promise<void> {
    // Query initial TV power state
    if (this.cec && this.config.cecEnabled) {
      const powerState = await this.cec.getPowerState()

      if (powerState === 'on') {
        logger.info('Initial state: TV is on')
        // Auto-start session if TV is already on
        this.setActive(true)
      } else if (powerState === 'standby') {
        logger.info('Initial state: TV is in standby')
      } else {
        logger.info('Initial state: TV power unknown')
      }
    }
  }
}
