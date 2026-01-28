import { describe, it, expect, vi, beforeEach } from 'vitest';
import { syncStoryPriority, syncAllStoriesPriority } from '../priority-sync.js';
import { Story } from '../../types/index.js';
import { TicketProvider } from '../ticket-provider/types.js';
import * as storyModule from '../../core/story.js';

// Mock story module
vi.mock('../../core/story.js', () => ({
  updateStoryField: vi.fn(),
}));

describe('priority-sync', () => {
  const mockStory: Story = {
    path: '/test/.ai-sdlc/stories/backlog/test-story.md',
    slug: 'test-story',
    frontmatter: {
      id: 'S-0001',
      title: 'Test Story',
      status: 'ready',
      created: '2024-01-01',
      updated: '2024-01-01',
      priority: 50,
      ticket_provider: 'github',
      ticket_id: '123',
      ticket_url: 'https://github.com/test-org/test-repo/issues/123',
    },
    content: 'Test story content',
  };

  const mockProvider: TicketProvider = {
    name: 'github',
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    updateStatus: vi.fn(),
    addComment: vi.fn(),
    linkPR: vi.fn(),
    mapStatusToExternal: vi.fn(),
    mapStatusFromExternal: vi.fn(),
    syncPriority: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('syncStoryPriority', () => {
    it('should update story priority when synced value differs', async () => {
      vi.mocked(mockProvider.syncPriority!).mockResolvedValue(10);
      vi.mocked(storyModule.updateStoryField).mockResolvedValue(mockStory);

      const result = await syncStoryPriority(mockStory, mockProvider);

      expect(result).toBe(mockStory);
      expect(mockProvider.syncPriority).toHaveBeenCalledWith('123');
      expect(storyModule.updateStoryField).toHaveBeenCalledWith(mockStory, 'priority', 10);
      expect(storyModule.updateStoryField).toHaveBeenCalledWith(
        mockStory,
        'priority_source',
        'github-project'
      );
      expect(storyModule.updateStoryField).toHaveBeenCalledWith(
        mockStory,
        'ticket_synced_at',
        expect.any(String)
      );
    });

    it('should not update priority when synced value is the same', async () => {
      const storyWithSamePriority = {
        ...mockStory,
        frontmatter: {
          ...mockStory.frontmatter,
          priority: 10,
        },
      };

      vi.mocked(mockProvider.syncPriority!).mockResolvedValue(10);
      vi.mocked(storyModule.updateStoryField).mockResolvedValue(storyWithSamePriority);

      const result = await syncStoryPriority(storyWithSamePriority, mockProvider);

      expect(result).toBe(storyWithSamePriority);
      expect(storyModule.updateStoryField).toHaveBeenCalledWith(
        storyWithSamePriority,
        'priority_source',
        'github-project'
      );
      expect(storyModule.updateStoryField).toHaveBeenCalledWith(
        storyWithSamePriority,
        'ticket_synced_at',
        expect.any(String)
      );
      // Should only update priority_source and ticket_synced_at, not priority
      expect(storyModule.updateStoryField).not.toHaveBeenCalledWith(
        storyWithSamePriority,
        'priority',
        expect.anything()
      );
    });

    it('should return null when story has no ticket ID', async () => {
      const storyNoTicket = {
        ...mockStory,
        frontmatter: {
          ...mockStory.frontmatter,
          ticket_id: undefined,
        },
      };

      const result = await syncStoryPriority(storyNoTicket, mockProvider);

      expect(result).toBeNull();
      expect(mockProvider.syncPriority).not.toHaveBeenCalled();
    });

    it('should return null when provider does not support syncPriority', async () => {
      const providerWithoutSync = {
        ...mockProvider,
        syncPriority: undefined,
      };

      const result = await syncStoryPriority(mockStory, providerWithoutSync);

      expect(result).toBeNull();
    });

    it('should return null when ticket not in project', async () => {
      vi.mocked(mockProvider.syncPriority!).mockResolvedValue(null);

      const result = await syncStoryPriority(mockStory, mockProvider);

      expect(result).toBeNull();
      expect(storyModule.updateStoryField).not.toHaveBeenCalled();
    });

    it('should return null on error and not throw', async () => {
      vi.mocked(mockProvider.syncPriority!).mockRejectedValue(new Error('API error'));

      const result = await syncStoryPriority(mockStory, mockProvider);

      expect(result).toBeNull();
      expect(storyModule.updateStoryField).not.toHaveBeenCalled();
    });
  });

  describe('syncAllStoriesPriority', () => {
    const stories: Story[] = [
      {
        ...mockStory,
        frontmatter: { ...mockStory.frontmatter, id: 'S-0001', ticket_id: '123' },
      },
      {
        ...mockStory,
        frontmatter: { ...mockStory.frontmatter, id: 'S-0002', ticket_id: '456' },
      },
      {
        ...mockStory,
        frontmatter: { ...mockStory.frontmatter, id: 'S-0003', ticket_id: undefined },
      },
    ];

    it('should sync all stories with ticket IDs', async () => {
      vi.mocked(mockProvider.syncPriority!)
        .mockResolvedValueOnce(10)
        .mockResolvedValueOnce(20)
        .mockResolvedValueOnce(null);
      vi.mocked(storyModule.updateStoryField).mockResolvedValue(mockStory);

      const syncedCount = await syncAllStoriesPriority(stories, mockProvider);

      expect(syncedCount).toBe(2);
      expect(mockProvider.syncPriority).toHaveBeenCalledTimes(2);
    });

    it('should call progress callback for each story', async () => {
      vi.mocked(mockProvider.syncPriority!).mockResolvedValue(null);

      const onProgress = vi.fn();
      await syncAllStoriesPriority(stories, mockProvider, onProgress);

      expect(onProgress).toHaveBeenCalledTimes(3);
      expect(onProgress).toHaveBeenNthCalledWith(1, 1, 3, stories[0]);
      expect(onProgress).toHaveBeenNthCalledWith(2, 2, 3, stories[1]);
      expect(onProgress).toHaveBeenNthCalledWith(3, 3, 3, stories[2]);
    });

    it('should continue on individual failures', async () => {
      vi.mocked(mockProvider.syncPriority!)
        .mockResolvedValueOnce(10)
        .mockRejectedValueOnce(new Error('API error'))
        .mockResolvedValueOnce(null);
      vi.mocked(storyModule.updateStoryField).mockResolvedValue(mockStory);

      const syncedCount = await syncAllStoriesPriority(stories, mockProvider);

      expect(syncedCount).toBe(1); // Only first story synced successfully
      expect(mockProvider.syncPriority).toHaveBeenCalledTimes(2);
    });

    it('should return 0 when no stories synced', async () => {
      vi.mocked(mockProvider.syncPriority!).mockResolvedValue(null);

      const syncedCount = await syncAllStoriesPriority(stories, mockProvider);

      expect(syncedCount).toBe(0);
    });
  });
});
