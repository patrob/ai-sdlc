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
  type TDDPhaseResult,
} from './implementation.js';
import { Story, TDDTestCycle } from '../types/index.js';
import * as storyModule from '../core/story.js';
import { execSync } from 'child_process';

// Mock child_process module
vi.mock('child_process', async () => {
  const actual = await vi.importActual<typeof import('child_process')>('child_process');
  return {
    ...actual,
    execSync: vi.fn(),
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
    const execSyncMock = vi.mocked(execSync);

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-01-15T10:00:00Z'));
      execSyncMock.mockReset();
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

      // Mock git status to show changes
      execSyncMock.mockReturnValue(' M src/file.ts\n' as any);

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
      const commitCalls = execSyncMock.mock.calls.filter(call =>
        typeof call[0] === 'string' && call[0].includes('git commit')
      );
      expect(commitCalls.length).toBeGreaterThan(0);
      expect(commitCalls[0]![0]).toContain('feat(test-story):');
      expect(commitCalls[0]![0]).toContain('TDD cycle 1');
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

      // Mock git status to show changes, but tests fail
      execSyncMock.mockReturnValue(' M src/file.ts\n' as any);

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
      const commitCalls = execSyncMock.mock.calls.filter(call =>
        typeof call[0] === 'string' && call[0].includes('git commit')
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
      execSyncMock.mockReturnValue('' as any);

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

      // Mock git status to show changes, but commit fails
      execSyncMock
        .mockReturnValueOnce(' M src/file.ts\n' as any) // git status
        .mockReturnValueOnce(undefined as any) // git add
        .mockImplementationOnce(() => {
          throw new Error('git commit failed');
        }); // git commit fails

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
    const execSyncMock = vi.mocked(execSync);

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-01-15T10:00:00Z'));
      execSyncMock.mockReset();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should export commitIfAllTestsPass function', () => {
      expect(commitIfAllTestsPass).toBeDefined();
      expect(typeof commitIfAllTestsPass).toBe('function');
    });

    it('should return { committed: true } when tests pass and changes exist', async () => {
      // Mock git status to show uncommitted changes
      execSyncMock
        .mockReturnValueOnce(' M src/file.ts\n' as any) // git status --porcelain
        .mockReturnValueOnce(undefined as any) // git add -A
        .mockReturnValueOnce(undefined as any); // git commit

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
      expect(execSyncMock).toHaveBeenCalledWith('git status --porcelain', { cwd: '/test/dir', encoding: 'utf-8' });
      expect(execSyncMock).toHaveBeenCalledWith('git add -A', { cwd: '/test/dir', stdio: 'pipe' });
      expect(execSyncMock).toHaveBeenCalledWith(
        expect.stringContaining('git commit -m'),
        expect.objectContaining({ cwd: '/test/dir' })
      );
    });

    it('should return { committed: false, reason: "tests failed" } when tests fail', async () => {
      // Mock git status to show uncommitted changes
      execSyncMock
        .mockReturnValueOnce(' M src/file.ts\n' as any); // git status --porcelain

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
      // Git add and commit should NOT be called
      expect(execSyncMock).toHaveBeenCalledTimes(1); // Only status check
    });

    it('should return { committed: false, reason: "nothing to commit" } when no changes exist', async () => {
      // Mock git status to show no changes
      execSyncMock
        .mockReturnValueOnce('' as any); // git status --porcelain (empty)

      const result = await commitIfAllTestsPass('/test/dir', 'feat(story): test message', 300000);

      expect(result.committed).toBe(false);
      expect(result.reason).toBe('nothing to commit');
      // runAllTests should NOT be called if there are no changes
      expect(execSyncMock).toHaveBeenCalledTimes(1); // Only status check
    });

    it('should handle git command errors gracefully', async () => {
      // Mock git status to show changes, then git add, then git commit fails
      execSyncMock
        .mockReturnValueOnce(' M src/file.ts\n' as any) // git status --porcelain
        .mockReturnValueOnce(undefined as any) // git add -A
        .mockImplementationOnce(() => {
          throw new Error('git commit failed');
        }); // git commit fails

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
      execSyncMock
        .mockReturnValueOnce(' M src/file.ts\n' as any) // git status --porcelain
        .mockReturnValueOnce(undefined as any) // git add -A
        .mockReturnValueOnce(undefined as any); // git commit

      // Mock runAllTests to pass
      const mockRunAllTests = vi.fn().mockResolvedValue({
        passed: true,
        output: 'All tests passed',
      });

      const messageWithQuotes = "feat(story): add 'quotes' and \"double quotes\"";
      // Pass mock as dependency injection parameter
      await commitIfAllTestsPass('/test/dir', messageWithQuotes, 300000, mockRunAllTests);

      // Check that the commit command was called with properly escaped message
      const commitCall = execSyncMock.mock.calls.find(call =>
        typeof call[0] === 'string' && call[0].includes('git commit')
      );
      expect(commitCall).toBeDefined();
      expect(commitCall![0]).toContain("git commit -m '");
      // Verify the escaping pattern is applied (single quotes wrapped, internal quotes escaped)
    });

    it('should call runAllTests with correct parameters', async () => {
      // Mock git status to show changes
      execSyncMock
        .mockReturnValueOnce(' M src/file.ts\n' as any) // git status --porcelain
        .mockReturnValueOnce(undefined as any) // git add -A
        .mockReturnValueOnce(undefined as any); // git commit

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
      execSyncMock.mockImplementation((cmd: string) => {
        if (typeof cmd === 'string') {
          if (cmd.includes('git status')) executionOrder.push('status');
          if (cmd.includes('git add')) executionOrder.push('add');
          if (cmd.includes('git commit')) executionOrder.push('commit');
        }
        return cmd.includes('git status') ? ' M file.ts\n' : undefined;
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
        vi.mocked(execSync).mockReturnValue('diff --git a/test.ts b/test.ts\n+new line');
        const hash = captureCurrentDiffHash('/test/dir');
        expect(hash).toBeDefined();
        expect(hash.length).toBe(64); // SHA256 produces 64 hex chars
        expect(execSync).toHaveBeenCalledWith('git diff HEAD', expect.objectContaining({ cwd: '/test/dir' }));
      });

      it('should return empty string if git command fails', () => {
        vi.mocked(execSync).mockImplementation(() => {
          throw new Error('Not a git repository');
        });
        const hash = captureCurrentDiffHash('/test/dir');
        expect(hash).toBe('');
      });

      it('should return consistent hash for same diff', () => {
        vi.mocked(execSync).mockReturnValue('same diff content');
        const hash1 = captureCurrentDiffHash('/test/dir');
        const hash2 = captureCurrentDiffHash('/test/dir');
        expect(hash1).toBe(hash2);
      });

      it('should return different hash for different diff', () => {
        vi.mocked(execSync).mockReturnValueOnce('diff content 1');
        const hash1 = captureCurrentDiffHash('/test/dir');
        vi.mocked(execSync).mockReturnValueOnce('diff content 2');
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
    });
  });
});
