---
id: S-0075
title: Implement GitHub write operations (status sync)
priority: 50
status: backlog
type: feature
created: '2026-01-19'
labels:
  - github
  - integration
  - sync
  - ticketing
  - epic-ticketing-integration
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
slug: github-write-operations
dependencies:
  - S-0074
---
# Implement GitHub write operations (status sync)

## User Story

**As a** user with GitHub Issues
**I want** status changes to sync to GitHub
**So that** my team sees progress without checking the CLI

## Summary

This story implements the write operations for GitHub Issues integration, enabling bidirectional sync between local stories and GitHub Issues. When a story's status changes, the corresponding GitHub Issue labels are updated. When a PR is created, it's linked to the issue.

## Context

### Sync Flow

```
Local Story                          GitHub Issue
─────────────                        ────────────
status: ready        ─────────►      label: status:ready
status: in-progress  ─────────►      label: status:in-progress
status: done         ─────────►      state: closed
pr_url set          ─────────►      PR linked (closes #123)
```

### Configuration

```json
{
  "ticketing": {
    "provider": "github",
    "syncOnRun": true,
    "github": {
      "statusLabels": {
        "backlog": "status:backlog",
        "ready": "status:ready",
        "in-progress": "status:in-progress",
        "done": "status:done",
        "blocked": "status:blocked"
      }
    }
  }
}
```

## Acceptance Criteria

### GitHubTicketProvider Write Methods

- [ ] Implement `updateStatus()` method:
  ```typescript
  async updateStatus(id: string, status: string): Promise<void> {
    // Remove old status labels
    // Add new status label
    // If status is 'done', close the issue
    // gh issue edit {id} --remove-label "status:*" --add-label "status:{status}"
  }
  ```

- [ ] Implement `addComment()` method:
  ```typescript
  async addComment(id: string, body: string): Promise<void> {
    // gh issue comment {id} --body "{body}"
  }
  ```

- [ ] Implement `linkPR()` method:
  ```typescript
  async linkPR(id: string, prUrl: string): Promise<void> {
    // Add comment linking to PR
    // gh issue comment {id} --body "PR created: {prUrl}"
    // Note: Actual PR→Issue linking is done via PR body ("Closes #123")
  }
  ```

- [ ] Implement `create()` method (for creating issues from stories):
  ```typescript
  async create(ticket: NewTicket): Promise<Ticket> {
    // gh issue create --title "{title}" --body "{body}" --label "{labels}"
    // Return created issue details
  }
  ```

### Sync on Run

- [ ] Add sync hook in story status transitions:
  ```typescript
  // In updateStoryStatus() or StoryService
  if (config.ticketing?.syncOnRun && story.frontmatter.ticket_id) {
    const provider = createTicketProvider(config);
    await provider.updateStatus(
      story.frontmatter.ticket_id,
      provider.mapStatusToExternal(newStatus)
    );
    // Update ticket_synced_at
  }
  ```

- [ ] Sync triggers on:
  - [ ] Status change (backlog → ready → in-progress → done)
  - [ ] PR creation (link PR to issue)
  - [ ] Story marked as blocked

- [ ] Graceful degradation: sync failures are logged but don't block workflow
  ```typescript
  try {
    await provider.updateStatus(ticketId, status);
  } catch (error) {
    logger.warn(`Failed to sync status to GitHub: ${error.message}`);
    // Continue workflow - don't fail
  }
  ```

### Manual Sync Command

- [ ] Add `ai-sdlc sync [story-id]` command:
  ```bash
  # Sync specific story
  ai-sdlc sync S-0042

  # Output:
  # Syncing S-0042 with GitHub Issue #123...
  # ✓ Status: in-progress → label:status:in-progress
  # ✓ Synced at: 2026-01-19T10:30:00Z

  # Sync all linked stories
  ai-sdlc sync --all

  # Output:
  # Syncing 5 linked stories...
  # ✓ S-0042: synced
  # ✓ S-0043: synced
  # ✗ S-0044: failed (issue not found)
  # ...
  ```

### PR Linking

- [ ] When review agent creates PR, include issue reference in PR body:
  ```markdown
  ## Summary
  ...

  Closes #123
  ```

- [ ] After PR creation, call `linkPR()` to add comment on issue

- [ ] Update `src/agents/review.ts` PR creation to:
  - [ ] Check if story has `ticket_id`
  - [ ] Include `Closes #{ticket_id}` in PR body
  - [ ] Call `provider.linkPR()` after PR creation

### gh CLI Commands Used

```bash
# Update labels
gh issue edit 123 --remove-label "status:backlog" --add-label "status:ready"

# Close issue
gh issue close 123

# Reopen issue
gh issue reopen 123

# Add comment
gh issue comment 123 --body "Status updated to in-progress"

# Create issue
gh issue create --title "Title" --body "Body" --label "label1,label2"
```

### Testing

- [ ] Unit tests for GitHubTicketProvider write methods with mocked gh CLI
- [ ] Unit test: updateStatus removes old status labels and adds new
- [ ] Unit test: updateStatus closes issue when status is 'done'
- [ ] Unit test: addComment posts comment to issue
- [ ] Unit test: linkPR adds PR reference comment
- [ ] Unit test: sync failures don't block workflow (graceful degradation)
- [ ] Integration test: status change triggers label update
- [ ] Integration test: PR creation includes issue reference
- [ ] Integration test: sync command updates multiple stories

### Documentation

- [ ] Update `docs/configuration.md` with:
  - [ ] `syncOnRun` option documentation
  - [ ] `statusLabels` mapping configuration
  - [ ] Example configurations for different workflows
- [ ] Document `ai-sdlc sync` command
- [ ] Document PR linking behavior
- [ ] Add troubleshooting for sync failures

## Technical Details

### Status Label Management

GitHub doesn't have built-in status field, so we use labels:

```typescript
async updateStatus(id: string, status: string): Promise<void> {
  const statusLabel = this.config.statusLabels?.[status] ?? `status:${status}`;

  // Get current labels
  const issue = await this.get(id);
  const oldStatusLabels = issue.labels.filter(l => l.startsWith('status:'));

  // Remove old status labels, add new
  const removeArgs = oldStatusLabels.map(l => `--remove-label "${l}"`).join(' ');
  await execGh(`issue edit ${id} ${removeArgs} --add-label "${statusLabel}"`);

  // Close/reopen based on status
  if (status === 'done') {
    await execGh(`issue close ${id}`);
  } else if (issue.state === 'closed') {
    await execGh(`issue reopen ${id}`);
  }
}
```

### Sync Timestamp

After successful sync, update story frontmatter:
```typescript
story.frontmatter.ticket_synced_at = new Date().toISOString();
await writeStory(story);
```

### Error Handling

All write operations should:
1. Log the operation being attempted
2. Catch and log errors
3. Not throw (graceful degradation)
4. Return success/failure status for reporting

## Out of Scope

- GitHub Projects column management (S-0076)
- Progress comments at milestones (S-0077)
- Pulling status FROM GitHub (GitHub is sync target, not source)
- Jira provider

## Definition of Done

- [ ] GitHubTicketProvider implements all write methods
- [ ] Status transitions sync to GitHub labels
- [ ] PR creation links to issue
- [ ] `ai-sdlc sync` command works
- [ ] Sync failures are graceful (logged, not blocking)
- [ ] All unit and integration tests pass
- [ ] Documentation updated
- [ ] `make verify` passes
