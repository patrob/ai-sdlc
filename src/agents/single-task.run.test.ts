import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  buildTaskPrompt,
  detectScopeViolation,
  verifyChanges,
  parseTaskResult,
  runSingleTaskAgent,
  TASK_AGENT_SYSTEM_PROMPT,
  validateFilePaths,
  detectMissingDependencies,
} from './single-task.js';
import { TaskContext, ImplementationTask } from '../types/index.js';
import { spawnSync } from 'child_process';
import * as clientModule from '../core/client.js';

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

describe('runSingleTaskAgent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should execute agent and return structured result on success', async () => {
    const mockRunAgentQuery = vi.mocked(clientModule.runAgentQuery);
    mockRunAgentQuery.mockResolvedValue('Agent successfully completed the task');

    const mockSpawnSync = vi.mocked(spawnSync);
    mockSpawnSync.mockImplementation((cmd, args) => {
      if (args?.[0] === 'diff' && args?.[1] === 'HEAD') {
        return {
          status: 0,
          stdout: 'diff --git a/src/foo.ts b/src/foo.ts\n+added line',
          stderr: '',
          error: undefined,
          signal: null,
          output: [],
          pid: 0,
        } as any;
      }
      if (args?.[0] === 'diff' && args?.[1] === '--name-only') {
        return {
          status: 0,
          stdout: 'src/foo.ts\n',
          stderr: '',
          error: undefined,
          signal: null,
          output: [],
          pid: 0,
        } as any;
      }
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

    const context: TaskContext = {
      task: {
        id: 'T1',
        description: 'Add function',
        status: 'pending',
        files: ['src/foo.ts'],
      },
      acceptanceCriteria: ['Must export function'],
      existingFiles: [{ path: 'src/foo.ts', content: 'export const x = 1;' }],
      projectPatterns: 'Use TypeScript',
      workingDirectory: '/test',
    };

    const result = await runSingleTaskAgent(context);

    expect(result.success).toBe(true);
    expect(result.filesChanged).toEqual(['src/foo.ts']);
    expect(result.verificationPassed).toBe(true);
    expect(mockRunAgentQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        workingDirectory: '/test',
      })
    );
  });

  it('should handle agent failure', async () => {
    const mockRunAgentQuery = vi.mocked(clientModule.runAgentQuery);
    mockRunAgentQuery.mockRejectedValue(new Error('Agent timeout'));

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

    const context: TaskContext = {
      task: {
        id: 'T1',
        description: 'Add function',
        status: 'pending',
      },
      acceptanceCriteria: [],
      existingFiles: [],
      projectPatterns: '',
      workingDirectory: '/test',
    };

    const result = await runSingleTaskAgent(context);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Agent timeout');
  });

  it('should handle verification failure', async () => {
    const mockRunAgentQuery = vi.mocked(clientModule.runAgentQuery);
    mockRunAgentQuery.mockResolvedValue('Agent completed');

    const mockSpawnSync = vi.mocked(spawnSync);
    mockSpawnSync.mockImplementation((cmd, args) => {
      if (args?.[0] === 'diff' && args?.[1] === 'HEAD') {
        return {
          status: 0,
          stdout: 'diff --git a/src/foo.ts b/src/foo.ts\n+added line',
          stderr: '',
          error: undefined,
          signal: null,
          output: [],
          pid: 0,
        } as any;
      }
      if (args?.[0] === 'diff' && args?.[1] === '--name-only') {
        return {
          status: 0,
          stdout: 'src/foo.ts\n',
          stderr: '',
          error: undefined,
          signal: null,
          output: [],
          pid: 0,
        } as any;
      }
      if (cmd === 'npx' && args?.[0] === 'tsc') {
        return {
          status: 1,
          stderr: 'TypeScript error: Type mismatch',
          stdout: '',
          error: undefined,
          signal: null,
          output: [],
          pid: 0,
        } as any;
      }
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

    const context: TaskContext = {
      task: {
        id: 'T1',
        description: 'Add function',
        status: 'pending',
        files: ['src/foo.ts'],
      },
      acceptanceCriteria: [],
      existingFiles: [],
      projectPatterns: '',
      workingDirectory: '/test',
    };

    const result = await runSingleTaskAgent(context);

    expect(result.success).toBe(false);
    expect(result.verificationPassed).toBe(false);
    expect(result.error).toContain('TypeScript error');
  });

  it('should respect dryRun option', async () => {
    const mockRunAgentQuery = vi.mocked(clientModule.runAgentQuery);

    const context: TaskContext = {
      task: {
        id: 'T1',
        description: 'Add function',
        status: 'pending',
      },
      acceptanceCriteria: [],
      existingFiles: [],
      projectPatterns: '',
      workingDirectory: '/test',
    };

    const result = await runSingleTaskAgent(context, { dryRun: true });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Dry run');
    expect(mockRunAgentQuery).not.toHaveBeenCalled();
  });

  it('should pass timeout option to runAgentQuery', async () => {
    const mockRunAgentQuery = vi.mocked(clientModule.runAgentQuery);
    mockRunAgentQuery.mockResolvedValue('Agent completed');

    const mockSpawnSync = vi.mocked(spawnSync);
    mockSpawnSync.mockReturnValue({
      status: 0,
      stdout: 'src/foo.ts\n',
      stderr: '',
      error: undefined,
      signal: null,
      output: [],
      pid: 0,
    } as any);

    const context: TaskContext = {
      task: {
        id: 'T1',
        description: 'Add function',
        status: 'pending',
        files: ['src/foo.ts'],
      },
      acceptanceCriteria: [],
      existingFiles: [],
      projectPatterns: '',
      workingDirectory: '/test',
    };

    await runSingleTaskAgent(context, { timeout: 300000 });

    expect(mockRunAgentQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        timeout: 300000,
      })
    );
  });

  it('should detect scope violation in result', async () => {
    const mockRunAgentQuery = vi.mocked(clientModule.runAgentQuery);
    mockRunAgentQuery.mockResolvedValue('Agent completed');

    const mockSpawnSync = vi.mocked(spawnSync);
    mockSpawnSync.mockImplementation((cmd, args) => {
      if (args?.[0] === 'diff' && args?.[1] === 'HEAD') {
        return {
          status: 0,
          stdout: 'diff changes',
          stderr: '',
          error: undefined,
          signal: null,
          output: [],
          pid: 0,
        } as any;
      }
      if (args?.[0] === 'diff' && args?.[1] === '--name-only') {
        return {
          status: 0,
          stdout: 'src/foo.ts\nsrc/unexpected.ts\n',
          stderr: '',
          error: undefined,
          signal: null,
          output: [],
          pid: 0,
        } as any;
      }
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

    const context: TaskContext = {
      task: {
        id: 'T1',
        description: 'Update foo',
        status: 'pending',
        files: ['src/foo.ts'],
      },
      acceptanceCriteria: [],
      existingFiles: [],
      projectPatterns: '',
      workingDirectory: '/test',
    };

    const result = await runSingleTaskAgent(context);

    expect(result.scopeViolation).toBeDefined();
    expect(result.scopeViolation).toContain('src/unexpected.ts');
  });
});
