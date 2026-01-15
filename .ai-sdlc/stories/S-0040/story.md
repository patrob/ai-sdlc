---
id: S-0040
title: Agent Request Queue
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
slug: agent-request-queue
---
# Agent Request Queue

## User Story

**As a** developer running multiple agents concurrently,
**I want** API requests to be rate-limited across all agents,
**So that** I don't hit Claude API rate limits and cause failures.

## Summary

When multiple agents run concurrently, they each make independent API calls to Claude. Without coordination, this can quickly exceed rate limits. This story implements a shared request queue that throttles API calls across all concurrent agents.

## Context

This is the third story in **Phase 3: Orchestrated Concurrency** of the Concurrent Workflows epic.

**Depends on:** S-0038 (Multi-Process Orchestrator), S-0039 (IPC Protocol)
**Blocks:** None (can be parallelized with S-0041)

**Reference:** `docs/ROADMAP_TO_CONCURRENT_WORK.md` (Section 3.3, Resource Contention)

## Acceptance Criteria

- [ ] Request queue service coordinates API calls across agents
- [ ] Configurable rate limit (requests per minute, default based on Claude tier)
- [ ] Agents request API "slots" before making calls
- [ ] Queue implements fair scheduling (no agent starves)
- [ ] Exponential backoff on rate limit errors
- [ ] Queue status visible in dashboard (pending, active, limit)
- [ ] Tests verify rate limiting works correctly
- [ ] All existing tests pass (`npm test`)
- [ ] TypeScript compilation succeeds (`npm run build`)

## Technical Notes

### Architecture

The request queue runs in the orchestrator process and agents communicate via IPC to request API slots.

```
┌─────────────────────────────────────────────────────┐
│              Orchestrator Process                    │
│  ┌─────────────────────────────────────────────┐   │
│  │           Request Queue                      │   │
│  │  ┌───────┐ ┌───────┐ ┌───────┐ ┌───────┐   │   │
│  │  │ Slot  │ │ Slot  │ │ Slot  │ │ Slot  │   │   │
│  │  └───────┘ └───────┘ └───────┘ └───────┘   │   │
│  │       ▲         ▲         ▲         ▲       │   │
│  └───────┼─────────┼─────────┼─────────┼───────┘   │
└──────────┼─────────┼─────────┼─────────┼───────────┘
           │ IPC     │ IPC     │ IPC     │ IPC
    ┌──────┴──┐ ┌────┴────┐ ┌──┴──────┐ ┌┴─────────┐
    │ Agent 1 │ │ Agent 2 │ │ Agent 3 │ │ Agent 4  │
    └─────────┘ └─────────┘ └─────────┘ └──────────┘
```

### Request Queue Implementation

```typescript
// src/core/request-queue.ts

interface QueueConfig {
  requestsPerMinute: number;  // Rate limit
  maxConcurrent: number;      // Max simultaneous requests
  fairnessWindow: number;     // Time window for fair scheduling (ms)
}

interface QueuedRequest {
  id: string;
  storyId: string;
  requestedAt: number;
  grantedAt?: number;
  completedAt?: number;
}

class RequestQueue {
  private config: QueueConfig;
  private pending: QueuedRequest[] = [];
  private active: Map<string, QueuedRequest> = new Map();
  private completed: QueuedRequest[] = [];  // Rolling window for rate calc
  private storyRequestCounts: Map<string, number> = new Map();

  constructor(config: Partial<QueueConfig> = {}) {
    this.config = {
      requestsPerMinute: config.requestsPerMinute ?? 50,  // Conservative default
      maxConcurrent: config.maxConcurrent ?? 5,
      fairnessWindow: config.fairnessWindow ?? 60000
    };
  }

  // Request an API slot (returns promise that resolves when slot available)
  async requestSlot(storyId: string): Promise<() => void> {
    const request: QueuedRequest = {
      id: crypto.randomUUID(),
      storyId,
      requestedAt: Date.now()
    };

    this.pending.push(request);

    // Wait for slot
    await this.waitForSlot(request);

    // Return release function
    return () => this.releaseSlot(request.id);
  }

  private async waitForSlot(request: QueuedRequest): Promise<void> {
    while (true) {
      if (this.canGrant(request)) {
        this.grant(request);
        return;
      }
      // Wait and retry
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  private canGrant(request: QueuedRequest): boolean {
    // Check concurrent limit
    if (this.active.size >= this.config.maxConcurrent) {
      return false;
    }

    // Check rate limit (requests in last minute)
    const recentCompleted = this.completed.filter(
      r => r.completedAt! > Date.now() - 60000
    );
    if (recentCompleted.length + this.active.size >= this.config.requestsPerMinute) {
      return false;
    }

    // Check fairness (is this story being starved?)
    const isStarving = this.isStoryStarving(request.storyId);
    if (isStarving) {
      return true;  // Priority grant
    }

    // FIFO for non-starving requests
    return this.pending[0]?.id === request.id;
  }

  private isStoryStarving(storyId: string): boolean {
    // Story is starving if it has been waiting longer than fairness window
    // while other stories have been granted
    const storyRequests = this.pending.filter(r => r.storyId === storyId);
    if (storyRequests.length === 0) return false;

    const oldestRequest = storyRequests[0];
    const waitTime = Date.now() - oldestRequest.requestedAt;

    return waitTime > this.config.fairnessWindow;
  }

  private grant(request: QueuedRequest): void {
    request.grantedAt = Date.now();
    this.pending = this.pending.filter(r => r.id !== request.id);
    this.active.set(request.id, request);

    // Track per-story count
    const count = this.storyRequestCounts.get(request.storyId) ?? 0;
    this.storyRequestCounts.set(request.storyId, count + 1);
  }

  private releaseSlot(requestId: string): void {
    const request = this.active.get(requestId);
    if (request) {
      request.completedAt = Date.now();
      this.active.delete(requestId);
      this.completed.push(request);

      // Prune old completed requests
      const cutoff = Date.now() - 60000;
      this.completed = this.completed.filter(r => r.completedAt! > cutoff);
    }
  }

  // Get current queue status for dashboard
  getStatus(): QueueStatus {
    return {
      pending: this.pending.length,
      active: this.active.size,
      rateLimit: this.config.requestsPerMinute,
      recentCompleted: this.completed.length,
      utilizationPercent: Math.round(
        (this.active.size / this.config.maxConcurrent) * 100
      )
    };
  }
}
```

### IPC Integration

```typescript
// In agent-executor.ts
async function makeClaudeRequest(prompt: string): Promise<Response> {
  // Request slot from parent
  process.send?.({ type: 'request_slot', storyId });

  // Wait for grant
  await waitForMessage('slot_granted');

  try {
    return await claude.complete(prompt);
  } finally {
    // Release slot
    process.send?.({ type: 'release_slot', storyId });
  }
}

// In orchestrator.ts
child.on('message', async (msg) => {
  if (msg.type === 'request_slot') {
    const release = await requestQueue.requestSlot(msg.storyId);
    child.send({ type: 'slot_granted' });
    // Store release function for this child
  }
  if (msg.type === 'release_slot') {
    // Call stored release function
  }
});
```

### Files to Create/Modify

- `src/core/request-queue.ts` - New RequestQueue class
- `src/core/orchestrator.ts` - Integrate queue
- `src/core/agent-executor.ts` - Request slots before API calls
- `src/types/ipc.ts` - Add slot request/grant message types

## Edge Cases

1. **Agent crashes while holding slot**: Release on agent exit
2. **All slots exhausted**: Agents wait (no timeout, but log warning)
3. **Rate limit error from API**: Implement backoff, reduce rate
4. **Single agent making many requests**: Fairness kicks in
5. **Configuration change mid-run**: Apply to new requests only

## Definition of Done

- [ ] Code review completed
- [ ] All tests passing (`npm test` shows 0 failures)
- [ ] TypeScript compilation succeeds (`npm run build`)
- [ ] Rate limiting verified with concurrent agents
- [ ] Fairness algorithm prevents starvation
- [ ] Queue status available for dashboard

---

**Effort:** medium
**Dependencies:** S-0038, S-0039
**Blocks:** None
