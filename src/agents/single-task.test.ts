import { spawnSync } from 'child_process';
import {beforeEach, describe, expect, it, vi } from 'vitest';

import {type TaskContext } from '../types/index.js';
import {
  buildTaskPrompt,
  detectMissingDependencies,
  detectScopeViolation,
  TASK_AGENT_SYSTEM_PROMPT,
  validateFilePaths,
  verifyChanges,
} from './single-task.js';

// Mock child_process module
vi.mock('child_process', async () => {
  const actual = await vi.importActual<typeof import('child_process')>('child_process');
  return {
    ...actual,
    spawnSync: vi.fn(),
  };
});

// Mock client module
vi.mock('../core/client.js', async () => {
  const actual = await vi.importActual<typeof import('../core/client.js')>('../core/client.js');
  return {
    ...actual,
    runAgentQuery: vi.fn(),
  };
});

// Mock logger
vi.mock('../core/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

describe('Single-Task Agent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('TASK_AGENT_SYSTEM_PROMPT', () => {
    it('should be defined and non-empty', () => {
      expect(TASK_AGENT_SYSTEM_PROMPT).toBeDefined();
      expect(typeof TASK_AGENT_SYSTEM_PROMPT).toBe('string');
      expect(TASK_AGENT_SYSTEM_PROMPT.length).toBeGreaterThan(0);
    });

    it('should contain key instructions', () => {
      expect(TASK_AGENT_SYSTEM_PROMPT).toContain('single implementation task');
      expect(TASK_AGENT_SYSTEM_PROMPT).toContain('ONLY the files listed');
    });
  });

  describe('buildTaskPrompt', () => {
    it('should include task ID and description', () => {
      const context: TaskContext = {
        task: {
          id: 'T1',
          description: 'Add new function',
          status: 'pending',
          files: ['src/utils.ts'],
        },
        acceptanceCriteria: [],
        existingFiles: [],
        projectPatterns: '',
        workingDirectory: '/test',
      };

      const prompt = buildTaskPrompt(context);

      expect(prompt).toContain('T1');
      expect(prompt).toContain('Add new function');
    });

    it('should include target files content', () => {
      const context: TaskContext = {
        task: {
          id: 'T1',
          description: 'Update utils',
          status: 'pending',
          files: ['src/utils.ts'],
        },
        acceptanceCriteria: [],
        existingFiles: [
          {
            path: 'src/utils.ts',
            content: 'export function foo() { return 42; }',
          },
        ],
        projectPatterns: '',
        workingDirectory: '/test',
      };

      const prompt = buildTaskPrompt(context);

      expect(prompt).toContain('src/utils.ts');
      expect(prompt).toContain('export function foo()');
    });

    it('should include acceptance criteria', () => {
      const context: TaskContext = {
        task: {
          id: 'T1',
          description: 'Add feature',
          status: 'pending',
        },
        acceptanceCriteria: ['Feature must handle edge case X', 'Feature must validate input Y'],
        existingFiles: [],
        projectPatterns: '',
        workingDirectory: '/test',
      };

      const prompt = buildTaskPrompt(context);

      expect(prompt).toContain('Feature must handle edge case X');
      expect(prompt).toContain('Feature must validate input Y');
    });

    it('should include project conventions', () => {
      const context: TaskContext = {
        task: {
          id: 'T1',
          description: 'Add feature',
          status: 'pending',
        },
        acceptanceCriteria: [],
        existingFiles: [],
        projectPatterns: 'Use camelCase for variables. Follow DRY principles.',
        workingDirectory: '/test',
      };

      const prompt = buildTaskPrompt(context);

      expect(prompt).toContain('Use camelCase for variables');
      expect(prompt).toContain('Follow DRY principles');
    });

    it('should exclude unrelated information', () => {
      const context: TaskContext = {
        task: {
          id: 'T1',
          description: 'Simple task',
          status: 'pending',
        },
        acceptanceCriteria: [],
        existingFiles: [],
        projectPatterns: '',
        workingDirectory: '/test',
      };

      const prompt = buildTaskPrompt(context);

      // Should not contain typical story sections
      expect(prompt).not.toContain('User Story');
      expect(prompt).not.toContain('Research');
      expect(prompt).not.toContain('Problem Context');
    });

    it('should produce reasonable prompt length for typical task', () => {
      const context: TaskContext = {
        task: {
          id: 'T1',
          description: 'Add validation function',
          status: 'pending',
          files: ['src/validator.ts'],
        },
        acceptanceCriteria: ['Must validate email format', 'Must reject invalid emails'],
        existingFiles: [
          {
            path: 'src/validator.ts',
            content: 'export function validate(input: string): boolean { return true; }',
          },
        ],
        projectPatterns: 'Follow TypeScript best practices',
        workingDirectory: '/test',
      };

      const prompt = buildTaskPrompt(context);

      // Typical prompt should be under 2000 characters (rough token estimate)
      expect(prompt.length).toBeLessThan(2000);
    });

    it('should enforce projectPatterns length limit', () => {
      const longPatterns = 'x'.repeat(3000); // Over 2000 char limit

      const context: TaskContext = {
        task: {
          id: 'T1',
          description: 'Add feature',
          status: 'pending',
        },
        acceptanceCriteria: [],
        existingFiles: [],
        projectPatterns: longPatterns,
        workingDirectory: '/test',
      };

      // Mock console.warn to capture warning
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const prompt = buildTaskPrompt(context);

      // Should have been truncated
      expect(prompt).toContain('[... truncated for length]');
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('truncated'));

      warnSpy.mockRestore();
    });
  });

  describe('detectScopeViolation', () => {
    it('should return undefined when all files are in scope', () => {
      const declared = ['src/foo.ts', 'src/bar.ts'];
      const actual = ['src/foo.ts', 'src/bar.ts'];

      const result = detectScopeViolation(declared, actual);

      expect(result).toBeUndefined();
    });

    it('should return violation list when extra files modified', () => {
      const declared = ['src/foo.ts'];
      const actual = ['src/foo.ts', 'src/bar.ts', 'src/baz.ts'];

      const result = detectScopeViolation(declared, actual);

      expect(result).toBeDefined();
      expect(result).toEqual(['src/bar.ts', 'src/baz.ts']);
    });

    it('should handle empty declared files array', () => {
      const declared: string[] = [];
      const actual = ['src/foo.ts'];

      const result = detectScopeViolation(declared, actual);

      expect(result).toEqual(['src/foo.ts']);
    });

    it('should handle empty actual files array', () => {
      const declared = ['src/foo.ts'];
      const actual: string[] = [];

      const result = detectScopeViolation(declared, actual);

      expect(result).toBeUndefined();
    });
  });

  describe('validateFilePaths', () => {
    it('should accept valid paths', () => {
      expect(() => validateFilePaths(['src/foo.ts', 'tests/bar.test.ts'])).not.toThrow();
    });

    it('should reject paths with shell metacharacters', () => {
      expect(() => validateFilePaths(['src/foo.ts; rm -rf /'])).toThrow(
        'shell metacharacters'
      );
      expect(() => validateFilePaths(['src/foo|bar.ts'])).toThrow('shell metacharacters');
      expect(() => validateFilePaths(['src/foo&.ts'])).toThrow('shell metacharacters');
    });

    it('should reject directory traversal', () => {
      expect(() => validateFilePaths(['../../../etc/passwd'])).toThrow(
        'directory traversal'
      );
      expect(() => validateFilePaths(['src/../../../etc/passwd'])).toThrow(
        'directory traversal'
      );
    });

    it('should accept paths with expected prefixes', () => {
      expect(() =>
        validateFilePaths([
          'src/foo.ts',
          'tests/bar.ts',
          'dist/baz.js',
          '.ai-sdlc/story.md',
          './local.ts',
        ])
      ).not.toThrow();
    });
  });

  describe('detectMissingDependencies', () => {
    it('should find missing file mentions', () => {
      const output = 'I need the file src/foo.ts to complete this task.';
      const result = detectMissingDependencies(output);

      expect(result).toBeDefined();
      expect(result).toContain('src/foo.ts');
    });

    it('should handle "missing file" phrase', () => {
      const output = 'The missing file utils.ts is required.';
      const result = detectMissingDependencies(output);

      expect(result).toBeDefined();
      expect(result).toContain('utils.ts');
    });

    it('should handle "not provided" phrase', () => {
      const output = 'The file config.json was not provided.';
      const result = detectMissingDependencies(output);

      expect(result).toBeDefined();
      expect(result).toContain('config.json');
    });

    it('should return undefined when no missing files', () => {
      const output = 'I completed the task successfully.';
      const result = detectMissingDependencies(output);

      expect(result).toBeUndefined();
    });

    it('should extract multiple file paths', () => {
      const output =
        'I need the files src/foo.ts and tests/bar.test.ts that were not provided.';
      const result = detectMissingDependencies(output);

      expect(result).toBeDefined();
      expect(result).toContain('src/foo.ts');
      expect(result).toContain('tests/bar.test.ts');
    });
  });

  describe('verifyChanges', () => {
    it('should pass when no files changed', async () => {
      const result = await verifyChanges([], '/test');

      expect(result.passed).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.testsRun).toBe(false);
    });

    it('should run TypeScript check and capture errors', async () => {
      const mockSpawnSync = vi.mocked(spawnSync);
      mockSpawnSync.mockReturnValue({
        status: 1,
        stderr: 'error TS2322: Type string is not assignable to type number',
        stdout: '',
        error: undefined,
        signal: null,
        output: [],
        pid: 0,
      } as any);

      const result = await verifyChanges(['src/foo.ts'], '/test');

      expect(result.passed).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('TypeScript errors');
      expect(result.errors[0]).toContain('TS2322');
    });

    it('should run ESLint on TypeScript files', async () => {
      const mockSpawnSync = vi.mocked(spawnSync);
      mockSpawnSync.mockReturnValue({
        status: 0,
        stderr: '',
        stdout: '',
        error: undefined,
        signal: null,
        output: [],
        pid: 0,
      } as any);

      await verifyChanges(['src/foo.ts', 'src/bar.tsx'], '/test');

      // Should call npx tsc and npx eslint
      expect(mockSpawnSync).toHaveBeenCalledWith(
        'npx',
        ['tsc', '--noEmit'],
        expect.any(Object)
      );
      expect(mockSpawnSync).toHaveBeenCalledWith(
        'npx',
        ['eslint', 'src/foo.ts', 'src/bar.tsx'],
        expect.any(Object)
      );
    });

    it('should aggregate multiple errors', async () => {
      const mockSpawnSync = vi.mocked(spawnSync);
      let callCount = 0;
      mockSpawnSync.mockImplementation(() => {
        callCount++;
        return {
          status: 1,
          stderr: callCount === 1 ? 'TypeScript error' : 'ESLint error',
          stdout: '',
          error: undefined,
          signal: null,
          output: [],
          pid: 0,
        } as any;
      });

      const result = await verifyChanges(['src/foo.ts'], '/test');

      expect(result.passed).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should run tests when test files are detected', async () => {
      const mockSpawnSync = vi.mocked(spawnSync);
      const calls: string[] = [];

      mockSpawnSync.mockImplementation((cmd, args) => {
        calls.push(`${cmd} ${args?.join(' ')}`);
        return {
          status: 0,
          stdout: '',
          stderr: '',
          error: undefined,
          signal: null,
          output: [],
          pid: 0,
        } as any;
      });

      const result = await verifyChanges(['src/foo.ts'], '/test');

      // Should call tsc, eslint, and npm test
      expect(result.testsRun).toBe(true);
      expect(calls.some((call) => call.includes('npm test'))).toBe(true);
      expect(calls.some((call) => call.includes('src/foo.test.ts'))).toBe(true);
    });

    it('should report when no tests detected', async () => {
      const mockSpawnSync = vi.mocked(spawnSync);
      mockSpawnSync.mockReturnValue({
        status: 0,
        stdout: '',
        stderr: '',
        error: undefined,
        signal: null,
        output: [],
        pid: 0,
      } as any);

      // Pass a non-.ts file so no test is detected
      const result = await verifyChanges(['README.md'], '/test');

      expect(result.testsRun).toBe(false);
      expect(result.errors.some((e) => e.includes('No tests detected'))).toBe(true);
    });

    it('should reject invalid file paths', async () => {
      const result = await verifyChanges(['src/foo.ts; rm -rf /'], '/test');

      expect(result.passed).toBe(false);
      expect(result.errors.some((e) => e.includes('Path validation failed'))).toBe(true);
    });
  });

});
