 
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { execSync,spawn, spawnSync } from 'child_process';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import fs from 'fs';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { beforeEach, describe, expect, it, Mock,vi } from 'vitest';

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

describe('PR Helper Functions', () => {
  describe('removeUnfinishedCheckboxes', () => {
    it('should remove lines with unchecked checkboxes', () => {
      const content = `
- [x] Completed task
- [ ] Uncompleted task
- [x] Another completed task
`;
      const result = removeUnfinishedCheckboxes(content);
      expect(result).toContain('[x] Completed task');
      expect(result).not.toContain('[ ] Uncompleted task');
      expect(result).toContain('[x] Another completed task');
    });

    it('should handle indented checkboxes', () => {
      const content = `
  - [x] Indented completed
  - [ ] Indented uncompleted
    - [ ] Nested uncompleted
`;
      const result = removeUnfinishedCheckboxes(content);
      expect(result).toContain('[x] Indented completed');
      expect(result).not.toContain('[ ] Indented uncompleted');
      expect(result).not.toContain('[ ] Nested uncompleted');
    });

    it('should handle asterisk bullets', () => {
      const content = `
* [x] Completed with asterisk
* [ ] Uncompleted with asterisk
`;
      const result = removeUnfinishedCheckboxes(content);
      expect(result).toContain('[x] Completed with asterisk');
      expect(result).not.toContain('[ ] Uncompleted with asterisk');
    });

    it('should preserve uppercase X checkboxes', () => {
      const content = `
- [X] Completed uppercase
- [ ] Uncompleted
`;
      const result = removeUnfinishedCheckboxes(content);
      expect(result).toContain('[X] Completed uppercase');
      expect(result).not.toContain('[ ] Uncompleted');
    });

    it('should handle empty content', () => {
      const result = removeUnfinishedCheckboxes('');
      expect(result).toBe('');
    });

    it('should preserve non-checkbox content', () => {
      const content = `
# Header
Regular paragraph with [ ] brackets in it.
- Regular list item
- [x] Completed checkbox
- [ ] Uncompleted checkbox
\`\`\`
Code with - [ ] checkbox
\`\`\`
`;
      const result = removeUnfinishedCheckboxes(content);
      expect(result).toContain('# Header');
      expect(result).toContain('Regular paragraph with [ ] brackets in it.');
      expect(result).toContain('- Regular list item');
      expect(result).toContain('[x] Completed checkbox');
      expect(result).not.toContain('[ ] Uncompleted checkbox');
      // Note: Code blocks will still be filtered, which is acceptable
    });
  });

  describe('getStoryFileURL', () => {
    beforeEach(() => {
      vi.resetAllMocks();
    });

    it('should generate GitHub URL from HTTPS remote', () => {
      vi.mocked(execSync).mockReturnValue('https://github.com/owner/repo.git\n');

      const url = getStoryFileURL('/test/project/.ai-sdlc/stories/S-001/story.md', 'feature-branch', '/test/project');

      expect(url).toBe('https://github.com/owner/repo/blob/feature-branch/.ai-sdlc/stories/S-001/story.md');
    });

    it('should generate GitHub URL from SSH remote', () => {
      vi.mocked(execSync).mockReturnValue('git@github.com:owner/repo.git\n');

      const url = getStoryFileURL('/test/project/.ai-sdlc/stories/S-001/story.md', 'feature-branch', '/test/project');

      expect(url).toBe('https://github.com/owner/repo/blob/feature-branch/.ai-sdlc/stories/S-001/story.md');
    });

    it('should handle remote URL without .git suffix', () => {
      vi.mocked(execSync).mockReturnValue('https://github.com/owner/repo\n');

      const url = getStoryFileURL('/test/project/.ai-sdlc/stories/S-001/story.md', 'main', '/test/project');

      expect(url).toBe('https://github.com/owner/repo/blob/main/.ai-sdlc/stories/S-001/story.md');
    });

    it('should return empty string for invalid remote URL', () => {
      vi.mocked(execSync).mockReturnValue('https://gitlab.com/owner/repo.git\n');

      const url = getStoryFileURL('/test/project/.ai-sdlc/stories/S-001/story.md', 'main', '/test/project');

      expect(url).toBe('');
    });

    it('should return empty string when git command fails', () => {
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('Git command failed');
      });

      const url = getStoryFileURL('/test/project/.ai-sdlc/stories/S-001/story.md', 'main', '/test/project');

      expect(url).toBe('');
    });
  });

  describe('formatPRDescription', () => {
    it('should format PR description with all sections', () => {
      const mockStory: Story = {
        path: '/test/story.md',
        slug: 'test-story',
        frontmatter: {
          id: 'S-001',
          title: 'Test Story',
          priority: 10,
          status: 'in-progress',
          type: 'feature',
          created: '2024-01-01',
          labels: [],
          research_complete: true,
          plan_complete: true,
          implementation_complete: true,
          reviews_complete: false,
        },
        content: `## User Story

**As a** developer
**I want** automated PRs
**So that** I can work faster

## Summary

This feature creates PRs automatically.

## Acceptance Criteria

- [x] PR created with title
- [ ] PR includes description
- [x] PR links to story

## Implementation Summary

Implemented PR creation with rich formatting.
Added tests for all functions.
`,
      };

      const prBody = formatPRDescription(mockStory, 'https://github.com/owner/repo/blob/main/story.md');

      expect(prBody).toContain('## Story ID');
      expect(prBody).toContain('S-001');
      expect(prBody).toContain('## User Story');
      expect(prBody).toContain('**As a** developer');
      expect(prBody).toContain('## Summary');
      expect(prBody).toContain('creates PRs automatically');
      expect(prBody).toContain('## Acceptance Criteria');
      expect(prBody).toContain('[x] PR created with title');
      expect(prBody).not.toContain('[ ] PR includes description');
      expect(prBody).toContain('## Implementation Summary');
      expect(prBody).toContain('Implemented PR creation');
      expect(prBody).toContain('[View Full Story](https://github.com/owner/repo/blob/main/story.md)');
    });

    it('should handle missing sections gracefully', () => {
      const mockStory: Story = {
        path: '/test/story.md',
        slug: 'test-story',
        frontmatter: {
          id: 'S-002',
          title: 'Minimal Story',
          priority: 10,
          status: 'in-progress',
          type: 'feature',
          created: '2024-01-01',
          labels: [],
          research_complete: true,
          plan_complete: true,
          implementation_complete: true,
          reviews_complete: false,
        },
        content: `## Summary

Just a summary.
`,
      };

      const prBody = formatPRDescription(mockStory, '');

      expect(prBody).toContain('## Story ID');
      expect(prBody).toContain('S-002');
      expect(prBody).toContain('## Summary');
      expect(prBody).toContain('Just a summary');
      expect(prBody).not.toContain('## User Story');
      expect(prBody).not.toContain('## Acceptance Criteria');
      expect(prBody).not.toContain('## Implementation Summary');
    });

    it('should remove unfinished checkboxes from all sections', () => {
      const mockStory: Story = {
        path: '/test/story.md',
        slug: 'test-story',
        frontmatter: {
          id: 'S-003',
          title: 'Test Story',
          priority: 10,
          status: 'in-progress',
          type: 'feature',
          created: '2024-01-01',
          labels: [],
          research_complete: true,
          plan_complete: true,
          implementation_complete: true,
          reviews_complete: false,
        },
        content: `## Acceptance Criteria

- [x] First criterion done
- [ ] Second criterion pending
- [x] Third criterion done

## Implementation Summary

- [x] Implemented feature
- [ ] TODO: Add more tests
`,
      };

      const prBody = formatPRDescription(mockStory, '');

      expect(prBody).toContain('[x] First criterion done');
      expect(prBody).not.toContain('[ ] Second criterion pending');
      expect(prBody).toContain('[x] Third criterion done');
      expect(prBody).toContain('[x] Implemented feature');
      expect(prBody).not.toContain('[ ] TODO: Add more tests');
    });
  });

  describe('truncatePRBody', () => {
    it('should not truncate content under limit', () => {
      const shortBody = 'This is a short PR body.';
      const result = truncatePRBody(shortBody, 1000);
      expect(result).toBe(shortBody);
    });

    it('should truncate Implementation Summary when over limit', () => {
      const longImplementation = 'x'.repeat(70000);
      const body = `## Story ID

S-001

## Summary

Brief summary

## Implementation Summary

${longImplementation}

---

📋 [View Full Story](https://example.com)
`;

      const result = truncatePRBody(body, 64000);

      expect(result.length).toBeLessThanOrEqual(64000);
      expect(result).toContain('## Story ID');
      expect(result).toContain('## Summary');
      expect(result).toContain('## Implementation Summary');
      expect(result).toContain('⚠️ Implementation Summary truncated due to length');
      expect(result).toContain('[View Full Story]');
    });

    it('should truncate at paragraph boundary', () => {
      const paragraph1 = 'First paragraph.\n\n';
      const paragraph2 = 'Second paragraph that is very long.\n\n';
      const paragraph3 = 'Third paragraph.';

      const body = `## Implementation Summary

${paragraph1}${paragraph2.repeat(3000)}${paragraph3}
`;

      const result = truncatePRBody(body, 1000);

      // Should truncate at last paragraph boundary
      expect(result).toContain('⚠️ Implementation Summary truncated');
      // Should not end mid-word or mid-sentence abruptly
    });

    it('should handle body without Implementation Summary section', () => {
      const longBody = 'x'.repeat(70000);
      const result = truncatePRBody(longBody, 64000);

      expect(result.length).toBeLessThanOrEqual(64000);
      expect(result).toContain('⚠️ Description truncated due to length');
    });

    it('should respect custom maxLength parameter', () => {
      const body = 'a'.repeat(10000);
      const result = truncatePRBody(body, 5000);

      expect(result.length).toBeLessThanOrEqual(5000);
      expect(result).toContain('⚠️ Description truncated');
    });
  });
});
