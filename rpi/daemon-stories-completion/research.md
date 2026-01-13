# Research: Complete Remaining Daemon Stories

## 1. Problem Overview

### Clear Problem Statement
Complete all 7 remaining daemon stories (Stories 3-9) from the daemon-workflow-engine sequence to enhance the ai-sdlc daemon with proper blocking behavior, continuous operation, intelligent priority selection, and improved terminal UI.

### Key Objectives
- **Story 3**: Exclude blocked/ folder from daemon watch
- **Story 4**: Add unblock CLI command
- **Story 5**: Implement continuous polling
- **Story 6**: Single-story selection on daemon startup
- **Story 7**: Nearest-completion priority algorithm
- **Story 8**: Set sensible config defaults
- **Story 9**: Redesign daemon terminal UI

### Success Criteria
- All stories pass their acceptance criteria
- `npm test` passes with 0 failures
- `npm run build` succeeds
- Daemon behavior matches PRD specifications
- Sequence file updated with completion status

---

## 2. Web Research Findings

### File Watching with Chokidar

**Directory Exclusion Pattern** (most relevant for Story 3):
```javascript
const watcher = chokidar.watch('./stories', {
  ignored: (path, stats) => {
    // Exclude directories by checking path
    if (path.includes('blocked')) return true;
    return false;
  },
  persistent: true,
  ignoreInitial: true
});
```

**Key Options**:
- `ignoreInitial: true` - Skip existing files, only watch for new changes (relevant for Story 6)
- `awaitWriteFinish: { stabilityThreshold: 2000 }` - Wait for file to stabilize before triggering

### Continuous Polling Pattern (Story 5)

**Recommended Pattern** - Recursive setTimeout (not setInterval):
```javascript
async function pollingLoop() {
  let isRunning = true;

  async function tick() {
    if (!isRunning) return;

    const tasks = await scanForTasks();
    const nextTask = selectNextTask(tasks);

    if (nextTask) {
      await processTask(nextTask);
    }

    await delay(5000);
    tick();
  }

  tick();
  return () => { isRunning = false; };
}
```

### Single-Item Processing with SRTF Priority (Stories 6, 7)

**Shortest Remaining Time First (SRTF)** - "Nearest Completion" algorithm:
```javascript
function selectNextTask(tasks) {
  return tasks.sort((a, b) => {
    // Primary: highest completion score (nearest to done)
    if (a.completionScore !== b.completionScore) {
      return b.completionScore - a.completionScore;
    }
    // Secondary: highest priority
    if (a.priority !== b.priority) {
      return b.priority - a.priority;
    }
    // Tertiary: oldest first
    return a.addedAt - b.addedAt;
  })[0];
}
```

### CLI Terminal UI Patterns (Story 9)

**Ora Spinner** - for simple feedback:
```javascript
const spinner = ora('Processing task...').start();
spinner.text = `Processing: ${task.id}`;
spinner.stopAndPersist({ symbol: '✓', text: `Completed: ${task.id}` });
```

**Best Practices**:
- Use `stopAndPersist()` to keep completed task visible
- Update spinner text dynamically for progress
- Clear idle message to prevent log spam

### Configuration Management (Story 8)

**Sensible Defaults Pattern**:
```javascript
const DEFAULT_CONFIG = {
  pollInterval: 5000,
  maxRetries: 3,  // NOT Infinity
  maxRefinements: 3
};
```

---

## 3. Codebase Analysis

### Affected Files Summary

| Story | Primary Files | Secondary Files |
|-------|--------------|-----------------|
| 3 | daemon.ts, kanban.ts | daemon.test.ts |
| 4 | story.ts, kanban.ts, commands.ts, index.ts | story.test.ts, blocked-stories.test.ts |
| 5 | daemon.ts | config.ts, daemon.test.ts |
| 6 | daemon.ts | daemon.test.ts |
| 7 | kanban.ts | kanban.test.ts, daemon.test.ts |
| 8 | config.ts | README.md, config.test.ts |
| 9 | daemon.ts, formatting.ts, index.ts | types/index.ts |

### Current Architecture

**Daemon Implementation**: `src/cli/daemon.ts`
- `DaemonRunner` class with queue-based processing
- Uses chokidar watching backlog, ready, in-progress (lines 71-75)
- `processingQueue`, `activeStoryIds`, `completedStoryIds` tracking
- Graceful shutdown with Ctrl+C handling

**State Assessment**: `src/core/kanban.ts`
- `assessState()` scans folders and generates recommended actions (line 79)
- Priority system: in-progress (0-150), ready (200-400), backlog (500+)
- Already implements blocking logic for max refinements/retries

**Blocking Infrastructure**: `src/core/story.ts`
- `moveToBlocked()` function (line 76) - moves stories to blocked/
- Sets `status='blocked'`, `blocked_reason`, `blocked_at` timestamp

**Configuration**: `src/core/config.ts`
- `DEFAULT_DAEMON_CONFIG` with `pollingInterval: 5000` (line 21)
- `maxRetries: Infinity` needs changing to 3 (line 52)

### Existing Patterns to Follow

**Moving Stories**:
```typescript
// From story.ts moveToBlocked()
const blockedPath = path.join(sdlcRoot, BLOCKED_DIR, `${story.frontmatter.id}.md`);
await fs.promises.mkdir(path.dirname(blockedPath), { recursive: true });
await fs.promises.rename(sourcePath, blockedPath);
```

**CLI Command Pattern**:
```typescript
// From index.ts
program
  .command('command-name <required-arg>')
  .description('Description')
  .option('--flag', 'Flag description')
  .action((arg, options) => handler(arg, options));
```

### Dependencies Between Stories

```
Story 1 (DONE) ← Story 3 (blocked/ exists)
Story 1 (DONE) ← Story 4 (moveToBlocked exists)
Story 6 ← Story 7 (single-story selection needed first)
Stories 1-8 ← Story 9 (UI reflects final behavior)
```

**Parallel-Safe Stories**: 3, 4, 5, 6, 8 can run in parallel
**Sequential Stories**: 7 after 6, 9 after all others

---

## 4. Proposed Solution Approach

### High-Level Strategy

**Phase 1: Verification Stories (Story 3)**
- Verify blocked/ is already excluded from watch paths
- Add integration test to confirm behavior

**Phase 2: Blocking Infrastructure (Story 4)**
- Add `unblockStory()` function to story.ts
- Update `findStoryById()` to search blocked/ folder
- Add CLI command to index.ts

**Phase 3: Daemon Behavior (Stories 5, 6, 7)**
- Story 5: Add polling interval to daemon loop
- Story 6: Change `ignoreInitial: true`, do manual initial assessment
- Story 7: Add completion score to priority calculation

**Phase 4: Configuration (Story 8)**
- Change `maxRetries` default from Infinity to 3
- Document defaults

**Phase 5: UI Polish (Story 9)**
- Redesign log output for compactness
- Add `--verbose` flag
- Improve status display

### Risk Factors and Mitigations

| Risk | Mitigation |
|------|-----------|
| Duplicate processing (Story 5) | Use existing activeStoryIds tracking |
| Breaking change on ignoreInitial (Story 6) | Thorough integration testing |
| Config breaking change (Story 8) | Document in changelog |
| Output format changes (Story 9) | Add --verbose for backward compat |

---

## 5. Example Code Snippets

### Story 4: unblockStory() Function

```typescript
export async function unblockStory(
  storyId: string,
  sdlcRoot: string,
  options?: { resetRetries?: boolean }
): Promise<Story> {
  const blockedPath = path.join(sdlcRoot, BLOCKED_DIR, `${storyId}.md`);

  if (!fs.existsSync(blockedPath)) {
    throw new Error(`Story not found in blocked/: ${storyId}`);
  }

  const story = parseStoryFile(blockedPath);

  // Determine destination based on workflow state
  let destFolder: KanbanFolder;
  if (story.frontmatter.implementation_complete) {
    destFolder = 'in-progress';
  } else if (story.frontmatter.plan_complete || story.frontmatter.research_complete) {
    destFolder = 'ready';
  } else {
    destFolder = 'backlog';
  }

  // Clear blocking metadata
  delete story.frontmatter.blocked_reason;
  delete story.frontmatter.blocked_at;
  story.frontmatter.status = destFolder;

  // Optional retry reset
  if (options?.resetRetries) {
    story.frontmatter.retry_count = 0;
    story.frontmatter.refinement_count = 0;
  }

  // Move file
  const destPath = path.join(sdlcRoot, destFolder, `${storyId}.md`);
  await moveStory(story, blockedPath, destPath);

  return story;
}
```

### Story 6: Initial Assessment Pattern

```typescript
// In DaemonRunner.start(), after watcher setup
this.watcher = chokidar.watch(watchDirs, {
  ...opts,
  ignoreInitial: true  // Changed from false
});

// Manual initial assessment
const assessment = assessState(this.sdlcRoot);
if (assessment.recommendedActions.length > 0) {
  const top = assessment.recommendedActions[0];
  console.log(`Found ${assessment.recommendedActions.length} stories, starting with: ${top.storyId}`);
  this.queueStory(top.storyPath, top.storyId);
}
```

### Story 7: Completion Score Calculation

```typescript
function calculateCompletionScore(story: Story): number {
  let score = 0;
  if (story.frontmatter.reviews_complete) score += 40;
  if (story.frontmatter.implementation_complete) score += 30;
  if (story.frontmatter.plan_complete) score += 20;
  if (story.frontmatter.research_complete) score += 10;
  return score;
}

// In action sorting:
priority: basePriority - calculateCompletionScore(story)
```

---

## 6. Next Steps

### Prerequisites
- [x] Story 1 (daemon-block-max-refinements) complete
- [x] Story 2 (daemon-block-max-retries) complete
- [x] blocked/ folder infrastructure exists

### Recommended Implementation Order

1. **Story 3** - Verify blocked/ exclusion (verification only, minimal code)
2. **Stories 4, 5, 6, 8** - Can be parallelized (independent changes)
3. **Story 7** - After Story 6 (depends on single-story selection)
4. **Story 9** - Last (UI should reflect final behavior)

### Testing Strategy

- **Unit tests**: story.test.ts, kanban.test.ts, config.test.ts
- **Integration tests**: daemon.test.ts, blocked-stories.test.ts
- **Manual verification**: Each story has specific manual test in Definition of Done

### Completion Tracking

Update `.ai-sdlc/docs/daemon-workflow-engine-sequence.md` after each story:
- Mark checkbox `[x]` in Completion Tracking section
- Update Status column in Implementation Sequence table
