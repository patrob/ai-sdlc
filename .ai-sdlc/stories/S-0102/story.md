---
id: S-0102
title: Implement Status Bar Component
priority: 4
status: backlog
type: feature
created: '2026-01-19'
labels:
  - tui
  - status-bar
  - epic-conversational-tui
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
slug: status-bar-component
dependencies:
  - S-0098
---
# Implement Status Bar Component

## User Story

**As a** developer using the ai-sdlc TUI
**I want** a status bar showing version, ready state, and current time
**So that** I can see system status at a glance

## Summary

Create the status bar shown in the design mockup: a horizontal bar below the header displaying version number, status indicator (READY/BUSY), and current time. This provides immediate visibility into system state.

## Technical Context

**Current State:**
- Version available from package.json
- Agent execution state tracked internally
- No persistent status display

**Target State:**
- Status bar with version, status indicator, time
- Real-time clock updates
- Status changes based on agent activity

## Acceptance Criteria

### Status Bar Layout

- [ ] Renders status bar matching design:
  ```
  v1.0.0  |  ● READY                                    10:52:25 AM
  ```

- [ ] Left: Version number (from package.json)
- [ ] Center-left: Status indicator with colored dot
- [ ] Right: Current time (updates every second)

### Status Indicator States

- [ ] **READY** (green dot): No agent activity, ready for input
- [ ] **PROCESSING** (yellow dot): Agent query in progress
- [ ] **ERROR** (red dot): Last operation failed
- [ ] **CONNECTING** (blue dot): Initializing connection

### Version Display

- [ ] Format: `v{major}.{minor}.{patch}`
- [ ] Read from @ai-sdlc/core or @ai-sdlc/tui package.json

### Clock

- [ ] Format: `HH:MM:SS AM/PM`
- [ ] Updates every second
- [ ] Uses system locale for formatting

## Files to Create

| File | Purpose |
|------|---------|
| `packages/tui/src/components/StatusBar.tsx` | Status bar component |
| `packages/tui/src/components/StatusIndicator.tsx` | Status dot + label |
| `packages/tui/src/components/Clock.tsx` | Real-time clock |
| `packages/tui/src/hooks/useClock.ts` | Clock update hook |
| `packages/tui/tests/StatusBar.test.tsx` | Status bar tests |

## Implementation Notes

```tsx
// packages/tui/src/components/StatusBar.tsx
import React from 'react';
import { Box, Text, Spacer } from 'ink';
import { StatusIndicator, Status } from './StatusIndicator.js';
import { Clock } from './Clock.js';

interface StatusBarProps {
  version: string;
  status: Status;
}

export function StatusBar({ version, status }: StatusBarProps) {
  return (
    <Box>
      <Text dimColor>v{version}</Text>
      <Text dimColor>  |  </Text>
      <StatusIndicator status={status} />
      <Spacer />
      <Clock />
    </Box>
  );
}
```

```tsx
// packages/tui/src/components/StatusIndicator.tsx
import React from 'react';
import { Text } from 'ink';

export type Status = 'ready' | 'processing' | 'error' | 'connecting';

const statusConfig: Record<Status, { color: string; label: string }> = {
  ready: { color: 'green', label: 'READY' },
  processing: { color: 'yellow', label: 'PROCESSING' },
  error: { color: 'red', label: 'ERROR' },
  connecting: { color: 'blue', label: 'CONNECTING' },
};

interface StatusIndicatorProps {
  status: Status;
}

export function StatusIndicator({ status }: StatusIndicatorProps) {
  const config = statusConfig[status];
  return (
    <Text>
      <Text color={config.color}>●</Text>
      <Text> </Text>
      <Text color={config.color}>{config.label}</Text>
    </Text>
  );
}
```

```tsx
// packages/tui/src/hooks/useClock.ts
import { useState, useEffect } from 'react';

export function useClock() {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => {
      setTime(new Date());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return time.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}
```

## Testing Requirements

- [ ] Unit test: Version displays correctly
- [ ] Unit test: Each status state renders correct color/label
- [ ] Unit test: Clock formats time correctly
- [ ] Unit test: Clock updates (mock timer)
- [ ] Integration test: Status bar visible in TUI
- [ ] `npm test` passes
- [ ] `npm run build` succeeds

## Definition of Done

- [ ] Status bar renders matching design
- [ ] All status states display correctly
- [ ] Clock updates in real-time
- [ ] Version reads from package.json
- [ ] All tests pass
- [ ] `make verify` passes

## References

- Design mockup: User-provided screenshot
- Related: S-0098 (TUI shell)
