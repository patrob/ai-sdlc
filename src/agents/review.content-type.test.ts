 
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { execSync,spawn, spawnSync } from 'child_process';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import fs from 'fs';
import { beforeEach, describe, expect, it, type Mock,vi } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
import * as clientModule from '../core/client.js';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import * as configModule from '../core/config.js';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import * as storyModule from '../core/story.js';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Config, ContentType,ReviewDecision, ReviewIssue, ReviewSeverity, type Story, TDDTestCycle } from '../types/index.js';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { createPullRequest, deriveIndividualPassFailFromPerspectives, determineEffectiveContentType, formatPRDescription, generateReviewSummary, generateTDDIssues, getConfigurationChanges, getDocumentationChanges, getSourceCodeChanges, getStoryFileURL, hasTestFiles, mergePullRequest,removeUnfinishedCheckboxes, runReviewAgent, truncatePRBody, validateTDDCycles, waitForChecks } from './review.js';

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
  describe('getConfigurationChanges', () => {
    const mockWorkingDir = '/test/project';

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should detect changes in .claude/ directory', () => {
      (spawnSync as Mock).mockReturnValue({
        status: 0,
        stdout: '.claude/skills/test-skill.md\nsrc/index.ts\n',
      });

      const result = getConfigurationChanges(mockWorkingDir);

      expect(result).toContain('.claude/skills/test-skill.md');
      expect(result).not.toContain('src/index.ts');
    });

    it('should detect changes in .github/ directory', () => {
      (spawnSync as Mock).mockReturnValue({
        status: 0,
        stdout: '.github/workflows/ci.yml\n.github/ISSUE_TEMPLATE/bug.md\n',
      });

      const result = getConfigurationChanges(mockWorkingDir);

      expect(result).toContain('.github/workflows/ci.yml');
      expect(result).toContain('.github/ISSUE_TEMPLATE/bug.md');
    });

    it('should detect root configuration files', () => {
      (spawnSync as Mock).mockReturnValue({
        status: 0,
        stdout: 'tsconfig.json\npackage.json\n.gitignore\nvitest.config.ts\n',
      });

      const result = getConfigurationChanges(mockWorkingDir);

      expect(result).toContain('tsconfig.json');
      expect(result).toContain('package.json');
      expect(result).toContain('.gitignore');
      expect(result).toContain('vitest.config.ts');
    });

    it('should return empty array when no config files changed', () => {
      (spawnSync as Mock).mockReturnValue({
        status: 0,
        stdout: 'src/index.ts\nsrc/utils.ts\n',
      });

      const result = getConfigurationChanges(mockWorkingDir);

      expect(result).toEqual([]);
    });

    it('should return unknown on git command failure', () => {
      (spawnSync as Mock).mockReturnValue({
        status: 1,
        stdout: '',
      });

      const result = getConfigurationChanges(mockWorkingDir);

      expect(result).toEqual(['unknown']);
    });

    it('should handle git diff errors gracefully', () => {
      (spawnSync as Mock).mockImplementation(() => {
        throw new Error('Git not found');
      });

      const result = getConfigurationChanges(mockWorkingDir);

      expect(result).toEqual(['unknown']);
    });
  });

  describe('getDocumentationChanges', () => {
    const mockWorkingDir = '/test/project';

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should detect markdown files (excluding story files)', () => {
      (spawnSync as Mock).mockReturnValue({
        status: 0,
        stdout: 'README.md\ndocs/guide.md\nsrc/index.ts\n.ai-sdlc/stories/S-001/story.md\n',
      });

      const result = getDocumentationChanges(mockWorkingDir);

      expect(result).toContain('README.md');
      expect(result).toContain('docs/guide.md');
      expect(result).not.toContain('src/index.ts');
      expect(result).not.toContain('.ai-sdlc/stories/S-001/story.md');
    });

    it('should detect files in docs/ directory', () => {
      (spawnSync as Mock).mockReturnValue({
        status: 0,
        stdout: 'docs/architecture.png\ndocs/api.json\nsrc/index.ts\n',
      });

      const result = getDocumentationChanges(mockWorkingDir);

      expect(result).toContain('docs/architecture.png');
      expect(result).toContain('docs/api.json');
      expect(result).not.toContain('src/index.ts');
    });

    it('should return unknown on git command failure', () => {
      (spawnSync as Mock).mockReturnValue({
        status: 1,
        stderr: 'fatal: not a git repository',
      });

      const result = getDocumentationChanges(mockWorkingDir);

      expect(result).toEqual(['unknown']);
    });

    it('should return empty array when no documentation changes exist', () => {
      (spawnSync as Mock).mockReturnValue({
        status: 0,
        stdout: 'src/index.ts\nsrc/util.ts\n',
      });

      const result = getDocumentationChanges(mockWorkingDir);

      expect(result).toEqual([]);
    });

    it('should handle git diff errors gracefully', () => {
      (spawnSync as Mock).mockImplementation(() => {
        throw new Error('Git not found');
      });

      const result = getDocumentationChanges(mockWorkingDir);

      expect(result).toEqual(['unknown']);
    });

    it('should exclude story files but include other markdown', () => {
      (spawnSync as Mock).mockReturnValue({
        status: 0,
        stdout: '.ai-sdlc/stories/S-0071/story.md\nCLAUDE.md\ndocs/testing.md\n',
      });

      const result = getDocumentationChanges(mockWorkingDir);

      expect(result).not.toContain('.ai-sdlc/stories/S-0071/story.md');
      expect(result).toContain('CLAUDE.md');
      expect(result).toContain('docs/testing.md');
    });
  });

  describe('determineEffectiveContentType', () => {
    it('should default to code when content_type is undefined', () => {
      const story: Story = {
        path: '/test/story.md',
        slug: 'test',
        frontmatter: {
          id: 'test-1',
          title: 'Test',
          slug: 'test',
          priority: 1,
          status: 'in-progress',
          type: 'feature',
          created: '2024-01-01',
          labels: [],
          research_complete: false,
          plan_complete: false,
          implementation_complete: false,
          reviews_complete: false,
        },
        content: 'test content',
      };

      const result = determineEffectiveContentType(story);

      expect(result).toBe('code');
    });

    it('should respect explicit content_type field', () => {
      const story: Story = {
        path: '/test/story.md',
        slug: 'test',
        frontmatter: {
          id: 'test-1',
          title: 'Test',
          slug: 'test',
          priority: 1,
          status: 'in-progress',
          type: 'feature',
          created: '2024-01-01',
          labels: [],
          research_complete: false,
          plan_complete: false,
          implementation_complete: false,
          reviews_complete: false,
          content_type: 'configuration',
        },
        content: 'test content',
      };

      const result = determineEffectiveContentType(story);

      expect(result).toBe('configuration');
    });

    it('should override to configuration when requires_source_changes is false', () => {
      const story: Story = {
        path: '/test/story.md',
        slug: 'test',
        frontmatter: {
          id: 'test-1',
          title: 'Test',
          slug: 'test',
          priority: 1,
          status: 'in-progress',
          type: 'feature',
          created: '2024-01-01',
          labels: [],
          research_complete: false,
          plan_complete: false,
          implementation_complete: false,
          reviews_complete: false,
          content_type: 'code',
          requires_source_changes: false,
        },
        content: 'test content',
      };

      const result = determineEffectiveContentType(story);

      expect(result).toBe('configuration');
    });

    it('should override to code when requires_source_changes is true', () => {
      const story: Story = {
        path: '/test/story.md',
        slug: 'test',
        frontmatter: {
          id: 'test-1',
          title: 'Test',
          slug: 'test',
          priority: 1,
          status: 'in-progress',
          type: 'feature',
          created: '2024-01-01',
          labels: [],
          research_complete: false,
          plan_complete: false,
          implementation_complete: false,
          reviews_complete: false,
          content_type: 'configuration',
          requires_source_changes: true,
        },
        content: 'test content',
      };

      const result = determineEffectiveContentType(story);

      expect(result).toBe('code');
    });

    it('should respect mixed content type', () => {
      const story: Story = {
        path: '/test/story.md',
        slug: 'test',
        frontmatter: {
          id: 'test-1',
          title: 'Test',
          slug: 'test',
          priority: 1,
          status: 'in-progress',
          type: 'feature',
          created: '2024-01-01',
          labels: [],
          research_complete: false,
          plan_complete: false,
          implementation_complete: false,
          reviews_complete: false,
          content_type: 'mixed',
        },
        content: 'test content',
      };

      const result = determineEffectiveContentType(story);

      expect(result).toBe('mixed');
    });

    it('should respect documentation content type', () => {
      const story: Story = {
        path: '/test/story.md',
        slug: 'test',
        frontmatter: {
          id: 'test-1',
          title: 'Test',
          slug: 'test',
          priority: 1,
          status: 'in-progress',
          type: 'feature',
          created: '2024-01-01',
          labels: [],
          research_complete: false,
          plan_complete: false,
          implementation_complete: false,
          reviews_complete: false,
          content_type: 'documentation',
        },
        content: 'test content',
      };

      const result = determineEffectiveContentType(story);

      expect(result).toBe('documentation');
    });
  });
});
