import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
  type TDDPhaseResult,
} from './implementation.js';
import { Story, TDDTestCycle } from '../types/index.js';
import * as storyModule from '../core/story.js';

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
});
