import { spawnSync } from 'child_process';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { afterEach,beforeEach, describe, expect, it, vi } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
import * as clientModule from '../core/client.js';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { type ImplementationTask,TaskContext } from '../types/index.js';
import {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  buildTaskPrompt,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  detectMissingDependencies,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  detectScopeViolation,
  parseTaskResult,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  runSingleTaskAgent,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  TASK_AGENT_SYSTEM_PROMPT,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  validateFilePaths,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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

describe('parseTaskResult', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should extract files changed from git diff', async () => {
    const mockSpawnSync = vi.mocked(spawnSync);
    mockSpawnSync.mockImplementation((cmd, args) => {
      if (args?.[0] === 'diff' && args?.[1] === '--name-only') {
        return {
          status: 0,
          stdout: 'src/foo.ts\nsrc/bar.ts\n',
          stderr: '',
          error: undefined,
          signal: null,
          output: [],
          pid: 0,
        } as any;
      }
      // Default for other calls (tsc, eslint)
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

    const task: ImplementationTask = {
      id: 'T1',
      description: 'Test task',
      status: 'pending',
      files: ['src/foo.ts', 'src/bar.ts'],
    };

    const result = await parseTaskResult('Agent output', task, '/test');

    expect(result.filesChanged).toEqual(['src/foo.ts', 'src/bar.ts']);
  });

  it('should detect scope violations', async () => {
    const mockSpawnSync = vi.mocked(spawnSync);
    mockSpawnSync.mockImplementation((cmd, args) => {
      if (args?.[0] === 'diff' && args?.[1] === '--name-only') {
        return {
          status: 0,
          stdout: 'src/foo.ts\nsrc/bar.ts\nsrc/unexpected.ts\n',
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

    const task: ImplementationTask = {
      id: 'T1',
      description: 'Test task',
      status: 'pending',
      files: ['src/foo.ts'],
    };

    const result = await parseTaskResult('Agent output', task, '/test');

    expect(result.scopeViolation).toBeDefined();
    expect(result.scopeViolation).toContain('src/bar.ts');
    expect(result.scopeViolation).toContain('src/unexpected.ts');
  });

  it('should include verification results', async () => {
    const mockSpawnSync = vi.mocked(spawnSync);
    mockSpawnSync.mockImplementation((cmd, args) => {
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
          stderr: 'TypeScript error',
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

    const task: ImplementationTask = {
      id: 'T1',
      description: 'Test task',
      status: 'pending',
      files: ['src/foo.ts'],
    };

    const result = await parseTaskResult('Agent output', task, '/test');

    expect(result.verificationPassed).toBe(false);
    expect(result.error).toContain('TypeScript error');
  });

  it('should return success=false when no files modified', async () => {
    const mockSpawnSync = vi.mocked(spawnSync);
    mockSpawnSync.mockImplementation((cmd, args) => {
      if (args?.[0] === 'diff' && args?.[1] === '--name-only') {
        return {
          status: 0,
          stdout: '',
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

    const task: ImplementationTask = {
      id: 'T1',
      description: 'Test task',
      status: 'pending',
    };

    const result = await parseTaskResult('Agent output', task, '/test');

    expect(result.success).toBe(false);
    expect(result.error).toContain('No files were modified');
  });

  it('should handle malformed output gracefully', async () => {
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

    const task: ImplementationTask = {
      id: 'T1',
      description: 'Test task',
      status: 'pending',
      files: ['src/foo.ts'],
    };

    // Even with nonsensical agent output, should parse git diff correctly
    const result = await parseTaskResult('???invalid???', task, '/test');

    expect(result.filesChanged).toEqual(['src/foo.ts']);
    expect(result.agentOutput).toBe('???invalid???');
  });
});
