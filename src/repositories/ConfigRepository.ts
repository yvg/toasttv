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
    introVideoId: number | null
    outroVideoId: number | null
  }
  interlude: {
    enabled: boolean
    frequency: number
  }
  vlc: {
    host: string
    port: number
  }
  logo: {
    enabled: boolean
    imagePath: string | null
    opacity: number
    position: number
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
    introVideoId: null,
    outroVideoId: null,
  },
  interlude: {
    enabled: true,
    frequency: 1,
  },
  vlc: {
    host: 'localhost',
    port: 9999,
  },
  logo: {
    enabled: true,
    imagePath: './data/logo.png',
    opacity: 128,
    position: 2,
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
            media: parsed.media?.directory ?? parsed.paths?.media ?? DEFAULT_BOOTSTRAP.paths.media,
            database: parsed.media?.databasePath ?? parsed.paths?.database ?? DEFAULT_BOOTSTRAP.paths.database
          }
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
    await setIfMissing('session.limitMinutes', DEFAULT_CONFIG.session.limitMinutes.toString())
    await setIfMissing('interlude.enabled', DEFAULT_CONFIG.interlude.enabled.toString())
    await setIfMissing('interlude.frequency', DEFAULT_CONFIG.interlude.frequency.toString())
    await setIfMissing('vlc.host', DEFAULT_CONFIG.vlc.host)
    await setIfMissing('vlc.port', DEFAULT_CONFIG.vlc.port.toString())
    await setIfMissing('logo.enabled', DEFAULT_CONFIG.logo.enabled.toString())
    await setIfMissing('logo.opacity', DEFAULT_CONFIG.logo.opacity.toString())
    await setIfMissing('logo.position', DEFAULT_CONFIG.logo.position.toString())
    if (DEFAULT_CONFIG.logo.imagePath) {
      await setIfMissing('logo.imagePath', DEFAULT_CONFIG.logo.imagePath)
    }

    // Auto-discover intro/outro if not set
    if (!settings['session.introVideoId']) {
      await this.discoverAndSetIntro()
    }
  }

  private async discoverAndSetIntro(): Promise<void> {
    if (!this.repository) return
    // Look for penny_..._intro.mp4
    const allMedia = await this.repository.getAll()
    const intro = allMedia.find(m => m.filename.includes('_intro') || m.filename.includes('penny_and_chip_splash'))
    if (intro) {
      await this.repository.setSetting('session.introVideoId', intro.id.toString())
      console.log(`Auto-configured intro video: ${intro.filename}`)
    }
    
    const outro = allMedia.find(m => m.filename.includes('_outro'))
    if (outro) {
      await this.repository.setSetting('session.outroVideoId', outro.id.toString())
      console.log(`Auto-configured outro video: ${outro.filename}`)
    }
  }

  async get(): Promise<AppConfig> {
    if (!this.repository) return DEFAULT_CONFIG
    
    const s = await this.repository.getAllSettings()

    return {
      server: {
        port: parseInt(s['server.port'] ?? '1993', 10)
      },
      session: {
        limitMinutes: parseInt(s['session.limitMinutes'] ?? '30', 10),
        introVideoId: s['session.introVideoId'] ? parseInt(s['session.introVideoId'], 10) : null,
        outroVideoId: s['session.outroVideoId'] ? parseInt(s['session.outroVideoId'], 10) : null,
      },
      interlude: {
        enabled: s['interlude.enabled'] === 'true',
        frequency: parseInt(s['interlude.frequency'] ?? '1', 10)
      },
      vlc: {
        host: s['vlc.host'] ?? 'localhost',
        port: parseInt(s['vlc.port'] ?? '9999', 10)
      },
      logo: {
        enabled: s['logo.enabled'] === 'true',
        imagePath: s['logo.imagePath'] ?? null,
        opacity: parseInt(s['logo.opacity'] ?? '128', 10),
        position: parseInt(s['logo.position'] ?? '2', 10)
      }
    }
  }

  async update(partial: DeepPartial<AppConfig>): Promise<void> {
    if (!this.repository) return

    if (partial.server?.port !== undefined) await this.repository.setSetting('server.port', partial.server.port.toString())
    
    if (partial.session) {
      if (partial.session.limitMinutes !== undefined) await this.repository.setSetting('session.limitMinutes', partial.session.limitMinutes.toString())
      if (partial.session.introVideoId !== undefined) await this.repository.setSetting('session.introVideoId', partial.session.introVideoId?.toString() ?? '')
      if (partial.session.outroVideoId !== undefined) await this.repository.setSetting('session.outroVideoId', partial.session.outroVideoId?.toString() ?? '')
    }

    if (partial.interlude) {
      if (partial.interlude.enabled !== undefined) await this.repository.setSetting('interlude.enabled', partial.interlude.enabled.toString())
      if (partial.interlude.frequency !== undefined) await this.repository.setSetting('interlude.frequency', partial.interlude.frequency.toString())
    }

    if (partial.vlc) {
      if (partial.vlc.host !== undefined) await this.repository.setSetting('vlc.host', partial.vlc.host)
      if (partial.vlc.port !== undefined) await this.repository.setSetting('vlc.port', partial.vlc.port.toString())
    }

    if (partial.logo) {
      if (partial.logo.enabled !== undefined) await this.repository.setSetting('logo.enabled', partial.logo.enabled.toString())
      if (partial.logo.imagePath !== undefined) await this.repository.setSetting('logo.imagePath', partial.logo.imagePath ?? '')
      if (partial.logo.opacity !== undefined) await this.repository.setSetting('logo.opacity', partial.logo.opacity.toString())
      if (partial.logo.position !== undefined) await this.repository.setSetting('logo.position', partial.logo.position.toString())
    }
  }
}

// Re-export ConfigManager as alias for backward compatibility
export { ConfigRepository as ConfigManager }
