# Roadmap to Concurrent Agent Work

> **Status:** Planning
> **Authors:** Product Owner & Tech Lead Collaboration
> **Date:** January 2026

## Executive Summary

This document outlines the path from the current sequential execution model to supporting multiple AI agents working concurrently on independent stories. The foundation being built with worktrees (S-0029 through S-0032) provides filesystem isolation, but true concurrent execution requires additional infrastructure for process isolation, state management, resource coordination, and user observability.

**Core thesis:** Concurrent agent work delivers meaningful value (2-3x throughput) for users with genuinely independent stories, but introduces complexity that must be carefully managed through conservative defaults, conflict detection, and excellent error recovery.

---

## Table of Contents

1. [Value Proposition](#1-value-proposition)
2. [Current Architecture](#2-current-architecture)
3. [Technical Challenges](#3-technical-challenges)
4. [Architectural Approach](#4-architectural-approach)
5. [Phased Roadmap](#5-phased-roadmap)
6. [Story Breakdown](#6-story-breakdown)
7. [Risk Analysis](#7-risk-analysis)
8. [Success Criteria](#8-success-criteria)
9. [Open Questions](#9-open-questions)

---

## 1. Value Proposition

### Why Concurrent Agents?

| Scenario | Sequential Time | Concurrent Time | Value |
|----------|-----------------|-----------------|-------|
| 3 independent bug fixes | 3 hours | 1.5 hours | 50% time savings |
| 5 microservice features | 10 hours | 3 hours | 70% time savings |
| Research + implementation split | 4 hours | 2.5 hours | 37% time savings |

### Target Use Cases

**High-Value (Independent Work):**
- Multiple bug fixes in different files/modules
- Features across separate microservices
- Parallel research tasks for different stories
- Non-overlapping refactoring efforts

**Lower-Value (Likely Conflicts):**
- Multiple features touching shared components
- Dependent stories (A requires B)
- Stories modifying the same files

### User Personas

1. **Solo Developer with Multiple Stories**
   - Wants to "set and forget" multiple stories
   - Needs clear status visibility
   - Values time compression over control

2. **Team Lead Delegating Work**
   - Assigns independent stories to agents
   - Monitors progress across the board
   - Needs conflict warnings before they happen

3. **Rapid Prototyper**
   - Exploring multiple approaches in parallel
   - Comfortable with potential conflicts
   - Values speed over safety

---

## 2. Current Architecture

### Execution Model (Sequential)

```
┌─────────────────────────────────────────────────────────┐
│                   CLI Process (single)                   │
│                                                          │
│   run(story) ──► action loop ──► Claude API ──► repeat   │
│                                                          │
│   Global State:                                          │
│   - process.cwd()                                        │
│   - .workflow-state.json (single file)                   │
│   - Single ora spinner                                   │
└─────────────────────────────────────────────────────────┘
```

### Worktree Foundation (Phase 0)

The current worktree stories (S-0029 through S-0032) provide:

| Component | What It Does | Limitation |
|-----------|--------------|------------|
| `worktree.ts` | Creates isolated git worktrees | One at a time |
| Branch isolation | `ai-sdlc/{storyId}-{slug}` | No coordination |
| Path isolation | `.ai-sdlc/worktrees/{id}/` | No concurrent access |
| `--worktree` flag | Opt-in worktree mode | Sequential only |

**What worktrees give us:** Filesystem isolation per story.
**What worktrees don't give us:** Concurrent process execution.

---

## 3. Technical Challenges

### 3.1 Process Isolation

**Problem:** `process.chdir()` is global to the Node.js process.

```typescript
// Current: affects entire process
process.chdir(worktreePath);
// All subsequent file operations use this path
```

**Implication:** Cannot run multiple stories in the same process.

### 3.2 State Management

| State Type | Current Location | Concurrency Issue |
|------------|------------------|-------------------|
| Story frontmatter | `stories/{id}/story.md` | Write conflicts |
| Workflow state | `.workflow-state.json` | Single file, no locking |
| Board state | Computed from filesystem | Race conditions |
| Git operations | Working directory | Branch conflicts |

### 3.3 Resource Contention

**Claude API:**
- Rate limits per organization
- N concurrent stories = N concurrent API streams
- Need request queuing/throttling

**Terminal Output:**
- Single spinner assumption (`ora`)
- Status updates overwrite each other
- Need multi-line dashboard

**Disk Space:**
- Each worktree ≈ full repo size
- N concurrent = N × repo size
- Need lifecycle management

### 3.4 Conflict Detection

```
Story A modifies: src/utils/helper.ts, src/api/user.ts
Story B modifies: src/api/user.ts, src/api/auth.ts
                         ↑
                   Conflict zone
```

**Required:** Detect file overlap before stories conflict.

---

## 4. Architectural Approach

### Recommended: Orchestrator Pattern

```
┌─────────────────────────────────────────────────────────┐
│                  Orchestrator Process                    │
│                                                          │
│  ┌──────────┐  ┌─────────────┐  ┌──────────────────┐   │
│  │ Priority │  │ Coordinator │  │ Status Dashboard │   │
│  │  Queue   │──│    (IPC)    │──│   (Terminal)     │   │
│  └──────────┘  └──────┬──────┘  └──────────────────┘   │
└───────────────────────┼─────────────────────────────────┘
                        │ fork() + IPC
        ┌───────────────┼───────────────┐
        ▼               ▼               ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│  Agent 1     │ │  Agent 2     │ │  Agent N     │
│  cwd: wt-001 │ │  cwd: wt-002 │ │  cwd: wt-00N │
│  story: S-001│ │  story: S-002│ │  story: S-00N│
└──────────────┘ └──────────────┘ └──────────────┘
```

### Why This Pattern?

| Alternative | Pros | Cons |
|-------------|------|------|
| Worker Threads | Lower overhead | Shared memory complexity |
| External Queue (Redis) | Proven, scalable | External dependency |
| Sequential Loop | Simple | No parallelism |
| **Child Processes** | **Clean isolation** | Process spawn overhead |

**Decision:** Child processes via `fork()` balance isolation with simplicity.

### Key Components

1. **Orchestrator** - Parent process that manages concurrent executions
2. **Agent Executor** - Child process that runs a single story
3. **IPC Protocol** - Structured messages between parent and children
4. **Status Dashboard** - Real-time multi-story progress display
5. **Conflict Detector** - Pre-flight check for file overlap
6. **Request Queue** - API rate limiting across all agents

---

## 5. Phased Roadmap

### Phase 0: Worktree Foundation (Current)

**Stories:** S-0029, S-0030, S-0031, S-0032

**Goal:** Enable filesystem isolation per story via git worktrees.

**Deliverables:**
- [x] S-0029: Core worktree creation service
- [ ] S-0030: Configuration options for worktree behavior
- [ ] S-0031: Management commands (list, remove)
- [ ] S-0032: Lifecycle cleanup prompts

**Exit Criteria:** User can run a story in an isolated worktree with `--worktree`.

---

### Phase 1: Isolation Hardening

**Goal:** Ensure state and resources are isolated per story.

**Prerequisites:** Phase 0 complete

**Stories:**

| ID | Title | Description |
|----|-------|-------------|
| S-TBD | Per-Story Workflow State | Move `.workflow-state.json` to story directory |
| S-TBD | Atomic Story Updates | Add file locking for frontmatter writes |
| S-TBD | Git State Validation | Ensure clean git state before operations |

**Exit Criteria:** Two stories can safely modify state without corruption (tested sequentially).

---

### Phase 2: Concurrent Execution MVP

**Goal:** Enable manually starting multiple agents in separate terminals.

**Prerequisites:** Phase 1 complete

**Stories:**

| ID | Title | Description |
|----|-------|-------------|
| S-TBD | Conflict Detection Service | Analyze stories for file overlap |
| S-TBD | Pre-Flight Conflict Warning | Warn user before starting conflicting stories |
| S-TBD | Concurrent-Safe Logging | Per-story log files for output |

**Exit Criteria:** User can safely run `ai-sdlc run --worktree S-0001` in one terminal and `ai-sdlc run --worktree S-0002` in another.

**User Experience:**
```bash
# Terminal 1
$ ai-sdlc run --worktree S-0001
⚠️  Conflict check: No overlapping files with active stories
✓ Starting in worktree: .ai-sdlc/worktrees/S-0001-feature-a/
[Agent output...]

# Terminal 2
$ ai-sdlc run --worktree S-0002
⚠️  Conflict check: S-0002 may conflict with S-0001 (shared: src/api/user.ts)
   Continue anyway? [y/N]
```

---

### Phase 3: Orchestrated Concurrency

**Goal:** Single command to run multiple stories concurrently.

**Prerequisites:** Phase 2 validated with alpha users

**Stories:**

| ID | Title | Description |
|----|-------|-------------|
| S-TBD | Multi-Process Orchestrator | Parent process managing child agents |
| S-TBD | IPC Status Protocol | Structured status messages |
| S-TBD | Agent Request Queue | Rate limiting across concurrent agents |
| S-TBD | Terminal Dashboard | Multi-story progress display |

**Exit Criteria:** User can run `ai-sdlc run --concurrent 3` to process 3 stories in parallel.

**User Experience:**
```bash
$ ai-sdlc run --concurrent 3

┌─────────────────────────────────────────────────────────┐
│ AI-SDLC Concurrent Execution                   [3/3 active]│
├─────────────────────────────────────────────────────────┤
│ S-0001 [Implement] ████████░░ 80%  auth feature          │
│ S-0002 [Research]  ███░░░░░░░ 30%  caching strategy      │
│ S-0003 [Plan]      ██████████ done  API refactor         │
├─────────────────────────────────────────────────────────┤
│ Queue: 2 pending │ API calls: 3/5 │ Est: 12 min          │
└─────────────────────────────────────────────────────────┘
```

---

### Phase 4: Advanced Scheduling

**Goal:** Intelligent story prioritization and resource management.

**Prerequisites:** Phase 3 stable in production

**Stories:**

| ID | Title | Description |
|----|-------|-------------|
| S-TBD | Priority-Based Scheduling | High priority stories run first |
| S-TBD | Dependency-Aware Scheduling | Don't run story if dependencies incomplete |
| S-TBD | Auto-Scale Concurrency | Adjust based on API rate limits |
| S-TBD | Worktree Lifecycle Limits | Auto-cleanup based on age/count/size |

**Exit Criteria:** System intelligently schedules work without user intervention.

---

## 6. Story Breakdown

### Phase 1 Stories (Detail)

#### S-TBD: Per-Story Workflow State

**As a** developer
**I want** workflow state isolated per story
**So that** concurrent executions don't corrupt shared state

**Acceptance Criteria:**
- [ ] `.workflow-state.json` moves to `stories/{id}/.workflow-state.json`
- [ ] `loadWorkflowState()` accepts optional `storyId` parameter
- [ ] `saveWorkflowState()` writes to story-specific location
- [ ] Migration handles existing global state file
- [ ] Tests verify isolation between two story states

**Technical Notes:**
```typescript
// Before
const state = loadWorkflowState(sdlcRoot);

// After
const state = loadWorkflowState(sdlcRoot, storyId);
// Stored at: {sdlcRoot}/stories/{storyId}/.workflow-state.json
```

---

#### S-TBD: Atomic Story Updates

**As a** developer
**I want** story file updates to be atomic
**So that** concurrent reads/writes don't corrupt frontmatter

**Acceptance Criteria:**
- [ ] Add `proper-lockfile` dependency
- [ ] `updateStoryFrontmatter()` acquires lock before read-modify-write
- [ ] Lock timeout configurable (default 5s)
- [ ] Lock conflicts logged with helpful message
- [ ] Tests verify two concurrent writers don't corrupt file

**Technical Notes:**
```typescript
import { lock } from 'proper-lockfile';

async function updateStoryFrontmatter(storyPath: string, updates: Partial<Frontmatter>) {
  const release = await lock(storyPath, { retries: 3 });
  try {
    const current = parseStory(storyPath);
    const updated = { ...current.frontmatter, ...updates };
    writeStory({ ...current, frontmatter: updated });
  } finally {
    release();
  }
}
```

---

#### S-TBD: Conflict Detection Service

**As a** developer
**I want** to know if two stories might conflict before running them
**So that** I can avoid merge hell

**Acceptance Criteria:**
- [ ] New `src/core/conflict-detector.ts` service
- [ ] `detectConflicts(stories: Story[])` returns overlapping files
- [ ] Uses `git diff --name-only` to compare branches
- [ ] Handles stories without branches (assumes no conflict)
- [ ] Tests verify detection of shared file modifications

**Technical Notes:**
```typescript
interface ConflictAnalysis {
  storyA: string;
  storyB: string;
  sharedFiles: string[];
  severity: 'high' | 'medium' | 'low';  // Based on file count and type
}

async function detectConflicts(stories: Story[]): Promise<ConflictAnalysis[]>;
```

---

### Phase 3 Stories (Detail)

#### S-TBD: Multi-Process Orchestrator

**As a** developer
**I want** to run multiple stories from a single command
**So that** I don't need multiple terminals

**Acceptance Criteria:**
- [ ] New `src/core/orchestrator.ts` service
- [ ] `Orchestrator.execute(stories, { concurrency })` runs N stories in parallel
- [ ] Child processes spawned via `fork()` with isolated `cwd`
- [ ] IPC channel for status updates from children
- [ ] Graceful shutdown on SIGINT (cleanup all children)
- [ ] Tests verify parallel execution with mocked agent

**Technical Notes:**
```typescript
class Orchestrator {
  private agents: Map<string, ChildProcess> = new Map();

  async execute(stories: Story[], opts: { concurrency: number }): Promise<ExecutionResult[]> {
    const queue = new PQueue({ concurrency: opts.concurrency });
    return Promise.all(stories.map(s => queue.add(() => this.runAgent(s))));
  }

  private runAgent(story: Story): Promise<ExecutionResult> {
    const worktreePath = await worktreeService.create(story);
    const child = fork('./agent-executor.js', [story.id], {
      cwd: worktreePath,
      stdio: ['pipe', 'pipe', 'pipe', 'ipc']
    });
    // Handle IPC messages, completion, errors
  }
}
```

---

#### S-TBD: Terminal Dashboard

**As a** developer
**I want** to see all concurrent stories' progress at once
**So that** I can monitor multiple agents without switching terminals

**Acceptance Criteria:**
- [ ] Multi-line status display using `log-update` or `blessed`
- [ ] Each story shows: ID, action, progress, worktree path
- [ ] Footer shows: queue depth, active count, API usage
- [ ] Updates in real-time as agents report progress
- [ ] Degrades gracefully to simple output if terminal doesn't support ANSI

**Technical Notes:**
```typescript
interface DashboardState {
  stories: Array<{
    id: string;
    action: ActionType;
    progress: number;  // 0-100
    status: 'running' | 'done' | 'failed' | 'queued';
  }>;
  queueDepth: number;
  apiCallsActive: number;
  apiCallsLimit: number;
}

class Dashboard {
  render(state: DashboardState): void;
  update(storyId: string, update: Partial<StoryStatus>): void;
}
```

---

## 7. Risk Analysis

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **Merge conflicts** | High | High | Pre-flight conflict detection, warnings |
| **API rate limiting** | High | Medium | Request queue with exponential backoff |
| **Cognitive overload** | Medium | Medium | Conservative defaults, clear dashboard |
| **Disk exhaustion** | Medium | Medium | Worktree limits, auto-cleanup |
| **Process zombies** | Low | High | Health checks, proper SIGTERM handling |
| **State corruption** | Low | Critical | File locking, atomic updates |
| **False promise** | Medium | High | Clear documentation on when to use |

### Risk Mitigation Strategy

1. **Conservative Defaults**
   - Sequential remains the default
   - `--concurrent` is explicit opt-in
   - Default concurrency of 2-3, not unlimited

2. **Clear Warnings**
   - Conflict detection before execution
   - Explicit user consent for risky operations
   - Dashboard shows potential issues prominently

3. **Excellent Recovery**
   - Per-story checkpoints for crash recovery
   - Clear error messages with resolution steps
   - `ai-sdlc cleanup` for stuck state

---

## 8. Success Criteria

### Phase 2 MVP (Manual Concurrency)

| Metric | Target | How to Measure |
|--------|--------|----------------|
| Alpha user satisfaction | 4/5+ | Post-usage survey |
| Conflict rate | <30% of sessions | Telemetry |
| Time savings | 30%+ for 2+ stories | User interviews |
| Error recovery success | 80%+ | Support tickets |

### Phase 3 (Orchestrated Concurrency)

| Metric | Target | How to Measure |
|--------|--------|----------------|
| Throughput improvement | 2x for 3 stories | Benchmarking |
| Dashboard usability | 4/5+ | User testing |
| Crash recovery rate | 95%+ | Automated tests |
| API efficiency | <10% wasted calls | Metrics |

### Go/No-Go Gates

**Phase 1 → Phase 2:**
- All Phase 1 stories complete
- No state corruption in testing
- Clear user demand signal

**Phase 2 → Phase 3:**
- 5+ alpha users tested
- 4/5+ satisfaction score
- <30% conflict rate
- Time savings validated

**Phase 3 → Phase 4:**
- Orchestrator stable (2+ weeks)
- Dashboard usability validated
- No critical bugs in production

---

## 9. Open Questions

### Product Questions

1. **Who is the primary target user?**
   - Solo developers? Teams? Enterprise?
   - Answer affects UX complexity

2. **What's the acceptable conflict rate?**
   - At what rate does the feature lose value?
   - Informs conflict detection strictness

3. **How do we handle dependent stories?**
   - Block? Warn? Auto-sequence?
   - Affects scheduling complexity

### Technical Questions

1. **How do we handle long-running agents?**
   - Timeout after N hours?
   - User notification?

2. **What's the IPC protocol?**
   - JSON-RPC? Custom schema?
   - Affects extensibility

3. **How do we handle partial failures?**
   - 2 of 3 succeed, 1 fails
   - Retry? Rollback? Continue?

4. **Should we support remote/distributed execution?**
   - Multiple machines?
   - Cloud agents?
   - Defer to Phase 5+?

---

## Appendix: Alternative Approaches Considered

### A. Worker Threads Instead of Processes

**Pros:** Lower memory overhead, shared state possible
**Cons:** `process.chdir()` still global, complex isolation
**Decision:** Rejected - isolation benefits outweigh overhead costs

### B. External Queue (Redis/BullMQ)

**Pros:** Battle-tested, scalable, persistence
**Cons:** External dependency, overkill for local dev
**Decision:** Deferred - consider for distributed execution (Phase 5+)

### C. Actor Model (xstate)

**Pros:** Elegant state machines, natural fit for stories
**Cons:** Significant architectural change, learning curve
**Decision:** Deferred - reconsider if process model proves limiting

### D. Docker Containers per Story

**Pros:** Ultimate isolation, reproducible environments
**Cons:** Heavy overhead, Docker dependency
**Decision:** Rejected - too heavy for the problem

---

## Document History

| Date | Author | Changes |
|------|--------|---------|
| 2026-01-15 | PO/TL | Initial version |
