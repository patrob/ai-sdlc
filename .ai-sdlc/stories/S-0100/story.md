---
id: S-0100
title: Implement Streaming Output Panel with Log Formatting
priority: 3
status: backlog
type: feature
created: '2026-01-19'
labels:
  - tui
  - output
  - streaming
  - epic-conversational-tui
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
slug: streaming-output-panel
dependencies:
  - S-0098
---
# Implement Streaming Output Panel with Log Formatting

## User Story

**As a** developer using the ai-sdlc TUI
**I want** to see streaming output with timestamps and severity levels
**So that** I can follow what the system is doing in real-time

## Summary

Create the output panel shown in the design mockup: a scrollable area displaying timestamped log entries with severity indicators ([SYS], [INFO], [✓], [!]). This panel receives events from the existing `AgentProgressCallback` and renders them in the TUI.

## Technical Context

**Current State:**
- `AgentProgressEvent` types exist in `src/core/client.ts`
- Progress callbacks output to console via ora spinners
- No structured log display in TUI

**Target State:**
- Output panel with scrollable log history
- Timestamps on each entry (HH:MM:SS AM/PM)
- Severity-based coloring and prefixes
- "Clear" button to reset output
- Auto-scroll to bottom on new entries

## Acceptance Criteria

### Output Panel Layout

- [ ] Renders panel matching design:
  ```
  Output                                                    Clear
  ─────────────────────────────────────────────────────────────────
  10:52:25 AM  [SYS]  AI-SDLC Orchestrator initialized successfully
  10:52:25 AM  [INFO] Connected to repository: github.com/org/repo
  10:52:25 AM  [✓]    Ready to process requests
  ```

- [ ] Panel header with "Output" label and "Clear" action
- [ ] Scrollable content area
- [ ] Auto-scroll to newest entry (unless user scrolled up)

### Log Entry Format

- [ ] Timestamp format: `HH:MM:SS AM/PM`
- [ ] Severity prefix with color:
  | Prefix | Color | Use Case |
  |--------|-------|----------|
  | `[SYS]` | Cyan | System messages |
  | `[INFO]` | Blue | Informational |
  | `[✓]` | Green | Success/completion |
  | `[!]` | Yellow | Warning |
  | `[✗]` | Red | Error |
  | `[→]` | Magenta | Tool execution |

### Event Mapping

- [ ] Map `AgentProgressEvent` to log entries:
  | Event Type | Prefix | Message |
  |------------|--------|---------|
  | `session_start` | `[SYS]` | "Session started: {sessionId}" |
  | `tool_start` | `[→]` | "Running: {toolName}" |
  | `tool_end` | `[✓]` | "Completed: {toolName}" |
  | `assistant_message` | `[INFO]` | Content (truncated if long) |
  | `completion` | `[✓]` | "Request completed" |
  | `error` | `[✗]` | Error message |
  | `retry` | `[!]` | "Retrying (attempt {n})..." |

### Interactions

- [ ] "Clear" button clears all log entries
- [ ] Scroll up pauses auto-scroll
- [ ] Scroll to bottom resumes auto-scroll
- [ ] Maximum 500 entries (older entries removed)

## Files to Create

| File | Purpose |
|------|---------|
| `packages/tui/src/components/OutputPanel.tsx` | Main output panel |
| `packages/tui/src/components/LogEntry.tsx` | Individual log entry |
| `packages/tui/src/components/PanelHeader.tsx` | Panel header with title/actions |
| `packages/tui/src/hooks/useLogBuffer.ts` | Log entry state management |
| `packages/tui/src/utils/formatters.ts` | Timestamp and message formatters |
| `packages/tui/tests/OutputPanel.test.tsx` | Output panel tests |

## Implementation Notes

```tsx
// packages/tui/src/components/OutputPanel.tsx
import React from 'react';
import { Box, Text, Spacer } from 'ink';
import { LogEntry, LogSeverity } from './LogEntry.js';
import { useLogBuffer } from '../hooks/useLogBuffer.js';

interface OutputPanelProps {
  entries: LogEntryData[];
  onClear: () => void;
}

export function OutputPanel({ entries, onClear }: OutputPanelProps) {
  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box>
        <Text color="red">Output</Text>
        <Spacer />
        <Text color="gray" dimColor>Clear</Text>
      </Box>
      <Box
        flexDirection="column"
        borderStyle="single"
        borderColor="gray"
        flexGrow={1}
        overflow="hidden"
      >
        {entries.map((entry, i) => (
          <LogEntry key={i} {...entry} />
        ))}
      </Box>
    </Box>
  );
}
```

```tsx
// packages/tui/src/components/LogEntry.tsx
import React from 'react';
import { Box, Text } from 'ink';

export type LogSeverity = 'sys' | 'info' | 'success' | 'warning' | 'error' | 'tool';

const severityConfig: Record<LogSeverity, { prefix: string; color: string }> = {
  sys: { prefix: '[SYS]', color: 'cyan' },
  info: { prefix: '[INFO]', color: 'blue' },
  success: { prefix: '[✓]', color: 'green' },
  warning: { prefix: '[!]', color: 'yellow' },
  error: { prefix: '[✗]', color: 'red' },
  tool: { prefix: '[→]', color: 'magenta' },
};

interface LogEntryProps {
  timestamp: Date;
  severity: LogSeverity;
  message: string;
}

export function LogEntry({ timestamp, severity, message }: LogEntryProps) {
  const config = severityConfig[severity];
  const time = timestamp.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  return (
    <Box>
      <Text dimColor>{time}</Text>
      <Text> </Text>
      <Text color={config.color}>{config.prefix.padEnd(6)}</Text>
      <Text> </Text>
      <Text>{message}</Text>
    </Box>
  );
}
```

```typescript
// packages/tui/src/hooks/useLogBuffer.ts
import { useState, useCallback } from 'react';
import { AgentProgressEvent } from '@ai-sdlc/core';

const MAX_ENTRIES = 500;

export function useLogBuffer() {
  const [entries, setEntries] = useState<LogEntryData[]>([]);

  const addEntry = useCallback((event: AgentProgressEvent) => {
    const entry = mapEventToEntry(event);
    setEntries(prev => {
      const next = [...prev, entry];
      return next.length > MAX_ENTRIES ? next.slice(-MAX_ENTRIES) : next;
    });
  }, []);

  const clear = useCallback(() => setEntries([]), []);

  return { entries, addEntry, clear };
}
```

## Testing Requirements

- [ ] Unit test: Log entry renders with correct format
- [ ] Unit test: Each severity displays correct prefix/color
- [ ] Unit test: Timestamp formats correctly
- [ ] Unit test: AgentProgressEvent maps to correct entry type
- [ ] Unit test: Clear removes all entries
- [ ] Unit test: Max entries limit enforced
- [ ] Integration test: Events stream to output panel
- [ ] `npm test` passes
- [ ] `npm run build` succeeds

## Definition of Done

- [ ] Output panel renders with design layout
- [ ] All severity levels display correctly
- [ ] Events map to appropriate log entries
- [ ] Clear functionality works
- [ ] Auto-scroll behavior correct
- [ ] All tests pass
- [ ] `make verify` passes

## References

- Design mockup: User-provided screenshot
- `AgentProgressEvent`: `packages/core/src/core/client.ts`
- Related: S-0098 (TUI shell), S-0099 (Input component)
