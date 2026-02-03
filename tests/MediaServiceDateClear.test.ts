
import { describe, expect, test, mock } from 'bun:test'
import { MediaService } from '../src/services/MediaService'
import { MediaRepository } from '../src/repositories/MediaRepository' // We will mock this

describe('MediaService Date Clearing', () => {
  test('updateType clears dates when setting to intro', async () => {
    // Mock Repo
    const mockRepo = {
        resetMediaType: mock(() => Promise.resolve()),
        updateDates: mock(() => Promise.resolve()),
        updateMediaType: mock(() => Promise.resolve()),
        getAll: mock(() => Promise.resolve([])), 
    } as unknown as MediaRepository

    const service = new MediaService(
        mockRepo, 
        {} as any, // Indexer
        { get: async () => ({ session: {} }), getMediaDirectory: () => '/media' } as any, // ConfigService
        {} as any // ThumbnailClient
    )

    await service.updateType(1, 'intro')

    // Verify updateDates was called with nulls
    expect(mockRepo.updateDates).toHaveBeenCalledWith(1, null, null)
    expect(mockRepo.resetMediaType).toHaveBeenCalledWith('intro')
    expect(mockRepo.updateMediaType).toHaveBeenCalledWith(1, 'intro')
  })

  test('updateType does NOT clear dates when setting to interlude', async () => {
    const mockRepo = {
        resetMediaType: mock(() => Promise.resolve()),
        updateDates: mock(() => Promise.resolve()),
        updateMediaType: mock(() => Promise.resolve()),
    } as unknown as MediaRepository

    const service = new MediaService(
        mockRepo, 
        {} as any, 
        { get: async () => ({ session: {} }), getMediaDirectory: () => '/media' } as any,
        {} as any // ThumbnailClient
    )

    await service.updateType(2, 'interlude')

    // Verify updateDates was NOT called
    expect(mockRepo.updateDates).not.toHaveBeenCalled()
    expect(mockRepo.updateMediaType).toHaveBeenCalledWith(2, 'interlude')
  })
})
