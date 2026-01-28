---
id: S-0076
title: GitHub Projects priority sync
priority: 60
status: ready
type: feature
created: '2026-01-19'
labels:
  - github
  - projects
  - priority
  - ticketing
  - epic-ticketing-integration
epic: ticketing-integration
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
slug: github-projects-priority-sync
dependencies:
  - S-0075
---
# GitHub Projects priority sync

## User Story

**As a** user with GitHub Projects
**I want** priority to sync from project board position
**So that** I can manage priority in GitHub and have ai-sdlc respect it

## Summary

This story adds GitHub Projects integration to sync issue priority based on board position or priority field. Teams can manage priority in GitHub Projects, and ai-sdlc will respect that ordering when selecting which stories to work on.

## Context

### GitHub Projects (v2)

GitHub Projects v2 uses a GraphQL API accessible via `gh`. Issues can have:
- **Position in a view**: Implicit priority based on order
- **Priority field**: Explicit priority (P0, P1, P2, etc.)
- **Status field**: Column in the board

### Priority Sync Flow

```
GitHub Project Board              Local Story
────────────────────              ───────────
Position 1 (top)     ─────────►   priority: 10
Position 2           ─────────►   priority: 20
Position 3           ─────────►   priority: 30
...
```

Or with priority field:
```
Priority: P0         ─────────►   priority: 10
Priority: P1         ─────────►   priority: 20
Priority: P2         ─────────►   priority: 30
```

## Acceptance Criteria

### Configuration

- [ ] Add GitHub Projects config options:
  ```json
  {
    "ticketing": {
      "provider": "github",
      "github": {
        "projectNumber": 5,
        "priorityField": "Priority",
        "priorityMapping": {
          "P0": 10,
          "P1": 20,
          "P2": 30,
          "P3": 40
        }
      }
    }
  }
  ```

### Priority Sync Implementation

- [ ] Add `syncPriority()` method to GitHubTicketProvider:
  ```typescript
  async syncPriority(ticketId: string): Promise<number | null> {
    // Query project for issue's priority field or position
    // Return normalized priority value (10, 20, 30, etc.)
  }
  ```

- [ ] Query GitHub Project via gh CLI:
  ```bash
  # Get project items with priority field
  gh project item-list {projectNumber} --owner {owner} --format json

  # Or via GraphQL for more control
  gh api graphql -f query='...'
  ```

### Sync Triggers

- [ ] Sync priority on `ai-sdlc import`:
  ```bash
  ai-sdlc import https://github.com/org/repo/issues/123
  # Fetches priority from project if issue is in project
  ```

- [ ] Sync priority on `ai-sdlc sync`:
  ```bash
  ai-sdlc sync S-0042
  # Updates local priority from GitHub Project
  ```

- [ ] Sync priority on `ai-sdlc run` (before selecting next story):
  ```typescript
  if (config.ticketing?.github?.projectNumber) {
    await syncPrioritiesFromProject();
  }
  ```

### Priority Display

- [ ] Show priority source in `ai-sdlc status`:
  ```
  Stories:
  ID      Title                    Status       Priority  Source
  S-0042  Add authentication       ready        10        GitHub Project
  S-0043  Fix login bug           ready        20        GitHub Project
  S-0044  Update docs             ready        50        Local
  ```

### gh CLI / GraphQL Usage

- [ ] Create utility for querying GitHub Projects:
  ```typescript
  async function getProjectItems(
    owner: string,
    projectNumber: number
  ): Promise<ProjectItem[]> {
    // gh project item-list {number} --owner {owner} --format json
  }

  async function getIssuePriorityFromProject(
    owner: string,
    projectNumber: number,
    issueNumber: number
  ): Promise<string | null> {
    // Find issue in project items
    // Return priority field value or position
  }
  ```

### Testing

- [ ] Unit test: syncPriority returns correct value from project
- [ ] Unit test: priority mapping converts P0/P1/P2 to numeric values
- [ ] Unit test: fallback to local priority when not in project
- [ ] Integration test: import syncs priority from project
- [ ] Integration test: sync command updates priority
- [ ] Test: issue not in project returns null (uses local priority)

### Documentation

- [ ] Document GitHub Projects configuration
- [ ] Document priority mapping options
- [ ] Document sync behavior and triggers
- [ ] Add examples for common project setups

## Technical Details

### GitHub Projects GraphQL Query

```graphql
query($owner: String!, $number: Int!) {
  organization(login: $owner) {
    projectV2(number: $number) {
      items(first: 100) {
        nodes {
          content {
            ... on Issue {
              number
            }
          }
          fieldValueByName(name: "Priority") {
            ... on ProjectV2ItemFieldSingleSelectValue {
              name
            }
          }
        }
      }
    }
  }
}
```

### Priority Normalization

Convert various priority formats to consistent numeric scale:
- Position-based: position * 10 (1→10, 2→20, 3→30)
- P0/P1/P2: Use mapping from config
- Numeric field: Use directly or scale

### Caching

Consider caching project data to avoid repeated API calls:
```typescript
// Cache project items for 5 minutes
const projectCache = new Map<string, { items: ProjectItem[], expires: number }>();
```

## Out of Scope

- Writing priority back to GitHub Projects
- Creating/managing project views
- Syncing other project fields (status column is handled in S-0075)
- Supporting multiple projects per repo

## Definition of Done

- [ ] GitHubTicketProvider implements `syncPriority()` method
- [ ] Priority syncs on import, sync, and run commands
- [ ] Priority mapping configuration works
- [ ] Fallback to local priority when issue not in project
- [ ] All unit and integration tests pass
- [ ] Documentation updated
- [ ] `make verify` passes
