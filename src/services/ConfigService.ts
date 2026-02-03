/**
 * Config Service
 * 
 * Business logic layer for application configuration.
 * Wraps ConfigRepository to maintain proper layer separation.
 */

import type { ConfigRepository, AppConfig, DeepPartial } from '../repositories/ConfigRepository'

export class ConfigService {
  constructor(
    private readonly repository: ConfigRepository
  ) {}

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
      interlude: { enabled, frequency }
    })
  }

  /**
   * Set logo configuration.
   */
  async setLogoConfig(imagePath: string, opacity: number, position: number): Promise<void> {
    await this.repository.update({
      logo: { imagePath, opacity, position, enabled: true }
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
}
