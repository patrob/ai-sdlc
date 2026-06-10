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
  describe('commitIfAllTestsPass', () => {
    const spawnSyncMock = vi.mocked(spawnSync);

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-01-15T10:00:00Z'));
      spawnSyncMock.mockReset();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should export commitIfAllTestsPass function', () => {
      expect(commitIfAllTestsPass).toBeDefined();
      expect(typeof commitIfAllTestsPass).toBe('function');
    });

    it('should return { committed: true } when tests pass and changes exist', async () => {
      // Mock git operations with spawnSync return shape
      spawnSyncMock.mockImplementation((cmd, args) => {
        if (cmd === 'git' && args?.[0] === 'status') {
          return { status: 0, stdout: ' M src/file.ts\n', stderr: '', output: [], pid: 1, signal: null };
        }
        if (cmd === 'git' && args?.[0] === 'add') {
          return { status: 0, stdout: '', stderr: '', output: [], pid: 1, signal: null };
        }
        if (cmd === 'git' && args?.[0] === 'commit') {
          return { status: 0, stdout: '', stderr: '', output: [], pid: 1, signal: null };
        }
        return { status: 0, stdout: '', stderr: '', output: [], pid: 1, signal: null };
      });

      // Mock runAllTests to pass
      const mockRunAllTests = vi.fn().mockResolvedValue({
        passed: true,
        output: 'All tests passed',
      });

      // Pass mock as dependency injection parameter
      const result = await commitIfAllTestsPass('/test/dir', 'feat(story): test message', 300000, mockRunAllTests);

      expect(result.committed).toBe(true);
      expect(result.reason).toBeUndefined();
      expect(mockRunAllTests).toHaveBeenCalledWith('/test/dir', 300000);
      // Check spawnSync was called with correct args
      const statusCalls = spawnSyncMock.mock.calls.filter(call => call[0] === 'git' && call[1]?.[0] === 'status');
      expect(statusCalls.length).toBeGreaterThan(0);
      const addCalls = spawnSyncMock.mock.calls.filter(call => call[0] === 'git' && call[1]?.[0] === 'add');
      expect(addCalls.length).toBeGreaterThan(0);
      const commitCalls = spawnSyncMock.mock.calls.filter(call => call[0] === 'git' && call[1]?.[0] === 'commit');
      expect(commitCalls.length).toBeGreaterThan(0);
    });

    it('should return { committed: false, reason: "tests failed" } when tests fail', async () => {
      // Mock git status to show uncommitted changes
      spawnSyncMock.mockImplementation((cmd, args) => {
        if (cmd === 'git' && args?.[0] === 'status') {
          return { status: 0, stdout: ' M src/file.ts\n', stderr: '', output: [], pid: 1, signal: null };
        }
        return { status: 0, stdout: '', stderr: '', output: [], pid: 1, signal: null };
      });

      // Mock runAllTests to fail
      const mockRunAllTests = vi.fn().mockResolvedValue({
        passed: false,
        output: 'Test failed',
      });

      // Pass mock as dependency injection parameter
      const result = await commitIfAllTestsPass('/test/dir', 'feat(story): test message', 300000, mockRunAllTests);

      expect(result.committed).toBe(false);
      expect(result.reason).toBe('tests failed');
      expect(mockRunAllTests).toHaveBeenCalledWith('/test/dir', 300000);
      // Git add and commit should NOT be called - only status
      const addCalls = spawnSyncMock.mock.calls.filter(call => call[0] === 'git' && call[1]?.[0] === 'add');
      expect(addCalls.length).toBe(0);
      const commitCalls = spawnSyncMock.mock.calls.filter(call => call[0] === 'git' && call[1]?.[0] === 'commit');
      expect(commitCalls.length).toBe(0);
    });

    it('should return { committed: false, reason: "nothing to commit" } when no changes exist', async () => {
      // Mock git status to show no changes
      spawnSyncMock.mockImplementation((cmd, args) => {
        if (cmd === 'git' && args?.[0] === 'status') {
          return { status: 0, stdout: '', stderr: '', output: [], pid: 1, signal: null };
        }
        return { status: 0, stdout: '', stderr: '', output: [], pid: 1, signal: null };
      });

      const result = await commitIfAllTestsPass('/test/dir', 'feat(story): test message', 300000);

      expect(result.committed).toBe(false);
      expect(result.reason).toBe('nothing to commit');
      // runAllTests should NOT be called if there are no changes - only status check
      const statusCalls = spawnSyncMock.mock.calls.filter(call => call[0] === 'git' && call[1]?.[0] === 'status');
      expect(statusCalls.length).toBe(1);
    });

    it('should handle git command errors gracefully', async () => {
      // Mock git status to show changes, then git add, then git commit fails
      spawnSyncMock.mockImplementation((cmd, args) => {
        if (cmd === 'git' && args?.[0] === 'status') {
          return { status: 0, stdout: ' M src/file.ts\n', stderr: '', output: [], pid: 1, signal: null };
        }
        if (cmd === 'git' && args?.[0] === 'add') {
          return { status: 0, stdout: '', stderr: '', output: [], pid: 1, signal: null };
        }
        if (cmd === 'git' && args?.[0] === 'commit') {
          throw new Error('git commit failed');
        }
        return { status: 0, stdout: '', stderr: '', output: [], pid: 1, signal: null };
      });

      // Mock runAllTests to pass
      const mockRunAllTests = vi.fn().mockResolvedValue({
        passed: true,
        output: 'All tests passed',
      });

      // Pass mock as dependency injection parameter
      await expect(commitIfAllTestsPass('/test/dir', 'feat(story): test message', 300000, mockRunAllTests)).rejects.toThrow('git commit failed');
    });

    it('should properly escape special characters in commit message', async () => {
      // Mock git operations
      spawnSyncMock.mockImplementation((cmd, args) => {
        if (cmd === 'git' && args?.[0] === 'status') {
          return { status: 0, stdout: ' M src/file.ts\n', stderr: '', output: [], pid: 1, signal: null };
        }
        if (cmd === 'git' && args?.[0] === 'add') {
          return { status: 0, stdout: '', stderr: '', output: [], pid: 1, signal: null };
        }
        if (cmd === 'git' && args?.[0] === 'commit') {
          return { status: 0, stdout: '', stderr: '', output: [], pid: 1, signal: null };
        }
        return { status: 0, stdout: '', stderr: '', output: [], pid: 1, signal: null };
      });

      // Mock runAllTests to pass
      const mockRunAllTests = vi.fn().mockResolvedValue({
        passed: true,
        output: 'All tests passed',
      });

      const messageWithQuotes = "feat(story): add 'quotes' and \"double quotes\"";
      // Pass mock as dependency injection parameter
      await commitIfAllTestsPass('/test/dir', messageWithQuotes, 300000, mockRunAllTests);

      // Check that the commit command was called with properly escaped message
      const commitCall = spawnSyncMock.mock.calls.find(call =>
        call[0] === 'git' && call[1]?.[0] === 'commit'
      );
      expect(commitCall).toBeDefined();
      // The message is in args[2] (commit -m <message>)
      expect(commitCall![1]?.[2]).toContain("feat(story): add 'quotes'");
    });

    it('should call runAllTests with correct parameters', async () => {
      // Mock git status to show changes
      spawnSyncMock.mockImplementation((cmd, args) => {
        if (cmd === 'git' && args?.[0] === 'status') {
          return { status: 0, stdout: ' M src/file.ts\n', stderr: '', output: [], pid: 1, signal: null };
        }
        if (cmd === 'git' && args?.[0] === 'add') {
          return { status: 0, stdout: '', stderr: '', output: [], pid: 1, signal: null };
        }
        if (cmd === 'git' && args?.[0] === 'commit') {
          return { status: 0, stdout: '', stderr: '', output: [], pid: 1, signal: null };
        }
        return { status: 0, stdout: '', stderr: '', output: [], pid: 1, signal: null };
      });

      // Mock runAllTests
      const mockRunAllTests = vi.fn().mockResolvedValue({
        passed: true,
        output: 'All tests passed',
      });

      const testTimeout = 600000; // Different timeout for testing
      // Pass mock as dependency injection parameter
      await commitIfAllTestsPass('/custom/dir', 'feat(story): test', testTimeout, mockRunAllTests);

      expect(mockRunAllTests).toHaveBeenCalledWith('/custom/dir', testTimeout);
    });

    it('should execute git commands in correct sequence', async () => {
      const executionOrder: string[] = [];

      // Mock git operations and track execution order
      spawnSyncMock.mockImplementation((cmd, args) => {
        if (cmd === 'git') {
          if (args?.[0] === 'status') {
            executionOrder.push('status');
            return { status: 0, stdout: ' M file.ts\n', stderr: '', output: [], pid: 1, signal: null };
          }
          if (args?.[0] === 'add') {
            executionOrder.push('add');
            return { status: 0, stdout: '', stderr: '', output: [], pid: 1, signal: null };
          }
          if (args?.[0] === 'commit') {
            executionOrder.push('commit');
            return { status: 0, stdout: '', stderr: '', output: [], pid: 1, signal: null };
          }
        }
        return { status: 0, stdout: '', stderr: '', output: [], pid: 1, signal: null };
      });

      // Mock runAllTests
      const mockRunAllTests = vi.fn().mockResolvedValue({
        passed: true,
        output: 'All tests passed',
      });

      // Pass mock as dependency injection parameter
      await commitIfAllTestsPass('/test/dir', 'feat(story): test', 300000, mockRunAllTests);

      expect(executionOrder).toEqual(['status', 'add', 'commit']);
    });
  });
});
