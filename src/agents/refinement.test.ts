import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runRefinementAgent } from './refinement.js';
import * as story from '../core/story.js';
import * as client from '../core/client.js';
import * as logger from '../core/logger.js';
import { Story } from '../types/index.js';

// Mock dependencies
vi.mock('../core/story.js');
vi.mock('../core/client.js');
vi.mock('../core/logger.js');

describe('runRefinementAgent', () => {
  const mockSdlcRoot = '/test/sdlc';
  const mockStoryPath = '/test/sdlc/backlog/S-001-test-story.md';

  const mockStory: Story = {
    path: mockStoryPath,
    slug: 'S-001-test-story',
    frontmatter: {
      id: 'S-001',
      title: 'Test Story',
      slug: 'test-story',
      priority: 10,
      status: 'backlog',
      type: 'feature',
      created: '2024-01-01',
      labels: ['existing-label'],
      research_complete: false,
      plan_complete: false,
      implementation_complete: false,
      reviews_complete: false,
    },
    content: 'Raw story content that needs refinement',
  };

  const mockMovedStory: Story = {
    ...mockStory,
    path: '/test/sdlc/ready/S-001-test-story.md',
    frontmatter: { ...mockStory.frontmatter, status: 'ready' },
  };

  const mockLogger = {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(story.parseStory).mockReturnValue({ ...mockStory });
    vi.mocked(story.writeStory).mockResolvedValue(undefined);
    vi.mocked(story.updateStoryStatus).mockResolvedValue(mockMovedStory);
    vi.mocked(logger.getLogger).mockReturnValue(mockLogger as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('successful refinement', () => {
    it('should refine story and return success', async () => {
      const refinedContent = `# User Story

As a user, I want to test the refinement agent so that I can verify it works correctly.

## Acceptance Criteria
- [ ] Criterion 1
- [ ] Criterion 2

effort: medium
labels: testing, ai`;

      vi.mocked(client.runAgentQuery).mockResolvedValue(refinedContent);

      const result = await runRefinementAgent(mockStoryPath, mockSdlcRoot);

      expect(result.success).toBe(true);
      expect(result.changesMade).toContain('Set effort estimate: medium');
      expect(result.changesMade).toContain('Added labels: testing, ai');
      expect(result.changesMade).toContain('Refined story content');
      expect(result.changesMade).toContain('Updated status to ready');
    });

    it('should call writeStory with updated content', async () => {
      const refinedContent = `Refined content here
effort: small
labels: feature`;

      vi.mocked(client.runAgentQuery).mockResolvedValue(refinedContent);

      await runRefinementAgent(mockStoryPath, mockSdlcRoot);

      expect(story.writeStory).toHaveBeenCalled();
      const writtenStory = vi.mocked(story.writeStory).mock.calls[0][0];
      expect(writtenStory.content).not.toContain('effort: small');
      expect(writtenStory.content).not.toContain('labels: feature');
    });

    it('should update story status to ready', async () => {
      vi.mocked(client.runAgentQuery).mockResolvedValue('Refined content');

      await runRefinementAgent(mockStoryPath, mockSdlcRoot);

      expect(story.updateStoryStatus).toHaveBeenCalledWith(
        expect.any(Object),
        'ready'
      );
    });

    it('should log refinement start and completion', async () => {
      vi.mocked(client.runAgentQuery).mockResolvedValue('Refined content');

      await runRefinementAgent(mockStoryPath, mockSdlcRoot);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'refinement',
        'Starting refinement phase',
        expect.objectContaining({ storyId: 'S-001' })
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'refinement',
        'Refinement phase complete',
        expect.objectContaining({ storyId: 'S-001', newStatus: 'ready' })
      );
    });
  });

  describe('effort estimate parsing', () => {
    it('should parse "effort: small"', async () => {
      vi.mocked(client.runAgentQuery).mockResolvedValue('Content\neffort: small');

      const result = await runRefinementAgent(mockStoryPath, mockSdlcRoot);

      expect(result.changesMade).toContain('Set effort estimate: small');
      const writtenStory = vi.mocked(story.writeStory).mock.calls[0][0];
      expect(writtenStory.frontmatter.estimated_effort).toBe('small');
    });

    it('should parse "effort: medium"', async () => {
      vi.mocked(client.runAgentQuery).mockResolvedValue('Content\neffort: medium');

      const result = await runRefinementAgent(mockStoryPath, mockSdlcRoot);

      expect(result.changesMade).toContain('Set effort estimate: medium');
    });

    it('should parse "effort: large"', async () => {
      vi.mocked(client.runAgentQuery).mockResolvedValue('Content\neffort: large');

      const result = await runRefinementAgent(mockStoryPath, mockSdlcRoot);

      expect(result.changesMade).toContain('Set effort estimate: large');
    });

    it('should parse effort with different formats', async () => {
      const variations = [
        'Effort: MEDIUM',
        'effort:small',
        'effort :  large',
      ];

      for (const variation of variations) {
        vi.clearAllMocks();
        vi.mocked(story.parseStory).mockReturnValue({ ...mockStory });
        vi.mocked(story.updateStoryStatus).mockResolvedValue(mockMovedStory);
        vi.mocked(client.runAgentQuery).mockResolvedValue(`Content\n${variation}`);

        const result = await runRefinementAgent(mockStoryPath, mockSdlcRoot);
        expect(result.changesMade.some(c => c.includes('Set effort estimate'))).toBe(true);
      }
    });

    it('should not set effort when not provided', async () => {
      vi.mocked(client.runAgentQuery).mockResolvedValue('Content with no size metadata');

      const result = await runRefinementAgent(mockStoryPath, mockSdlcRoot);

      expect(result.changesMade).not.toContainEqual(expect.stringContaining('Set effort'));
    });
  });

  describe('labels parsing', () => {
    it('should parse single label', async () => {
      vi.mocked(client.runAgentQuery).mockResolvedValue('Content\nlabels: bug');

      const result = await runRefinementAgent(mockStoryPath, mockSdlcRoot);

      expect(result.changesMade).toContain('Added labels: bug');
    });

    it('should parse multiple labels', async () => {
      vi.mocked(client.runAgentQuery).mockResolvedValue('Content\nlabels: bug, feature, urgent');

      const result = await runRefinementAgent(mockStoryPath, mockSdlcRoot);

      expect(result.changesMade).toContain('Added labels: bug, feature, urgent');
    });

    it('should merge labels with existing labels', async () => {
      vi.mocked(client.runAgentQuery).mockResolvedValue('Content\nlabels: new-label');

      await runRefinementAgent(mockStoryPath, mockSdlcRoot);

      const writtenStory = vi.mocked(story.writeStory).mock.calls[0][0];
      expect(writtenStory.frontmatter.labels).toContain('existing-label');
      expect(writtenStory.frontmatter.labels).toContain('new-label');
    });

    it('should deduplicate labels', async () => {
      vi.mocked(client.runAgentQuery).mockResolvedValue('Content\nlabels: existing-label, new-label');

      await runRefinementAgent(mockStoryPath, mockSdlcRoot);

      const writtenStory = vi.mocked(story.writeStory).mock.calls[0][0];
      const existingCount = writtenStory.frontmatter.labels.filter(l => l === 'existing-label').length;
      expect(existingCount).toBe(1);
    });

    it('should normalize labels to lowercase', async () => {
      vi.mocked(client.runAgentQuery).mockResolvedValue('Content\nlabels: BUG, FEATURE');

      await runRefinementAgent(mockStoryPath, mockSdlcRoot);

      const writtenStory = vi.mocked(story.writeStory).mock.calls[0][0];
      expect(writtenStory.frontmatter.labels).toContain('bug');
      expect(writtenStory.frontmatter.labels).toContain('feature');
    });

    it('should handle labels with hyphens', async () => {
      vi.mocked(client.runAgentQuery).mockResolvedValue('Content\nlabels: tech-debt, high-priority');

      await runRefinementAgent(mockStoryPath, mockSdlcRoot);

      const writtenStory = vi.mocked(story.writeStory).mock.calls[0][0];
      expect(writtenStory.frontmatter.labels).toContain('tech-debt');
      expect(writtenStory.frontmatter.labels).toContain('high-priority');
    });

    it('should not add labels when not provided', async () => {
      vi.mocked(client.runAgentQuery).mockResolvedValue('Content with no tag metadata');

      const result = await runRefinementAgent(mockStoryPath, mockSdlcRoot);

      expect(result.changesMade).not.toContainEqual(expect.stringContaining('Added labels'));
    });
  });

  describe('content cleaning', () => {
    it('should remove effort line from content', async () => {
      vi.mocked(client.runAgentQuery).mockResolvedValue('Content\neffort: medium\nMore content');

      await runRefinementAgent(mockStoryPath, mockSdlcRoot);

      const writtenStory = vi.mocked(story.writeStory).mock.calls[0][0];
      expect(writtenStory.content).not.toContain('effort: medium');
      expect(writtenStory.content).toContain('Content');
      expect(writtenStory.content).toContain('More content');
    });

    it('should remove labels line from content', async () => {
      vi.mocked(client.runAgentQuery).mockResolvedValue('Content\nlabels: bug, feature\nMore content');

      await runRefinementAgent(mockStoryPath, mockSdlcRoot);

      const writtenStory = vi.mocked(story.writeStory).mock.calls[0][0];
      expect(writtenStory.content).not.toContain('labels: bug, feature');
    });

    it('should collapse multiple blank lines', async () => {
      vi.mocked(client.runAgentQuery).mockResolvedValue('Content\n\n\n\n\nMore content');

      await runRefinementAgent(mockStoryPath, mockSdlcRoot);

      const writtenStory = vi.mocked(story.writeStory).mock.calls[0][0];
      expect(writtenStory.content).not.toContain('\n\n\n');
    });

    it('should trim whitespace', async () => {
      vi.mocked(client.runAgentQuery).mockResolvedValue('  Content with whitespace  \n\n');

      await runRefinementAgent(mockStoryPath, mockSdlcRoot);

      const writtenStory = vi.mocked(story.writeStory).mock.calls[0][0];
      expect(writtenStory.content).toBe('Content with whitespace');
    });
  });

  describe('timestamp update', () => {
    it('should update the updated field with current date', async () => {
      vi.mocked(client.runAgentQuery).mockResolvedValue('Refined content');

      await runRefinementAgent(mockStoryPath, mockSdlcRoot);

      const writtenStory = vi.mocked(story.writeStory).mock.calls[0][0];
      expect(writtenStory.frontmatter.updated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('error handling', () => {
    it('should return failure result on agent query error', async () => {
      vi.mocked(client.runAgentQuery).mockRejectedValue(new Error('API error'));

      const result = await runRefinementAgent(mockStoryPath, mockSdlcRoot);

      expect(result.success).toBe(false);
      expect(result.error).toBe('API error');
    });

    it('should log error when refinement fails', async () => {
      vi.mocked(client.runAgentQuery).mockRejectedValue(new Error('API error'));

      await runRefinementAgent(mockStoryPath, mockSdlcRoot);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'refinement',
        'Refinement phase failed',
        expect.objectContaining({ error: 'API error' })
      );
    });

    it('should return original story on error', async () => {
      vi.mocked(client.runAgentQuery).mockRejectedValue(new Error('API error'));

      const result = await runRefinementAgent(mockStoryPath, mockSdlcRoot);

      expect(result.story.frontmatter.id).toBe('S-001');
    });

    it('should preserve changes made before error', async () => {
      // This tests that if we partially process before an error, we track what was done
      vi.mocked(client.runAgentQuery).mockRejectedValue(new Error('Late error'));

      const result = await runRefinementAgent(mockStoryPath, mockSdlcRoot);

      expect(result.changesMade).toEqual([]);
    });

    it('should handle non-Error exceptions', async () => {
      vi.mocked(client.runAgentQuery).mockRejectedValue('String error');

      const result = await runRefinementAgent(mockStoryPath, mockSdlcRoot);

      expect(result.success).toBe(false);
      expect(result.error).toBe('String error');
    });
  });

  describe('progress callback', () => {
    it('should pass onProgress callback to agent query', async () => {
      vi.mocked(client.runAgentQuery).mockResolvedValue('Refined content');
      const onProgress = vi.fn();

      await runRefinementAgent(mockStoryPath, mockSdlcRoot, { onProgress });

      expect(client.runAgentQuery).toHaveBeenCalledWith(
        expect.objectContaining({ onProgress })
      );
    });
  });

  describe('prompt construction', () => {
    it('should include story title in prompt', async () => {
      vi.mocked(client.runAgentQuery).mockResolvedValue('Refined content');

      await runRefinementAgent(mockStoryPath, mockSdlcRoot);

      expect(client.runAgentQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: expect.stringContaining('Test Story'),
        })
      );
    });

    it('should include story content in prompt', async () => {
      vi.mocked(client.runAgentQuery).mockResolvedValue('Refined content');

      await runRefinementAgent(mockStoryPath, mockSdlcRoot);

      expect(client.runAgentQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: expect.stringContaining('Raw story content that needs refinement'),
        })
      );
    });

    it('should include refinement system prompt', async () => {
      vi.mocked(client.runAgentQuery).mockResolvedValue('Refined content');

      await runRefinementAgent(mockStoryPath, mockSdlcRoot);

      expect(client.runAgentQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          systemPrompt: expect.stringContaining('product refinement specialist'),
        })
      );
    });
  });
});
