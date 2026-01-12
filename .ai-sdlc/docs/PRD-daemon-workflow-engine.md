# PRD: Daemon Workflow Engine Improvements

## Overview

### Problem Statement
The ai-sdlc daemon currently processes stories but lacks key behaviors expected for a robust, autonomous workflow engine:
1. Stories that hit max iterations remain in their original folders, cluttering the active workflow
2. Priority selection doesn't clearly enforce "nearest to completion" logic
3. The daemon's lifecycle behavior (continuous polling vs. reactive watching) is unclear
4. No clear separation between "blocked" work requiring intervention and active work

### Vision
A daemon that autonomously shepherds stories from backlog through completion, intelligently handling failures, and clearly surfacing work that needs human intervention—all while running continuously until explicitly stopped.

---

## User Requirements (Gathered from Product Owner Session)

| Requirement | Decision |
|-------------|----------|
| **Priority** | Nearest completion first: in-progress > ready > backlog. Secondary: priority field in frontmatter |
| **Blocking** | Move blocked stories to `blocked/` folder for visibility |
| **Preemption** | Finish current story before re-evaluating priority |
| **Recovery** | Resume exact story/action where left off on restart |
| **Lifecycle** | Run indefinitely, polling for new work (Ctrl+C to stop) |
| **Multi-WIP** | Pick one in-progress by priority, finish it, then handle others |
| **Rejection** | Story is "blocked" when it enters any failure state where agent can't continue |

---

## Current State Analysis

### What Works
- File watching via chokidar on backlog/, ready/, in-progress/
- Sequential story processing (one at a time)
- Priority system in `assessState()` (in-progress: 0-150, ready: 200-400, backlog: 500+)
- Story state persisted in frontmatter (research_complete, plan_complete, etc.)
- Max iterations tracking (refinement_count, retry_count)
- Graceful shutdown handling

### Gaps to Address
1. **No blocked/ folder** - Stories flagged with `priority + 10000` stay in place
2. **Lifecycle ambiguity** - Daemon watches for changes but doesn't actively poll
3. **Initial state handling** - On startup, all stories queued; no explicit "pick highest priority first"
4. **Blocked definition unclear** - Two separate concepts (max refinements vs max retries) not unified

---

## Functional Requirements

### FR-1: Blocked Folder Management
**Description**: Stories that cannot proceed autonomously must be moved to a `blocked/` folder.

**Acceptance Criteria**:
- [ ] When a story hits max refinement attempts, move to `.ai-sdlc/blocked/`
- [ ] When a story hits max review retries, move to `.ai-sdlc/blocked/`
- [ ] When an agent encounters an unrecoverable error, move story to blocked/
- [ ] Blocked stories include a `blocked_reason` field in frontmatter explaining why
- [ ] Blocked stories include `blocked_at` timestamp
- [ ] Daemon logs clearly indicate story was blocked and why
- [ ] Blocked folder is NOT watched by daemon (stories don't re-enter queue)

### FR-2: Unblock Workflow
**Description**: Users must be able to manually unblock stories and return them to the workflow.

**Acceptance Criteria**:
- [ ] CLI command: `ai-sdlc unblock <story-id>` moves story from blocked/ to appropriate folder
- [ ] Unblock clears `blocked_reason` and `blocked_at` fields
- [ ] Unblock optionally resets retry counts (`--reset-retries` flag)
- [ ] Unblock determines target folder based on story state (in-progress if partially complete, ready if refined)
- [ ] Daemon picks up unblocked story on next poll cycle

### FR-3: Continuous Polling Mode
**Description**: Daemon should run indefinitely, actively checking for new work.

**Acceptance Criteria**:
- [ ] After queue is empty, daemon continues running and polling
- [ ] Poll interval is configurable (default: 5 seconds)
- [ ] New stories added to backlog/ready/in-progress are detected and queued
- [ ] Daemon only stops on explicit Ctrl+C or SIGTERM
- [ ] Status output shows "Waiting for work..." when idle (not "Queue empty, exiting")

### FR-4: Priority-Based Story Selection
**Description**: On startup and after each story completion, select the highest priority story.

**Acceptance Criteria**:
- [ ] Priority order: in-progress > ready > backlog (by folder)
- [ ] Within a folder, use frontmatter `priority` field as tiebreaker
- [ ] If multiple in-progress stories exist, pick the one nearest completion
- [ ] "Nearest completion" = most workflow flags set (reviews_complete > implementation_complete > plan_complete > research_complete)
- [ ] On daemon start, don't queue all stories—assess and pick ONE highest priority
- [ ] After story completion/blocking, reassess all stories and pick next highest priority

### FR-5: Unified Blocking Detection
**Description**: Consolidate all "can't proceed" scenarios under one blocking mechanism.

**Acceptance Criteria**:
- [ ] Max refinement attempts -> blocked
- [ ] Max review retries -> blocked
- [ ] Agent execution error (timeout, crash) -> blocked
- [ ] External dependency failure (git conflict, missing branch) -> blocked
- [ ] All blocking scenarios log consistently and move to blocked/
- [ ] `blocked_reason` captures specific failure type for debugging

### FR-6: Story Completion Flow
**Description**: Clear handoff when a story completes successfully.

**Acceptance Criteria**:
- [ ] PR created successfully -> story moves to done/
- [ ] After moving to done/, daemon immediately reassesses for next story
- [ ] Completion logged with PR URL
- [ ] No pause or user confirmation required between stories

---

## Non-Functional Requirements

### NFR-1: Observability
- Daemon logs current story being processed and current action
- Daemon logs time spent on each story/action
- Daemon logs queue depth and waiting stories
- Structured logging suitable for piping to files

### NFR-2: Resilience
- Daemon survives transient errors (network timeout, API rate limit)
- Story state saved after each action (crash recovery)
- Filesystem operations are atomic (no partial moves)

### NFR-3: Configuration
- All thresholds configurable in `ai-sdlc.config.ts`:
  - `daemon.pollInterval` (default: 5000ms)
  - `daemon.maxIterationsPerStory` (default: 100)
  - `refinement.maxIterations` (default: 3)
  - `reviewConfig.maxRetries` (default: 3, was Infinity)
- Story-level overrides in frontmatter take precedence

---

## Technical Design Overview

### New Folder Structure
```
.ai-sdlc/
├── backlog/       # Stories needing refinement
├── ready/         # Refined, ready for RPIV
├── in-progress/   # Currently being worked on
├── done/          # Completed with PR
└── blocked/       # NEW: Stories requiring manual intervention
```

### Frontmatter Changes
```yaml
---
# Existing fields...

# NEW: Blocking fields
blocked_reason: "Max review retries (3) reached - review keeps failing on security concerns"
blocked_at: "2024-01-15T10:30:00Z"
---
```

### Key Code Changes
1. **`src/core/story.ts`**: Add `moveToBlocked()` function
2. **`src/core/kanban.ts`**: Update `assessState()` to handle blocked detection
3. **`src/cli/daemon.ts`**: Change lifecycle to continuous polling mode
4. **`src/cli/commands.ts`**: Add `unblock` command
5. **`src/types/index.ts`**: Add blocked-related types

---

## Out of Scope (Future Considerations)
- Parallel story processing (multiple stories at once)
- Web dashboard for monitoring
- Slack/email notifications for blocked stories
- Automatic retry of blocked stories after timeout
- Priority escalation over time

---

## Success Metrics
1. **Blocked visibility**: 100% of blocked stories in blocked/ folder (not hidden in-place)
2. **Continuous operation**: Daemon runs for 24+ hours without manual restart
3. **Recovery rate**: Daemon successfully resumes after process restart
4. **Throughput**: Stories flow backlog -> done without manual intervention (happy path)

---

## Story Breakdown

_To be added after PRD approval_
