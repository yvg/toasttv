/**
 * ToastTV Daemon Entry Point
 *
 * Wires all components together and runs the main playback loop.
 */

import * as path from 'node:path'
import { ConfigRepository } from './repositories/ConfigRepository'
import type { AppConfig, DeepPartial } from './repositories/ConfigRepository'
import { MediaRepository } from './repositories/MediaRepository'
import { FilesystemClient } from './clients/FilesystemClient'
import { FFProbeClient } from './clients/FilesystemClient'
import { VlcClient } from './clients/VlcClient'
import { CECClient, CEC_KEYS } from './clients/CECClient'
import { MediaIndexer } from './services/MediaIndexer'
import {
  PlaylistEngine,
  SystemDateTimeProvider,
} from './services/PlaylistEngine'
import { SessionManager } from './services/SessionManager'
import { ConfigService } from './services/ConfigService'
import { type MediaItem, type ToastTVConfig } from './types'

export class ToastTVDaemon {
  private running = false

  private readonly appConfig: ConfigRepository
  private repository: MediaRepository | null = null
  private vlc: VlcClient | null = null
  private indexer: MediaIndexer | null = null
  private engine: PlaylistEngine | null = null

  constructor(configPath = './data/config.json') {
    this.appConfig = new ConfigRepository(configPath)
  }

  getMediaDirectory(): string {
    return this.appConfig.getBootstrap().paths.media
  }

  getSessionInfo(): {
    startedAt: Date | null
    limitMinutes: number
    elapsedMs: number
  } {
    if (!this.engine) return { startedAt: null, limitMinutes: 30, elapsedMs: 0 }
    return this.engine.sessionInfo
  }

  // --- Getters for DI (used by server to create services) ---
  async getConfig(): Promise<AppConfig> {
    return this.appConfig.get()
  }

  updateConfig(partial: DeepPartial<AppConfig>): void {
    this.appConfig.update(partial)
  }

  // --- Getters for DI (used by server to create services) ---

  getRepository(): MediaRepository {
    if (!this.repository) throw new Error('Daemon not started')
    return this.repository
  }

  getIndexer(): MediaIndexer {
    if (!this.indexer) throw new Error('Daemon not started')
    return this.indexer
  }

  getVlc(): VlcClient {
    if (!this.vlc) throw new Error('Daemon not started')
    return this.vlc
  }

  getEngine(): PlaylistEngine {
    if (!this.engine) throw new Error('Daemon not started')
    return this.engine
  }

  getConfigManager(): ConfigRepository {
    return this.appConfig
  }

  async start(): Promise<void> {
    console.log('ToastTV daemon starting...')

    // 1. Initialize DB from bootstrap config
    const bootstrap = this.appConfig.getBootstrap()
    this.repository = new MediaRepository(bootstrap.paths.database)
    await this.repository.initialize()

    // 2. Initialize Config (Seed DB defaults)
    await this.appConfig.initialize(this.repository)
    const runtimeConfig = await this.appConfig.get()

    // 3. Initialize Services
    const vlcConfig = {
      ...runtimeConfig.vlc,
      reconnectDelayMs: 2000,
      maxReconnectAttempts: 10,
    }
    this.vlc = new VlcClient(vlcConfig)

    const filesystem = new FilesystemClient()
    const mediaProbe = new FFProbeClient()

    // Media Indexer uses runtime config for logic but bootstrap config for paths
    const mediaConfig = {
      directory: bootstrap.paths.media,
      supportedExtensions: ['.mp4', '.mkv', '.avi', '.mov', '.webm'],
      databasePath: bootstrap.paths.database,
    }

    // Default interlude directory to 'interludes' inside media directory if not specified
    const interludeConfig = {
      ...runtimeConfig.interlude,
      directory: path.join(bootstrap.paths.media, 'interludes'),
    }

    this.indexer = new MediaIndexer(
      mediaConfig,
      interludeConfig,
      this.repository,
      filesystem,
      mediaProbe
    )

    this.engine = new PlaylistEngine(
      this.appConfig,
      this.repository,
      new SessionManager(new SystemDateTimeProvider()),
      new SystemDateTimeProvider()
    )

    // 4. Run Scan & Connect
    await this.indexer.scanAll()

    // 5. Auto-discover special media (intro/outro/offair) via ConfigService
    const configService = new ConfigService(this.appConfig)
    const allMedia = await this.repository.getAll()
    await configService.discoverSpecialMedia(allMedia)

    await this.vlc.connect()

    // Apply logo settings
    if (runtimeConfig.logo.enabled && runtimeConfig.logo.imagePath) {
      // Use fire-and-forget or await, but catch error if VLC not ready?
      // VlcClient.connect() should ensure it's ready.
      try {
        await this.vlc.setLogo(
          runtimeConfig.logo.imagePath,
          runtimeConfig.logo.opacity,
          runtimeConfig.logo.position
        )
      } catch (err) {
        console.warn('Failed to set initial logo:', err)
      }
    }

    // Try to start CEC listener (optional, may not be available on all systems)
    try {
      await this.initializeCEC()
    } catch {
      console.log('CEC not available (this is optional)')
    }

    this.running = true
    console.log('ToastTV daemon ready')
  }

  private async initializeCEC(): Promise<void> {
    if (!this.vlc || !this.engine) return
    const cec = new CECClient()
    const engine = this.engine
    const vlc = this.vlc

    // Map remote buttons to actions
    cec.onPowerOn(() => {
      console.log('CEC: TV turned on, starting session')
      void engine.startSession()
    })

    cec.onKeyPress(CEC_KEYS.PLAY, () => {
      void engine.startSession()
    })

    cec.onKeyPress(CEC_KEYS.PAUSE, () => {
      void vlc.pause()
    })

    cec.onKeyPress(CEC_KEYS.STOP, () => {
      void engine.endSession()
    })

    cec.onKeyPress(CEC_KEYS.FORWARD, () => {
      void engine.getNextVideo() // Skip handled by playback loop
    })

    cec.onKeyPress(CEC_KEYS.SELECT, () => {
      // Toggle play/pause
      if (engine.isSessionActive) {
        void vlc.pause()
      } else {
        void engine.startSession()
      }
    })

    await cec.start()
    console.log('CEC listener started')
  }

  async stop(): Promise<void> {
    console.log('ToastTV daemon stopping...')
    this.running = false

    if (this.engine && this.engine.isSessionActive) {
      await this.engine.endSession()
    }

    if (this.vlc) {
      try {
        await this.vlc.stop()
      } catch (e) {
        /* ignore */
      }

      try {
        await this.vlc.disconnect()
      } catch (e) {
        /* ignore */
      }
    }

    if (this.repository) {
      await this.repository.close()
    }

    console.log('ToastTV daemon stopped')
  }
}
