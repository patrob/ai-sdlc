---
id: S-0096
title: Story Grouping Query Infrastructure
priority: 4
status: backlog
type: feature
created: '2026-01-19'
labels:
  - architecture
  - query-infrastructure
  - extensible
  - epic-batch-automation
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
slug: story-grouping-query-infrastructure
dependencies: []
---
# Story Grouping Query Infrastructure

## User Story

**As a** developer using ai-sdlc
**I want** to query stories by grouping dimensions (epic, sprint, team, labels)
**So that** I can filter and organize work across different views compatible with external PM tools

## Summary

Add a flexible, extensible query infrastructure for grouping stories. This infrastructure uses labels as the universal internal representation while supporting multiple grouping dimensions (thematic, temporal, structural) that can map to external systems (Jira Epics, GitHub Projects, Linear Cycles, etc.).

## Technical Context

**Research Findings:**
- Labels are the **universal many-to-many mechanism** across all PM tools
- All major systems support: single-parent hierarchy, labels/tags
- Grouping cardinality varies: Jira/Linear allow 1 epic, GitHub/Asana allow multiple
- Our existing `labels: string[]` is the right foundation

**Current State:**
- Stories have `labels: string[]` in frontmatter
- Epic convention exists: `epic-{name}` labels
- No query functions for filtering by labels
- No abstraction for grouping dimensions

**Target State:**
- Query functions for filtering stories by any label pattern
- Grouping dimension types with conventions (epic, sprint, team)
- Configuration for external system mapping
- Foundation for S-0095 (`--epic` flag) and future ticketing integration

## Design Principles

1. **Labels are source of truth** - Internal representation uses label conventions
2. **Conventions over configuration** - `epic-*`, `sprint-*`, `team-*` patterns work out-of-box
3. **Extensible mapping** - External systems can map their concepts to our labels
4. **Cardinality-aware** - Support both single and multiple groupings per dimension

## Acceptance Criteria

### Core Query Functions

- [ ] Add to `src/core/kanban.ts`:
  ```typescript
  findStoriesByLabel(sdlcRoot: string, label: string): Story[]
  findStoriesByLabels(sdlcRoot: string, labels: string[], mode: 'all' | 'any'): Story[]
  findStoriesByPattern(sdlcRoot: string, pattern: string): Story[]  // e.g., 'epic-*'
  ```

- [ ] Add convenience wrappers:
  ```typescript
  findStoriesByEpic(sdlcRoot: string, epicId: string): Story[]     // queries 'epic-{id}'
  findStoriesBySprint(sdlcRoot: string, sprintId: string): Story[] // queries 'sprint-{id}'
  findStoriesByTeam(sdlcRoot: string, teamId: string): Story[]     // queries 'team-{id}'
  ```

### Grouping Discovery

- [ ] Add functions to discover existing groupings:
  ```typescript
  getUniqueLabels(sdlcRoot: string): string[]
  getGroupings(sdlcRoot: string, dimension: GroupingDimension): GroupingSummary[]
  ```

- [ ] `GroupingSummary` includes:
  - `id`: Grouping identifier (e.g., `ticketing-integration`)
  - `label`: Full label (e.g., `epic-ticketing-integration`)
  - `storyCount`: Number of stories in this grouping
  - `statusBreakdown`: Count by status (backlog, ready, in-progress, done)

### Type Definitions

- [ ] Add to `src/types/index.ts`:
  ```typescript
  export type GroupingDimension = 'thematic' | 'temporal' | 'structural';

  export interface GroupingConfig {
    dimension: GroupingDimension;
    prefix: string;           // e.g., 'epic-', 'sprint-', 'team-'
    cardinality: 'single' | 'multiple';  // Can story have multiple?
    externalMapping?: {
      provider: string;       // e.g., 'jira', 'github', 'linear'
      fieldName: string;      // e.g., 'epic', 'project', 'cycle'
    };
  }

  export interface GroupingSummary {
    id: string;
    label: string;
    dimension: GroupingDimension;
    storyCount: number;
    statusBreakdown: Record<StoryStatus, number>;
  }

  // Default grouping conventions
  export const DEFAULT_GROUPINGS: GroupingConfig[] = [
    { dimension: 'thematic', prefix: 'epic-', cardinality: 'single' },
    { dimension: 'temporal', prefix: 'sprint-', cardinality: 'single' },
    { dimension: 'structural', prefix: 'team-', cardinality: 'single' },
  ];
  ```

### Configuration Support

- [ ] Add optional `groupings` section to `.ai-sdlc.json`:
  ```json
  {
    "groupings": {
      "thematic": {
        "prefix": "epic-",
        "cardinality": "single",
        "externalMapping": {
          "provider": "jira",
          "fieldName": "epic"
        }
      },
      "temporal": {
        "prefix": "sprint-",
        "cardinality": "single"
      }
    }
  }
  ```

- [ ] Configuration is **optional** - defaults work without config

### Edge Cases

- [ ] Story with no grouping labels returns in "ungrouped" queries
- [ ] Story with multiple epic labels (when cardinality=single) logs warning
- [ ] Pattern matching handles special regex characters safely
- [ ] Empty grouping queries return empty array (not error)

## Files to Modify

| File | Change |
|------|--------|
| `src/core/kanban.ts` | Add query functions |
| `src/types/index.ts` | Add grouping types |
| `src/core/config.ts` | Add optional groupings config |

## Files to Create

| File | Purpose |
|------|---------|
| `src/core/groupings.ts` | Grouping logic, pattern matching, discovery |
| `tests/unit/groupings.test.ts` | Unit tests for grouping queries |

## Implementation Notes

### Label Pattern Matching

```typescript
// Simple glob-to-regex for label patterns
function labelMatchesPattern(label: string, pattern: string): boolean {
  if (!pattern.includes('*')) {
    return label === pattern;
  }
  const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
  return regex.test(label);
}

// Find stories by pattern
export function findStoriesByPattern(sdlcRoot: string, pattern: string): Story[] {
  const allStories = findAllStories(sdlcRoot);
  return allStories.filter(story =>
    story.frontmatter.labels.some(label => labelMatchesPattern(label, pattern))
  );
}
```

### External Mapping (Future-Ready)

The `externalMapping` field is stored but **not implemented** in this story. It provides the hook for S-0073+ (ticketing integration) to:
1. Read the mapping configuration
2. Sync local groupings to external system fields
3. Import external groupings as local labels

Example future use:
```typescript
// In ticketing provider (future S-0073+)
async function syncEpicToJira(story: Story, jiraClient: JiraClient) {
  const config = getGroupingConfig('thematic');
  if (config.externalMapping?.provider === 'jira') {
    const epicLabel = story.frontmatter.labels.find(l => l.startsWith(config.prefix));
    if (epicLabel) {
      const epicId = epicLabel.replace(config.prefix, '');
      await jiraClient.setEpic(story.ticket_id, epicId);
    }
  }
}
```

## Testing Requirements

- [ ] Unit tests for `findStoriesByLabel()` with exact match
- [ ] Unit tests for `findStoriesByLabels()` with 'all' and 'any' modes
- [ ] Unit tests for `findStoriesByPattern()` with glob patterns
- [ ] Unit tests for `findStoriesByEpic()` convenience wrapper
- [ ] Unit tests for `getGroupings()` discovery function
- [ ] Unit tests for cardinality warning (multiple epics)
- [ ] Unit tests for empty/missing labels edge cases
- [ ] Integration test with real story files
- [ ] `npm test` passes
- [ ] `npm run build` succeeds

## Out of Scope

- External system synchronization (S-0073+)
- CLI commands for grouping management (can be added later)
- Nested groupings / grouping hierarchy
- Cross-grouping dependency validation

## Definition of Done

- [ ] All query functions implemented and exported
- [ ] Type definitions added to `src/types/index.ts`
- [ ] Optional configuration support added
- [ ] Default conventions work without configuration
- [ ] All tests pass
- [ ] `make verify` passes

## References

- Prerequisite for: S-0095 (Parallel Epic Processing)
- Compatible with: S-0073+ (Ticketing Integration epic)
- Research: Universal grouping patterns across Jira, GitHub, Linear, Asana

## Appendix: PM Tool Mapping Reference

| Our Concept | Jira | GitHub | Linear | Asana |
|-------------|------|--------|--------|-------|
| `epic-*` (thematic) | Epic | Project | Project | Project |
| `sprint-*` (temporal) | Sprint | Milestone | Cycle | - |
| `team-*` (structural) | Component | Repository | Team | Team |
| `labels` (tags) | Labels | Labels | Labels | Tags |

**Cardinality by system:**
- Jira: 1 epic, 1 sprint, N labels
- GitHub: N projects, 1 milestone, N labels
- Linear: 1 project, 1 cycle, N labels
- Asana: N projects, N tags
