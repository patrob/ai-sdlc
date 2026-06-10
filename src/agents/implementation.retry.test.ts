import { spawnSync } from 'child_process';
import { describe, expect, it, vi } from 'vitest';

import { type Story } from '../types/index.js';
import {
  captureCurrentDiffHash,
  extractTestFailures,
  hasChangesOccurred,
  truncateTestOutput,
} from './implementation.js';

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
function _createMockStory(overrides: Partial<Story> = {}): Story {
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
  describe('Implementation Retry Utilities', () => {
    describe('captureCurrentDiffHash', () => {
      it('should return SHA256 hash of git diff HEAD', () => {
        vi.mocked(spawnSync).mockReturnValue({
          status: 0,
          stdout: 'diff --git a/test.ts b/test.ts\n+new line',
          stderr: '',
          output: [],
          pid: 1,
          signal: null,
        });
        const hash = captureCurrentDiffHash('/test/dir');
        expect(hash).toBeDefined();
        expect(hash.length).toBe(64); // SHA256 produces 64 hex chars
        expect(spawnSync).toHaveBeenCalledWith('git', ['diff', 'HEAD'], expect.objectContaining({ cwd: '/test/dir' }));
      });

      it('should return empty string if git command fails', () => {
        vi.mocked(spawnSync).mockImplementation(() => {
          throw new Error('Not a git repository');
        });
        const hash = captureCurrentDiffHash('/test/dir');
        expect(hash).toBe('');
      });

      it('should return consistent hash for same diff', () => {
        vi.mocked(spawnSync).mockReturnValue({
          status: 0,
          stdout: 'same diff content',
          stderr: '',
          output: [],
          pid: 1,
          signal: null,
        });
        const hash1 = captureCurrentDiffHash('/test/dir');
        const hash2 = captureCurrentDiffHash('/test/dir');
        expect(hash1).toBe(hash2);
      });

      it('should return different hash for different diff', () => {
        vi.mocked(spawnSync)
          .mockReturnValueOnce({
            status: 0,
            stdout: 'diff content 1',
            stderr: '',
            output: [],
            pid: 1,
            signal: null,
          })
          .mockReturnValueOnce({
            status: 0,
            stdout: 'diff content 2',
            stderr: '',
            output: [],
            pid: 1,
            signal: null,
          });
        const hash1 = captureCurrentDiffHash('/test/dir');
        const hash2 = captureCurrentDiffHash('/test/dir');
        expect(hash1).not.toBe(hash2);
      });
    });

    describe('hasChangesOccurred', () => {
      it('should return true when hashes are different', () => {
        expect(hasChangesOccurred('hash1', 'hash2')).toBe(true);
      });

      it('should return false when hashes are the same', () => {
        expect(hasChangesOccurred('hash1', 'hash1')).toBe(false);
      });

      it('should return true when comparing empty to non-empty', () => {
        expect(hasChangesOccurred('', 'hash1')).toBe(true);
      });

      it('should return false when both are empty', () => {
        expect(hasChangesOccurred('', '')).toBe(false);
      });
    });

    describe('extractTestFailures', () => {
      it('should return empty result for empty input', () => {
        const result = extractTestFailures('');
        expect(result.failures).toEqual([]);
        expect(result.summary).toBe('');
        expect(result.truncatedPassing).toBe('');
      });

      it('should extract vitest summary line', () => {
        const output = `
 ✓ src/test.ts > should pass
 FAIL src/test.ts > should fail
   Expected: true
   Received: false

 Test Files  1 failed | 1 passed (2)
 Duration   1.23s
        `.trim();

        const result = extractTestFailures(output);
        expect(result.summary).toContain('Test Files');
        expect(result.summary).toContain('1 failed');
      });

      it('should extract multiple failure blocks', () => {
        const output = `
 ✓ src/test.ts > passing test
 FAIL src/test.ts > first failure
   Expected: 1
   Received: 2
 FAIL src/test.ts > second failure
   Expected: "hello"
   Received: "world"

 Test Files  2 failed | 1 passed (3)
        `.trim();

        const result = extractTestFailures(output);
        expect(result.failures.length).toBe(2);
        expect(result.failures[0]).toContain('first failure');
        expect(result.failures[0]).toContain('Expected: 1');
        expect(result.failures[1]).toContain('second failure');
        expect(result.failures[1]).toContain('Expected: "hello"');
      });

      it('should capture Expected vs Received in failure blocks', () => {
        const output = `
 FAIL src/api.test.ts > API > should return user
   AssertionError: expected undefined to equal { name: 'John' }
   Expected: { name: "John" }
   Received: undefined

   at tests/api.test.ts:15:10

 Test Files  1 failed (1)
        `.trim();

        const result = extractTestFailures(output);
        expect(result.failures.length).toBe(1);
        expect(result.failures[0]).toContain('Expected: { name: "John" }');
        expect(result.failures[0]).toContain('Received: undefined');
        expect(result.failures[0]).toContain('AssertionError');
      });

      it('should handle output with only passing tests', () => {
        const output = `
 ✓ src/test.ts > should pass 1
 ✓ src/test.ts > should pass 2
 ✓ src/test.ts > should pass 3

 Test Files  3 passed (3)
 Duration   0.5s
        `.trim();

        const result = extractTestFailures(output);
        expect(result.failures).toEqual([]);
        expect(result.truncatedPassing).toContain('should pass 1');
      });

      it('should separate passing tests from failure blocks', () => {
        const output = `
 ✓ src/test.ts > passing test 1
 ✓ src/test.ts > passing test 2
 FAIL src/test.ts > failing test
   Error details here

 Test Files  1 failed | 2 passed (3)
        `.trim();

        const result = extractTestFailures(output);
        expect(result.failures.length).toBe(1);
        expect(result.truncatedPassing).toContain('passing test 1');
        expect(result.truncatedPassing).not.toContain('failing test');
      });

      it('should handle Jest format summary', () => {
        const output = `
 FAIL src/test.ts
   ✕ should fail

 Test Suites: 1 failed, 1 total
        `.trim();

        const result = extractTestFailures(output);
        expect(result.summary).toContain('Test Suites');
        expect(result.summary).toContain('1 failed');
      });

      it('should handle checkmark and X markers', () => {
        const output = `
✓ passing test
✗ failing test
  Expected true, got false
× another failure
  Some error

Test Files  2 failed | 1 passed (3)
        `.trim();

        const result = extractTestFailures(output);
        expect(result.failures.length).toBe(2);
      });
    });

    describe('truncateTestOutput', () => {
      it('should not truncate output shorter than maxLength', () => {
        const output = 'Short output';
        expect(truncateTestOutput(output)).toBe(output);
      });

      it('should not truncate output equal to maxLength', () => {
        const output = 'x'.repeat(8000);
        expect(truncateTestOutput(output)).toBe(output);
      });

      it('should handle empty output', () => {
        expect(truncateTestOutput('')).toBe('');
      });

      it('should handle custom maxLength', () => {
        const output = 'x'.repeat(200);
        const result = truncateTestOutput(output, 100);
        expect(result.length).toBeLessThan(output.length);
        // Falls back to showing end when no failures detected
        expect(result).toContain('Output truncated');
        expect(result).toContain('last 100 characters');
      });

      it('should prioritize failure blocks when truncating', () => {
        // Create output with passing tests first, failure at end (like vitest)
        const passingTests = '✓ passing test\n'.repeat(500);
        const failureBlock = `
 FAIL src/important.test.ts > critical test
   Expected: "success"
   Received: "failure"

 Test Files  1 failed | 500 passed (501)
        `.trim();

        const output = passingTests + '\n' + failureBlock;
        const result = truncateTestOutput(output, 2000);

        // Should contain the failure details
        expect(result).toContain('FAIL');
        expect(result).toContain('Expected: "success"');
        expect(result).toContain('Received: "failure"');
        expect(result).toContain('FAILURE DETAILS');
      });

      it('should include summary when failures present', () => {
        const output = `
 ✓ passing
 FAIL src/test.ts > failing
   Error here

 Test Files  1 failed | 1 passed (2)
        `.trim() + 'x'.repeat(10000);

        const result = truncateTestOutput(output, 1000);

        expect(result).toContain('TEST SUMMARY');
        expect(result).toContain('1 failed');
      });

      it('should fall back to showing end of output when no failures detected', () => {
        const beginning = 'START' + 'x'.repeat(5000);
        const end = 'IMPORTANT_END_CONTENT';
        const output = beginning + end;

        const result = truncateTestOutput(output, 1000);

        // Should show end since that's where failures usually are
        expect(result).toContain('last 1000 characters');
        expect(result).toContain('IMPORTANT_END_CONTENT');
      });

      it('should preserve all failure blocks even with many passing tests', () => {
        const passingTests = Array.from({ length: 100 }, (_, i) =>
          `✓ src/test${i}.ts > passing test ${i}`
        ).join('\n');

        const failures = `
 FAIL src/critical.test.ts > must fix this
   TypeError: Cannot read property 'foo' of undefined
   Expected: defined
   Received: undefined

 FAIL src/another.test.ts > also broken
   AssertionError: values not equal
   Expected: 42
   Received: 0
        `.trim();

        const output = passingTests + '\n' + failures + '\n Test Files  2 failed | 100 passed (102)';
        const result = truncateTestOutput(output, 3000);

        expect(result).toContain('must fix this');
        expect(result).toContain('also broken');
        expect(result).toContain('Expected: defined');
        expect(result).toContain('Expected: 42');
      });

      it('should include truncated passing tests if space remains', () => {
        const output = `
 ✓ passing test 1
 ✓ passing test 2
 FAIL src/test.ts > failing
   Short error

 Test Files  1 failed | 2 passed (3)
        `.trim();

        // Large maxLength should include everything
        const result = truncateTestOutput(output, 10000);

        expect(result).toContain('passing test 1');
        expect(result).toContain('FAIL');
      });
    });
  });
});
