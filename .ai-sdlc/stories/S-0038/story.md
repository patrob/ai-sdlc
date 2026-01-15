---
id: S-0038
title: Multi-Process Orchestrator
priority: 4
status: backlog
type: feature
created: '2026-01-15'
labels:
  - concurrent-workflows
  - phase-3
  - infrastructure
epic: concurrent-workflows
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
slug: multi-process-orchestrator
---
# Multi-Process Orchestrator

## User Story

**As a** developer using ai-sdlc,
**I want** to run multiple stories from a single command,
**So that** I don't need multiple terminals to execute concurrent work.

## Summary

This is the core component of Phase 3: Orchestrated Concurrency. The orchestrator spawns child processes for each story, manages their lifecycle, coordinates IPC communication, and handles graceful shutdown.

## Context

This is the first story in **Phase 3: Orchestrated Concurrency** of the Concurrent Workflows epic.

**Depends on:** All Phase 2 stories (S-0035, S-0036, S-0037)
**Blocks:** S-0039 (IPC Protocol), S-0040 (Request Queue), S-0041 (Dashboard)

**Reference:** `docs/ROADMAP_TO_CONCURRENT_WORK.md` (Section 4, Architectural Approach)

## Acceptance Criteria

- [ ] New `src/core/orchestrator.ts` service
- [ ] `ai-sdlc run --concurrent <N>` runs N stories in parallel
- [ ] Child processes spawned via `fork()` with isolated `cwd` per worktree
- [ ] IPC channel established for status updates from children
- [ ] Process pool respects concurrency limit (queue excess stories)
- [ ] Graceful shutdown on SIGINT/SIGTERM (cleanup all children)
- [ ] Child crash doesn't crash parent (error isolation)
- [ ] Tests verify parallel execution with mocked agents
- [ ] All existing tests pass (`npm test`)
- [ ] TypeScript compilation succeeds (`npm run build`)

## Technical Notes

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                  Orchestrator Process                        │
│                                                              │
│  ┌──────────┐  ┌─────────────┐  ┌──────────────────────┐   │
│  │ Story    │  │ Process     │  │ Status Aggregator    │   │
│  │ Queue    │──│ Pool        │──│ (from IPC)           │   │
│  └──────────┘  └──────┬──────┘  └──────────────────────┘   │
└───────────────────────┼──────────────────────────────────────┘
                        │ fork() + IPC
        ┌───────────────┼───────────────┐
        ▼               ▼               ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│  Agent 1     │ │  Agent 2     │ │  Agent N     │
│  cwd: wt-001 │ │  cwd: wt-002 │ │  cwd: wt-00N │
└──────────────┘ └──────────────┘ └──────────────┘
```

### Core Implementation

```typescript
import { fork, ChildProcess } from 'child_process';
import PQueue from 'p-queue';

interface OrchestratorOptions {
  concurrency: number;
  onStatusUpdate?: (storyId: string, status: AgentStatus) => void;
  onComplete?: (storyId: string, result: ExecutionResult) => void;
  onError?: (storyId: string, error: Error) => void;
}

class Orchestrator {
  private agents: Map<string, ChildProcess> = new Map();
  private queue: PQueue;
  private options: OrchestratorOptions;

  constructor(options: OrchestratorOptions) {
    this.options = options;
    this.queue = new PQueue({ concurrency: options.concurrency });

    // Handle process termination
    process.on('SIGINT', () => this.shutdown());
    process.on('SIGTERM', () => this.shutdown());
  }

  async execute(stories: Story[]): Promise<ExecutionResult[]> {
    const results: ExecutionResult[] = [];

    const promises = stories.map(story =>
      this.queue.add(async () => {
        const result = await this.runAgent(story);
        results.push(result);
        return result;
      })
    );

    await Promise.all(promises);
    return results;
  }

  private async runAgent(story: Story): Promise<ExecutionResult> {
    // Create worktree for isolation
    const worktreePath = await worktreeService.create(story);

    return new Promise((resolve, reject) => {
      const child = fork(
        path.join(__dirname, 'agent-executor.js'),
        [story.id],
        {
          cwd: worktreePath,
          stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
          env: { ...process.env, AI_SDLC_STORY_ID: story.id }
        }
      );

      this.agents.set(story.id, child);

      // Handle IPC messages
      child.on('message', (msg: IPCMessage) => {
        if (msg.type === 'status') {
          this.options.onStatusUpdate?.(story.id, msg.payload);
        }
      });

      // Handle completion
      child.on('exit', (code) => {
        this.agents.delete(story.id);
        if (code === 0) {
          resolve({ storyId: story.id, success: true });
        } else {
          resolve({ storyId: story.id, success: false, exitCode: code });
        }
      });

      // Handle errors
      child.on('error', (err) => {
        this.agents.delete(story.id);
        this.options.onError?.(story.id, err);
        reject(err);
      });
    });
  }

  async shutdown(): Promise<void> {
    console.log('\nShutting down agents...');

    // Send SIGTERM to all children
    for (const [storyId, child] of this.agents) {
      console.log(`  Stopping ${storyId}...`);
      child.kill('SIGTERM');
    }

    // Wait for graceful shutdown (max 10s)
    await Promise.race([
      Promise.all([...this.agents.values()].map(
        child => new Promise(resolve => child.on('exit', resolve))
      )),
      new Promise(resolve => setTimeout(resolve, 10000))
    ]);

    // Force kill any remaining
    for (const child of this.agents.values()) {
      if (!child.killed) {
        child.kill('SIGKILL');
      }
    }

    process.exit(0);
  }
}
```

### Agent Executor (Child Process Entry Point)

```typescript
// src/core/agent-executor.ts
// This runs in the child process

const storyId = process.argv[2];

async function main() {
  // Send status updates to parent via IPC
  const sendStatus = (status: AgentStatus) => {
    process.send?.({ type: 'status', payload: status });
  };

  try {
    sendStatus({ phase: 'starting', progress: 0 });

    // Run the story workflow
    await runStoryWorkflow(storyId, {
      onProgress: (progress) => sendStatus({ phase: 'running', progress })
    });

    sendStatus({ phase: 'complete', progress: 100 });
    process.exit(0);
  } catch (error) {
    sendStatus({ phase: 'error', error: error.message });
    process.exit(1);
  }
}

main();
```

### CLI Integration

```typescript
program
  .command('run [storyId]')
  .option('-c, --concurrent <n>', 'Run N stories concurrently', '1')
  .option('--worktree', 'Run in isolated worktree')
  .action(async (storyId, options) => {
    const concurrency = parseInt(options.concurrent);

    if (concurrency > 1) {
      // Get stories to run (ready status, highest priority first)
      const stories = await getReadyStories(concurrency);

      const orchestrator = new Orchestrator({
        concurrency,
        onStatusUpdate: (id, status) => dashboard.update(id, status),
        onError: (id, err) => console.error(`${id} failed: ${err.message}`)
      });

      await orchestrator.execute(stories);
    } else {
      // Existing single-story flow
      await runSingleStory(storyId, options);
    }
  });
```

### Files to Create/Modify

- `src/core/orchestrator.ts` - New Orchestrator class
- `src/core/agent-executor.ts` - Child process entry point
- `src/index.ts` - Add `--concurrent` flag
- `src/types/index.ts` - Add orchestrator types
- `package.json` - Add `p-queue` dependency

## Edge Cases

1. **Child crashes**: Log error, continue with remaining stories
2. **All children crash**: Report aggregate failure, clean up
3. **Parent crashes**: Children become orphans (OS handles cleanup)
4. **SIGINT during startup**: Cancel queued stories, stop running ones
5. **Worktree creation fails**: Skip story, report error, continue

## Definition of Done

- [ ] Code review completed
- [ ] All tests passing (`npm test` shows 0 failures)
- [ ] TypeScript compilation succeeds (`npm run build`)
- [ ] Manual test: 3 stories run concurrently
- [ ] Graceful shutdown works correctly
- [ ] Error isolation verified (one crash doesn't affect others)

---

**Effort:** large
**Dependencies:** S-0035, S-0036, S-0037 (Phase 2)
**Blocks:** S-0039, S-0040, S-0041
