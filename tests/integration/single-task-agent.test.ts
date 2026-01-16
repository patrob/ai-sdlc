import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Create mock functions using vi.hoisted() so they're available during vi.mock hoisting
const { mockSpawnSync, mockRunAgentQuery } = vi.hoisted(() => ({
  mockSpawnSync: vi.fn(),
  mockRunAgentQuery: vi.fn(),
}));

// Mock the agent query function
vi.mock('../../src/core/client.js', () => ({
  runAgentQuery: mockRunAgentQuery,
}));

// Mock git operations
vi.mock('child_process', () => ({
  spawnSync: mockSpawnSync,
  execSync: vi.fn(),
  spawn: vi.fn(),
}));

// Import the functions we need to test after setting up mocks
import { runSingleTaskAgent, buildTaskPrompt } from '../../src/agents/single-task.js';
import type { TaskContext } from '../../src/types/index.js';

describe('Single-Task Agent Integration Tests', () => {
  let tempDir: string;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create temp directory structure
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'single-task-test-'));

    // Default mock for git diff (no changes initially)
    mockSpawnSync.mockImplementation((cmd: string, args?: string[]) => {
      if (cmd === 'git' && args?.[0] === 'diff') {
        if (args?.[1] === 'HEAD') {
          return {
            status: 0,
            stdout: '',
            stderr: '',
            output: [],
            pid: 1,
            signal: null,
            error: undefined,
          };
        }
        if (args?.[1] === '--name-only') {
          return {
            status: 0,
            stdout: '',
            stderr: '',
            output: [],
            pid: 1,
            signal: null,
            error: undefined,
          };
        }
      }
      if (cmd === 'npx') {
        // TypeScript and ESLint pass by default
        return {
          status: 0,
          stdout: '',
          stderr: '',
          output: [],
          pid: 1,
          signal: null,
          error: undefined,
        };
      }
      return {
        status: 0,
        stdout: '',
        stderr: '',
        output: [],
        pid: 1,
        signal: null,
        error: undefined,
      };
    });

    // Default mock for agent query
    mockRunAgentQuery.mockResolvedValue('Task completed successfully');
  });

  afterEach(() => {
    // Clean up temp directory
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('end-to-end task execution', () => {
    it('should execute a simple task and return success', async () => {
      // Create a simple test file
      const testFilePath = path.join(tempDir, 'utils.ts');
      fs.writeFileSync(testFilePath, 'export const x = 1;');

      // Mock git showing file was modified
      mockSpawnSync.mockImplementation((cmd: string, args?: string[]) => {
        if (cmd === 'git' && args?.[0] === 'diff') {
          if (args?.[1] === 'HEAD') {
            return {
              status: 0,
              stdout: 'diff --git a/utils.ts b/utils.ts\n+export function greet(name: string) { return "Hello " + name; }',
              stderr: '',
              output: [],
              pid: 1,
              signal: null,
              error: undefined,
            };
          }
          if (args?.[1] === '--name-only') {
            return {
              status: 0,
              stdout: 'utils.ts\n',
              stderr: '',
              output: [],
              pid: 1,
              signal: null,
              error: undefined,
            };
          }
        }
        if (cmd === 'npx') {
          // TypeScript and ESLint pass
          return {
            status: 0,
            stdout: '',
            stderr: '',
            output: [],
            pid: 1,
            signal: null,
            error: undefined,
          };
        }
        return {
          status: 0,
          stdout: '',
          stderr: '',
          output: [],
          pid: 1,
          signal: null,
          error: undefined,
        };
      });

      const context: TaskContext = {
        task: {
          id: 'T1',
          description: 'Add a new exported function greet(name: string): string',
          status: 'pending',
          files: ['utils.ts'],
        },
        acceptanceCriteria: ['Function must be exported', 'Function must accept a name parameter'],
        existingFiles: [
          {
            path: 'utils.ts',
            content: 'export const x = 1;',
          },
        ],
        projectPatterns: 'Use TypeScript. Follow functional programming patterns.',
        workingDirectory: tempDir,
      };

      const result = await runSingleTaskAgent(context);

      expect(result.success).toBe(true);
      expect(result.filesChanged).toEqual(['utils.ts']);
      expect(result.verificationPassed).toBe(true);
      expect(result.error).toBeUndefined();
      expect(mockRunAgentQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          workingDirectory: tempDir,
        })
      );
    });

    it('should detect and report scope violations', async () => {
      mockSpawnSync.mockImplementation((cmd: string, args?: string[]) => {
        if (cmd === 'git' && args?.[0] === 'diff') {
          if (args?.[1] === 'HEAD') {
            return {
              status: 0,
              stdout: 'diff changes',
              stderr: '',
              output: [],
              pid: 1,
              signal: null,
              error: undefined,
            };
          }
          if (args?.[1] === '--name-only') {
            return {
              status: 0,
              stdout: 'utils.ts\nhelper.ts\n', // Modified extra file
              stderr: '',
              output: [],
              pid: 1,
              signal: null,
              error: undefined,
            };
          }
        }
        if (cmd === 'npx') {
          return {
            status: 0,
            stdout: '',
            stderr: '',
            output: [],
            pid: 1,
            signal: null,
            error: undefined,
          };
        }
        return {
          status: 0,
          stdout: '',
          stderr: '',
          output: [],
          pid: 1,
          signal: null,
          error: undefined,
        };
      });

      const context: TaskContext = {
        task: {
          id: 'T1',
          description: 'Update utils',
          status: 'pending',
          files: ['utils.ts'], // Only declared utils.ts
        },
        acceptanceCriteria: [],
        existingFiles: [],
        projectPatterns: '',
        workingDirectory: tempDir,
      };

      const result = await runSingleTaskAgent(context);

      expect(result.scopeViolation).toBeDefined();
      expect(result.scopeViolation).toContain('helper.ts');
      expect(result.success).toBe(true); // Still success, but with warning
    });

    it('should handle verification failures', async () => {
      mockSpawnSync.mockImplementation((cmd: string, args?: string[]) => {
        if (cmd === 'git' && args?.[0] === 'diff') {
          if (args?.[1] === 'HEAD') {
            return {
              status: 0,
              stdout: 'diff changes',
              stderr: '',
              output: [],
              pid: 1,
              signal: null,
              error: undefined,
            };
          }
          if (args?.[1] === '--name-only') {
            return {
              status: 0,
              stdout: 'utils.ts\n',
              stderr: '',
              output: [],
              pid: 1,
              signal: null,
              error: undefined,
            };
          }
        }
        if (cmd === 'npx' && args?.[0] === 'tsc') {
          // TypeScript fails
          return {
            status: 1,
            stderr: 'error TS2322: Type string is not assignable to type number',
            stdout: '',
            output: [],
            pid: 1,
            signal: null,
            error: undefined,
          };
        }
        return {
          status: 0,
          stdout: '',
          stderr: '',
          output: [],
          pid: 1,
          signal: null,
          error: undefined,
        };
      });

      const context: TaskContext = {
        task: {
          id: 'T1',
          description: 'Update function',
          status: 'pending',
          files: ['utils.ts'],
        },
        acceptanceCriteria: [],
        existingFiles: [],
        projectPatterns: '',
        workingDirectory: tempDir,
      };

      const result = await runSingleTaskAgent(context);

      expect(result.success).toBe(false);
      expect(result.verificationPassed).toBe(false);
      expect(result.error).toContain('TypeScript errors');
      expect(result.error).toContain('TS2322');
    });

    it('should report when no files are modified', async () => {
      // Git reports no changes
      mockSpawnSync.mockImplementation((cmd: string, args?: string[]) => {
        if (cmd === 'git' && args?.[0] === 'diff') {
          return {
            status: 0,
            stdout: '',
            stderr: '',
            output: [],
            pid: 1,
            signal: null,
            error: undefined,
          };
        }
        return {
          status: 0,
          stdout: '',
          stderr: '',
          output: [],
          pid: 1,
          signal: null,
          error: undefined,
        };
      });

      const context: TaskContext = {
        task: {
          id: 'T1',
          description: 'Do nothing task',
          status: 'pending',
        },
        acceptanceCriteria: [],
        existingFiles: [],
        projectPatterns: '',
        workingDirectory: tempDir,
      };

      const result = await runSingleTaskAgent(context);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No files were modified');
    });
  });

  describe('prompt construction validation', () => {
    it('should generate minimal context prompt', () => {
      const context: TaskContext = {
        task: {
          id: 'T1',
          description: 'Simple task',
          status: 'pending',
          files: ['foo.ts'],
        },
        acceptanceCriteria: ['Must validate input'],
        existingFiles: [
          {
            path: 'foo.ts',
            content: 'export const x = 1;',
          },
        ],
        projectPatterns: 'Use TypeScript',
        workingDirectory: tempDir,
      };

      const prompt = buildTaskPrompt(context);

      // Should include essential information
      expect(prompt).toContain('T1');
      expect(prompt).toContain('Simple task');
      expect(prompt).toContain('foo.ts');
      expect(prompt).toContain('export const x = 1');
      expect(prompt).toContain('Must validate input');
      expect(prompt).toContain('Use TypeScript');

      // Should NOT include full story sections
      expect(prompt).not.toContain('User Story');
      expect(prompt).not.toContain('Research');
      expect(prompt).not.toContain('Problem Context');
    });

    it('should keep prompt under reasonable token limit', () => {
      const context: TaskContext = {
        task: {
          id: 'T1',
          description: 'Add validation function with edge case handling',
          status: 'pending',
          files: ['validator.ts'],
        },
        acceptanceCriteria: [
          'Must validate email format',
          'Must reject invalid emails',
          'Must handle edge cases',
        ],
        existingFiles: [
          {
            path: 'validator.ts',
            content: 'export function validate(input: string): boolean {\n  return true;\n}',
          },
        ],
        projectPatterns: 'Follow TypeScript best practices. Use functional programming patterns.',
        workingDirectory: tempDir,
      };

      const prompt = buildTaskPrompt(context);

      // Rough estimate: 1 token ~= 4 characters, so 2000 tokens ~= 8000 characters
      // For a typical task, prompt should be well under this
      expect(prompt.length).toBeLessThan(5000);
    });
  });

  describe('error handling', () => {
    it('should handle agent timeout gracefully', async () => {
      mockRunAgentQuery.mockRejectedValue(new Error('Agent execution timeout'));

      const context: TaskContext = {
        task: {
          id: 'T1',
          description: 'Timeout task',
          status: 'pending',
        },
        acceptanceCriteria: [],
        existingFiles: [],
        projectPatterns: '',
        workingDirectory: tempDir,
      };

      const result = await runSingleTaskAgent(context);

      expect(result.success).toBe(false);
      expect(result.error).toContain('timeout');
    });

    it('should handle git command failures', async () => {
      mockSpawnSync.mockImplementation((cmd: string, args?: string[]) => {
        if (cmd === 'git' && args?.[0] === 'diff') {
          return {
            status: 128,
            stdout: '',
            stderr: 'fatal: not a git repository',
            output: [],
            pid: 1,
            signal: null,
            error: new Error('git failed'),
          };
        }
        return {
          status: 0,
          stdout: '',
          stderr: '',
          output: [],
          pid: 1,
          signal: null,
          error: undefined,
        };
      });

      mockRunAgentQuery.mockResolvedValue('Agent completed');

      const context: TaskContext = {
        task: {
          id: 'T1',
          description: 'Test task',
          status: 'pending',
        },
        acceptanceCriteria: [],
        existingFiles: [],
        projectPatterns: '',
        workingDirectory: tempDir,
      };

      // Should return error result (consistent with Result Object pattern)
      const result = await runSingleTaskAgent(context);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Git operation failed');
    });
  });

  describe('options handling', () => {
    it('should respect dryRun option and not execute agent', async () => {
      const context: TaskContext = {
        task: {
          id: 'T1',
          description: 'Dry run task',
          status: 'pending',
        },
        acceptanceCriteria: [],
        existingFiles: [],
        projectPatterns: '',
        workingDirectory: tempDir,
      };

      const result = await runSingleTaskAgent(context, { dryRun: true });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Dry run');
      expect(mockRunAgentQuery).not.toHaveBeenCalled();
    });

    it('should pass timeout option to runAgentQuery', async () => {
      mockSpawnSync.mockImplementation((cmd: string, args?: string[]) => {
        if (cmd === 'git' && args?.[0] === 'diff') {
          if (args?.[1] === '--name-only') {
            return {
              status: 0,
              stdout: 'foo.ts\n',
              stderr: '',
              output: [],
              pid: 1,
              signal: null,
              error: undefined,
            };
          }
          return {
            status: 0,
            stdout: 'diff changes',
            stderr: '',
            output: [],
            pid: 1,
            signal: null,
            error: undefined,
          };
        }
        return {
          status: 0,
          stdout: '',
          stderr: '',
          output: [],
          pid: 1,
          signal: null,
          error: undefined,
        };
      });

      const context: TaskContext = {
        task: {
          id: 'T1',
          description: 'Task with timeout',
          status: 'pending',
          files: ['foo.ts'],
        },
        acceptanceCriteria: [],
        existingFiles: [],
        projectPatterns: '',
        workingDirectory: tempDir,
      };

      await runSingleTaskAgent(context, { timeout: 300000 });

      expect(mockRunAgentQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          timeout: 300000,
        })
      );
    });
  });
});
