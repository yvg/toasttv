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
import { MpvClient } from './clients/MpvClient'
import { CECClient, CEC_KEYS } from './clients/CECClient'
import { MediaIndexer } from './services/MediaIndexer'
import {
  PlaylistEngine,
  SystemDateTimeProvider,
} from './services/PlaylistEngine'
import { SessionManager } from './services/SessionManager'
import { ConfigService } from './services/ConfigService'
import { PlaybackService } from './services/PlaybackService'
import type { MediaItem, ToastTVConfig, IMediaPlayer } from './types'

export class ToastTVDaemon {
  private running = false

  private readonly appConfig: ConfigRepository
  private repository: MediaRepository | null = null
  private player: IMediaPlayer | null = null
  private indexer: MediaIndexer | null = null
  private engine: PlaylistEngine | null = null
  private playbackService: PlaybackService | null = null
  private configService: ConfigService | null = null

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

  getPlayer(): IMediaPlayer {
    if (!this.player) throw new Error('Daemon not started')
    return this.player
  }

  getEngine(): PlaylistEngine {
    if (!this.engine) throw new Error('Daemon not started')
    return this.engine
  }

  getConfigManager(): ConfigRepository {
    return this.appConfig
  }

  getPlaybackService(): PlaybackService {
    if (!this.playbackService) throw new Error('Daemon not started')
    return this.playbackService
  }

  getConfigService(): ConfigService {
    if (!this.configService) throw new Error('Daemon not started')
    return this.configService
  }

  /**
   * Initialize components (DB, Services). Fast.
   * Call this before starting the web server.
   */
  async init(): Promise<void> {
    console.log('ToastTV daemon initializing...')

    // 1. Initialize DB from bootstrap config
    const bootstrap = this.appConfig.getBootstrap()
    this.repository = new MediaRepository(bootstrap.paths.database)
    await this.repository.initialize()

    // 2. Initialize Config (Seed DB defaults)
    await this.appConfig.initialize(this.repository)
    const runtimeConfig = await this.appConfig.get()

    // 3. Initialize Services
    const playerConfig = {
      ...runtimeConfig.mpv,
      reconnectDelayMs: 2000,
      maxReconnectAttempts: 10,
    }
    // Switch to MpvClient (implements IMediaPlayer)
    this.player = new MpvClient(playerConfig)

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

    console.log('Components initialized.')
  }

  /**
   * Start background tasks (Scanning, MPV Connection). Slow.
   * Call this AFTER starting the web server to ensure fast UI availability.
   */
  async start(): Promise<void> {
    if (!this.player || !this.indexer || !this.repository || !this.engine) {
      throw new Error('Daemon not initialized. Call init() first.')
    }

    console.log('ToastTV background services starting...')

    // 4. Run Scan & Connect
    await this.indexer.scanAll()

    // 5. Create ConfigService and auto-discover special media
    this.configService = new ConfigService(this.appConfig)
    const allMedia = await this.repository.getAll()
    await this.configService.discoverSpecialMedia(allMedia)

    await this.player.connect()

    // 6. Create PlaybackService (needed for CEC and server)
    this.playbackService = new PlaybackService({
      player: this.player,
      engine: this.engine,
      config: this.configService,
      media: this.repository,
      // Note: No DashboardEventService here - server can set it later if needed
    })

    // Get fresh config for logo settings
    const runtimeConfig = await this.appConfig.get()

    // Apply logo settings
    if (runtimeConfig.logo) {
      // Map AppConfig structure (imagePath) to LogoConfig structure (filePath)
      await this.player.updateLogo({
        filePath: runtimeConfig.logo.imagePath,
        opacity: runtimeConfig.logo.opacity,
        position: runtimeConfig.logo.position,
        x: runtimeConfig.logo.x,
        y: runtimeConfig.logo.y,
      })
    }

    // Try to start CEC listener (optional, may not be available on all systems)
    try {
      await this.initializeCEC()
    } catch {
      console.log('CEC not available (this is optional)')
    }

    this.running = true
    console.log('ToastTV daemon fully operational')
  }

  private async initializeCEC(): Promise<void> {
    if (!this.playbackService) return
    const cec = new CECClient()
    const playback = this.playbackService

    // Map remote buttons to actions via PlaybackService
    cec.onPowerOn(() => {
      console.log('CEC: TV turned on, starting session')
      void playback.startSession()
    })

    cec.onKeyPress(CEC_KEYS.PLAY, () => {
      console.log('CEC: PLAY - starting session')
      void playback.startSession()
    })

    cec.onKeyPress(CEC_KEYS.PAUSE, () => {
      console.log('CEC: PAUSE - toggling pause')
      void playback.pause()
    })

    cec.onKeyPress(CEC_KEYS.STOP, () => {
      console.log('CEC: STOP - ending session')
      void playback.endSession()
    })

    cec.onKeyPress(CEC_KEYS.FORWARD, () => {
      console.log('CEC: FORWARD - skipping to next video')
      void playback.skip()
    })

    cec.onKeyPress(CEC_KEYS.RIGHT, () => {
      console.log('CEC: RIGHT - skipping to next video')
      void playback.skip()
    })

    cec.onKeyPress(CEC_KEYS.SELECT, () => {
      // Toggle play/pause
      if (playback.isSessionActive) {
        console.log('CEC: SELECT - toggling pause')
        void playback.pause()
      } else {
        console.log('CEC: SELECT - starting session')
        void playback.startSession()
      }
    })

    // TODO: Add power off detection to end session

    await cec.start()
    console.log('CEC listener started')
  }

  async stop(): Promise<void> {
    console.log('ToastTV daemon stopping...')
    this.running = false

    if (this.engine && this.engine.isSessionActive) {
      await this.engine.endSession()
    }

    if (this.player) {
      try {
        await this.player.stop()
      } catch (e) {
        /* ignore */
      }

      try {
        await this.player.disconnect()
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
