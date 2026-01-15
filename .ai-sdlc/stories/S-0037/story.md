---
id: S-0037
title: Concurrent-Safe Logging
priority: 3
status: backlog
type: feature
created: '2026-01-15'
labels:
  - concurrent-workflows
  - phase-2
  - infrastructure
epic: concurrent-workflows
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
slug: concurrent-safe-logging
---
# Concurrent-Safe Logging

## User Story

**As a** developer running multiple stories concurrently,
**I want** each story's output logged to a separate file,
**So that** I can review what each agent did without interleaved output.

## Summary

When multiple agents run in separate terminals, their console output can be hard to track. This story adds per-story log files that capture all agent output, making it easy to review what happened in each story.

## Context

This is the third story in **Phase 2: Concurrent Execution MVP** of the Concurrent Workflows epic.

**Depends on:** S-0033 (Per-Story Workflow State)
**Blocks:** Phase 3 stories (required for orchestrator)

**Reference:** `docs/ROADMAP_TO_CONCURRENT_WORK.md` (Section 5, Phase 2)

## Acceptance Criteria

- [ ] Each story execution creates a log file in its story directory
- [ ] Log file location: `stories/{id}/logs/{timestamp}.log`
- [ ] All agent output (stdout, stderr) captured to log file
- [ ] Log includes timestamps for each entry
- [ ] Console output continues normally (dual output)
- [ ] Log rotation: keep last N logs per story (configurable, default 5)
- [ ] `ai-sdlc logs <story-id>` command to view/tail logs
- [ ] All existing tests pass (`npm test`)
- [ ] TypeScript compilation succeeds (`npm run build`)

## Technical Notes

### Log File Structure

```
.ai-sdlc/stories/S-0001/
├── story.md
├── .workflow-state.json
└── logs/
    ├── 2026-01-15T10-30-00.log
    ├── 2026-01-15T14-45-22.log
    └── 2026-01-15T16-00-00.log  (latest)
```

### Log Format

```
[2026-01-15T10:30:00.123Z] [INFO] Starting story S-0001: Add user authentication
[2026-01-15T10:30:00.456Z] [INFO] Action: research
[2026-01-15T10:30:15.789Z] [AGENT] Analyzing codebase for authentication patterns...
[2026-01-15T10:31:00.000Z] [AGENT] Found existing auth middleware in src/middleware/
[2026-01-15T10:32:00.000Z] [INFO] Research complete, moving to plan
...
```

### Implementation Approach

```typescript
import { createWriteStream, WriteStream } from 'fs';
import path from 'path';

class StoryLogger {
  private logStream: WriteStream;
  private storyId: string;

  constructor(storyId: string, sdlcRoot: string) {
    this.storyId = storyId;
    const logDir = path.join(sdlcRoot, 'stories', storyId, 'logs');
    fs.mkdirSync(logDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const logPath = path.join(logDir, `${timestamp}.log`);
    this.logStream = createWriteStream(logPath, { flags: 'a' });

    this.rotateOldLogs(logDir);
  }

  log(level: 'INFO' | 'AGENT' | 'ERROR' | 'WARN', message: string): void {
    const timestamp = new Date().toISOString();
    const entry = `[${timestamp}] [${level}] ${message}\n`;

    // Write to file
    this.logStream.write(entry);

    // Also write to console (unless quiet mode)
    if (level === 'ERROR') {
      console.error(message);
    } else {
      console.log(message);
    }
  }

  private rotateOldLogs(logDir: string, keep: number = 5): void {
    const logs = fs.readdirSync(logDir)
      .filter(f => f.endsWith('.log'))
      .sort()
      .reverse();

    // Delete logs beyond the keep limit
    logs.slice(keep).forEach(log => {
      fs.unlinkSync(path.join(logDir, log));
    });
  }

  close(): void {
    this.logStream.end();
  }
}
```

### CLI Command for Viewing Logs

```typescript
// ai-sdlc logs <story-id> [--tail] [--lines N]
program
  .command('logs <storyId>')
  .description('View logs for a story')
  .option('-t, --tail', 'Follow log output')
  .option('-n, --lines <n>', 'Number of lines to show', '50')
  .action(async (storyId, options) => {
    const logPath = getLatestLogPath(storyId);

    if (options.tail) {
      // Use tail -f equivalent
      tailLog(logPath);
    } else {
      // Show last N lines
      const lines = await readLastLines(logPath, parseInt(options.lines));
      console.log(lines);
    }
  });
```

### Files to Create/Modify

- `src/core/logger.ts` - New StoryLogger class
- `src/cli/commands.ts` - Integrate logger into run flow
- `src/index.ts` - Add `logs` command
- `src/core/index.ts` - Export logger

## Edge Cases

1. **Disk full**: Graceful degradation, warn user
2. **Permission denied**: Error with clear message
3. **Concurrent log writes**: Each run has its own log file (no conflict)
4. **Very long lines**: Truncate or wrap at reasonable limit
5. **Binary output**: Escape or skip non-printable characters

## Definition of Done

- [ ] Code review completed
- [ ] All tests passing (`npm test` shows 0 failures)
- [ ] TypeScript compilation succeeds (`npm run build`)
- [ ] Log files created in correct location
- [ ] `ai-sdlc logs` command works correctly
- [ ] Log rotation removes old files

---

**Effort:** medium
**Dependencies:** S-0033
**Blocks:** Phase 3 stories
