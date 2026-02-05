/**
 * ToastTV Configuration Repository
 *
 * Handles loading, saving, and runtime updates of configuration.
 * Persists to JSON file for simple editing.
 */

import { existsSync, readFileSync } from 'node:fs'
import type { IMediaRepository } from './IMediaRepository'

export interface BootstrapConfig {
  paths: {
    media: string
    database: string
  }
}

export interface AppConfig {
  server: {
    port: number
  }
  session: {
    limitMinutes: number
    resetHour: number
    offAirAssetId: number | null
    introVideoId: number | null
    outroVideoId: number | null
  }
  interlude: {
    enabled: boolean
    frequency: number
  }
  mpv: {
    ipcSocket: string
  }
  logo: {
    enabled: boolean
    imagePath: string | null
    opacity: number
    position: number
    x: number
    y: number
  }
}

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P]
}

const DEFAULT_BOOTSTRAP: BootstrapConfig = {
  paths: {
    media: './media',
    database: './data/media.db',
  },
}

const DEFAULT_CONFIG: AppConfig = {
  server: {
    port: 1993,
  },
  session: {
    limitMinutes: 30,
    resetHour: 6,
    offAirAssetId: null,
    introVideoId: null,
    outroVideoId: null,
  },
  interlude: {
    enabled: true,
    frequency: 1,
  },
  mpv: {
    ipcSocket: '/tmp/toasttv-mpv.sock',
  },
  logo: {
    enabled: true,
    imagePath: './data/logo.png',
    opacity: 128,
    position: 6, // Top-Right
    x: 8,
    y: 8,
  },
}

export class ConfigRepository {
  private bootstrap: BootstrapConfig
  private repository: IMediaRepository | null = null

  constructor(configPath = './data/config.json') {
    this.bootstrap = this.loadBootstrap(configPath)
  }

  // Called by Daemon after creating MediaRepository
  async initialize(repository: IMediaRepository): Promise<void> {
    this.repository = repository
    await this.seedDefaults()
  }

  private loadBootstrap(configPath: string): BootstrapConfig {
    try {
      if (existsSync(configPath)) {
        const raw = readFileSync(configPath, 'utf-8')
        const parsed = JSON.parse(raw)
        return {
          paths: {
            media:
              parsed.media?.directory ??
              parsed.paths?.media ??
              DEFAULT_BOOTSTRAP.paths.media,
            database:
              parsed.media?.databasePath ??
              parsed.paths?.database ??
              DEFAULT_BOOTSTRAP.paths.database,
          },
        }
      }
    } catch (error) {
      console.warn('Failed to load bootstrap config, using defaults:', error)
    }
    return DEFAULT_BOOTSTRAP
  }

  getBootstrap(): BootstrapConfig {
    return this.bootstrap
  }

  // Seed DB with defaults if empty
  private async seedDefaults(): Promise<void> {
    if (!this.repository) return

    const settings = await this.repository.getAllSettings()

    // Helper to set if missing
    const setIfMissing = async (key: string, value: string) => {
      if (!settings[key]) {
        await this.repository!.setSetting(key, value)
      }
    }

    await setIfMissing('server.port', DEFAULT_CONFIG.server.port.toString())
    await setIfMissing(
      'session.limitMinutes',
      DEFAULT_CONFIG.session.limitMinutes.toString()
    )
    await setIfMissing(
      'interlude.enabled',
      DEFAULT_CONFIG.interlude.enabled.toString()
    )
    await setIfMissing(
      'interlude.frequency',
      DEFAULT_CONFIG.interlude.frequency.toString()
    )
    await setIfMissing('mpv.ipcSocket', DEFAULT_CONFIG.mpv.ipcSocket)
    await setIfMissing('logo.enabled', DEFAULT_CONFIG.logo.enabled.toString())
    await setIfMissing('logo.opacity', DEFAULT_CONFIG.logo.opacity.toString())
    await setIfMissing('logo.position', DEFAULT_CONFIG.logo.position.toString())
    await setIfMissing('logo.x', DEFAULT_CONFIG.logo.x.toString())
    await setIfMissing('logo.y', DEFAULT_CONFIG.logo.y.toString())
    if (DEFAULT_CONFIG.logo.imagePath) {
      await setIfMissing('logo.imagePath', DEFAULT_CONFIG.logo.imagePath)
    }
    // Note: Special media discovery (intro/outro/offair) is now handled by ConfigService.discoverSpecialMedia()
  }

  async get(): Promise<AppConfig> {
    if (!this.repository) return DEFAULT_CONFIG

    const s = await this.repository.getAllSettings()

    return {
      server: {
        port: parseInt(s['server.port'] ?? '1993', 10),
      },
      session: {
        limitMinutes: parseInt(s['session.limitMinutes'] ?? '30', 10),
        resetHour: parseInt(s['session.resetHour'] ?? '6', 10),
        offAirAssetId: s['session.offAirAssetId']
          ? parseInt(s['session.offAirAssetId'], 10)
          : null,
        introVideoId: s['session.introVideoId']
          ? parseInt(s['session.introVideoId'], 10)
          : null,
        outroVideoId: s['session.outroVideoId']
          ? parseInt(s['session.outroVideoId'], 10)
          : null,
      },
      interlude: {
        enabled: s['interlude.enabled'] === 'true',
        frequency: parseInt(s['interlude.frequency'] ?? '1', 10),
      },
      mpv: {
        ipcSocket: s['mpv.ipcSocket'] ?? '/tmp/toasttv-mpv.sock',
      },
      logo: {
        enabled: s['logo.enabled'] === 'true',
        imagePath: s['logo.imagePath'] ?? null,
        opacity: parseInt(s['logo.opacity'] ?? '128', 10),
        position: parseInt(s['logo.position'] ?? '6', 10),
        x: parseInt(s['logo.x'] ?? '8', 10),
        y: parseInt(s['logo.y'] ?? '8', 10),
      },
    }
  }

  async update(partial: DeepPartial<AppConfig>): Promise<void> {
    if (!this.repository) return

    if (partial.server?.port !== undefined)
      await this.repository.setSetting(
        'server.port',
        partial.server.port.toString()
      )

    if (partial.session) {
      if (partial.session.limitMinutes !== undefined)
        await this.repository.setSetting(
          'session.limitMinutes',
          partial.session.limitMinutes.toString()
        )
      if (partial.session.resetHour !== undefined)
        await this.repository.setSetting(
          'session.resetHour',
          partial.session.resetHour.toString()
        )
      if (partial.session.offAirAssetId !== undefined)
        await this.repository.setSetting(
          'session.offAirAssetId',
          partial.session.offAirAssetId?.toString() ?? ''
        )
      if (partial.session.introVideoId !== undefined)
        await this.repository.setSetting(
          'session.introVideoId',
          partial.session.introVideoId?.toString() ?? ''
        )
      if (partial.session.outroVideoId !== undefined)
        await this.repository.setSetting(
          'session.outroVideoId',
          partial.session.outroVideoId?.toString() ?? ''
        )
    }

    if (partial.interlude) {
      if (partial.interlude.enabled !== undefined)
        await this.repository.setSetting(
          'interlude.enabled',
          partial.interlude.enabled.toString()
        )
      if (partial.interlude.frequency !== undefined)
        await this.repository.setSetting(
          'interlude.frequency',
          partial.interlude.frequency.toString()
        )
    }

    if (partial.mpv) {
      if (partial.mpv.ipcSocket !== undefined)
        await this.repository.setSetting('mpv.ipcSocket', partial.mpv.ipcSocket)
    }

    if (partial.logo) {
      if (partial.logo.enabled !== undefined)
        await this.repository.setSetting(
          'logo.enabled',
          partial.logo.enabled.toString()
        )
      if (partial.logo.imagePath !== undefined)
        await this.repository.setSetting(
          'logo.imagePath',
          partial.logo.imagePath ?? ''
        )
      if (partial.logo.opacity !== undefined)
        await this.repository.setSetting(
          'logo.opacity',
          partial.logo.opacity.toString()
        )
      if (partial.logo.position !== undefined)
        await this.repository.setSetting(
          'logo.position',
          partial.logo.position.toString()
        )
      if (partial.logo.x !== undefined)
        await this.repository.setSetting('logo.x', partial.logo.x.toString())
      if (partial.logo.y !== undefined)
        await this.repository.setSetting('logo.y', partial.logo.y.toString())
    }
  }
}

// Re-export ConfigManager as alias for backward compatibility
export { ConfigRepository as ConfigManager }
