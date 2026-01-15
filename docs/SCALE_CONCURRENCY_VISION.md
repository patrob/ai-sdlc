# Scaling AI-SDLC: Distributed Agent Teams Vision

> **Status:** Vision Document
> **Authors:** Product Owner & Tech Lead Collaboration
> **Date:** January 2026
> **Scope:** Beyond local concurrency - distributed, 24/7, team-like agent coordination

## Executive Summary

This document explores the vision for scaling ai-sdlc beyond a single machine to a distributed system of AI agents working concurrently across multiple servers. The goal: **a self-organizing team of AI agents that coordinate through explicit communication channels, manage shared resources through distributed locking, and escalate to humans only when truly blocked.**

This builds on the [Roadmap to Concurrent Work](./ROADMAP_TO_CONCURRENT_WORK.md) which covers local multi-process concurrency. This vision document addresses:

- True distributed execution across multiple servers/machines
- Centralized coordination with external state stores
- Inter-agent communication that mimics team dynamics
- 24/7 autonomous operation with self-healing
- Human-in-the-loop integration at scale

---

## Table of Contents

1. [The "Team" Metaphor](#1-the-team-metaphor)
2. [Distributed Architecture](#2-distributed-architecture)
3. [Coordination Layer](#3-coordination-layer)
4. [Inter-Agent Communication](#4-inter-agent-communication)
5. [Git Coordination](#5-git-coordination-the-hard-part)
6. [Specialized Agent Roles](#6-specialized-agent-roles)
7. [24/7 Operation & Self-Healing](#7-247-operation--self-healing)
8. [Human-in-the-Loop](#8-human-in-the-loop)
9. [Evolution Path](#9-evolution-path)
10. [Open Questions](#10-open-questions)

---

## 1. The "Team" Metaphor

### What Real Software Teams Do

Real teams don't just work in parallel - they **communicate, coordinate, and collaborate**:

| Team Concept | What It Means |
|--------------|---------------|
| Standup | Status sync, blocker identification |
| Sprint Planning | Work prioritization, capacity allocation |
| Task Assignment | Claiming work, avoiding duplication |
| Code Review | Quality gates, knowledge transfer |
| Merge Conflicts | Coordination on shared resources |
| Shared Context | Everyone knows the goals and conventions |
| Escalation | When to involve humans |

### Mapping to Distributed Agents

| Team Concept | Distributed Agent Equivalent |
|--------------|------------------------------|
| Standup | Heartbeat protocol, state sync broadcasts |
| Sprint Planning | Work queue prioritization at coordinator |
| Task Assignment | Claim-based work distribution with locks |
| Code Review | Agent-to-agent review handoff with context |
| Merge Conflicts | Git coordination layer with conflict prediction |
| Shared Context | Central knowledge base, learned conventions |
| Escalation | Human-in-the-loop triggers, approval workflows |

**Key Insight:** Running multiple instances isn't enough. Agents need explicit communication channels to work like a team.

---

## 2. Distributed Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     COORDINATOR SERVICE                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ State Sync   │  │ Work Queue   │  │ Distributed Lock     │  │
│  │ (assessState)│  │ (Redis/SQS)  │  │ Manager              │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ Conflict     │  │ Knowledge    │  │ Human Loop           │  │
│  │ Predictor    │  │ Store        │  │ Gateway              │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
          │                   │                   │
          ▼                   ▼                   ▼
    ┌──────────┐        ┌──────────┐        ┌──────────┐
    │ Worker A │        │ Worker B │        │ Worker C │
    │ Server 1 │        │ Server 2 │        │ Server 3 │
    │ story: S1│        │ story: S2│        │ story: S3│
    └──────────┘        └──────────┘        └──────────┘
```

### Components

**Coordinator Service:**
- Runs `assessState()` against centralized story source
- Maintains prioritized work queue
- Tracks which stories/files are claimed
- Predicts and prevents merge conflicts
- Routes blocked stories to human reviewers
- Shares research findings across workers

**Worker Nodes:**
- Pull work from queue
- Acquire necessary locks
- Execute actions (research, plan, implement, review)
- Report results and progress
- Release locks on completion

### Work Queue Pattern

The "competing consumers" pattern provides the foundation:

```
┌─────────────────────────────────────────────────────────┐
│                    WORK QUEUE (Redis/SQS)               │
│                                                          │
│  Priority 0:  [S-045:review] [S-012:implement]          │
│  Priority 100: [S-023:plan] [S-067:research]            │
│  Priority 500: [S-089:refine] [S-091:refine]            │
└─────────────────────────────────────────────────────────┘
                    │           │           │
                    ▼           ▼           ▼
              [Worker A]  [Worker B]  [Worker C]
                claim       claim       claim
```

**Benefits:**
- Decouples work detection from work execution
- Natural load balancing across workers
- Durable queues survive coordinator restarts
- Easy to add/remove workers dynamically

---

## 3. Coordination Layer

### Locking Strategy

Multiple agents can't safely modify the same codebase without coordination. Three levels of locking:

**Level 1: Story-Level Isolation (MVP)**
```
Worker A claims S-001 → Full lock on story
Worker B cannot work on S-001 until A releases
```
- Simple, no conflicts possible
- Limits concurrency (only N stories at once)

**Level 2: Phase-Level Parallelism**
```
S-001: implementing (Worker A)
S-002: researching  (Worker B)
S-003: reviewing    (Worker C)
```
- Different phases rarely conflict
- Higher concurrency
- Some coordination still needed

**Level 3: Semantic File Locking (Advanced)**
```
Worker A claims: [src/auth.ts, src/login.tsx]
Worker B claims: [src/api.ts, src/utils.ts]
No overlap → Both proceed
```
- Maximum concurrency
- Workers claim specific files they'll modify
- Mimics how real teams naturally avoid conflicts

### Lock Manager Implementation

```typescript
interface LockManager {
  // Claim a story (Level 1)
  claimStory(storyId: string, workerId: string): Promise<Lock>;

  // Claim specific files (Level 3)
  claimFiles(files: string[], workerId: string): Promise<Lock>;

  // Check for conflicts before claiming
  wouldConflict(files: string[]): Promise<ConflictReport>;

  // Release all locks for a worker
  releaseAll(workerId: string): Promise<void>;

  // Heartbeat to keep locks alive
  heartbeat(workerId: string): Promise<void>;
}

interface Lock {
  id: string;
  workerId: string;
  resources: string[];  // storyId or file paths
  acquiredAt: Date;
  expiresAt: Date;      // Auto-release on worker death
}
```

### Conflict Prediction

Before assigning work, the coordinator predicts conflicts:

```typescript
interface ConflictPrediction {
  storyA: string;
  storyB: string;
  conflictingFiles: string[];
  severity: 'hard' | 'soft' | 'likely-none';
  recommendation: 'serialize' | 'proceed-with-caution' | 'proceed';
}

function predictConflict(storyA: Story, storyB: Story): ConflictPrediction {
  // Analyze implementation plans for file overlap
  // Check historical conflict patterns
  // Consider module boundaries (same module = high risk)
  // Return recommendation
}
```

---

## 4. Inter-Agent Communication

### Communication Channels

**1. Broadcast Events (Pub/Sub)**

All workers subscribe to relevant event topics:

```typescript
// Events all workers should hear
type BroadcastEvent =
  | { type: 'STORY_COMPLETED'; storyId: string; summary: string }
  | { type: 'STORY_BLOCKED'; storyId: string; reason: string }
  | { type: 'REBASE_NEEDED'; affectedStories: string[] }
  | { type: 'PATTERN_DISCOVERED'; pattern: CodePattern }
  | { type: 'MAIN_UPDATED'; commitSha: string };
```

**2. Direct Handoffs**

Context preservation between phases:

```typescript
interface PhaseHandoff {
  fromPhase: 'research' | 'plan' | 'implement' | 'review';
  toPhase: 'plan' | 'implement' | 'review' | 'rework';
  storyId: string;
  context: {
    keyFindings: string[];
    decisions: Decision[];
    warnings: string[];
    suggestedApproach?: string;
  };
}
```

Currently, context is lost at phase boundaries. Distributed system can preserve and transfer it:

- Research → Planning: "Found existing auth module, recommend extending it"
- Implementation → Review: "Changed 3 files, key risk is the API migration"
- Review → Rework: "Tests pass but security concern in input validation"

**3. Shared Knowledge Base**

Accumulated "tribal knowledge" shared across all agents:

```typescript
interface KnowledgeBase {
  // Codebase conventions learned by one agent, shared with all
  conventions: CodeConvention[];

  // API patterns, error handling approaches
  patterns: CodePattern[];

  // Testing strategies that worked
  testingStrategies: TestStrategy[];

  // Common pitfalls to avoid
  antipatterns: AntiPattern[];
}
```

**4. Coordination Messages**

Real-time coordination between workers:

```
Worker A: CLAIMING story=S-001 files=[auth.ts, login.tsx]
Worker B: CLAIMING story=S-002 files=[api.ts]
Coordinator: APPROVED both (no conflict)
Worker A: IMPLEMENTING S-001
Worker C: WAITING_FOR files=[auth.ts] blocked_by=WorkerA
Worker A: PR_CREATED story=S-001 pr=#123
Coordinator: ASSIGN_REVIEW story=S-001 reviewer=WorkerD
Worker D: REVIEWING S-001
Worker D: REVIEW_COMPLETE story=S-001 result=APPROVED
Coordinator: MERGE_PR pr=#123
Coordinator: BROADCAST rebase_needed stories=[S-002, S-003]
```

---

## 5. Git Coordination (The Hard Part)

Git operations are the most conflict-prone aspect. A distributed system needs sophisticated git coordination.

### Pre-Implementation Conflict Detection

```typescript
// Before assigning work, coordinator checks
async function canProceedSafely(
  story: Story,
  inFlightWork: InFlightWork[]
): Promise<SafetyAssessment> {
  const plannedFiles = extractPlannedFiles(story.implementationPlan);

  for (const work of inFlightWork) {
    const overlap = findOverlap(plannedFiles, work.claimedFiles);
    if (overlap.length > 0) {
      return {
        safe: false,
        conflictsWith: work.storyId,
        sharedFiles: overlap,
        recommendation: 'wait' | 'proceed-will-need-rebase'
      };
    }
  }

  return { safe: true };
}
```

### Merge Strategies

**Option 1: Sequential Merge Queue**
```
PRs enter queue after implementation
Merge one at a time
Auto-rebase waiting PRs
```
- Simple, deterministic
- Limits throughput

**Option 2: Parallel Merge with Resolution**
```
Attempt parallel merges
On conflict: auto-resolve or trigger rework
```
- Higher throughput
- More complexity

**Option 3: Merge Train Pattern (GitLab-style)**
```
Group non-conflicting PRs into "trains"
Test and merge trains together
Conflict = eject from train, re-queue
```
- Best throughput
- Sophisticated coordination required

### Rebase Coordination Protocol

```
1. Main branch updated (merge or external commit)
2. Coordinator identifies affected worktrees
3. Broadcast REBASE_NEEDED to workers
4. Workers:
   a. If idle: rebase immediately
   b. If implementing: complete current operation, then rebase
   c. If rebase has conflicts: pause, trigger rework agent
5. Coordinator tracks rebase completion
6. Resume normal operations
```

---

## 6. Specialized Agent Roles

Real teams have specialists. Distributed ai-sdlc can have specialized workers:

### Role-Based Worker Pool

```yaml
workers:
  research:
    count: 3
    concurrency: 5      # Multiple stories per worker (read-heavy)
    capabilities: [codebase_analysis, documentation_search]

  implementation:
    count: 5
    concurrency: 1      # One story per worker (write-heavy)
    capabilities: [code_generation, testing, git_operations]

  review:
    count: 2
    concurrency: 3      # Multiple reviews per worker
    capabilities: [security_analysis, code_quality, test_coverage]

  rework:
    count: 1
    concurrency: 1      # Deep debugging focus
    capabilities: [debugging, failure_analysis, fix_generation]
```

### Benefits of Specialization

| Benefit | Explanation |
|---------|-------------|
| Resource optimization | Research is cheap, implementation is expensive |
| Specialized prompts | Each role gets tailored context and instructions |
| Natural load balancing | More researchers when backlog is full |
| Quality improvement | Review specialists develop expertise |
| Cost efficiency | Right-size compute per role |

### Cross-Role Communication

```
┌──────────────┐     research findings      ┌──────────────┐
│   Research   │ ─────────────────────────► │   Planning   │
│   Specialist │                            │   Specialist │
└──────────────┘                            └──────────────┘
                                                   │
                                    implementation plan
                                                   │
                                                   ▼
┌──────────────┐     review feedback        ┌──────────────┐
│    Review    │ ◄───────────────────────── │Implementation│
│   Specialist │                            │   Specialist │
└──────────────┘                            └──────────────┘
       │
       │ rejection + context
       ▼
┌──────────────┐
│    Rework    │
│   Specialist │
└──────────────┘
```

---

## 7. 24/7 Operation & Self-Healing

### Health Monitoring

```
┌─────────────────────────────────────────────────────────┐
│                  HEALTH MONITORING                       │
├─────────────────────────────────────────────────────────┤
│ Worker Heartbeat     Every 30s, workers ping coordinator│
│ Stale Lock Cleanup   Release locks from dead workers    │
│ Work Redistribution  Reassign orphaned tasks            │
│ Auto-Scaling         Spin up/down workers based on load │
│ Circuit Breakers     Prevent cascade failures           │
└─────────────────────────────────────────────────────────┘
```

### Failure Scenarios & Recovery

**Worker Crash Mid-Task:**
```
1. Heartbeat timeout (60s) triggers alert
2. Lock manager releases worker's locks
3. Work item returns to queue with "retry" flag
4. Another worker picks it up
5. Worktree state cleaned up on recovery
```

**Coordinator Crash:**
```
1. Workers detect connection loss
2. Workers pause, retry with exponential backoff
3. New coordinator elected (if clustered) or restarted
4. State reconstructed from durable storage (Redis/Postgres)
5. In-flight work verified and resumed
```

**Git Repository Issues:**
```
1. Automatic retry with exponential backoff
2. Alert on persistent failures (3+ retries)
3. Circuit breaker prevents cascade
4. Human notification for manual intervention
```

**API Rate Limits (Claude, GitHub):**
```
1. Token bucket rate limiting at coordinator
2. Queue backpressure when limits approached
3. Priority preservation during throttling
4. Graceful degradation (pause low-priority work)
```

### Self-Healing Patterns

| Pattern | Implementation |
|---------|---------------|
| Auto-rebase | Detect upstream changes, rebase affected worktrees |
| Retry with context | Failed operations retry with additional debugging context |
| Escalate after N failures | Circuit breaker triggers human notification |
| Learn from failures | Update knowledge base with failure patterns |

---

## 8. Human-in-the-Loop

### Escalation Triggers

| Trigger | Threshold | Action |
|---------|-----------|--------|
| Max retries hit | 3 failed attempts | Route to human review queue |
| Ambiguous requirements | Confidence < 70% | Request clarification |
| Architecture decision | Affects 5+ files | Require human approval |
| Security concern | Any CVE pattern | Immediate human review |
| Cost threshold | Story > $X in tokens | Pause and notify |

### Human Interaction Channels

**1. Notification System**
```yaml
notifications:
  slack:
    webhook: ${SLACK_WEBHOOK}
    channels:
      alerts: "#ai-sdlc-alerts"
      daily_digest: "#ai-sdlc-updates"
    triggers:
      - story_blocked
      - security_concern
      - daily_summary

  email:
    recipients: [team@example.com]
    triggers:
      - critical_failure
      - weekly_report
```

**2. Approval Workflows**
```
Story S-045 requires human approval:
  Reason: Architecture decision - adding new database table

  [View Changes] [Approve] [Request Changes] [Reassign]

  Context:
  - Research findings: (link)
  - Implementation plan: (link)
  - Affected files: 8
  - Risk assessment: Medium
```

**3. Priority Override**
```typescript
interface HumanOverride {
  // Bump story to top of queue
  prioritize(storyId: string): void;

  // Pause story processing
  pause(storyId: string, reason: string): void;

  // Cancel and rollback
  cancel(storyId: string): void;

  // Assign to specific worker/role
  assign(storyId: string, workerId: string): void;

  // Provide additional context
  addContext(storyId: string, context: string): void;
}
```

### Dashboard for Humans

```
┌──────────────────────────────────────────────────────────────┐
│  AI-SDLC Team Dashboard                          [Refresh]   │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Workers: 8/10 active    Queue: 23 stories    Rate: 2.4/hr  │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│  [NEEDS ATTENTION]                                           │
│                                                              │
│  ⚠️  S-045: Max retries hit                                  │
│      Reason: Architecture decision needed                    │
│      [View] [Approve] [Reassign]                            │
│                                                              │
│  ⚠️  S-052: Security review required                         │
│      Reason: Potential SQL injection pattern detected        │
│      [View] [Dismiss] [Block]                               │
│                                                              │
│  ⚠️  S-061: Ambiguous requirements                           │
│      Reason: Story mentions "improve performance" - unclear  │
│      [Clarify] [Provide Context] [Skip]                     │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│  [ACTIVE WORK]                                               │
│                                                              │
│  Worker A (server-1): S-001 implementing  ████████░░ 80%    │
│  Worker B (server-2): S-002 researching   ███░░░░░░░ 30%    │
│  Worker C (server-1): S-003 reviewing     ██████████ done   │
│  Worker D (server-3): S-004 planning      █████░░░░░ 50%    │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│  [TODAY'S STATS]                                             │
│                                                              │
│  Completed: 12 stories    Blocked: 3    Failed: 1           │
│  Avg time: 45 min         Success rate: 92%                 │
│  Token usage: 1.2M        Est. cost: $24.50                 │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## 9. Evolution Path

Building on the [Roadmap to Concurrent Work](./ROADMAP_TO_CONCURRENT_WORK.md), here's the path to full distributed operation:

### Phase 5: External State Store (Foundation for Distribution)

**Prerequisites:** Phase 4 complete (local orchestration stable)

**Goal:** Move state to external store, enabling multiple machines to share state.

| Component | Current | Target |
|-----------|---------|--------|
| Story state | Filesystem (`.ai-sdlc/stories/`) | Postgres + file sync |
| Workflow state | `.workflow-state.json` | Redis |
| Locks | In-memory | Redis distributed locks |
| Events | None | Redis Pub/Sub |

**Key Decisions:**
- State store technology (Postgres vs MongoDB vs DynamoDB)
- Sync strategy (filesystem remains source of truth? or external store?)
- Migration path for existing users

### Phase 6: Worker Separation (Scale Out)

**Goal:** Extract worker logic into deployable service that can run on multiple machines.

```
┌─────────────────┐
│   Coordinator   │
│   (Single)      │
└────────┬────────┘
         │
    ┌────┴────┬────────────┐
    ▼         ▼            ▼
┌───────┐ ┌───────┐   ┌───────┐
│Worker │ │Worker │   │Worker │
│Server1│ │Server2│   │Server3│
└───────┘ └───────┘   └───────┘
```

**Deliverables:**
- Worker as standalone deployable (Docker container)
- Worker registration/discovery protocol
- Health check and auto-recovery
- Basic load balancing

### Phase 7: Smart Coordination (Intelligence)

**Goal:** Intelligent work distribution, conflict prediction, inter-agent communication.

**Deliverables:**
- Conflict prediction before assignment
- Specialized worker roles
- Inter-agent communication channels
- Shared knowledge base
- Learning from outcomes

### Phase 8: Self-Healing & Autonomy (24/7)

**Goal:** Full autonomous operation with human escalation only when needed.

**Deliverables:**
- Comprehensive health monitoring
- Auto-recovery from all failure modes
- Human escalation workflows
- Cost tracking and optimization
- SLA guarantees

### Phase 9: External Integrations

**Goal:** Integration with external systems (GitHub Issues, Jira, etc.)

**Deliverables:**
- Bidirectional sync with issue trackers
- Webhook-driven story creation
- Status updates back to source system
- Comment/feedback integration

---

## 10. Open Questions

### Architectural Decisions

| Question | Options | Considerations |
|----------|---------|----------------|
| Centralized vs P2P coordination? | Central coordinator / Peer-to-peer | Central is simpler but SPOF; P2P is resilient but complex |
| State store technology? | Postgres / Redis / DynamoDB | Postgres for durability; Redis for speed; DynamoDB for scale |
| Communication protocol? | Redis Pub/Sub / Kafka / NATS | Redis sufficient for start; Kafka for true scale |
| Worker deployment model? | Containers / Serverless / VMs | Containers for isolation; Serverless for cost; VMs for control |

### Product Questions

| Question | Impact |
|----------|--------|
| What's the target scale? 10 workers? 100? 1000? | Affects technology choices |
| Multi-tenant or single-tenant? | Security, isolation, cost model |
| SLA requirements? | Determines redundancy needs |
| Cost ceiling per story? | Token budgeting, efficiency optimization |

### Technical Challenges

| Challenge | Difficulty | Notes |
|-----------|------------|-------|
| Story dependencies | Hard | How to express and honor dependencies? |
| Cross-story context | Hard | How much context should agents share? |
| Test infrastructure sharing | Medium | Parallel tests hitting same DBs |
| Token cost optimization | Medium | Sharing context reduces redundant analysis |
| Observability at scale | Medium | Distributed tracing, log aggregation |

### Open Research Questions

1. **Can agents develop "team memory"?**
   - Learning conventions over time
   - Improving from collective experience
   - Building institutional knowledge

2. **What's the optimal team composition?**
   - Ratio of specialists to generalists
   - When to add more workers vs optimize existing
   - Diminishing returns curve

3. **How do we measure "team health"?**
   - Beyond throughput: quality, learning, improvement
   - Detecting dysfunction early
   - Continuous improvement metrics

---

## Appendix A: Technology Options

### Message Queue Options

| Technology | Pros | Cons | When to Use |
|------------|------|------|-------------|
| Redis Streams | Fast, built-in Pub/Sub | Memory-bound | MVP, <100 workers |
| Amazon SQS | Managed, scalable | AWS lock-in, latency | AWS deployments |
| RabbitMQ | Flexible routing | Operational overhead | Complex routing needs |
| Kafka | Massive scale, replay | Complexity | 1000+ workers |

### State Store Options

| Technology | Pros | Cons | When to Use |
|------------|------|------|-------------|
| PostgreSQL | ACID, familiar | Scaling limits | Source of truth |
| Redis | Fast, Pub/Sub built-in | Durability concerns | Ephemeral state, locks |
| DynamoDB | Infinite scale | AWS lock-in, cost | Large scale AWS |
| CockroachDB | Distributed SQL | Complexity | Global distribution |

### Worker Deployment Options

| Technology | Pros | Cons | When to Use |
|------------|------|------|-------------|
| Docker + K8s | Standard, flexible | Ops overhead | Production at scale |
| AWS ECS/Fargate | Managed, scales | AWS lock-in | AWS deployments |
| Fly.io | Simple, global | Newer platform | Quick global deploy |
| Serverless (Lambda) | Pay-per-use | Cold starts, limits | Burst capacity |

---

## Appendix B: Example Event Flow

A complete example of distributed team coordination:

```
T+0s    Coordinator: ASSESS_STATE found 5 actions needed
T+1s    Coordinator: ENQUEUE [S-001:implement, S-002:research, S-003:plan]
T+2s    Worker A:    CLAIM story=S-001
T+2s    Worker B:    CLAIM story=S-002
T+3s    Coordinator: APPROVED A for S-001
T+3s    Coordinator: APPROVED B for S-002
T+4s    Worker A:    STATUS story=S-001 phase=implement progress=0%
T+5s    Worker B:    STATUS story=S-002 phase=research progress=10%
T+30s   Worker B:    COMPLETED story=S-002 phase=research
T+31s   Worker B:    CLAIM story=S-003
T+32s   Coordinator: APPROVED B for S-003
T+60s   Worker A:    STATUS story=S-001 phase=implement progress=50%
T+90s   Worker B:    COMPLETED story=S-003 phase=plan
T+91s   Worker B:    CLAIM story=S-003 phase=implement
T+92s   Coordinator: CONFLICT_CHECK S-003 vs S-001
T+93s   Coordinator: CONFLICT_DETECTED shared_files=[src/api/user.ts]
T+94s   Coordinator: QUEUE_WAIT story=S-003 waiting_for=S-001
T+120s  Worker A:    COMPLETED story=S-001 phase=implement
T+121s  Worker A:    PR_CREATED story=S-001 pr=#123
T+122s  Coordinator: ASSIGN_REVIEW story=S-001 reviewer=WorkerC
T+123s  Coordinator: UNBLOCK story=S-003
T+124s  Worker B:    RESUME story=S-003 phase=implement
T+125s  Worker C:    CLAIM story=S-001 phase=review
T+180s  Worker C:    REVIEW_COMPLETE story=S-001 result=APPROVED
T+181s  Coordinator: MERGE_PR pr=#123
T+182s  Coordinator: BROADCAST main_updated commit=abc123
T+183s  Worker B:    REBASE story=S-003 onto=abc123
T+184s  Worker B:    REBASE_SUCCESS no_conflicts
T+240s  Worker B:    COMPLETED story=S-003 phase=implement
...
```

---

## Document History

| Date | Author | Changes |
|------|--------|---------|
| 2026-01-15 | PO/TL | Initial vision document |
