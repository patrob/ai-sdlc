import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  buildTaskContext,
  evaluateTaskResult,
  getNextTask,
  runImplementationOrchestrator,
} from './orchestrator.js';
import {
  ImplementationTask,
  TaskProgress,
  AgentTaskResult,
  OrchestratorResult,
} from '../types/index.js';

// Mock dependencies
vi.mock('../core/task-parser.js');
vi.mock('../core/task-progress.js');
vi.mock('./single-task.js');
vi.mock('child_process');
vi.mock('fs');

import { parseImplementationTasks } from '../core/task-parser.js';
import {
  getTaskProgress,
  updateTaskProgress,
  initializeTaskProgress,
  readStoryFile,
} from '../core/task-progress.js';
import { runSingleTaskAgent } from './single-task.js';
import { spawnSync } from 'child_process';
import * as fs from 'fs';

describe('orchestrator', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-16T10:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('buildTaskContext', () => {
    it('should extract relevant acceptance criteria for task files', () => {
      const task: ImplementationTask = {
        id: 'T1',
        description: 'Create auth service',
        status: 'pending',
        files: ['src/auth.ts', 'src/auth.test.ts'],
      };

      const storyContent = `
## Acceptance Criteria

- [ ] Create auth service in src/auth.ts
- [ ] Implement login function
- [ ] Add auth tests in src/auth.test.ts
- [ ] Create user service (unrelated)
      `;

      const context = buildTaskContext(task, storyContent, '/test/dir');

      expect(context.task).toBe(task);
      // Only criteria that mention files in task.files are matched:
      // - "Create auth service in src/auth.ts" matches src/auth.ts
      // - "Add auth tests in src/auth.test.ts" matches src/auth.test.ts
      // - "Implement login function" doesn't mention files, so no match
      expect(context.acceptanceCriteria).toHaveLength(2);
      expect(context.acceptanceCriteria[0]).toContain('auth service');
      expect(context.acceptanceCriteria).not.toContain(expect.stringContaining('user service'));
      expect(context.workingDirectory).toBe('/test/dir');
    });

    it('should include first 3 criteria when no file-specific matches', () => {
      const task: ImplementationTask = {
        id: 'T1',
        description: 'Generic task',
        status: 'pending',
        files: ['src/foo.ts'],
      };

      const storyContent = `
## Acceptance Criteria

- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Criterion 3
- [ ] Criterion 4
      `;

      const context = buildTaskContext(task, storyContent, '/test/dir');

      expect(context.acceptanceCriteria).toHaveLength(3);
      expect(context.acceptanceCriteria[0]).toBe('Criterion 1');
      expect(context.acceptanceCriteria[2]).toBe('Criterion 3');
    });

    it('should read existing files when they exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('export const foo = 42;');

      const task: ImplementationTask = {
        id: 'T1',
        description: 'Update foo',
        status: 'pending',
        files: ['src/foo.ts'],
      };

      const context = buildTaskContext(task, '', '/test/dir');

      expect(context.existingFiles).toHaveLength(1);
      expect(context.existingFiles[0].path).toBe('src/foo.ts');
      expect(context.existingFiles[0].content).toBe('export const foo = 42;');
    });

    it('should handle missing files gracefully', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const task: ImplementationTask = {
        id: 'T1',
        description: 'Create new file',
        status: 'pending',
        files: ['src/new.ts'],
      };

      const context = buildTaskContext(task, '', '/test/dir');

      expect(context.existingFiles).toHaveLength(0);
    });

    it('should truncate project patterns if too long', () => {
      const task: ImplementationTask = {
        id: 'T1',
        description: 'Task',
        status: 'pending',
      };

      const longPattern = 'a'.repeat(3000);
      const storyContent = `
## Technical Specification

${longPattern}
      `;

      const context = buildTaskContext(task, storyContent, '/test/dir');

      expect(context.projectPatterns.length).toBeLessThanOrEqual(2050);
      expect(context.projectPatterns).toContain('[... truncated for length]');
    });
  });

  describe('evaluateTaskResult', () => {
    const createTaskResult = (
      success: boolean,
      error?: string,
      verificationPassed = true,
      scopeViolation?: string[]
    ): AgentTaskResult => ({
      success,
      task: { id: 'T1', description: 'Task', status: 'in_progress' },
      filesChanged: [],
      verificationPassed,
      error,
      scopeViolation,
    });

    it('should return success for successful result', () => {
      const result = createTaskResult(true);
      expect(evaluateTaskResult(result, 1, 2)).toBe('success');
    });

    it('should return unrecoverable if max retries exceeded', () => {
      const result = createTaskResult(false, 'Test failed');
      expect(evaluateTaskResult(result, 3, 2)).toBe('unrecoverable');
    });

    it('should return unrecoverable for dependency errors', () => {
      const result = createTaskResult(false, 'Dependency not met: T2 must complete first');
      expect(evaluateTaskResult(result, 1, 2)).toBe('unrecoverable');
    });

    it('should return unrecoverable for impossible task', () => {
      const result = createTaskResult(false, 'This task is impossible to implement');
      expect(evaluateTaskResult(result, 1, 2)).toBe('unrecoverable');
    });

    it('should return unrecoverable for scope violations', () => {
      const result = createTaskResult(false, 'Modified files outside scope', true, [
        'src/other.ts',
      ]);
      expect(evaluateTaskResult(result, 1, 2)).toBe('unrecoverable');
    });

    it('should return recoverable for timeout errors', () => {
      const result = createTaskResult(false, 'Agent execution timed out');
      expect(evaluateTaskResult(result, 1, 2)).toBe('recoverable');
    });

    it('should return recoverable for API errors', () => {
      const result = createTaskResult(false, 'API rate limit exceeded');
      expect(evaluateTaskResult(result, 1, 2)).toBe('recoverable');
    });

    it('should return recoverable for verification failures', () => {
      const result = createTaskResult(false, 'Tests failed', false);
      expect(evaluateTaskResult(result, 1, 2)).toBe('recoverable');
    });

    it('should return recoverable for missing dependencies', () => {
      const result: AgentTaskResult = {
        ...createTaskResult(false, 'Missing file'),
        missingDependencies: ['src/config.ts'],
      };
      expect(evaluateTaskResult(result, 1, 2)).toBe('recoverable');
    });

    it('should default to recoverable for unknown errors', () => {
      const result = createTaskResult(false, 'Something went wrong');
      expect(evaluateTaskResult(result, 1, 2)).toBe('recoverable');
    });
  });

  describe('getNextTask', () => {
    const createTask = (
      id: string,
      dependencies: string[] = []
    ): ImplementationTask => ({
      id,
      description: `Task ${id}`,
      status: 'pending',
      dependencies,
    });

    const createProgress = (taskId: string, status: TaskProgress['status']): TaskProgress => ({
      taskId,
      status,
    });

    it('should return first pending task with no dependencies', () => {
      const tasks = [createTask('T1'), createTask('T2')];
      const progress = [createProgress('T1', 'pending'), createProgress('T2', 'pending')];

      const next = getNextTask(tasks, progress);
      expect(next?.id).toBe('T1');
    });

    it('should skip completed tasks', () => {
      const tasks = [createTask('T1'), createTask('T2')];
      const progress = [createProgress('T1', 'completed'), createProgress('T2', 'pending')];

      const next = getNextTask(tasks, progress);
      expect(next?.id).toBe('T2');
    });

    it('should wait for dependencies to complete', () => {
      // T1 is pending, T2 depends on T1, T3 has no deps
      // getNextTask should return T1 or T3 (both eligible), preferring first pending
      const tasks = [createTask('T1'), createTask('T2', ['T1']), createTask('T3')];
      const progress = [
        createProgress('T1', 'pending'),
        createProgress('T2', 'pending'),
        createProgress('T3', 'pending'),
      ];

      const next = getNextTask(tasks, progress);
      // T1 comes first and has no deps, so it's selected
      expect(next?.id).toBe('T1');
    });

    it('should prioritize in_progress tasks over pending', () => {
      // T1 is in_progress (resume), T3 is pending
      const tasks = [createTask('T1'), createTask('T2', ['T1']), createTask('T3')];
      const progress = [
        createProgress('T1', 'in_progress'),
        createProgress('T2', 'pending'),
        createProgress('T3', 'pending'),
      ];

      const next = getNextTask(tasks, progress);
      // T1 is in_progress, should be resumed first
      expect(next?.id).toBe('T1');
    });

    it('should return task with all dependencies completed', () => {
      const tasks = [createTask('T1'), createTask('T2', ['T1'])];
      const progress = [createProgress('T1', 'completed'), createProgress('T2', 'pending')];

      const next = getNextTask(tasks, progress);
      expect(next?.id).toBe('T2');
    });

    it('should prioritize in_progress tasks over pending', () => {
      const tasks = [createTask('T1'), createTask('T2')];
      const progress = [createProgress('T1', 'in_progress'), createProgress('T2', 'pending')];

      const next = getNextTask(tasks, progress);
      expect(next?.id).toBe('T1');
    });

    it('should return null when all tasks complete', () => {
      const tasks = [createTask('T1'), createTask('T2')];
      const progress = [createProgress('T1', 'completed'), createProgress('T2', 'completed')];

      const next = getNextTask(tasks, progress);
      expect(next).toBeNull();
    });

    it('should detect circular dependencies', () => {
      const tasks = [createTask('T1', ['T2']), createTask('T2', ['T1'])];
      const progress = [createProgress('T1', 'pending'), createProgress('T2', 'pending')];

      expect(() => getNextTask(tasks, progress)).toThrow(/circular dependency/i);
    });

    it('should handle multiple dependencies', () => {
      const tasks = [createTask('T1'), createTask('T2'), createTask('T3', ['T1', 'T2'])];
      const progress = [
        createProgress('T1', 'completed'),
        createProgress('T2', 'pending'),
        createProgress('T3', 'pending'),
      ];

      const next = getNextTask(tasks, progress);
      expect(next?.id).toBe('T2'); // T3 still waiting for T2
    });
  });

  describe('runImplementationOrchestrator', () => {
    beforeEach(() => {
      // Default mocks
      vi.mocked(readStoryFile).mockResolvedValue('Story content');
      vi.mocked(parseImplementationTasks).mockReturnValue([]);
      vi.mocked(getTaskProgress).mockResolvedValue([]);
      vi.mocked(initializeTaskProgress).mockResolvedValue();
      vi.mocked(updateTaskProgress).mockResolvedValue();
      vi.mocked(spawnSync).mockReturnValue({
        status: 0,
        stdout: '',
        stderr: '',
        error: undefined,
      } as any);
    });

    it('should return success with zero tasks when no tasks in plan', async () => {
      vi.mocked(parseImplementationTasks).mockReturnValue([]);

      const result = await runImplementationOrchestrator('/story.md', '/sdlc', {});

      expect(result.success).toBe(true);
      expect(result.tasksCompleted).toBe(0);
      expect(result.tasksFailed).toBe(0);
      expect(result.tasksRemaining).toBe(0);
    });

    it('should initialize progress tracking when missing', async () => {
      const tasks: ImplementationTask[] = [
        { id: 'T1', description: 'Task 1', status: 'pending' },
      ];

      vi.mocked(parseImplementationTasks).mockReturnValue(tasks);
      vi.mocked(getTaskProgress)
        .mockResolvedValueOnce([]) // First call: empty
        .mockResolvedValueOnce([{ taskId: 'T1', status: 'pending' }]); // After init

      vi.mocked(runSingleTaskAgent).mockResolvedValue({
        success: true,
        task: tasks[0],
        filesChanged: ['src/foo.ts'],
        verificationPassed: true,
      });

      await runImplementationOrchestrator('/story.md', '/sdlc', {});

      expect(initializeTaskProgress).toHaveBeenCalledWith('/story.md', ['T1']);
    });

    it('should complete all tasks successfully', async () => {
      const tasks: ImplementationTask[] = [
        { id: 'T1', description: 'Task 1', status: 'pending', files: ['src/foo.ts'] },
        { id: 'T2', description: 'Task 2', status: 'pending', files: ['src/bar.ts'] },
      ];

      vi.mocked(parseImplementationTasks).mockReturnValue(tasks);

      // Track task status changes dynamically
      const statuses: Record<string, TaskProgress['status']> = {
        T1: 'pending',
        T2: 'pending',
      };
      vi.mocked(updateTaskProgress).mockImplementation(async (_path, taskId, status) => {
        statuses[taskId] = status;
      });
      vi.mocked(getTaskProgress).mockImplementation(async () => [
        { taskId: 'T1', status: statuses['T1'] },
        { taskId: 'T2', status: statuses['T2'] },
      ]);

      vi.mocked(runSingleTaskAgent).mockResolvedValue({
        success: true,
        task: tasks[0],
        filesChanged: ['src/foo.ts'],
        verificationPassed: true,
      });

      const result = await runImplementationOrchestrator('/story.md', '/sdlc', {});

      expect(result.success).toBe(true);
      expect(result.tasksCompleted).toBe(2);
      expect(result.tasksFailed).toBe(0);
      expect(result.totalAgentInvocations).toBe(2);
    });

    it('should retry recoverable failures up to max retries', async () => {
      const tasks: ImplementationTask[] = [
        { id: 'T1', description: 'Task 1', status: 'pending', files: ['src/foo.ts'] },
      ];

      vi.mocked(parseImplementationTasks).mockReturnValue(tasks);

      // Track task status changes to simulate progress updates
      let t1Status: TaskProgress['status'] = 'pending';
      vi.mocked(updateTaskProgress).mockImplementation(async (_path, _taskId, status) => {
        t1Status = status;
      });
      vi.mocked(getTaskProgress).mockImplementation(async () => [{ taskId: 'T1', status: t1Status }]);

      // First attempt fails, second succeeds
      vi.mocked(runSingleTaskAgent)
        .mockResolvedValueOnce({
          success: false,
          task: tasks[0],
          filesChanged: [],
          verificationPassed: false,
          error: 'Tests failed (recoverable)',
        })
        .mockResolvedValueOnce({
          success: true,
          task: tasks[0],
          filesChanged: ['src/foo.ts'],
          verificationPassed: true,
        });

      const result = await runImplementationOrchestrator('/story.md', '/sdlc', {
        maxRetriesPerTask: 2,
      });

      expect(result.success).toBe(true);
      expect(result.totalAgentInvocations).toBe(2);
    });

    it('should fail task after max retries exceeded', async () => {
      const tasks: ImplementationTask[] = [
        { id: 'T1', description: 'Task 1', status: 'pending', files: ['src/foo.ts'] },
      ];

      vi.mocked(parseImplementationTasks).mockReturnValue(tasks);

      // Track task status changes to simulate progress updates
      let t1Status: TaskProgress['status'] = 'pending';
      vi.mocked(updateTaskProgress).mockImplementation(async (_path, _taskId, status) => {
        t1Status = status;
      });
      vi.mocked(getTaskProgress).mockImplementation(async () => [{ taskId: 'T1', status: t1Status }]);

      // All attempts fail
      vi.mocked(runSingleTaskAgent).mockResolvedValue({
        success: false,
        task: tasks[0],
        filesChanged: [],
        verificationPassed: false,
        error: 'Tests keep failing',
      });

      const result = await runImplementationOrchestrator('/story.md', '/sdlc', {
        maxRetriesPerTask: 2,
      });

      expect(result.success).toBe(false);
      expect(result.tasksFailed).toBe(1);
      expect(result.failedTasks).toHaveLength(1);
      expect(result.failedTasks[0].taskId).toBe('T1');
      expect(result.totalAgentInvocations).toBe(3); // Initial + 2 retries
    });

    it('should stop on unrecoverable failure when stopOnFirstFailure is true', async () => {
      const tasks: ImplementationTask[] = [
        { id: 'T1', description: 'Task 1', status: 'pending' },
        { id: 'T2', description: 'Task 2', status: 'pending' },
      ];

      vi.mocked(parseImplementationTasks).mockReturnValue(tasks);
      vi.mocked(getTaskProgress).mockImplementation(async () => {
        const call = vi.mocked(updateTaskProgress).mock.calls.length;
        if (call === 0) {
          return [
            { taskId: 'T1', status: 'pending' },
            { taskId: 'T2', status: 'pending' },
          ];
        } else {
          return [
            { taskId: 'T1', status: 'in_progress' },
            { taskId: 'T2', status: 'pending' },
          ];
        }
      });

      vi.mocked(runSingleTaskAgent).mockResolvedValue({
        success: false,
        task: tasks[0],
        filesChanged: [],
        verificationPassed: false,
        error: 'This task is impossible',
      });

      const result = await runImplementationOrchestrator('/story.md', '/sdlc', {
        stopOnFirstFailure: true,
      });

      expect(result.success).toBe(false);
      expect(result.tasksFailed).toBe(1);
      expect(result.tasksRemaining).toBe(1); // T2 not attempted
    });

    it('should skip commits in dry run mode', async () => {
      const tasks: ImplementationTask[] = [
        { id: 'T1', description: 'Task 1', status: 'pending', files: ['src/foo.ts'] },
      ];

      vi.mocked(parseImplementationTasks).mockReturnValue(tasks);

      // Track task status changes to simulate progress updates
      let t1Status: TaskProgress['status'] = 'pending';
      vi.mocked(updateTaskProgress).mockImplementation(async (_path, _taskId, status) => {
        t1Status = status;
      });
      vi.mocked(getTaskProgress).mockImplementation(async () => [{ taskId: 'T1', status: t1Status }]);

      const result = await runImplementationOrchestrator('/story.md', '/sdlc', {
        dryRun: true,
      });

      expect(result.success).toBe(true);
      expect(spawnSync).not.toHaveBeenCalled();
    });

    it('should skip commits when commitAfterEachTask is false', async () => {
      const tasks: ImplementationTask[] = [
        { id: 'T1', description: 'Task 1', status: 'pending', files: ['src/foo.ts'] },
      ];

      vi.mocked(parseImplementationTasks).mockReturnValue(tasks);
      vi.mocked(getTaskProgress).mockImplementation(async () => {
        const call = vi.mocked(updateTaskProgress).mock.calls.length;
        if (call <= 1) {
          return [{ taskId: 'T1', status: 'in_progress' }];
        } else {
          return [{ taskId: 'T1', status: 'completed' }];
        }
      });

      vi.mocked(runSingleTaskAgent).mockResolvedValue({
        success: true,
        task: tasks[0],
        filesChanged: ['src/foo.ts'],
        verificationPassed: true,
      });

      await runImplementationOrchestrator('/story.md', '/sdlc', {
        commitAfterEachTask: false,
      });

      expect(spawnSync).not.toHaveBeenCalledWith('git', expect.anything(), expect.anything());
    });
  });
});
