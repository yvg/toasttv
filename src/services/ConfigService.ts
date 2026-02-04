/**
 * Config Service
 *
 * Business logic layer for application configuration.
 * Wraps ConfigRepository to maintain proper layer separation.
 */

import type {
  ConfigRepository,
  AppConfig,
  DeepPartial,
} from '../repositories/ConfigRepository'

export class ConfigService {
  constructor(private readonly repository: ConfigRepository) {}

  /**
   * Get current application configuration.
   */
  async get(): Promise<AppConfig> {
    return this.repository.get()
  }

  /**
   * Update configuration with partial values.
   */
  async update(partial: DeepPartial<AppConfig>): Promise<void> {
    await this.repository.update(partial)
  }

  /**
   * Set session time limit with validation.
   */
  async setSessionLimit(minutes: number): Promise<void> {
    if (minutes < 0) {
      throw new Error('Session limit cannot be negative')
    }
    await this.repository.update({ session: { limitMinutes: minutes } })
  }

  /**
   * Set interlude configuration.
   */
  async setInterludeConfig(enabled: boolean, frequency: number): Promise<void> {
    if (frequency < 1) {
      throw new Error('Interlude frequency must be at least 1')
    }
    await this.repository.update({
      interlude: { enabled, frequency },
    })
  }

  /**
   * Set logo configuration.
   */
  async setLogoConfig(
    imagePath: string,
    opacity: number,
    position: number
  ): Promise<void> {
    await this.repository.update({
      logo: { imagePath, opacity, position, enabled: true },
    })
  }

  /**
   * Disable logo overlay.
   */
  async disableLogo(): Promise<void> {
    await this.repository.update({ logo: { enabled: false } })
  }

  /**
   * Get media directory path from bootstrap config.
   */
  getMediaDirectory(): string {
    return this.repository.getBootstrap().paths.media
  }

  /**
   * Get database path from bootstrap config.
   */
  getDatabasePath(): string {
    return this.repository.getBootstrap().paths.database
  }

  /**
   * Auto-discover special media (intro/outro/off-air) by filename patterns.
   * This is business logic that belongs in the service layer.
   * Called during app initialization after media indexing.
   */
  async discoverSpecialMedia(
    allMedia: Array<{ id: number; filename: string }>
  ): Promise<void> {
    const currentConfig = await this.get()

    // Intro - look for _intro or penny_and_chip_splash
    if (!currentConfig.session.introVideoId) {
      const intro = allMedia.find(
        (m) =>
          m.filename.includes('_intro') ||
          m.filename.includes('penny_and_chip_splash')
      )
      if (intro) {
        await this.repository.update({ session: { introVideoId: intro.id } })
        console.log(`Auto-configured intro video: ${intro.filename}`)
      }
    }

    // Outro - look for _outro
    if (!currentConfig.session.outroVideoId) {
      const outro = allMedia.find((m) => m.filename.includes('_outro'))
      if (outro) {
        await this.repository.update({ session: { outroVideoId: outro.id } })
        console.log(`Auto-configured outro video: ${outro.filename}`)
      }
    }

    // Off-air screen - look for bedtime
    if (!currentConfig.session.offAirAssetId) {
      const offair = allMedia.find((m) => m.filename.includes('bedtime'))
      if (offair) {
        await this.repository.update({ session: { offAirAssetId: offair.id } })
        console.log(`Auto-configured off-air screen: ${offair.filename}`)
      }
    }
  }
}
