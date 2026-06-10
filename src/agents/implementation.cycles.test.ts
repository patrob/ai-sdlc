import { spawnSync } from 'child_process';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { afterAll,afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import * as storyModule from '../core/story.js';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { type Story, TDDTestCycle } from '../types/index.js';
import {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  type AttemptHistoryEntry,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  type AttemptOutcome,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  buildRetryHistorySection,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  buildRetryPrompt,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  captureCurrentDiffHash,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  checkACCoverage,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  commitIfAllTestsPass,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  detectMissingDependencies,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  executeGreenPhase,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  executeRedPhase,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  executeRefactorPhase,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  extractChangedFiles,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  type ExtractedTestOutput,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  extractTestFailures,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  hasChangesOccurred,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  recordTDDCycle,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  runAllTests,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  runSingleTest,
  runTDDImplementation,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sanitizeTestOutput,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  TDD_SYSTEM_PROMPT,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  type TDDPhaseResult,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
  describe('TDD cycle commits', () => {
    const spawnSyncMock = vi.mocked(spawnSync);

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-01-15T10:00:00Z'));
      spawnSyncMock.mockReset();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should commit after successful TDD REFACTOR phase', async () => {
      const story = createMockStory({
        slug: 'test-story',
        content: `# Test Story

## Acceptance Criteria

- [x] Feature done
`,
      });

      // Mock parseStory to return our mock story
      vi.mocked(storyModule.parseStory).mockReturnValue(story);

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

      // Mock dependencies
      const mockRunAgentQuery = vi.fn()
        .mockResolvedValueOnce('Created test file src/test.test.ts for: should do X') // RED
        .mockResolvedValueOnce('Implemented code') // GREEN
        .mockResolvedValueOnce('Refactored code'); // REFACTOR

      const mockRunSingleTest = vi.fn()
        .mockResolvedValueOnce({ passed: false, output: 'Test failed' }) // RED check (expect fail)
        .mockResolvedValueOnce({ passed: true, output: 'Test passed' }); // GREEN check (expect pass)

      const mockRunAllTests = vi.fn()
        .mockResolvedValue({ passed: true, output: 'All tests pass' });

      const result = await runTDDImplementation(
        story,
        '/tmp/test/.ai-sdlc',
        {
          runAgentQuery: mockRunAgentQuery,
          runSingleTest: mockRunSingleTest,
          runAllTests: mockRunAllTests,
        }
      );

      expect(result.success).toBe(true);
      // Verify commit was called with correct message format
      const commitCalls = spawnSyncMock.mock.calls.filter(call =>
        call[0] === 'git' && call[1]?.[0] === 'commit'
      );
      expect(commitCalls.length).toBeGreaterThan(0);
      expect(commitCalls[0]![1]?.[2]).toContain('feat(test-story):');
      expect(commitCalls[0]![1]?.[2]).toContain('TDD cycle 1');
    });

    it('should skip commit when tests fail', async () => {
      const story = createMockStory({
        content: `# Test Story

## Acceptance Criteria

- [x] Feature done
`,
      });

      // Mock parseStory to return our mock story
      vi.mocked(storyModule.parseStory).mockReturnValue(story);

      // Mock git status to show changes
      spawnSyncMock.mockImplementation((cmd, args) => {
        if (cmd === 'git' && args?.[0] === 'status') {
          return { status: 0, stdout: ' M src/file.ts\n', stderr: '', output: [], pid: 1, signal: null };
        }
        return { status: 0, stdout: '', stderr: '', output: [], pid: 1, signal: null };
      });

      const mockRunAgentQuery = vi.fn()
        .mockResolvedValueOnce('Created test file src/test.test.ts') // RED
        .mockResolvedValueOnce('Implemented code') // GREEN
        .mockResolvedValueOnce('Refactored code'); // REFACTOR

      const mockRunSingleTest = vi.fn()
        .mockResolvedValueOnce({ passed: false, output: 'Test failed' }) // RED check (expect fail)
        .mockResolvedValueOnce({ passed: true, output: 'Test passed' }); // GREEN check (expect pass)

      // Mock runAllTests to fail after GREEN (regression check fails)
      const mockRunAllTests = vi.fn()
        .mockResolvedValueOnce({ passed: false, output: 'Tests failed' }); // GREEN regression check fails

      const result = await runTDDImplementation(
        story,
        '/tmp/test/.ai-sdlc',
        {
          runAgentQuery: mockRunAgentQuery,
          runSingleTest: mockRunSingleTest,
          runAllTests: mockRunAllTests,
        }
      );

      expect(result.success).toBe(false);
      // Verify no commit was called
      const commitCalls = spawnSyncMock.mock.calls.filter(call =>
        call[0] === 'git' && call[1]?.[0] === 'commit'
      );
      expect(commitCalls.length).toBe(0);
    });

    it('should skip commit when nothing to commit', async () => {
      const story = createMockStory({
        content: `# Test Story

## Acceptance Criteria

- [x] Feature done
`,
      });

      // Mock parseStory to return our mock story
      vi.mocked(storyModule.parseStory).mockReturnValue(story);

      // Mock git status to show NO changes
      spawnSyncMock.mockImplementation((cmd, args) => {
        if (cmd === 'git' && args?.[0] === 'status') {
          return { status: 0, stdout: '', stderr: '', output: [], pid: 1, signal: null };
        }
        return { status: 0, stdout: '', stderr: '', output: [], pid: 1, signal: null };
      });

      const mockRunAgentQuery = vi.fn()
        .mockResolvedValueOnce('Created test file src/test.test.ts') // RED
        .mockResolvedValueOnce('Implemented code') // GREEN
        .mockResolvedValueOnce('Refactored code'); // REFACTOR

      const mockRunSingleTest = vi.fn()
        .mockResolvedValueOnce({ passed: false, output: 'Test failed' }) // RED check (expect fail)
        .mockResolvedValueOnce({ passed: true, output: 'Test passed' }); // GREEN check (expect pass)

      const mockRunAllTests = vi.fn()
        .mockResolvedValue({ passed: true, output: 'All tests pass' });

      const result = await runTDDImplementation(
        story,
        '/tmp/test/.ai-sdlc',
        {
          runAgentQuery: mockRunAgentQuery,
          runSingleTest: mockRunSingleTest,
          runAllTests: mockRunAllTests,
        }
      );

      expect(result.success).toBe(true);
      expect(result.changesMade).toContain('Skipped commit: nothing to commit');
    });

    it('should handle commit errors gracefully during TDD', async () => {
      const story = createMockStory({
        content: `# Test Story

## Acceptance Criteria

- [x] Feature done
`,
      });

      // Mock parseStory to return our mock story
      vi.mocked(storyModule.parseStory).mockReturnValue(story);

      // Track call count to know when to throw
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      let callCount = 0;
      spawnSyncMock.mockImplementation((cmd, args) => {
        callCount++;
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

      const mockRunAgentQuery = vi.fn()
        .mockResolvedValueOnce('Created test file src/test.test.ts') // RED
        .mockResolvedValueOnce('Implemented code') // GREEN
        .mockResolvedValueOnce('Refactored code'); // REFACTOR

      const mockRunSingleTest = vi.fn()
        .mockResolvedValueOnce({ passed: false, output: 'Test failed' }) // RED check (expect fail)
        .mockResolvedValueOnce({ passed: true, output: 'Test passed' }); // GREEN check (expect pass)

      const mockRunAllTests = vi.fn()
        .mockResolvedValue({ passed: true, output: 'All tests pass' });

      const result = await runTDDImplementation(
        story,
        '/tmp/test/.ai-sdlc',
        {
          runAgentQuery: mockRunAgentQuery,
          runSingleTest: mockRunSingleTest,
          runAllTests: mockRunAllTests,
        }
      );

      // Should succeed despite commit error
      expect(result.success).toBe(true);
      expect(result.changesMade.some(msg => msg.includes('Commit warning'))).toBe(true);
    });
  });
});
