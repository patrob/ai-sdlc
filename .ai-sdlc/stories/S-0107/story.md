---
id: S-0107
title: Implement Tab Navigation (Terminal/Stories Views)
priority: 7
status: backlog
type: feature
created: '2026-01-19'
labels:
  - tui
  - navigation
  - tabs
  - epic-conversational-tui
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
slug: tab-navigation
dependencies:
  - S-0098
  - S-0100
---
# Implement Tab Navigation (Terminal/Stories Views)

## User Story

**As a** developer using the ai-sdlc TUI
**I want** to switch between Terminal and Stories views using tabs
**So that** I can see my conversation/output or my story board without leaving the TUI

## Summary

Add tab navigation shown in the design mockup. The "Terminal" tab shows the output panel and input prompt. The "Stories" tab shows a kanban-style board of all stories. Users can switch views while maintaining state.

## Technical Context

**Current State:**
- Single view with output panel and input
- `status` command shows board in CLI
- No view switching in TUI

**Target State:**
- Tab bar with Terminal and Stories tabs
- Terminal view: output panel + input (current)
- Stories view: kanban board visualization
- Keyboard shortcut to switch (Tab or number keys)

## Acceptance Criteria

### Tab Bar

- [ ] Renders tab bar matching design:
  ```
  ┌──────────┐ ┌─────────────┐
  │ Terminal │ │ Stories (5) │
  └──────────┘ └─────────────┘
  ```

- [ ] Active tab highlighted (underline or different background)
- [ ] Stories tab shows count of non-done stories
- [ ] Tabs clickable (if Ink supports) or keyboard navigable

### Terminal View (Default)

- [ ] Output panel with log entries
- [ ] Input prompt at bottom
- [ ] All existing TUI functionality

### Stories View

- [ ] Kanban-style board with columns:
  ```
  Backlog          In Progress      Review           Done
  ─────────────────────────────────────────────────────────
  S-0097           S-0054           S-0063           S-0050
  Monorepo...      Recovery...      Parallel...      Config...

  S-0098
  Basic TUI...
  ```

- [ ] Show story ID and truncated title
- [ ] Color-code by priority
- [ ] Scrollable if many stories
- [ ] Show story count per column

### Navigation

- [ ] Tab key cycles between tabs
- [ ] 1 key jumps to Terminal
- [ ] 2 key jumps to Stories
- [ ] Arrow keys navigate within Stories view (select story)
- [ ] Enter on story shows detail / sets as current context

### State Preservation

- [ ] Switching tabs preserves:
  - Output panel content
  - Input buffer
  - Selected story (if any)
  - Scroll position

## Files to Create

| File | Purpose |
|------|---------|
| `packages/tui/src/components/TabBar.tsx` | Tab navigation component |
| `packages/tui/src/components/Tab.tsx` | Individual tab |
| `packages/tui/src/views/TerminalView.tsx` | Terminal view container |
| `packages/tui/src/views/StoriesView.tsx` | Kanban board view |
| `packages/tui/src/components/KanbanBoard.tsx` | Board visualization |
| `packages/tui/src/components/StoryCard.tsx` | Individual story card |
| `packages/tui/src/hooks/useNavigation.ts` | Tab navigation state |
| `packages/tui/tests/TabNavigation.test.tsx` | Navigation tests |

## Implementation Notes

```tsx
// packages/tui/src/components/TabBar.tsx
import React from 'react';
import { Box } from 'ink';
import { Tab } from './Tab.js';

export type TabId = 'terminal' | 'stories';

interface TabBarProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  storiesCount: number;
}

export function TabBar({ activeTab, onTabChange, storiesCount }: TabBarProps) {
  return (
    <Box>
      <Tab
        id="terminal"
        label="Terminal"
        isActive={activeTab === 'terminal'}
        onSelect={() => onTabChange('terminal')}
      />
      <Tab
        id="stories"
        label={`Stories (${storiesCount})`}
        isActive={activeTab === 'stories'}
        onSelect={() => onTabChange('stories')}
      />
    </Box>
  );
}
```

```tsx
// packages/tui/src/views/StoriesView.tsx
import React from 'react';
import { Box } from 'ink';
import { KanbanBoard } from '../components/KanbanBoard.js';
import { useStories } from '../hooks/useStories.js';

interface StoriesViewProps {
  onStorySelect: (storyId: string) => void;
}

export function StoriesView({ onStorySelect }: StoriesViewProps) {
  const { stories, loading } = useStories();

  if (loading) {
    return <Text>Loading stories...</Text>;
  }

  const columns = groupByStatus(stories);

  return (
    <Box flexDirection="column" flexGrow={1}>
      <KanbanBoard
        columns={columns}
        onStorySelect={onStorySelect}
      />
    </Box>
  );
}

function groupByStatus(stories: Story[]): KanbanColumn[] {
  const statusOrder = ['backlog', 'in-progress', 'review', 'done'];
  const grouped = new Map<string, Story[]>();

  for (const status of statusOrder) {
    grouped.set(status, []);
  }

  for (const story of stories) {
    const list = grouped.get(story.status) || [];
    list.push(story);
    grouped.set(story.status, list);
  }

  return statusOrder.map(status => ({
    status,
    title: formatStatusTitle(status),
    stories: grouped.get(status) || [],
  }));
}
```

```tsx
// packages/tui/src/components/KanbanBoard.tsx
import React from 'react';
import { Box, Text } from 'ink';
import { StoryCard } from './StoryCard.js';

interface KanbanColumn {
  status: string;
  title: string;
  stories: Story[];
}

interface KanbanBoardProps {
  columns: KanbanColumn[];
  onStorySelect: (storyId: string) => void;
  selectedStoryId?: string;
}

export function KanbanBoard({ columns, onStorySelect, selectedStoryId }: KanbanBoardProps) {
  return (
    <Box>
      {columns.map(column => (
        <Box
          key={column.status}
          flexDirection="column"
          width="25%"
          paddingX={1}
        >
          <Text bold underline>
            {column.title} ({column.stories.length})
          </Text>
          <Box flexDirection="column" marginTop={1}>
            {column.stories.map(story => (
              <StoryCard
                key={story.id}
                story={story}
                isSelected={story.id === selectedStoryId}
                onSelect={() => onStorySelect(story.id)}
              />
            ))}
          </Box>
        </Box>
      ))}
    </Box>
  );
}
```

```tsx
// packages/tui/src/hooks/useNavigation.ts
import { useState, useEffect } from 'react';
import { useInput } from 'ink';

export type TabId = 'terminal' | 'stories';

export function useNavigation() {
  const [activeTab, setActiveTab] = useState<TabId>('terminal');

  useInput((input, key) => {
    if (key.tab) {
      setActiveTab(current => current === 'terminal' ? 'stories' : 'terminal');
    } else if (input === '1') {
      setActiveTab('terminal');
    } else if (input === '2') {
      setActiveTab('stories');
    }
  });

  return { activeTab, setActiveTab };
}
```

## Testing Requirements

- [ ] Unit test: TabBar renders correct tabs
- [ ] Unit test: Active tab highlighted
- [ ] Unit test: Stories count displayed
- [ ] Unit test: Tab key switches tabs
- [ ] Unit test: Number keys switch tabs
- [ ] Unit test: KanbanBoard groups stories correctly
- [ ] Unit test: StoryCard renders story info
- [ ] Integration test: View switches preserve state
- [ ] Integration test: Story selection works
- [ ] `npm test` passes
- [ ] `npm run build` succeeds

## Definition of Done

- [ ] Tab bar renders with correct tabs
- [ ] Terminal view shows output/input
- [ ] Stories view shows kanban board
- [ ] Keyboard navigation works
- [ ] State preserved across tab switches
- [ ] All tests pass
- [ ] `make verify` passes

## References

- Design mockup: User-provided screenshot
- Existing kanban data: `packages/core/src/core/kanban.ts`
- Related: S-0098 (TUI shell), S-0100 (Output panel)
