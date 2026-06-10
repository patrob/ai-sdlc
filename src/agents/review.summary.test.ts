import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { runReviewAgent, validateTDDCycles, generateTDDIssues, generateReviewSummary, removeUnfinishedCheckboxes, getStoryFileURL, formatPRDescription, truncatePRBody, createPullRequest, getSourceCodeChanges, getConfigurationChanges, getDocumentationChanges, determineEffectiveContentType, deriveIndividualPassFailFromPerspectives, hasTestFiles, waitForChecks, mergePullRequest } from './review.js';
import * as storyModule from '../core/story.js';
import * as clientModule from '../core/client.js';
import * as configModule from '../core/config.js';
import { ReviewDecision, ReviewSeverity, Config, TDDTestCycle, ReviewIssue, Story, ContentType } from '../types/index.js';
import { spawn, spawnSync, execSync } from 'child_process';
import fs from 'fs';

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

describe('generateReviewSummary', () => {
  it('should export generateReviewSummary function', () => {
    expect(generateReviewSummary).toBeDefined();
    expect(typeof generateReviewSummary).toBe('function');
  });

  it('should return fallback message when no issues', () => {
    const summary = generateReviewSummary([], 120);
    expect(summary).toBe('Review rejected due to system error or policy violation.');
  });

  it('should prioritize blocker issues first', () => {
    const issues: ReviewIssue[] = [
      { severity: 'minor', category: 'style', description: 'Missing semicolon' },
      { severity: 'blocker', category: 'security', description: 'SQL injection vulnerability' },
      { severity: 'major', category: 'testing', description: 'Missing tests' },
    ];

    const summary = generateReviewSummary(issues, 200);
    expect(summary).toContain('SQL injection vulnerability');
    // Blocker should appear first
    expect(summary.indexOf('SQL injection')).toBeLessThan(summary.indexOf('Missing tests'));
  });

  it('should prioritize critical issues second', () => {
    const issues: ReviewIssue[] = [
      { severity: 'minor', category: 'style', description: 'Missing semicolon' },
      { severity: 'critical', category: 'security', description: 'Authentication bypass' },
      { severity: 'major', category: 'testing', description: 'Missing tests' },
    ];

    const summary = generateReviewSummary(issues, 200);
    expect(summary).toContain('Authentication bypass');
    expect(summary.indexOf('Authentication bypass')).toBeLessThan(summary.indexOf('Missing tests'));
  });

  it('should include file names when available', () => {
    const issues: ReviewIssue[] = [
      {
        severity: 'blocker',
        category: 'security',
        description: 'SQL injection vulnerability',
        file: 'src/db/queries.ts',
        line: 42,
      },
    ];

    const summary = generateReviewSummary(issues, 200);
    expect(summary).toContain('queries.ts');
    expect(summary).toContain(':42');
  });

  it('should show top 3 issues with truncation indicator', () => {
    const issues: ReviewIssue[] = [
      { severity: 'blocker', category: 'security', description: 'Issue 1' },
      { severity: 'blocker', category: 'security', description: 'Issue 2' },
      { severity: 'blocker', category: 'security', description: 'Issue 3' },
      { severity: 'critical', category: 'bug', description: 'Issue 4' },
      { severity: 'critical', category: 'bug', description: 'Issue 5' },
    ];

    const summary = generateReviewSummary(issues, 200);
    expect(summary).toContain('Issue 1');
    expect(summary).toContain('Issue 2');
    expect(summary).toContain('Issue 3');
    expect(summary).toContain('...and 2 more issues');
  });

  it('should handle exactly 3 issues without truncation indicator', () => {
    const issues: ReviewIssue[] = [
      { severity: 'blocker', category: 'security', description: 'Issue 1' },
      { severity: 'critical', category: 'bug', description: 'Issue 2' },
      { severity: 'major', category: 'testing', description: 'Issue 3' },
    ];

    const summary = generateReviewSummary(issues, 200);
    expect(summary).toContain('Issue 1');
    expect(summary).toContain('Issue 2');
    expect(summary).toContain('Issue 3');
    expect(summary).not.toContain('more issues');
  });

  it('should handle 1 issue without truncation', () => {
    const issues: ReviewIssue[] = [
      { severity: 'blocker', category: 'security', description: 'SQL injection found' },
    ];

    const summary = generateReviewSummary(issues, 200);
    expect(summary).toBe('SQL injection found.');
  });

  it('should truncate very long individual descriptions', () => {
    const longDescription = 'This is a very long description that goes on and on and on and should be truncated because it exceeds the maximum allowed length for a single issue in the executive summary and we need to keep things concise for the user to read quickly.';

    const issues: ReviewIssue[] = [
      { severity: 'blocker', category: 'security', description: longDescription },
    ];

    const summary = generateReviewSummary(issues, 150);
    expect(summary.length).toBeLessThan(longDescription.length);
    expect(summary).toContain('...');
  });

  it('should respect terminal width for narrow terminals (80 cols)', () => {
    const issues: ReviewIssue[] = [
      { severity: 'blocker', category: 'security', description: 'SQL injection vulnerability in user query handler' },
      { severity: 'critical', category: 'testing', description: 'Tests are failing due to undefined variable errors' },
      { severity: 'major', category: 'code_quality', description: 'Missing error handling in async function' },
    ];

    const summary = generateReviewSummary(issues, 80);
    // Summary should be truncated to fit narrow terminal
    // Available width = 80 - 2 (indent) - 9 ("Summary: ") = 69 chars
    expect(summary.length).toBeLessThanOrEqual(80);
  });

  it('should handle wide terminals (200 cols) without unnecessary truncation', () => {
    const issues: ReviewIssue[] = [
      { severity: 'blocker', category: 'security', description: 'SQL injection vulnerability' },
      { severity: 'critical', category: 'testing', description: 'Tests failing' },
    ];

    const summary = generateReviewSummary(issues, 200);
    expect(summary).toContain('SQL injection vulnerability');
    expect(summary).toContain('Tests failing');
  });

  it('should handle very small terminal width gracefully (< 20 cols)', () => {
    const issues: ReviewIssue[] = [
      { severity: 'blocker', category: 'security', description: 'SQL injection vulnerability in user query handler' },
      { severity: 'critical', category: 'testing', description: 'Tests are failing' },
    ];

    // Terminal width of 10 should not cause negative or invalid calculations
    const summary = generateReviewSummary(issues, 10);
    expect(summary).toBeDefined();
    expect(summary.length).toBeGreaterThan(0);
    expect(summary).not.toBe('.');
    // Should use minimum viable width of 40 for availableWidth
    expect(summary).toContain('SQL');
  });

  it('should handle invalid terminal width (negative or non-finite)', () => {
    const issues: ReviewIssue[] = [
      { severity: 'blocker', category: 'security', description: 'Security issue found' },
    ];

    // Should fallback to 80 when invalid width provided
    const summary1 = generateReviewSummary(issues, -1);
    expect(summary1).toContain('Security issue');

    const summary2 = generateReviewSummary(issues, Infinity);
    expect(summary2).toContain('Security issue');

    const summary3 = generateReviewSummary(issues, NaN);
    expect(summary3).toContain('Security issue');
  });

  it('should skip issues with empty descriptions', () => {
    const issues: ReviewIssue[] = [
      { severity: 'blocker', category: 'security', description: '' },
      { severity: 'critical', category: 'testing', description: 'Tests are failing' },
      { severity: 'major', category: 'code_quality', description: '   ' }, // Whitespace only
    ];

    const summary = generateReviewSummary(issues, 200);
    expect(summary).toContain('Tests are failing');
    expect(summary).not.toContain('security');
    expect(summary).not.toContain('code_quality');
  });

  it('should return fallback message when all issues have empty descriptions', () => {
    const issues: ReviewIssue[] = [
      { severity: 'blocker', category: 'security', description: '' },
      { severity: 'critical', category: 'testing', description: '   ' }, // Whitespace only
      { severity: 'major', category: 'code_quality', description: '\n\n' }, // Only newlines
    ];

    const summary = generateReviewSummary(issues, 200);
    expect(summary).toBe('Review rejected (no actionable issue details available).');
  });

  it('should handle issues without severity (treat as minor)', () => {
    const issues: ReviewIssue[] = [
      { severity: 'blocker' as any, category: 'security', description: 'Critical issue' },
      { severity: undefined as any, category: 'style', description: 'Style issue' },
    ];

    const summary = generateReviewSummary(issues, 200);
    // Blocker should appear first
    expect(summary).toContain('Critical issue');
  });

  it('should handle all same severity (preserve order)', () => {
    const issues: ReviewIssue[] = [
      { severity: 'major', category: 'testing', description: 'First issue' },
      { severity: 'major', category: 'code_quality', description: 'Second issue' },
      { severity: 'major', category: 'architecture', description: 'Third issue' },
    ];

    const summary = generateReviewSummary(issues, 200);
    expect(summary.indexOf('First issue')).toBeLessThan(summary.indexOf('Second issue'));
    expect(summary.indexOf('Second issue')).toBeLessThan(summary.indexOf('Third issue'));
  });

  it('should strip ANSI codes for security', () => {
    const issues: ReviewIssue[] = [
      { severity: 'blocker', category: 'security', description: 'Error: \x1b[31mDanger\x1b[0m found' },
    ];

    const summary = generateReviewSummary(issues, 200);
    expect(summary).not.toContain('\x1b');
    expect(summary).toContain('Danger');
  });

  it('should remove code blocks from descriptions', () => {
    const issues: ReviewIssue[] = [
      {
        severity: 'blocker',
        category: 'security',
        description: 'SQL injection found:\n```sql\nSELECT * FROM users WHERE id = ${userId}\n```\nUse parameterized queries.',
      },
    ];

    const summary = generateReviewSummary(issues, 200);
    expect(summary).not.toContain('```');
    expect(summary).toContain('SQL injection found');
    expect(summary).toContain('Use parameterized queries');
  });

  it('should handle 100+ issues with large count indicator', () => {
    const issues: ReviewIssue[] = Array.from({ length: 150 }, (_, i) => ({
      severity: 'major' as const,
      category: 'testing',
      description: `Issue ${i + 1}`,
    }));

    const summary = generateReviewSummary(issues, 200);
    expect(summary).toContain('...and 147 more issues');
  });

  it('should handle issues with file names but no line numbers', () => {
    const issues: ReviewIssue[] = [
      {
        severity: 'critical',
        category: 'security',
        description: 'Potential XSS vulnerability',
        file: 'src/components/UserProfile.tsx',
      },
    ];

    const summary = generateReviewSummary(issues, 200);
    expect(summary).toContain('UserProfile.tsx');
    expect(summary).not.toContain(':');
  });

  it('should normalize whitespace in descriptions', () => {
    const issues: ReviewIssue[] = [
      {
        severity: 'blocker',
        category: 'testing',
        description: 'Tests   are\n\n\nfailing\ndue to errors',
      },
    ];

    const summary = generateReviewSummary(issues, 200);
    // Should collapse multiple whitespace/newlines to single space
    expect(summary).not.toContain('\n');
    expect(summary).toContain('Tests are failing due to errors');
  });

  it('should add "more issues" indicator with singular form for 1 remaining', () => {
    const issues: ReviewIssue[] = [
      { severity: 'blocker', category: 'security', description: 'Issue 1' },
      { severity: 'blocker', category: 'security', description: 'Issue 2' },
      { severity: 'blocker', category: 'security', description: 'Issue 3' },
      { severity: 'critical', category: 'bug', description: 'Issue 4' },
    ];

    const summary = generateReviewSummary(issues, 200);
    expect(summary).toContain('...and 1 more issue.');
  });
});
