import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runImplementationOrchestrator } from '../../src/agents/orchestrator.js';
import * as fs from 'fs';
import * as path from 'path';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { rm } from 'fs/promises';

// Mock single-task agent to control execution
vi.mock('../../src/agents/single-task.js');
import { runSingleTaskAgent } from '../../src/agents/single-task.js';
import { AgentTaskResult, ImplementationTask } from '../../src/types/index.js';

// Mock git operations
vi.mock('child_process', async () => {
  const actual = await vi.importActual<typeof import('child_process')>('child_process');
  return {
    ...actual,
    spawnSync: vi.fn((cmd, args, opts) => {
      // Mock git commands
      if (cmd === 'git') {
        return {
          status: 0,
          stdout: '',
          stderr: '',
          error: undefined,
        };
      }
      return actual.spawnSync(cmd, args, opts);
    }),
  };
});

describe('orchestrator integration', () => {
  let tempDir: string;
  let storyPath: string;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-16T10:00:00Z'));

    // Create temp directory for test files
    tempDir = mkdtempSync(path.join(tmpdir(), 'orch-test-'));
    const storyDir = path.join(tempDir, '.ai-sdlc', 'stories', 'S-TEST');
    fs.mkdirSync(storyDir, { recursive: true });
    storyPath = path.join(storyDir, 'story.md');
  });

  afterEach(async () => {
    vi.useRealTimers();
    vi.clearAllMocks();
    // Clean up temp directory
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('should complete full orchestration flow with 3 tasks', async () => {
    // Create story file with implementation plan
    const storyContent = `---
id: S-TEST
title: Test Story
---

## Acceptance Criteria

- [ ] Create foo service
- [ ] Create bar service
- [ ] Integrate foo and bar

## Implementation Tasks

- [ ] **T1**: Create foo service
  - Files: \`src/foo.ts\`
  - Dependencies: none

- [ ] **T2**: Create bar service
  - Files: \`src/bar.ts\`
  - Dependencies: none

- [ ] **T3**: Integrate services
  - Files: \`src/integration.ts\`
  - Dependencies: T1, T2
`;
    fs.writeFileSync(storyPath, storyContent);

    // Mock agent to succeed for all tasks
    let taskCallCount = 0;
    vi.mocked(runSingleTaskAgent).mockImplementation(async (context) => {
      taskCallCount++;
      return {
        success: true,
        task: context.task,
        filesChanged: context.task.files || [],
        verificationPassed: true,
      } as AgentTaskResult;
    });

    const result = await runImplementationOrchestrator(storyPath, tempDir, {
      commitAfterEachTask: true,
    });

    expect(result.success).toBe(true);
    expect(result.tasksCompleted).toBe(3);
    expect(result.tasksFailed).toBe(0);
    expect(result.tasksRemaining).toBe(0);
    expect(result.totalAgentInvocations).toBe(3);
    expect(taskCallCount).toBe(3);

    // Verify progress table was created
    const finalContent = fs.readFileSync(storyPath, 'utf-8');
    expect(finalContent).toContain('## Task Progress');
    expect(finalContent).toContain('| T1 | completed |');
    expect(finalContent).toContain('| T2 | completed |');
    expect(finalContent).toContain('| T3 | completed |');
  });

  it('should resume from last incomplete task after interruption', async () => {
    // Create story with task progress indicating T1 complete, T2 in_progress
    const storyContent = `---
id: S-TEST
title: Test Story
---

## Implementation Tasks

- [x] **T1**: First task
  - Files: \`src/foo.ts\`
  - Dependencies: none

- [ ] **T2**: Second task
  - Files: \`src/bar.ts\`
  - Dependencies: T1

- [ ] **T3**: Third task
  - Files: \`src/baz.ts\`
  - Dependencies: T2

## Task Progress

| Task | Status | Started | Completed |
|------|--------|---------|-----------|
| T1 | completed | 2026-01-16T10:00:00Z | 2026-01-16T10:05:00Z |
| T2 | in_progress | 2026-01-16T10:05:30Z | - |
| T3 | pending | - | - |
`;
    fs.writeFileSync(storyPath, storyContent);

    // Mock agent
    const executedTasks: string[] = [];
    vi.mocked(runSingleTaskAgent).mockImplementation(async (context) => {
      executedTasks.push(context.task.id);
      return {
        success: true,
        task: context.task,
        filesChanged: context.task.files || [],
        verificationPassed: true,
      } as AgentTaskResult;
    });

    const result = await runImplementationOrchestrator(storyPath, tempDir, {});

    expect(result.success).toBe(true);
    expect(result.tasksCompleted).toBe(3); // All 3 tasks now complete (T1 was already done)
    expect(result.totalAgentInvocations).toBe(2); // Only T2 and T3 were executed
    expect(executedTasks).toEqual(['T2', 'T3']); // T1 skipped
  });

  it('should checkpoint progress after each task', async () => {
    const storyContent = `---
id: S-TEST
title: Test Story
---

## Implementation Tasks

- [ ] **T1**: Task one
  - Files: \`src/foo.ts\`
  - Dependencies: none

- [ ] **T2**: Task two
  - Files: \`src/bar.ts\`
  - Dependencies: none
`;
    fs.writeFileSync(storyPath, storyContent);

    // Mock agent
    vi.mocked(runSingleTaskAgent).mockImplementation(async (context) => {
      const result: AgentTaskResult = {
        success: true,
        task: context.task,
        filesChanged: context.task.files || [],
        verificationPassed: true,
      };

      return result;
    });

    await runImplementationOrchestrator(storyPath, tempDir, {});

    // After orchestration completes, verify final state shows both tasks completed
    const finalContent = fs.readFileSync(storyPath, 'utf-8');
    expect(finalContent).toContain('| T1 | completed |');
    expect(finalContent).toContain('| T2 | completed |');
  });

  it('should stop and report errors on task failure', async () => {
    const storyContent = `---
id: S-TEST
title: Test Story
---

## Implementation Tasks

- [ ] **T1**: Success task
  - Files: \`src/foo.ts\`
  - Dependencies: none

- [ ] **T2**: Failing task
  - Files: \`src/bar.ts\`
  - Dependencies: none

- [ ] **T3**: Never reached
  - Files: \`src/baz.ts\`
  - Dependencies: none
`;
    fs.writeFileSync(storyPath, storyContent);

    // T1 succeeds, T2 fails unrecoverably
    vi.mocked(runSingleTaskAgent).mockImplementation(async (context) => {
      if (context.task.id === 'T1') {
        return {
          success: true,
          task: context.task,
          filesChanged: ['src/foo.ts'],
          verificationPassed: true,
        } as AgentTaskResult;
      } else {
        return {
          success: false,
          task: context.task,
          filesChanged: [],
          verificationPassed: false,
          error: 'This task is impossible to implement',
        } as AgentTaskResult;
      }
    });

    const result = await runImplementationOrchestrator(storyPath, tempDir, {
      stopOnFirstFailure: true,
    });

    expect(result.success).toBe(false);
    expect(result.tasksCompleted).toBe(1);
    expect(result.tasksFailed).toBe(1);
    expect(result.tasksRemaining).toBe(1);
    expect(result.failedTasks).toHaveLength(1);
    expect(result.failedTasks[0].taskId).toBe('T2');
    expect(result.failedTasks[0].error).toContain('impossible');
  });

  it('should create git commits after successful tasks', async () => {
    const storyContent = `---
id: S-TEST
title: Test Story
---

## Implementation Tasks

- [ ] **T1**: Create service
  - Files: \`src/service.ts\`
  - Dependencies: none
`;
    fs.writeFileSync(storyPath, storyContent);

    vi.mocked(runSingleTaskAgent).mockResolvedValue({
      success: true,
      task: { id: 'T1', description: 'Create service', status: 'pending', files: ['src/service.ts'] },
      filesChanged: ['src/service.ts'],
      verificationPassed: true,
    } as AgentTaskResult);

    const { spawnSync } = await import('child_process');

    await runImplementationOrchestrator(storyPath, tempDir, {
      commitAfterEachTask: true,
    });

    // Verify git add and git commit were called
    const calls = vi.mocked(spawnSync).mock.calls;
    const gitAddCall = calls.find((call) => call[0] === 'git' && call[1]?.[0] === 'add');
    const gitCommitCall = calls.find((call) => call[0] === 'git' && call[1]?.[0] === 'commit');

    expect(gitAddCall).toBeDefined();
    expect(gitCommitCall).toBeDefined();
    expect(gitCommitCall?.[1]).toEqual([
      'commit',
      '-m',
      expect.stringContaining('T1'),
    ]);
  });

  it('should handle dry run mode without executing agents', async () => {
    const storyContent = `---
id: S-TEST
title: Test Story
---

## Implementation Tasks

- [ ] **T1**: Task one
  - Files: \`src/foo.ts\`
  - Dependencies: none
`;
    fs.writeFileSync(storyPath, storyContent);

    vi.mocked(runSingleTaskAgent).mockRejectedValue(new Error('Should not be called'));

    const result = await runImplementationOrchestrator(storyPath, tempDir, {
      dryRun: true,
    });

    // Dry run should simulate success without calling agent
    expect(result.success).toBe(true);
    expect(runSingleTaskAgent).not.toHaveBeenCalled();
  });

  it('should respect dependency order in execution', async () => {
    const storyContent = `---
id: S-TEST
title: Test Story
---

## Implementation Tasks

- [ ] **T1**: Base task
  - Files: \`src/base.ts\`
  - Dependencies: none

- [ ] **T2**: Depends on T1
  - Files: \`src/derived.ts\`
  - Dependencies: T1

- [ ] **T3**: Depends on T2
  - Files: \`src/final.ts\`
  - Dependencies: T2
`;
    fs.writeFileSync(storyPath, storyContent);

    const executionOrder: string[] = [];
    vi.mocked(runSingleTaskAgent).mockImplementation(async (context) => {
      executionOrder.push(context.task.id);
      return {
        success: true,
        task: context.task,
        filesChanged: context.task.files || [],
        verificationPassed: true,
      } as AgentTaskResult;
    });

    await runImplementationOrchestrator(storyPath, tempDir, {});

    // Verify execution order respects dependencies
    expect(executionOrder).toEqual(['T1', 'T2', 'T3']);
  });
});
