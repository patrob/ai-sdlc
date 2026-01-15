---
id: S-0041
title: Terminal Dashboard
priority: 4
status: backlog
type: feature
created: '2026-01-15'
labels:
  - concurrent-workflows
  - phase-3
  - ux
epic: concurrent-workflows
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
slug: terminal-dashboard
---
# Terminal Dashboard

## User Story

**As a** developer running multiple stories concurrently,
**I want** to see all stories' progress at once,
**So that** I can monitor multiple agents without switching terminals.

## Summary

Provides a real-time terminal dashboard showing progress of all concurrent stories. Replaces the single-story spinner with a multi-line, updating display.

## Context

This is the fourth story in **Phase 3: Orchestrated Concurrency** of the Concurrent Workflows epic.

**Depends on:** S-0038 (Orchestrator), S-0039 (IPC Protocol)
**Blocks:** None (final Phase 3 story)

**Reference:** `docs/ROADMAP_TO_CONCURRENT_WORK.md` (Section 5, Phase 3 User Experience)

## Acceptance Criteria

- [ ] Multi-line status display using `log-update` or similar
- [ ] Each story shows: ID, title (truncated), phase, progress bar, elapsed time
- [ ] Footer shows: queue depth, active count, API usage, estimated time
- [ ] Updates in real-time as agents report progress via IPC
- [ ] Graceful degradation to simple output if terminal doesn't support ANSI
- [ ] Supports both interactive and CI/pipe modes
- [ ] Story completion/error states clearly visible
- [ ] All existing tests pass (`npm test`)
- [ ] TypeScript compilation succeeds (`npm run build`)

## Technical Notes

### Visual Design

```
┌─────────────────────────────────────────────────────────────┐
│ AI-SDLC Concurrent Execution                    [3/5 active] │
├─────────────────────────────────────────────────────────────┤
│ S-0001 │ Add auth feature       │ Implement │ ████████░░ 80% │ 4m 32s │
│ S-0002 │ Fix user validation    │ Research  │ ███░░░░░░░ 30% │ 1m 15s │
│ S-0003 │ Update API endpoints   │ Review    │ ██████████ done│ 6m 02s │
│ S-0004 │ Refactor database      │ Plan      │ ██████░░░░ 60% │ 2m 48s │
│ S-0005 │ Add logging service    │ Queued    │ ░░░░░░░░░░  0% │   --   │
├─────────────────────────────────────────────────────────────┤
│ Queue: 2 pending │ API: 3/50 rpm │ Est. completion: ~8 min    │
└─────────────────────────────────────────────────────────────┘
```

### Implementation Approach

```typescript
// src/cli/dashboard.ts
import logUpdate from 'log-update';
import chalk from 'chalk';

interface StoryStatus {
  id: string;
  title: string;
  phase: 'research' | 'plan' | 'implement' | 'review' | 'complete' | 'error' | 'queued';
  progress: number;  // 0-100
  startedAt?: number;
  completedAt?: number;
  error?: string;
}

interface DashboardState {
  stories: StoryStatus[];
  queueDepth: number;
  apiUsage: { current: number; limit: number };
  startedAt: number;
}

class Dashboard {
  private state: DashboardState;
  private interval: NodeJS.Timer | null = null;
  private isInteractive: boolean;

  constructor() {
    this.state = {
      stories: [],
      queueDepth: 0,
      apiUsage: { current: 0, limit: 50 },
      startedAt: Date.now()
    };
    this.isInteractive = process.stdout.isTTY ?? false;
  }

  start(): void {
    if (this.isInteractive) {
      // Update display every 100ms
      this.interval = setInterval(() => this.render(), 100);
    }
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    // Final render
    this.render();
    logUpdate.done();
  }

  updateStory(id: string, update: Partial<StoryStatus>): void {
    const story = this.state.stories.find(s => s.id === id);
    if (story) {
      Object.assign(story, update);
    } else {
      this.state.stories.push({ id, title: '', phase: 'queued', progress: 0, ...update });
    }

    if (!this.isInteractive) {
      // Non-interactive: log updates as they come
      console.log(`[${id}] ${update.phase ?? ''} ${update.progress ?? 0}%`);
    }
  }

  updateQueue(depth: number): void {
    this.state.queueDepth = depth;
  }

  updateApiUsage(current: number, limit: number): void {
    this.state.apiUsage = { current, limit };
  }

  private render(): void {
    if (!this.isInteractive) return;

    const lines: string[] = [];
    const width = process.stdout.columns || 80;

    // Header
    const activeCount = this.state.stories.filter(
      s => !['complete', 'error', 'queued'].includes(s.phase)
    ).length;
    lines.push(this.renderHeader(activeCount, this.state.stories.length));
    lines.push(this.renderSeparator(width));

    // Story rows
    for (const story of this.state.stories) {
      lines.push(this.renderStoryRow(story, width));
    }

    // Footer
    lines.push(this.renderSeparator(width));
    lines.push(this.renderFooter());

    logUpdate(lines.join('\n'));
  }

  private renderHeader(active: number, total: number): string {
    return chalk.bold(`AI-SDLC Concurrent Execution`) +
           chalk.gray(` [${active}/${total} active]`);
  }

  private renderStoryRow(story: StoryStatus, width: number): string {
    const id = story.id.padEnd(7);
    const title = this.truncate(story.title, 22).padEnd(22);
    const phase = this.formatPhase(story.phase).padEnd(10);
    const progress = this.renderProgressBar(story.progress, 10);
    const time = this.formatElapsed(story.startedAt);

    return `${id} │ ${title} │ ${phase} │ ${progress} │ ${time}`;
  }

  private renderProgressBar(percent: number, width: number): string {
    if (percent >= 100) return chalk.green('done'.padEnd(width));

    const filled = Math.round((percent / 100) * width);
    const empty = width - filled;
    const bar = '█'.repeat(filled) + '░'.repeat(empty);

    return chalk.cyan(bar) + chalk.gray(` ${percent.toString().padStart(3)}%`);
  }

  private formatPhase(phase: string): string {
    const colors: Record<string, (s: string) => string> = {
      research: chalk.blue,
      plan: chalk.yellow,
      implement: chalk.magenta,
      review: chalk.cyan,
      complete: chalk.green,
      error: chalk.red,
      queued: chalk.gray
    };
    return (colors[phase] ?? chalk.white)(phase);
  }

  private formatElapsed(startedAt?: number): string {
    if (!startedAt) return '  --  ';
    const elapsed = Date.now() - startedAt;
    const minutes = Math.floor(elapsed / 60000);
    const seconds = Math.floor((elapsed % 60000) / 1000);
    return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
  }

  private renderFooter(): string {
    const queue = `Queue: ${this.state.queueDepth} pending`;
    const api = `API: ${this.state.apiUsage.current}/${this.state.apiUsage.limit} rpm`;
    const est = this.estimateCompletion();

    return chalk.gray(`${queue} │ ${api} │ Est: ${est}`);
  }

  private estimateCompletion(): string {
    const remaining = this.state.stories.filter(
      s => !['complete', 'error'].includes(s.phase)
    );
    if (remaining.length === 0) return 'done';

    // Simple estimate: average remaining progress * stories
    const avgRemaining = remaining.reduce(
      (sum, s) => sum + (100 - s.progress), 0
    ) / remaining.length;

    // Assume ~1 minute per 10% progress
    const minutes = Math.ceil((avgRemaining / 10) * remaining.length / 3);
    return `~${minutes} min`;
  }

  private truncate(str: string, len: number): string {
    return str.length > len ? str.slice(0, len - 1) + '…' : str;
  }

  private renderSeparator(width: number): string {
    return chalk.gray('─'.repeat(Math.min(width, 65)));
  }
}

export const dashboard = new Dashboard();
```

### Integration with Orchestrator

```typescript
// In orchestrator.ts
const dashboard = new Dashboard();

orchestrator.on('storyStart', (story) => {
  dashboard.updateStory(story.id, {
    title: story.title,
    phase: 'queued',
    progress: 0,
    startedAt: Date.now()
  });
});

orchestrator.on('statusUpdate', (storyId, status) => {
  dashboard.updateStory(storyId, {
    phase: status.phase,
    progress: status.progress
  });
});

orchestrator.on('storyComplete', (storyId) => {
  dashboard.updateStory(storyId, {
    phase: 'complete',
    progress: 100,
    completedAt: Date.now()
  });
});

// Start dashboard when orchestrator starts
dashboard.start();
```

### Files to Create/Modify

- `src/cli/dashboard.ts` - New Dashboard class
- `src/core/orchestrator.ts` - Emit events for dashboard
- `package.json` - Add `log-update` dependency
- `src/cli/index.ts` - Export dashboard

## Edge Cases

1. **Terminal resize**: Re-render with new dimensions
2. **No TTY (piped output)**: Fall back to simple line output
3. **Very long story titles**: Truncate with ellipsis
4. **Many stories (>10)**: Consider pagination or scrolling
5. **Rapid updates**: Throttle render to 10fps max

## Definition of Done

- [ ] Code review completed
- [ ] All tests passing (`npm test` shows 0 failures)
- [ ] TypeScript compilation succeeds (`npm run build`)
- [ ] Dashboard renders correctly with 3+ stories
- [ ] Non-interactive fallback works
- [ ] Visual design matches mockup

---

**Effort:** medium
**Dependencies:** S-0038, S-0039
**Blocks:** None
