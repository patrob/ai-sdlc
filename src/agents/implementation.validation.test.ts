import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import {
  TDD_SYSTEM_PROMPT,
  runSingleTest,
  runAllTests,
  executeRedPhase,
  executeGreenPhase,
  executeRefactorPhase,
  recordTDDCycle,
  checkACCoverage,
  runTDDImplementation,
  commitIfAllTestsPass,
  captureCurrentDiffHash,
  hasChangesOccurred,
  truncateTestOutput,
  extractTestFailures,
  buildRetryPrompt,
  detectMissingDependencies,
  sanitizeTestOutput,
  extractChangedFiles,
  buildRetryHistorySection,
  type TDDPhaseResult,
  type AttemptHistoryEntry,
  type AttemptOutcome,
  type ExtractedTestOutput,
} from './implementation.js';
import { Story, TDDTestCycle } from '../types/index.js';
import * as storyModule from '../core/story.js';
import { spawnSync } from 'child_process';

// Mock child_process module
vi.mock('child_process', async () => {
  const actual = await vi.importActual<typeof import('child_process')>('child_process');
  return {
    ...actual,
    spawnSync: vi.fn(),
  };
});

// Mock the story module for tests that need it
vi.mock('../core/story.js', async () => {
  const actual = await vi.importActual<typeof import('../core/story.js')>('../core/story.js');
  return {
    ...actual,
    parseStory: vi.fn(),
    writeStory: vi.fn(),
  };
});

// Mock story for testing
function createMockStory(overrides: Partial<Story> = {}): Story {
  return {
    path: '/test/story.md',
    slug: 'test-story',
    frontmatter: {
      id: 'test-123',
      title: 'Test Story',
      priority: 1,
      status: 'in-progress',
      type: 'feature',
      created: '2024-01-01',
      labels: [],
      research_complete: true,
      plan_complete: true,
      implementation_complete: false,
      reviews_complete: false,
      tdd_enabled: true,
      ...overrides.frontmatter,
    },
    content: `# Test Story

## Acceptance Criteria

- [ ] Feature should do X
- [ ] Feature should handle Y

## Implementation Plan

Phase 1: Setup
- [ ] Create test file
- [ ] Write failing test
`,
    ...overrides,
  } as Story;
}

describe('TDD System and Test Helpers', () => {
  describe('Security Validation', () => {
    describe('sanitizeTestOutput', () => {
      it('should remove ANSI SGR sequences (colors)', () => {
        const input = '\x1B[31mError:\x1B[0m Test failed';
        const output = sanitizeTestOutput(input);
        expect(output).toBe('Error: Test failed');
        expect(output).not.toContain('\x1B');
      });

      it('should remove ANSI DCS sequences', () => {
        const input = 'Before\x1BPDCSdata\x1B\\After';
        const output = sanitizeTestOutput(input);
        expect(output).toBe('BeforeAfter');
        expect(output).not.toContain('\x1B');
      });

      it('should remove ANSI PM sequences', () => {
        const input = 'Before\x1B^PMdata\x1B\\After';
        const output = sanitizeTestOutput(input);
        expect(output).toBe('BeforeAfter');
        expect(output).not.toContain('\x1B');
      });

      it('should remove ANSI OSC sequences (BEL terminated)', () => {
        const input = 'Before\x1B]0;Window Title\x07After';
        const output = sanitizeTestOutput(input);
        expect(output).toBe('BeforeAfter');
        expect(output).not.toContain('\x1B');
      });

      it('should remove ANSI OSC sequences (ST terminated)', () => {
        const input = 'Before\x1B]0;Window Title\x1B\\After';
        const output = sanitizeTestOutput(input);
        expect(output).toBe('BeforeAfter');
        expect(output).not.toContain('\x1B');
      });

      it('should remove control characters except newline, tab, CR', () => {
        const input = 'Test\x00\x01\x02\n\t\rOK';
        const output = sanitizeTestOutput(input);
        expect(output).toBe('Test\n\t\rOK');
        expect(output).not.toContain('\x00');
        expect(output).not.toContain('\x01');
        expect(output).not.toContain('\x02');
      });

      it('should handle complex ANSI sequences from real test output', () => {
        const input = '\x1B[32m✓\x1B[0m Test passed\n\x1B[31m✗\x1B[0m Test failed';
        const output = sanitizeTestOutput(input);
        expect(output).toBe('✓ Test passed\n✗ Test failed');
        expect(output).not.toContain('\x1B');
      });

      it('should handle empty input', () => {
        const output = sanitizeTestOutput('');
        expect(output).toBe('');
      });

      it('should preserve normal text without ANSI codes', () => {
        const input = 'Normal test output with no escape codes';
        const output = sanitizeTestOutput(input);
        expect(output).toBe(input);
      });
    });
  });

  describe('Pre-Flight Check Functions', () => {
    describe('extractChangedFiles', () => {
      beforeEach(() => {
        vi.mocked(spawnSync).mockReset();
      });

      it('should return comma-separated list of changed files', () => {
        vi.mocked(spawnSync).mockReturnValue({
          status: 0,
          stdout: 'src/foo.ts\nsrc/bar.ts\npackage.json',
          stderr: '',
          output: [],
          pid: 1,
          signal: null,
        });

        const result = extractChangedFiles('/test/dir');
        expect(result).toBe('src/foo.ts, src/bar.ts, package.json');
      });

      it('should return single filename for one changed file', () => {
        vi.mocked(spawnSync).mockReturnValue({
          status: 0,
          stdout: 'src/single-file.ts',
          stderr: '',
          output: [],
          pid: 1,
          signal: null,
        });

        const result = extractChangedFiles('/test/dir');
        expect(result).toBe('src/single-file.ts');
      });

      it('should return "No changes detected" for empty diff', () => {
        vi.mocked(spawnSync).mockReturnValue({
          status: 0,
          stdout: '',
          stderr: '',
          output: [],
          pid: 1,
          signal: null,
        });

        const result = extractChangedFiles('/test/dir');
        expect(result).toBe('No changes detected');
      });

      it('should return "No changes detected" when git status is 0 but only whitespace', () => {
        vi.mocked(spawnSync).mockReturnValue({
          status: 0,
          stdout: '\n\n  \n',
          stderr: '',
          output: [],
          pid: 1,
          signal: null,
        });

        const result = extractChangedFiles('/test/dir');
        expect(result).toBe('No changes detected');
      });

      it('should handle git errors gracefully', () => {
        vi.mocked(spawnSync).mockImplementation(() => {
          throw new Error('git not found');
        });

        const result = extractChangedFiles('/test/dir');
        expect(result).toBe('Unable to determine changes');
      });

      it('should call git diff HEAD --name-only', () => {
        vi.mocked(spawnSync).mockReturnValue({
          status: 0,
          stdout: 'file.ts',
          stderr: '',
          output: [],
          pid: 1,
          signal: null,
        });

        extractChangedFiles('/test/dir');

        expect(spawnSync).toHaveBeenCalledWith(
          'git',
          ['diff', 'HEAD', '--name-only'],
          expect.objectContaining({ cwd: '/test/dir' })
        );
      });
    });

    describe('buildRetryHistorySection', () => {
      it('should return empty string for empty history', () => {
        expect(buildRetryHistorySection([])).toBe('');
      });

      it('should return empty string for null/undefined history', () => {
        expect(buildRetryHistorySection(null as unknown as AttemptHistoryEntry[])).toBe('');
        expect(buildRetryHistorySection(undefined as unknown as AttemptHistoryEntry[])).toBe('');
      });

      it('should format single attempt correctly', () => {
        const history: AttemptHistoryEntry[] = [
          {
            attempt: 1,
            testFailures: 2,
            buildFailures: 0,
            testSnippet: 'Expected true but got false',
            buildSnippet: '',
            changesSummary: 'src/foo.ts, src/bar.ts',
            outcome: 'failed_tests',
          },
        ];

        const result = buildRetryHistorySection(history);

        expect(result).toContain('PREVIOUS ATTEMPT HISTORY');
        expect(result).toContain('Attempt 1: src/foo.ts, src/bar.ts -> Tests failed');
        expect(result).toContain('Expected true but got false');
        expect(result).toContain('Do NOT repeat the same fixes');
      });

      it('should format multiple attempts with truncation to 2 errors each', () => {
        const history: AttemptHistoryEntry[] = [
          {
            attempt: 1,
            testFailures: 1,
            buildFailures: 1,
            testSnippet: 'Test error 1',
            buildSnippet: 'Build error 1',
            changesSummary: 'src/a.ts',
            outcome: 'failed_build',
          },
          {
            attempt: 2,
            testFailures: 2,
            buildFailures: 0,
            testSnippet: 'Test error 2',
            buildSnippet: '',
            changesSummary: 'src/b.ts',
            outcome: 'failed_tests',
          },
        ];

        const result = buildRetryHistorySection(history);

        expect(result).toContain('Attempt 1: src/a.ts -> Build failed');
        expect(result).toContain('Attempt 2: src/b.ts -> Tests failed');
        expect(result).toContain('Test error 1');
        expect(result).toContain('Build error 1');
        expect(result).toContain('Test error 2');
      });

      it('should limit history to last 3 attempts when more exist', () => {
        const history: AttemptHistoryEntry[] = [
          { attempt: 1, testFailures: 1, buildFailures: 0, testSnippet: 'err1', buildSnippet: '', changesSummary: 'f1', outcome: 'failed_tests' },
          { attempt: 2, testFailures: 1, buildFailures: 0, testSnippet: 'err2', buildSnippet: '', changesSummary: 'f2', outcome: 'failed_tests' },
          { attempt: 3, testFailures: 1, buildFailures: 0, testSnippet: 'err3', buildSnippet: '', changesSummary: 'f3', outcome: 'failed_tests' },
          { attempt: 4, testFailures: 1, buildFailures: 0, testSnippet: 'err4', buildSnippet: '', changesSummary: 'f4', outcome: 'failed_tests' },
          { attempt: 5, testFailures: 1, buildFailures: 0, testSnippet: 'err5', buildSnippet: '', changesSummary: 'f5', outcome: 'failed_tests' },
        ];

        const result = buildRetryHistorySection(history);

        expect(result).toContain('Last 3 attempts');
        expect(result).not.toContain('Attempt 1:');
        expect(result).not.toContain('Attempt 2:');
        expect(result).toContain('Attempt 3:');
        expect(result).toContain('Attempt 4:');
        expect(result).toContain('Attempt 5:');
      });

      it('should format no_change outcome correctly', () => {
        const history: AttemptHistoryEntry[] = [
          {
            attempt: 2,
            testFailures: 0,
            buildFailures: 0,
            testSnippet: '',
            buildSnippet: '',
            changesSummary: 'No changes detected',
            outcome: 'no_change',
          },
        ];

        const result = buildRetryHistorySection(history);

        expect(result).toContain('Attempt 2: No changes detected -> No changes made');
      });

      it('should include "Do NOT repeat" instruction', () => {
        const history: AttemptHistoryEntry[] = [
          { attempt: 1, testFailures: 1, buildFailures: 0, testSnippet: '', buildSnippet: '', changesSummary: 'file.ts', outcome: 'failed_tests' },
        ];

        const result = buildRetryHistorySection(history);

        expect(result).toContain('Do NOT repeat the same fixes');
        expect(result).toContain('Try a different approach');
      });

      it('should truncate long error snippets', () => {
        const longSnippet = 'x'.repeat(200);
        const history: AttemptHistoryEntry[] = [
          {
            attempt: 1,
            testFailures: 1,
            buildFailures: 0,
            testSnippet: longSnippet,
            buildSnippet: '',
            changesSummary: 'file.ts',
            outcome: 'failed_tests',
          },
        ];

        const result = buildRetryHistorySection(history);

        expect(result).not.toContain(longSnippet);
        expect(result.length).toBeLessThan(longSnippet.length + 500);
      });
    });

    describe('buildRetryPrompt with attemptHistory', () => {
      it('should include retry history section when attempts > 0', () => {
        const history: AttemptHistoryEntry[] = [
          {
            attempt: 1,
            testFailures: 2,
            buildFailures: 0,
            testSnippet: 'Test failed',
            buildSnippet: '',
            changesSummary: 'src/foo.ts',
            outcome: 'failed_tests',
          },
        ];

        const prompt = buildRetryPrompt('test output', '', 2, 3, history);

        expect(prompt).toContain('PREVIOUS ATTEMPT HISTORY');
        expect(prompt).toContain('Attempt 1: src/foo.ts -> Tests failed');
        expect(prompt).toContain('Do NOT repeat the same fixes');
      });

      it('should omit retry history section when no history provided', () => {
        const prompt = buildRetryPrompt('test output', '', 1, 3);

        expect(prompt).not.toContain('PREVIOUS ATTEMPT HISTORY');
        expect(prompt).not.toContain('Do NOT repeat');
      });

      it('should omit retry history section when empty array provided', () => {
        const prompt = buildRetryPrompt('test output', '', 1, 3, []);

        expect(prompt).not.toContain('PREVIOUS ATTEMPT HISTORY');
        expect(prompt).not.toContain('Do NOT repeat');
      });

      it('should place history after error classification and before output sections', () => {
        const history: AttemptHistoryEntry[] = [
          { attempt: 1, testFailures: 1, buildFailures: 0, testSnippet: '', buildSnippet: '', changesSummary: 'f.ts', outcome: 'failed_tests' },
        ];

        const prompt = buildRetryPrompt('test output here', 'build output here', 2, 3, history);

        const historyIndex = prompt.indexOf('PREVIOUS ATTEMPT HISTORY');
        const testOutputIndex = prompt.indexOf('Test Output:');
        const buildOutputIndex = prompt.indexOf('Build Output:');

        expect(historyIndex).toBeGreaterThan(0);
        expect(buildOutputIndex).toBeGreaterThan(historyIndex);
        expect(testOutputIndex).toBeGreaterThan(historyIndex);
      });
    });
  });
});
