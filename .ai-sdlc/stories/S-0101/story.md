---
id: S-0101
title: Create Metrics Dashboard Component
priority: 4
status: backlog
type: feature
created: '2026-01-19'
labels:
  - tui
  - dashboard
  - metrics
  - epic-conversational-tui
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
slug: metrics-dashboard
dependencies:
  - S-0098
---
# Create Metrics Dashboard Component

## User Story

**As a** developer using the ai-sdlc TUI
**I want** to see key metrics at a glance (stories completed, cycle time, commits, success rate)
**So that** I can understand my SDLC health without running separate commands

## Summary

Create the metrics dashboard shown in the design mockup: four stat cards displaying key performance indicators with trend indicators. Metrics are calculated from story history and git data.

## Technical Context

**Current State:**
- Story metadata tracks completion dates
- Git history available via commands
- No aggregated metrics calculation
- CLI `status` command shows current state but no trends

**Target State:**
- Four metric cards in horizontal row
- Real-time data from stories and git
- Trend indicators (↑/↓ with percentages)
- Refresh on story state changes

## Acceptance Criteria

### Dashboard Layout

- [ ] Renders four metric cards matching design:
  ```
  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
  │ ✓      ↑8%   │ │ ◷     ↓12%   │ │ ⌥      ↑15%  │ │ 📈           │
  │ 12           │ │ 2.3h         │ │ 47           │ │ 98.5%        │
  │ Stories      │ │ Avg. Cycle   │ │ Commits      │ │ Success      │
  │ Completed    │ │ Time         │ │ Today        │ │ Rate         │
  └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘
  ```

### Metric Calculations

- [ ] **Stories Completed**: Count of stories with `status: done` in current period
  - Trend: Compare to previous period (week over week)

- [ ] **Avg. Cycle Time**: Mean time from `status: in-progress` to `status: done`
  - Calculated from story metadata timestamps
  - Trend: Compare to previous period

- [ ] **Commits Today**: Count of git commits in current day
  - Use `git log --since="midnight" --oneline | wc -l`
  - Trend: Compare to yesterday

- [ ] **Success Rate**: Percentage of stories completed without reversion
  - Stories that went to done and stayed done
  - Trend: Rolling 30-day average vs previous 30 days

### Trend Indicators

- [ ] Green ↑ for positive trends
- [ ] Red ↓ for negative trends
- [ ] Gray — for no change
- [ ] Percentage shown next to arrow

### Data Refresh

- [ ] Metrics calculated on TUI launch
- [ ] Refresh when story status changes
- [ ] Manual refresh with Ctrl+R (if feasible)

## Files to Create

| File | Purpose |
|------|---------|
| `packages/tui/src/components/MetricsDashboard.tsx` | Dashboard container |
| `packages/tui/src/components/MetricCard.tsx` | Individual metric card |
| `packages/core/src/core/metrics.ts` | Metrics calculation logic |
| `packages/tui/src/hooks/useMetrics.ts` | Metrics data hook |
| `packages/tui/tests/MetricsDashboard.test.tsx` | Dashboard tests |
| `packages/core/tests/metrics.test.ts` | Calculation tests |

## Implementation Notes

```tsx
// packages/tui/src/components/MetricCard.tsx
import React from 'react';
import { Box, Text } from 'ink';

interface MetricCardProps {
  icon: string;
  value: string | number;
  label: string;
  trend?: {
    direction: 'up' | 'down' | 'none';
    percentage: number;
  };
}

export function MetricCard({ icon, value, label, trend }: MetricCardProps) {
  const trendColor = trend?.direction === 'up' ? 'green'
    : trend?.direction === 'down' ? 'red'
    : 'gray';
  const trendArrow = trend?.direction === 'up' ? '↑'
    : trend?.direction === 'down' ? '↓'
    : '—';

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="gray"
      paddingX={2}
      paddingY={1}
      width={18}
    >
      <Box justifyContent="space-between">
        <Text>{icon}</Text>
        {trend && (
          <Text color={trendColor}>
            {trendArrow}{trend.percentage}%
          </Text>
        )}
      </Box>
      <Text bold>{value}</Text>
      <Text dimColor>{label}</Text>
    </Box>
  );
}
```

```typescript
// packages/core/src/core/metrics.ts
export interface SDLCMetrics {
  storiesCompleted: MetricValue;
  avgCycleTime: MetricValue;
  commitsToday: MetricValue;
  successRate: MetricValue;
}

export interface MetricValue {
  value: number | string;
  trend: {
    direction: 'up' | 'down' | 'none';
    percentage: number;
  };
}

export async function calculateMetrics(
  sdlcRoot: string,
  projectRoot: string
): Promise<SDLCMetrics> {
  const stories = await loadAllStories(sdlcRoot);
  const gitStats = await getGitStats(projectRoot);

  return {
    storiesCompleted: calculateStoriesCompleted(stories),
    avgCycleTime: calculateAvgCycleTime(stories),
    commitsToday: calculateCommitsToday(gitStats),
    successRate: calculateSuccessRate(stories),
  };
}
```

### Metric Icons

Using Unicode symbols that render well in terminals:
- Stories Completed: `✓` (U+2713)
- Avg. Cycle Time: `◷` (U+25F7) or `⏱`
- Commits Today: `⌥` or simple `-○-`
- Success Rate: `📈` or `↗`

## Testing Requirements

- [ ] Unit test: MetricCard renders all variants
- [ ] Unit test: Trend arrows colored correctly
- [ ] Unit test: calculateStoriesCompleted accuracy
- [ ] Unit test: calculateAvgCycleTime handles edge cases
- [ ] Unit test: calculateCommitsToday parses git output
- [ ] Unit test: calculateSuccessRate percentage correct
- [ ] Integration test: Dashboard displays in TUI
- [ ] `npm test` passes
- [ ] `npm run build` succeeds

## Definition of Done

- [ ] Four metric cards render matching design
- [ ] All metrics calculate correctly from data
- [ ] Trend indicators display appropriately
- [ ] Metrics refresh on story changes
- [ ] All tests pass
- [ ] `make verify` passes

## References

- Design mockup: User-provided screenshot
- Story data: `packages/core/src/core/kanban.ts`
- Related: S-0098 (TUI shell)
