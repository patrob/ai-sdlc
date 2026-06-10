 
import { execSync } from 'child_process';
import fs from 'fs';
import { beforeEach, describe, expect, it,vi } from 'vitest';

import * as configModule from '../core/config.js';
import * as storyModule from '../core/story.js';
import { type Config } from '../types/index.js';
import { createPullRequest } from './review.js';

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

describe('createPullRequest - Draft PR Support', () => {
  const mockStoryPath = '/test/project/.ai-sdlc/stories/S-001/story.md';
  const mockSdlcRoot = '/test/project/.ai-sdlc';
  const _mockWorkingDir = '/test/project';

  const mockStory = {
    path: mockStoryPath,
    slug: 'test-story',
    frontmatter: {
      id: 'S-001',
      title: 'Test Story',
      priority: 10,
      status: 'in-progress' as const,
      type: 'feature' as const,
      created: '2024-01-01',
      labels: [],
      research_complete: true,
      plan_complete: true,
      implementation_complete: true,
      reviews_complete: true,
      branch: 'ai-sdlc/test-story',
    },
    content: '## Summary\n\nTest content',
  };

  const mockConfig: Config = {
    sdlcFolder: '.ai-sdlc',
    stageGates: {
      requireApprovalBeforeImplementation: false,
      requireApprovalBeforePR: false,
      autoMergeOnApproval: false,
    },
    refinement: {
      maxIterations: 3,
      escalateOnMaxAttempts: 'error',
      enableCircuitBreaker: true,
    },
    reviewConfig: {
      maxRetries: 3,
      maxRetriesUpperBound: 10,
      autoCompleteOnApproval: true,
      autoRestartOnRejection: true,
    },
    defaultLabels: [],
    theme: 'auto',
    timeouts: {
      agentTimeout: 600000,
      buildTimeout: 120000,
      testTimeout: 300000,
    },
  };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(storyModule.parseStory).mockReturnValue(mockStory as any);
    vi.mocked(configModule.loadConfig).mockReturnValue(mockConfig);
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => true } as fs.Stats);
    vi.mocked(storyModule.updateStoryField).mockResolvedValue(undefined);
  });

  describe('draft flag from options parameter', () => {
    it('should include --draft flag when options.draft is true', async () => {
      // Mock successful gh CLI availability
      vi.mocked(execSync).mockImplementation((cmd: string) => {
        if (cmd === 'gh --version') return 'gh version 2.0.0\n';
        if (cmd.startsWith('git checkout')) return '';
        if (cmd === 'git status --porcelain') return '';
        if (cmd.startsWith('git push')) return '';
        if (cmd === 'gh pr view --json url') throw new Error('no PR');
        if (cmd.includes('gh pr create')) {
          // Verify --draft flag is present
          expect(cmd).toContain('--draft');
          return 'https://github.com/owner/repo/pull/123\n';
        }
        if (cmd.includes('git remote')) return 'https://github.com/owner/repo.git\n';
        return '';
      });

      const result = await createPullRequest(mockStoryPath, mockSdlcRoot, { draft: true });

      expect(result.success).toBe(true);
      expect(result.changesMade).toContain('Created draft PR: https://github.com/owner/repo/pull/123');
    });

    it('should NOT include --draft flag when options.draft is false', async () => {
      vi.mocked(execSync).mockImplementation((cmd: string) => {
        if (cmd === 'gh --version') return 'gh version 2.0.0\n';
        if (cmd.startsWith('git checkout')) return '';
        if (cmd === 'git status --porcelain') return '';
        if (cmd.startsWith('git push')) return '';
        if (cmd === 'gh pr view --json url') throw new Error('no PR');
        if (cmd.includes('gh pr create')) {
          // Verify --draft flag is NOT present
          expect(cmd).not.toContain('--draft');
          return 'https://github.com/owner/repo/pull/123\n';
        }
        if (cmd.includes('git remote')) return 'https://github.com/owner/repo.git\n';
        return '';
      });

      const result = await createPullRequest(mockStoryPath, mockSdlcRoot, { draft: false });

      expect(result.success).toBe(true);
      expect(result.changesMade).toContain('Created PR: https://github.com/owner/repo/pull/123');
    });
  });

  describe('draft flag from config', () => {
    it('should use config github.createDraftPRs when options not provided', async () => {
      // Config with createDraftPRs: true
      const configWithDraft = {
        ...mockConfig,
        github: { createDraftPRs: true },
      };
      vi.mocked(configModule.loadConfig).mockReturnValue(configWithDraft);

      vi.mocked(execSync).mockImplementation((cmd: string) => {
        if (cmd === 'gh --version') return 'gh version 2.0.0\n';
        if (cmd.startsWith('git checkout')) return '';
        if (cmd === 'git status --porcelain') return '';
        if (cmd.startsWith('git push')) return '';
        if (cmd === 'gh pr view --json url') throw new Error('no PR');
        if (cmd.includes('gh pr create')) {
          // Should use --draft from config
          expect(cmd).toContain('--draft');
          return 'https://github.com/owner/repo/pull/123\n';
        }
        if (cmd.includes('git remote')) return 'https://github.com/owner/repo.git\n';
        return '';
      });

      const result = await createPullRequest(mockStoryPath, mockSdlcRoot);

      expect(result.success).toBe(true);
      expect(result.changesMade).toContain('Created draft PR: https://github.com/owner/repo/pull/123');
    });

    it('should NOT use draft when config github.createDraftPRs is false', async () => {
      const configWithoutDraft = {
        ...mockConfig,
        github: { createDraftPRs: false },
      };
      vi.mocked(configModule.loadConfig).mockReturnValue(configWithoutDraft);

      vi.mocked(execSync).mockImplementation((cmd: string) => {
        if (cmd === 'gh --version') return 'gh version 2.0.0\n';
        if (cmd.startsWith('git checkout')) return '';
        if (cmd === 'git status --porcelain') return '';
        if (cmd.startsWith('git push')) return '';
        if (cmd === 'gh pr view --json url') throw new Error('no PR');
        if (cmd.includes('gh pr create')) {
          expect(cmd).not.toContain('--draft');
          return 'https://github.com/owner/repo/pull/123\n';
        }
        if (cmd.includes('git remote')) return 'https://github.com/owner/repo.git\n';
        return '';
      });

      const result = await createPullRequest(mockStoryPath, mockSdlcRoot);

      expect(result.success).toBe(true);
    });

    it('should default to non-draft when github config is not set', async () => {
      // Config without github section
      vi.mocked(configModule.loadConfig).mockReturnValue(mockConfig);

      vi.mocked(execSync).mockImplementation((cmd: string) => {
        if (cmd === 'gh --version') return 'gh version 2.0.0\n';
        if (cmd.startsWith('git checkout')) return '';
        if (cmd === 'git status --porcelain') return '';
        if (cmd.startsWith('git push')) return '';
        if (cmd === 'gh pr view --json url') throw new Error('no PR');
        if (cmd.includes('gh pr create')) {
          expect(cmd).not.toContain('--draft');
          return 'https://github.com/owner/repo/pull/123\n';
        }
        if (cmd.includes('git remote')) return 'https://github.com/owner/repo.git\n';
        return '';
      });

      const result = await createPullRequest(mockStoryPath, mockSdlcRoot);

      expect(result.success).toBe(true);
      expect(result.changesMade).toContain('Created PR: https://github.com/owner/repo/pull/123');
    });
  });

  describe('options parameter takes precedence over config', () => {
    it('should use options.draft=false even when config says createDraftPRs=true', async () => {
      // Config says draft, but options says not draft
      const configWithDraft = {
        ...mockConfig,
        github: { createDraftPRs: true },
      };
      vi.mocked(configModule.loadConfig).mockReturnValue(configWithDraft);

      vi.mocked(execSync).mockImplementation((cmd: string) => {
        if (cmd === 'gh --version') return 'gh version 2.0.0\n';
        if (cmd.startsWith('git checkout')) return '';
        if (cmd === 'git status --porcelain') return '';
        if (cmd.startsWith('git push')) return '';
        if (cmd === 'gh pr view --json url') throw new Error('no PR');
        if (cmd.includes('gh pr create')) {
          // Options should override config
          expect(cmd).not.toContain('--draft');
          return 'https://github.com/owner/repo/pull/123\n';
        }
        if (cmd.includes('git remote')) return 'https://github.com/owner/repo.git\n';
        return '';
      });

      const result = await createPullRequest(mockStoryPath, mockSdlcRoot, { draft: false });

      expect(result.success).toBe(true);
    });

    it('should use options.draft=true even when config says createDraftPRs=false', async () => {
      // Config says not draft, but options says draft
      const configWithoutDraft = {
        ...mockConfig,
        github: { createDraftPRs: false },
      };
      vi.mocked(configModule.loadConfig).mockReturnValue(configWithoutDraft);

      vi.mocked(execSync).mockImplementation((cmd: string) => {
        if (cmd === 'gh --version') return 'gh version 2.0.0\n';
        if (cmd.startsWith('git checkout')) return '';
        if (cmd === 'git status --porcelain') return '';
        if (cmd.startsWith('git push')) return '';
        if (cmd === 'gh pr view --json url') throw new Error('no PR');
        if (cmd.includes('gh pr create')) {
          // Options should override config
          expect(cmd).toContain('--draft');
          return 'https://github.com/owner/repo/pull/123\n';
        }
        if (cmd.includes('git remote')) return 'https://github.com/owner/repo.git\n';
        return '';
      });

      const result = await createPullRequest(mockStoryPath, mockSdlcRoot, { draft: true });

      expect(result.success).toBe(true);
    });
  });
});
