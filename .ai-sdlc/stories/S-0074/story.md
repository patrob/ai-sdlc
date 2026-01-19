---
id: S-0074
title: Implement GitHub read operations (import/link)
priority: 40
status: backlog
type: feature
created: '2026-01-19'
labels:
  - github
  - integration
  - ticketing
  - epic-ticketing-integration
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
slug: github-read-operations
dependencies:
  - S-0073
---
# Implement GitHub read operations (import/link)

## User Story

**As a** user with GitHub Issues
**I want** to import and link issues to local stories
**So that** I can work with existing issues in ai-sdlc

## Summary

This story implements the read operations for GitHub Issues integration using the `gh` CLI. Users can import existing GitHub Issues as new stories, or link existing stories to issues. This is the first visible value from the ticketing integration epic.

## Context

### Prerequisites

- User must have `gh` CLI installed and authenticated
- User must have access to the repository's issues

### gh CLI Usage

The `gh` CLI provides structured output that's easy to parse:

```bash
# List issues
gh issue list --json number,title,body,state,labels,assignees

# Get single issue
gh issue view 123 --json number,title,body,state,labels,assignees,projectItems
```

## Acceptance Criteria

### GitHubTicketProvider Implementation

- [ ] Create `src/services/ticket-provider/github-provider.ts`

- [ ] Implement `list()` method:
  ```typescript
  async list(filter?: TicketFilter): Promise<Ticket[]> {
    // gh issue list --json number,title,body,state,labels
    // Map to Ticket objects
  }
  ```

- [ ] Implement `get()` method:
  ```typescript
  async get(id: string): Promise<Ticket> {
    // gh issue view {id} --json number,title,body,state,labels,projectItems
    // Map to Ticket object with priority from project if available
  }
  ```

- [ ] Map GitHub issue state to StoryStatus:
  - `open` → `ready` (default) or use label mapping from config
  - `closed` → `done`

### CLI Commands

- [ ] Add `ai-sdlc import <issue-url>` command:
  ```bash
  ai-sdlc import https://github.com/org/repo/issues/123

  # Output:
  # Importing GitHub Issue #123...
  # Created story: S-0042 - Add user authentication
  # Linked to: https://github.com/org/repo/issues/123
  ```

  - [ ] Parse issue URL to extract owner/repo/number
  - [ ] Fetch issue details via `gh issue view`
  - [ ] Create new story with:
    - Title from issue title
    - Description from issue body
    - `ticket_provider: 'github'`
    - `ticket_id: '123'`
    - `ticket_url: <full-url>`
    - `ticket_synced_at: <now>`
  - [ ] Handle already-imported issues (check existing stories for ticket_id)

- [ ] Add `ai-sdlc link <story-id> <issue-url>` command:
  ```bash
  ai-sdlc link S-0042 https://github.com/org/repo/issues/123

  # Output:
  # Linked S-0042 to GitHub Issue #123
  # Synced: title, description, status
  ```

  - [ ] Update existing story with ticket fields
  - [ ] Optionally sync title/description from issue (with confirmation)

### gh CLI Wrapper

- [ ] Create `src/services/gh-cli.ts` utility:
  ```typescript
  export async function ghIssueView(
    owner: string,
    repo: string,
    number: number
  ): Promise<GitHubIssue> {
    // Execute: gh issue view {number} -R {owner}/{repo} --json ...
    // Parse JSON output
    // Handle errors (not authenticated, not found, etc.)
  }

  export async function ghIssueList(
    owner: string,
    repo: string,
    filter?: IssueFilter
  ): Promise<GitHubIssue[]> {
    // Execute: gh issue list -R {owner}/{repo} --json ...
  }

  export function isGhAvailable(): Promise<boolean> {
    // Check if gh CLI is installed and authenticated
  }
  ```

### Error Handling

- [ ] Graceful error when `gh` CLI is not installed:
  ```
  Error: GitHub CLI (gh) is not installed.
  Install it from: https://cli.github.com/
  ```

- [ ] Graceful error when not authenticated:
  ```
  Error: Not authenticated to GitHub.
  Run: gh auth login
  ```

- [ ] Graceful error when issue not found:
  ```
  Error: Issue #123 not found in org/repo
  ```

- [ ] Graceful error when no access to repo:
  ```
  Error: Cannot access org/repo. Check your permissions.
  ```

### Testing

- [ ] Unit tests for GitHubTicketProvider with mocked gh CLI
- [ ] Unit tests for gh CLI wrapper with mocked exec
- [ ] Unit tests for URL parsing (various GitHub URL formats)
- [ ] Integration test: import command creates story with correct fields
- [ ] Integration test: link command updates story with ticket fields
- [ ] Test error scenarios (gh not installed, not authenticated, issue not found)

### Documentation

- [ ] Update `docs/configuration.md` with GitHub provider setup
- [ ] Document `gh` CLI requirements
- [ ] Document `import` and `link` commands
- [ ] Add troubleshooting section for common GitHub errors

## Technical Details

### GitHub Issue JSON Structure

```json
{
  "number": 123,
  "title": "Add user authentication",
  "body": "## Description\n...",
  "state": "open",
  "labels": [
    {"name": "enhancement"},
    {"name": "status:ready"}
  ],
  "assignees": [
    {"login": "username"}
  ],
  "projectItems": [
    {
      "project": {"title": "Sprint 1"},
      "status": {"name": "In Progress"}
    }
  ]
}
```

### URL Parsing

Support various GitHub URL formats:
- `https://github.com/owner/repo/issues/123`
- `https://github.com/owner/repo/issues/123#issuecomment-456`
- `github.com/owner/repo/issues/123`
- `owner/repo#123` (shorthand)

### Provider Factory Update

Update `src/services/ticket-provider/index.ts`:
```typescript
case 'github':
  return new GitHubTicketProvider(config.ticketing?.github);
```

## Out of Scope

- Write operations to GitHub (S-0075)
- GitHub Projects priority sync (S-0076)
- Progress comments (S-0077)
- Automatic sync on run (S-0075)
- Jira provider

## Definition of Done

- [ ] GitHubTicketProvider implements `list()` and `get()` methods
- [ ] `ai-sdlc import <issue-url>` command works
- [ ] `ai-sdlc link <story-id> <issue-url>` command works
- [ ] gh CLI wrapper handles errors gracefully
- [ ] All unit and integration tests pass
- [ ] Documentation updated with GitHub setup instructions
- [ ] `make verify` passes
