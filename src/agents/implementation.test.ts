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
  buildRetryPrompt,
  detectMissingDependencies,
  sanitizeTestOutput,
  type TDDPhaseResult,
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
  describe('TDD_SYSTEM_PROMPT', () => {
    it('should export TDD_SYSTEM_PROMPT constant', () => {
      expect(TDD_SYSTEM_PROMPT).toBeDefined();
    });

    it('TDD_SYSTEM_PROMPT should be a non-empty string', () => {
      expect(typeof TDD_SYSTEM_PROMPT).toBe('string');
      expect(TDD_SYSTEM_PROMPT.length).toBeGreaterThan(0);
    });

    it('TDD_SYSTEM_PROMPT should contain RED phase guidance', () => {
      expect(TDD_SYSTEM_PROMPT).toContain('RED');
    });

    it('TDD_SYSTEM_PROMPT should contain GREEN phase guidance', () => {
      expect(TDD_SYSTEM_PROMPT).toContain('GREEN');
    });

    it('TDD_SYSTEM_PROMPT should contain REFACTOR phase guidance', () => {
      expect(TDD_SYSTEM_PROMPT).toContain('REFACTOR');
    });

    it('TDD_SYSTEM_PROMPT should emphasize test-first approach', () => {
      expect(TDD_SYSTEM_PROMPT.toLowerCase()).toContain('before writing a test'.toLowerCase());
    });
  });

  describe('runSingleTest helper', () => {
    it('should export runSingleTest function', () => {
      expect(runSingleTest).toBeDefined();
      expect(typeof runSingleTest).toBe('function');
    });

    it('should return object with passed and output properties', async () => {
      // Note: This test validates the function signature and return type.
      // We use a non-existent test file to make it fail fast without running actual tests.
      const result = await runSingleTest('nonexistent.test.ts', '/tmp', 5000);

      expect(result).toHaveProperty('passed');
      expect(result).toHaveProperty('output');
      expect(typeof result.passed).toBe('boolean');
      expect(typeof result.output).toBe('string');
    });

    it('should return non-empty output string on failure', async () => {
      // Run against non-existent file to get error output without recursive test execution
      const result = await runSingleTest('nonexistent.test.ts', '/tmp', 5000);
      expect(result.output.length).toBeGreaterThan(0);
      expect(result.passed).toBe(false);
    });
  });

  describe('runAllTests helper', () => {
    it('should export runAllTests function', () => {
      expect(runAllTests).toBeDefined();
      expect(typeof runAllTests).toBe('function');
    });

    it('should return object with passed and output properties', async () => {
      // Note: This test validates the function signature and return type.
      // We use /tmp which has no package.json to make it fail fast without recursive tests.
      const result = await runAllTests('/tmp', 5000);

      expect(result).toHaveProperty('passed');
      expect(result).toHaveProperty('output');
      expect(typeof result.passed).toBe('boolean');
      expect(typeof result.output).toBe('string');
    });

    it('should return non-empty output string on failure', async () => {
      // Run in directory without package.json to get error output without recursion
      const result = await runAllTests('/tmp', 5000);
      expect(result.output.length).toBeGreaterThan(0);
      expect(result.passed).toBe(false);
    });
  });

  describe('executeRedPhase', () => {
    it('should export executeRedPhase function', () => {
      expect(executeRedPhase).toBeDefined();
      expect(typeof executeRedPhase).toBe('function');
    });

    it('should return a TDDPhaseResult object', async () => {
      // This test validates the return type structure
      const mockStory = createMockStory();
      const mockRunAgentQuery = vi.fn().mockResolvedValue('Created test file test.test.ts');

      const result = await executeRedPhase(mockStory, 1, {
        workingDir: '/tmp/test',
        runAgentQuery: mockRunAgentQuery,
      });

      expect(result).toHaveProperty('testName');
      expect(result).toHaveProperty('testFile');
      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('output');
      expect(result).toHaveProperty('success');
    });

    it('should generate a test file path in the result', async () => {
      const mockStory = createMockStory();
      const mockRunAgentQuery = vi.fn().mockResolvedValue('Created failing test in src/feature.test.ts for: Feature should do X');

      const result = await executeRedPhase(mockStory, 1, {
        workingDir: '/tmp/test',
        runAgentQuery: mockRunAgentQuery,
      });

      expect(typeof result.testFile).toBe('string');
      expect(result.testFile.length).toBeGreaterThan(0);
    });
  });

  describe('executeGreenPhase', () => {
    it('should export executeGreenPhase function', () => {
      expect(executeGreenPhase).toBeDefined();
      expect(typeof executeGreenPhase).toBe('function');
    });

    it('should return a TDDPhaseResult object', async () => {
      const mockStory = createMockStory();
      const mockRunAgentQuery = vi.fn().mockResolvedValue('Implemented minimum code to pass test');

      const result = await executeGreenPhase(mockStory, 1, 'src/feature.test.ts', {
        workingDir: '/tmp/test',
        runAgentQuery: mockRunAgentQuery,
      });

      expect(result).toHaveProperty('testName');
      expect(result).toHaveProperty('testFile');
      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('output');
      expect(result).toHaveProperty('success');
    });

    it('should preserve the test file from RED phase', async () => {
      const mockStory = createMockStory();
      const mockRunAgentQuery = vi.fn().mockResolvedValue('Implemented code');
      const testFile = 'src/my-feature.test.ts';

      const result = await executeGreenPhase(mockStory, 1, testFile, {
        workingDir: '/tmp/test',
        runAgentQuery: mockRunAgentQuery,
      });

      expect(result.testFile).toBe(testFile);
    });
  });

  describe('executeRefactorPhase', () => {
    it('should export executeRefactorPhase function', () => {
      expect(executeRefactorPhase).toBeDefined();
      expect(typeof executeRefactorPhase).toBe('function');
    });

    it('should return a TDDPhaseResult object', async () => {
      const mockStory = createMockStory();
      const mockRunAgentQuery = vi.fn().mockResolvedValue('Refactored code for clarity');

      const result = await executeRefactorPhase(mockStory, 1, 'src/feature.test.ts', {
        workingDir: '/tmp/test',
        runAgentQuery: mockRunAgentQuery,
      });

      expect(result).toHaveProperty('testName');
      expect(result).toHaveProperty('testFile');
      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('output');
      expect(result).toHaveProperty('success');
    });

    it('should indicate success when refactoring completes', async () => {
      const mockStory = createMockStory();
      const mockRunAgentQuery = vi.fn().mockResolvedValue('Refactored: extracted helper function');

      const result = await executeRefactorPhase(mockStory, 1, 'src/feature.test.ts', {
        workingDir: '/tmp/test',
        runAgentQuery: mockRunAgentQuery,
      });

      expect(result.success).toBe(true);
    });
  });

  describe('recordTDDCycle', () => {
    it('should export recordTDDCycle function', () => {
      expect(recordTDDCycle).toBeDefined();
      expect(typeof recordTDDCycle).toBe('function');
    });

    it('should create a TDDTestCycle record', () => {
      const redResult: TDDPhaseResult = {
        testName: 'should do X',
        testFile: 'src/feature.test.ts',
        timestamp: '2024-01-01T10:00:00.000Z',
        output: 'Test failed as expected',
        success: true,
      };
      const greenResult: TDDPhaseResult = {
        testName: 'should do X',
        testFile: 'src/feature.test.ts',
        timestamp: '2024-01-01T10:05:00.000Z',
        output: 'Test passed',
        success: true,
      };
      const refactorResult: TDDPhaseResult = {
        testName: 'should do X',
        testFile: 'src/feature.test.ts',
        timestamp: '2024-01-01T10:10:00.000Z',
        output: 'Refactoring done',
        success: true,
      };

      const cycle = recordTDDCycle(1, redResult, greenResult, refactorResult);

      expect(cycle.test_name).toBe('should do X');
      expect(cycle.test_file).toBe('src/feature.test.ts');
      expect(cycle.red_timestamp).toBe('2024-01-01T10:00:00.000Z');
      expect(cycle.green_timestamp).toBe('2024-01-01T10:05:00.000Z');
      expect(cycle.refactor_timestamp).toBe('2024-01-01T10:10:00.000Z');
      expect(cycle.cycle_number).toBe(1);
    });

    it('should include test output from RED phase', () => {
      const redResult: TDDPhaseResult = {
        testName: 'test1',
        testFile: 'test.ts',
        timestamp: '2024-01-01T10:00:00.000Z',
        output: 'FAIL: Expected true but got false',
        success: true,
      };
      const greenResult: TDDPhaseResult = {
        testName: 'test1',
        testFile: 'test.ts',
        timestamp: '2024-01-01T10:05:00.000Z',
        output: 'PASS',
        success: true,
      };
      const refactorResult: TDDPhaseResult = {
        testName: 'test1',
        testFile: 'test.ts',
        timestamp: '2024-01-01T10:10:00.000Z',
        output: 'Done',
        success: true,
      };

      const cycle = recordTDDCycle(1, redResult, greenResult, refactorResult);

      expect(cycle.test_output_red).toBe('FAIL: Expected true but got false');
      expect(cycle.test_output_green).toBe('PASS');
    });
  });

  describe('checkACCoverage', () => {
    it('should export checkACCoverage function', () => {
      expect(checkACCoverage).toBeDefined();
      expect(typeof checkACCoverage).toBe('function');
    });

    it('should return false when acceptance criteria have unchecked items', () => {
      const story = createMockStory({
        content: `# Test Story

## Acceptance Criteria

- [ ] Feature should do X
- [ ] Feature should handle Y
`,
      });

      const result = checkACCoverage(story);

      expect(result).toBe(false);
    });

    it('should return true when all acceptance criteria are checked', () => {
      const story = createMockStory({
        content: `# Test Story

## Acceptance Criteria

- [x] Feature should do X
- [x] Feature should handle Y
`,
      });

      const result = checkACCoverage(story);

      expect(result).toBe(true);
    });

    it('should return true when no acceptance criteria section exists', () => {
      const story = createMockStory({
        content: `# Test Story

## Summary
Just a summary, no AC.
`,
      });

      const result = checkACCoverage(story);

      // No AC means "nothing to check" = coverage complete
      expect(result).toBe(true);
    });
  });

  describe('runTDDImplementation', () => {
    it('should export runTDDImplementation function', () => {
      expect(runTDDImplementation).toBeDefined();
      expect(typeof runTDDImplementation).toBe('function');
    });

    it('should return an AgentResult object', async () => {
      // Create mock story with all AC checked (so it completes after first cycle)
      const story = createMockStory({
        content: `# Test Story

## Acceptance Criteria

- [x] Feature done
`,
      });

      // Mock parseStory to return our mock story (used by runTDDImplementation to re-read)
      vi.mocked(storyModule.parseStory).mockReturnValue(story);

      // Mock dependencies
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

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('changesMade');
    });
  });

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

    describe('truncateTestOutput', () => {
      it('should not truncate output shorter than maxLength', () => {
        const output = 'Short output';
        expect(truncateTestOutput(output)).toBe(output);
      });

      it('should not truncate output equal to maxLength', () => {
        const output = 'x'.repeat(5000);
        expect(truncateTestOutput(output)).toBe(output);
      });

      it('should truncate output longer than maxLength', () => {
        const output = 'x'.repeat(6000);
        const result = truncateTestOutput(output);
        expect(result.length).toBeLessThan(output.length);
        expect(result).toContain('Output truncated');
        expect(result).toContain('Showing first 5000 characters of 6000 total');
      });

      it('should handle custom maxLength', () => {
        const output = 'x'.repeat(200);
        const result = truncateTestOutput(output, 100);
        expect(result.length).toBeLessThan(output.length);
        expect(result).toContain('Showing first 100 characters of 200 total');
      });

      it('should handle empty output', () => {
        expect(truncateTestOutput('')).toBe('');
      });

      it('should preserve first 5000 chars of content', () => {
        const output = 'START' + 'x'.repeat(5000) + 'END';
        const result = truncateTestOutput(output);
        expect(result).toContain('START');
        expect(result).not.toContain('END');
      });
    });

    describe('buildRetryPrompt', () => {
      it('should include test output in prompt', () => {
        const testOutput = 'Test failed: expected 2 but got 1';
        const buildOutput = '';
        const prompt = buildRetryPrompt(testOutput, buildOutput, 1, 3);
        expect(prompt).toContain('CRITICAL: Tests are failing');
        expect(prompt).toContain(testOutput);
        expect(prompt).toContain('Test Output:');
      });

      it('should include build output in prompt', () => {
        const testOutput = '';
        const buildOutput = 'Build error: module not found';
        const prompt = buildRetryPrompt(testOutput, buildOutput, 1, 3);
        expect(prompt).toContain('Build Output:');
        expect(prompt).toContain(buildOutput);
      });

      it('should include both test and build output', () => {
        const testOutput = 'Test failed';
        const buildOutput = 'Build error';
        const prompt = buildRetryPrompt(testOutput, buildOutput, 2, 3);
        expect(prompt).toContain('Test Output:');
        expect(prompt).toContain('Build Output:');
        expect(prompt).toContain('Test failed');
        expect(prompt).toContain('Build error');
      });

      it('should include attempt number and max retries', () => {
        const prompt = buildRetryPrompt('test output', '', 2, 5);
        expect(prompt).toContain('retry attempt 2 of 5');
      });

      it('should include analysis instructions', () => {
        const prompt = buildRetryPrompt('test output', '', 1, 3);
        expect(prompt).toContain('ANALYZE the test/build output');
        expect(prompt).toContain('Compare EXPECTED vs ACTUAL');
        expect(prompt).toContain('Identify the root cause');
        expect(prompt).toContain('Fix ONLY the production code');
      });

      it('should truncate long test output', () => {
        const longOutput = 'x'.repeat(10000);
        const prompt = buildRetryPrompt(longOutput, '', 1, 3);
        expect(prompt.length).toBeLessThan(longOutput.length + 1000); // Prompt + some overhead
        expect(prompt).toContain('Output truncated');
      });

      it('should handle empty outputs gracefully', () => {
        const prompt = buildRetryPrompt('', '', 1, 3);
        expect(prompt).toContain('CRITICAL: Tests are failing');
        expect(prompt).not.toContain('Test Output:');
        expect(prompt).not.toContain('Build Output:');
      });

      it('should trim whitespace from outputs', () => {
        const testOutput = '   \n\n   ';
        const buildOutput = '   \n\n   ';
        const prompt = buildRetryPrompt(testOutput, buildOutput, 1, 3);
        // Empty after trim, so should not include output sections
        expect(prompt).not.toContain('Test Output:');
        expect(prompt).not.toContain('Build Output:');
      });

      it('should detect and provide guidance for missing dependencies', () => {
        const buildOutput = "Cannot find module 'proper-lockfile'";
        const prompt = buildRetryPrompt('', buildOutput, 1, 3);
        expect(prompt).toContain('DEPENDENCY ISSUE DETECTED');
        expect(prompt).toContain('proper-lockfile');
        expect(prompt).toContain('npm install');
      });

      it('should detect multiple missing dependencies', () => {
        const buildOutput = "Cannot find module 'lodash'\nCannot find module 'axios'";
        const prompt = buildRetryPrompt('', buildOutput, 1, 3);
        expect(prompt).toContain('lodash');
        expect(prompt).toContain('axios');
        expect(prompt).toContain('npm install lodash axios');
      });

      it('should handle scoped packages in missing dependency detection', () => {
        const buildOutput = "Cannot find module '@types/node'";
        const prompt = buildRetryPrompt('', buildOutput, 1, 3);
        expect(prompt).toContain('@types/node');
      });

      describe('TypeScript error classification', () => {
        it('should classify and separate TypeScript errors in build output', () => {
          const buildOutput = `
src/app.tsx(59,12): error TS2304: Cannot find name 'Foo'.
tests/app.test.ts(60,1): error TS2307: Cannot find module '../app'.
src/types.ts(10,5): error TS2339: Property 'bar' does not exist.
          `.trim();

          const prompt = buildRetryPrompt('', buildOutput, 1, 3);

          // Should contain source errors section
          expect(prompt).toContain('SOURCE ERRORS');
          expect(prompt).toContain('src/app.tsx');
          expect(prompt).toContain('TS2304');

          // Should contain cascading errors section
          expect(prompt).toContain('CASCADING ERRORS');
          expect(prompt).toContain('tests/app.test.ts');
          expect(prompt).toContain('TS2307');
        });

        it('should provide guidance to fix source errors first', () => {
          const buildOutput = `
src/app.ts(1,1): error TS2304: Cannot find name 'Foo'.
tests/app.test.ts(2,2): error TS2307: Cannot find module '../app'.
          `.trim();

          const prompt = buildRetryPrompt('', buildOutput, 1, 3);

          expect(prompt).toContain('Fix source errors first');
          expect(prompt).toMatch(/source errors.*resolve.*cascading/i);
        });

        it('should handle build output with only source errors', () => {
          const buildOutput = `
src/app.ts(1,1): error TS2304: Cannot find name 'Foo'.
src/types.ts(2,2): error TS2339: Property 'bar' does not exist.
          `.trim();

          const prompt = buildRetryPrompt('', buildOutput, 1, 3);

          expect(prompt).toContain('SOURCE ERRORS');
          expect(prompt).not.toContain('CASCADING ERRORS');
        });

        it('should handle build output with only cascading errors', () => {
          const buildOutput = `
tests/app.test.ts(1,1): error TS2307: Cannot find module '../app'.
src/app.ts(2,2): error TS2345: Argument of type 'string' is not assignable.
          `.trim();

          const prompt = buildRetryPrompt('', buildOutput, 1, 3);

          expect(prompt).toContain('CASCADING ERRORS');
          expect(prompt).not.toContain('SOURCE ERRORS');
        });

        it('should handle build output with no TypeScript errors', () => {
          const buildOutput = 'Compilation successful with 0 errors';

          const prompt = buildRetryPrompt('', buildOutput, 1, 3);

          expect(prompt).not.toContain('SOURCE ERRORS');
          expect(prompt).not.toContain('CASCADING ERRORS');
          expect(prompt).toContain(buildOutput); // Should still include original output
        });

        it('should prioritize source errors before cascading in output', () => {
          const buildOutput = `
tests/app.test.ts(1,1): error TS2307: Cannot find module '../app'.
src/app.ts(2,2): error TS2304: Cannot find name 'Foo'.
src/utils.ts(3,3): error TS2345: Argument type mismatch.
          `.trim();

          const prompt = buildRetryPrompt('', buildOutput, 1, 3);

          const sourceIndex = prompt.indexOf('SOURCE ERRORS');
          const cascadingIndex = prompt.indexOf('CASCADING ERRORS');

          expect(sourceIndex).toBeGreaterThan(0);
          expect(cascadingIndex).toBeGreaterThan(0);
          expect(sourceIndex).toBeLessThan(cascadingIndex);
        });

        it('should classify TS2322 errors based on file path context', () => {
          const buildOutput = `
src/types/index.d.ts(1,1): error TS2322: Type mismatch in definition.
src/app.ts(2,2): error TS2322: Type mismatch in usage.
          `.trim();

          const prompt = buildRetryPrompt('', buildOutput, 1, 3);

          // Type definition file errors should be source
          expect(prompt).toContain('src/types/index.d.ts');
          expect(prompt).toContain('SOURCE ERRORS');

          // Regular file type errors should be cascading
          // (Both will appear but in different sections)
          const sourceSection = prompt.substring(
            prompt.indexOf('SOURCE ERRORS'),
            prompt.indexOf('CASCADING ERRORS') !== -1
              ? prompt.indexOf('CASCADING ERRORS')
              : prompt.length
          );
          expect(sourceSection).toContain('src/types/index.d.ts');
          expect(sourceSection).not.toContain('src/app.ts');
        });

        it('should include error details with line numbers and messages', () => {
          const buildOutput = `
src/app.ts(59,12): error TS2304: Cannot find name 'Foo'.
          `.trim();

          const prompt = buildRetryPrompt('', buildOutput, 1, 3);

          expect(prompt).toContain('src/app.ts');
          expect(prompt).toContain('59'); // line number
          expect(prompt).toContain('TS2304');
          expect(prompt).toContain("Cannot find name 'Foo'");
        });

        it('should handle mixed TypeScript errors and other build output', () => {
          const buildOutput = `
Build started...
src/app.ts(1,1): error TS2304: Cannot find name 'Foo'.
Warning: Unused variable
tests/app.test.ts(2,2): error TS2307: Cannot find module.
Build completed with errors
          `.trim();

          const prompt = buildRetryPrompt('', buildOutput, 1, 3);

          // Should classify TypeScript errors
          expect(prompt).toContain('SOURCE ERRORS');
          expect(prompt).toContain('CASCADING ERRORS');

          // Should still include full build output
          expect(prompt).toContain('Build started');
          expect(prompt).toContain('Warning: Unused variable');
        });
      });
    });

    describe('detectMissingDependencies', () => {
      it('should return empty array for empty input', () => {
        expect(detectMissingDependencies('')).toEqual([]);
      });

      it('should return empty array for null input', () => {
        expect(detectMissingDependencies(null as unknown as string)).toEqual([]);
      });

      it('should detect Cannot find module pattern', () => {
        const output = "Error: Cannot find module 'express'";
        expect(detectMissingDependencies(output)).toEqual(['express']);
      });

      it('should detect Can\'t resolve pattern', () => {
        const output = "Module not found: Can't resolve 'react-dom'";
        expect(detectMissingDependencies(output)).toEqual(['react-dom']);
      });

      it('should handle scoped packages', () => {
        const output = "Cannot find module '@anthropic-ai/sdk'";
        expect(detectMissingDependencies(output)).toEqual(['@anthropic-ai/sdk']);
      });

      it('should deduplicate multiple occurrences', () => {
        const output = "Cannot find module 'lodash'\nError: Cannot find module 'lodash'";
        expect(detectMissingDependencies(output)).toEqual(['lodash']);
      });

      it('should ignore relative imports', () => {
        const output = "Cannot find module './utils'\nCannot find module '../helpers'";
        expect(detectMissingDependencies(output)).toEqual([]);
      });

      it('should ignore absolute paths', () => {
        const output = "Cannot find module '/home/user/project/utils'";
        expect(detectMissingDependencies(output)).toEqual([]);
      });

      it('should extract base package name from subpaths', () => {
        const output = "Cannot find module 'lodash/merge'";
        expect(detectMissingDependencies(output)).toEqual(['lodash']);
      });

      it('should handle multiple different packages', () => {
        const output = "Cannot find module 'express'\nCan't resolve 'lodash'";
        expect(detectMissingDependencies(output)).toContain('express');
        expect(detectMissingDependencies(output)).toContain('lodash');
        expect(detectMissingDependencies(output)).toHaveLength(2);
      });
    });
  });

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
});
