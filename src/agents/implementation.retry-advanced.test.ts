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
  describe('Implementation Retry Utilities', () => {
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
        // New truncation shows "last N characters" when no failures detected
        expect(prompt).toMatch(/Output (truncated|restructured)/);
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
});
