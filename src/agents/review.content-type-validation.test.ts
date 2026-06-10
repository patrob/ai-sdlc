 
import { spawnSync } from 'child_process';
import fs from 'fs';
import { beforeEach, describe, expect, it, type Mock,vi } from 'vitest';

import * as clientModule from '../core/client.js';
import * as configModule from '../core/config.js';
import * as storyModule from '../core/story.js';
import { type Config,ReviewDecision, type Story } from '../types/index.js';
import { runReviewAgent } from './review.js';

// Mock external dependencies
vi.mock('child_process', () => ({
  spawn: vi.fn(),
  spawnSync: vi.fn(),
  execSync: vi.fn(),
}));
vi.mock('fs');
vi.mock('../core/story.js', async () => {
  const actual = await vi.importActual<typeof import('../core/story.js')>('../core/story.js');
  return {
    ...actual,
    parseStory: vi.fn(),
    writeStory: vi.fn(),
    appendReviewHistory: vi.fn(),
    snapshotMaxRetries: vi.fn(),
    isAtMaxRetries: vi.fn(() => false), // Default: not at max retries
    appendToSection: vi.fn(),
    updateStoryField: vi.fn(),
    updateStoryStatus: vi.fn((story) => Promise.resolve(story)), // Return same story with updated status
  };
});
vi.mock('../core/client.js');
vi.mock('../core/config.js', async () => {
  const actual = await vi.importActual<typeof import('../core/config.js')>('../core/config.js');
  return {
    ...actual,
    loadConfig: vi.fn(),
  };
});

describe('Content Type Classification and Validation', () => {
  describe('Content Type Validation in runReviewAgent', () => {
    const mockStoryPath = '/test/stories/test-story.md';
    const mockWorkingDir = '/test/project';

    beforeEach(() => {
      vi.clearAllMocks();
      // Working-directory validation runs before content checks; fs is auto-mocked
      // so existsSync/statSync must be stubbed for runReviewAgent to proceed.
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => true } as fs.Stats);
      vi.mocked(configModule.loadConfig).mockReturnValue({
        implementation: {
          maxRetries: 3,
          maxRetriesUpperBound: 10,
        },
      } as Config);
      vi.mocked(storyModule.snapshotMaxRetries).mockResolvedValue(undefined);
      vi.mocked(storyModule.isAtMaxRetries).mockReturnValue(false);
    });

    it('should validate source changes for code stories', async () => {
      const mockStory: Story = {
        path: mockStoryPath,
        slug: 'test-story',
        frontmatter: {
          id: 'test-1',
          title: 'Test Story',
          slug: 'test-story',
          priority: 1,
          status: 'in-progress',
          type: 'feature',
          created: '2024-01-01',
          labels: [],
          research_complete: true,
          plan_complete: true,
          implementation_complete: true,
          reviews_complete: false,
          content_type: 'code',
        },
        content: 'test content',
      };

      vi.mocked(storyModule.parseStory).mockReturnValue(mockStory);
      vi.mocked(storyModule.updateStoryField).mockResolvedValue(undefined);

      // Mock no source changes
      (spawnSync as Mock).mockReturnValue({
        status: 0,
        stdout: 'README.md\n',
      });

      const result = await runReviewAgent(mockStoryPath, mockWorkingDir);

      expect(result.decision).toBe(ReviewDecision.RECOVERY);
      expect(storyModule.updateStoryField).toHaveBeenCalledWith(
        mockStory,
        'last_restart_reason',
        'No source code changes detected. Implementation wrote documentation only.'
      );
    });

    it('should validate config changes for configuration stories', async () => {
      const mockStory: Story = {
        path: mockStoryPath,
        slug: 'test-story',
        frontmatter: {
          id: 'test-1',
          title: 'Test Story',
          slug: 'test-story',
          priority: 1,
          status: 'in-progress',
          type: 'feature',
          created: '2024-01-01',
          labels: [],
          research_complete: true,
          plan_complete: true,
          implementation_complete: true,
          reviews_complete: false,
          content_type: 'configuration',
        },
        content: 'test content',
      };

      vi.mocked(storyModule.parseStory).mockReturnValue(mockStory);
      vi.mocked(storyModule.updateStoryField).mockResolvedValue(undefined);

      // Mock no config changes (only source changes)
      (spawnSync as Mock).mockReturnValue({
        status: 0,
        stdout: 'src/index.ts\n',
      });

      const result = await runReviewAgent(mockStoryPath, mockWorkingDir);

      expect(result.decision).toBe(ReviewDecision.RECOVERY);
      expect(storyModule.updateStoryField).toHaveBeenCalledWith(
        mockStory,
        'last_restart_reason',
        expect.stringContaining('Configuration story requires changes to config files')
      );
    });

    it('should validate documentation files for documentation stories', async () => {
      const mockStory: Story = {
        path: mockStoryPath,
        slug: 'test-story',
        frontmatter: {
          id: 'test-1',
          title: 'Test Story',
          slug: 'test-story',
          priority: 1,
          status: 'in-progress',
          type: 'feature',
          created: '2024-01-01',
          labels: [],
          research_complete: true,
          plan_complete: true,
          implementation_complete: true,
          reviews_complete: false,
          content_type: 'documentation',
        },
        content: 'test content',
      };

      vi.mocked(storyModule.parseStory).mockReturnValue(mockStory);
      vi.mocked(clientModule.runAgentQuery).mockResolvedValue({
        text: JSON.stringify({
          decision: 'APPROVED',
          codeReview: { passed: true, issues: [] },
          securityReview: { passed: true, issues: [] },
          poReview: { passed: true, issues: [] },
        }),
      });

      // Mock documentation changes (docs/ and .md files modified)
      (spawnSync as Mock).mockReturnValue({
        status: 0,
        stdout: 'docs/config.md\nREADME.md\n',
      });

      const result = await runReviewAgent(mockStoryPath, mockWorkingDir);

      // Should proceed to review, not trigger recovery
      expect(result.decision).not.toBe(ReviewDecision.RECOVERY);
    });

    it('should trigger recovery when documentation story has no documentation changes', async () => {
      const mockStory: Story = {
        path: mockStoryPath,
        slug: 'test-story',
        frontmatter: {
          id: 'test-1',
          title: 'Test Story',
          slug: 'test-story',
          priority: 1,
          status: 'in-progress',
          type: 'feature',
          created: '2024-01-01',
          labels: [],
          research_complete: true,
          plan_complete: true,
          implementation_complete: true,
          reviews_complete: false,
          content_type: 'documentation',
          implementation_retry_count: 0,
          max_implementation_retries: 3,
        },
        content: 'test content',
      };

      vi.mocked(storyModule.parseStory).mockReturnValue(mockStory);
      vi.mocked(storyModule.updateStoryField).mockResolvedValue(undefined);

      // Mock no documentation changes (only story file, which should be excluded)
      (spawnSync as Mock).mockReturnValue({
        status: 0,
        stdout: '.ai-sdlc/stories/S-0071/story.md\n',
      });

      const result = await runReviewAgent(mockStoryPath, mockWorkingDir);

      // Should trigger recovery since no valid documentation changes
      expect(result.decision).toBe(ReviewDecision.RECOVERY);
      expect(storyModule.updateStoryField).toHaveBeenCalledWith(
        mockStory,
        'implementation_complete',
        false
      );
      expect(storyModule.updateStoryField).toHaveBeenCalledWith(
        mockStory,
        'last_restart_reason',
        expect.stringContaining('Documentation story requires changes to markdown files')
      );
    });

    it('should validate both source and config for mixed stories', async () => {
      const mockStory: Story = {
        path: mockStoryPath,
        slug: 'test-story',
        frontmatter: {
          id: 'test-1',
          title: 'Test Story',
          slug: 'test-story',
          priority: 1,
          status: 'in-progress',
          type: 'feature',
          created: '2024-01-01',
          labels: [],
          research_complete: true,
          plan_complete: true,
          implementation_complete: true,
          reviews_complete: false,
          content_type: 'mixed',
        },
        content: 'test content',
      };

      vi.mocked(storyModule.parseStory).mockReturnValue(mockStory);
      vi.mocked(storyModule.updateStoryField).mockResolvedValue(undefined);

      // Mock only source changes (missing config)
      (spawnSync as Mock).mockReturnValue({
        status: 0,
        stdout: 'src/index.ts\n',
      });

      const result = await runReviewAgent(mockStoryPath, mockWorkingDir);

      expect(result.decision).toBe(ReviewDecision.RECOVERY);
      expect(storyModule.updateStoryField).toHaveBeenCalledWith(
        mockStory,
        'last_restart_reason',
        expect.stringContaining('Mixed story requires both source AND configuration changes')
      );
    });

    it('should pass validation when mixed story has both changes', async () => {
      const mockStory: Story = {
        path: mockStoryPath,
        slug: 'test-story',
        frontmatter: {
          id: 'test-1',
          title: 'Test Story',
          slug: 'test-story',
          priority: 1,
          status: 'in-progress',
          type: 'feature',
          created: '2024-01-01',
          labels: [],
          research_complete: true,
          plan_complete: true,
          implementation_complete: true,
          reviews_complete: false,
          content_type: 'mixed',
        },
        content: 'test content',
      };

      vi.mocked(storyModule.parseStory).mockReturnValue(mockStory);
      vi.mocked(clientModule.runAgentQuery).mockResolvedValue({
        text: JSON.stringify({
          decision: 'APPROVED',
          codeReview: { passed: true, issues: [] },
          securityReview: { passed: true, issues: [] },
          poReview: { passed: true, issues: [] },
        }),
      });

      // Mock both source and config changes
      (spawnSync as Mock).mockReturnValue({
        status: 0,
        stdout: 'src/index.ts\n.claude/skills/test.md\n',
      });

      const result = await runReviewAgent(mockStoryPath, mockWorkingDir);

      // Should proceed to review
      expect(result.decision).not.toBe(ReviewDecision.RECOVERY);
    });
  });
});
