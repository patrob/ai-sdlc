---
*Generated: 2026-01-28*

Perfect! Now I have enough context to create a comprehensive implementation plan. Let me create the detailed plan.

# Implementation Plan: GitHub Write Operations (Status Sync)

## Phase 1: Setup and Foundation

- [ ] **T1**: Review and understand existing codebase structure
  - Files: `src/services/ticket-provider/github-provider.ts`, `src/services/gh-cli.ts`, `src/core/story.ts`
  - Dependencies: none

- [ ] **T2**: Add gh CLI write operation helper functions
  - Files: `src/services/gh-cli.ts`
  - Dependencies: T1

- [ ] **T3**: Add tests for gh CLI write operation helpers
  - Files: `src/services/__tests__/gh-cli.test.ts`
  - Dependencies: T2

## Phase 2: GitHubTicketProvider Write Methods

- [ ] **T4**: Implement `updateStatus()` method
  - Files: `src/services/ticket-provider/github-provider.ts`
  - Dependencies: T2
  - Details: Remove old status labels, add new label, close/reopen issue based on status

- [ ] **T5**: Implement `addComment()` method
  - Files: `src/services/ticket-provider/github-provider.ts`
  - Dependencies: T2
  - Details: Post comment to GitHub Issue via gh CLI

- [ ] **T6**: Implement `linkPR()` method
  - Files: `src/services/ticket-provider/github-provider.ts`
  - Dependencies: T2, T5
  - Details: Add PR link as comment on issue

- [ ] **T7**: Implement `create()` method
  - Files: `src/services/ticket-provider/github-provider.ts`
  - Dependencies: T2
  - Details: Create new GitHub Issue from NewTicket

- [ ] **T8**: Add unit tests for `updateStatus()`
  - Files: `src/services/ticket-provider/__tests__/github-provider.test.ts`
  - Dependencies: T4
  - Details: Test label removal/addition, issue close/reopen, error handling

- [ ] **T9**: Add unit tests for `addComment()`
  - Files: `src/services/ticket-provider/__tests__/github-provider.test.ts`
  - Dependencies: T5
  - Details: Test comment posting, graceful error handling

- [ ] **T10**: Add unit tests for `linkPR()`
  - Files: `src/services/ticket-provider/__tests__/github-provider.test.ts`
  - Dependencies: T6
  - Details: Test PR linking comment format

- [ ] **T11**: Add unit tests for `create()`
  - Files: `src/services/ticket-provider/__tests__/github-provider.test.ts`
  - Dependencies: T7
  - Details: Test issue creation with labels, assignee, body

## Phase 3: Sync on Run Integration

- [ ] **T12**: Add `ticket_synced_at` field to StoryFrontmatter type
  - Files: `src/types/index.ts`
  - Dependencies: none

- [ ] **T13**: Create ticket sync utility module
  - Files: `src/services/ticket-sync.ts`
  - Dependencies: T4, T5, T6, T12
  - Details: Helper functions for syncing story changes to ticketing provider with graceful error handling

- [ ] **T14**: Add sync hook in `updateStoryStatus()` function
  - Files: `src/core/story.ts`
  - Dependencies: T13
  - Details: Call ticket provider updateStatus when story status changes

- [ ] **T15**: Add sync trigger for PR creation in review agent
  - Files: `src/agents/review.ts`
  - Dependencies: T6, T13
  - Details: Include "Closes #N" in PR body, call linkPR() after PR creation

- [ ] **T16**: Add unit tests for ticket sync utilities
  - Files: `src/services/__tests__/ticket-sync.test.ts`
  - Dependencies: T13
  - Details: Test graceful degradation, logging on failures, sync timestamp updates

- [ ] **T17**: Add unit tests for story status sync hook
  - Files: `src/core/__tests__/story-ticket-sync.test.ts`
  - Dependencies: T14
  - Details: Test status change triggers sync, failures don't block workflow

- [ ] **T18**: Add unit tests for PR linking in review agent
  - Files: `src/agents/__tests__/review-pr-linking.test.ts`
  - Dependencies: T15
  - Details: Test PR body includes issue reference, linkPR called after creation

## Phase 4: Manual Sync Command

- [ ] **T19**: Create `sync` command handler
  - Files: `src/cli/commands/sync.ts`
  - Dependencies: T13
  - Details: Implement `ai-sdlc sync [story-id]` with --all flag support

- [ ] **T20**: Register `sync` command in CLI
  - Files: `src/index.ts` or CLI command registry
  - Dependencies: T19

- [ ] **T21**: Add unit tests for sync command
  - Files: `src/cli/commands/__tests__/sync.test.ts`
  - Dependencies: T19
  - Details: Test single story sync, --all flag, error reporting

- [ ] **T22**: Add integration test for sync command
  - Files: `tests/integration/sync-command.test.ts`
  - Dependencies: T19, T20
  - Details: Test sync command updates GitHub labels via mocked gh CLI

## Phase 5: Integration Testing

- [ ] **T23**: Add integration test for status change sync
  - Files: `tests/integration/github-status-sync.test.ts`
  - Dependencies: T14
  - Details: Test story status change triggers GitHub label update

- [ ] **T24**: Add integration test for PR creation and linking
  - Files: `tests/integration/github-pr-linking.test.ts`
  - Dependencies: T15
  - Details: Test PR creation includes issue reference and posts comment

- [ ] **T25**: Add integration test for sync error handling
  - Files: `tests/integration/github-sync-graceful-degradation.test.ts`
  - Dependencies: T13, T14
  - Details: Test sync failures log warnings but don't block workflow

- [ ] **T26**: Add integration test for syncing multiple stories
  - Files: `tests/integration/github-sync-multiple.test.ts`
  - Dependencies: T19
  - Details: Test `ai-sdlc sync --all` syncs multiple linked stories

## Phase 6: Documentation

- [ ] **T27**: Document `syncOnRun` configuration option
  - Files: `docs/configuration.md`
  - Dependencies: T14

- [ ] **T28**: Document `statusLabels` mapping configuration
  - Files: `docs/configuration.md`
  - Dependencies: T4

- [ ] **T29**: Document `ai-sdlc sync` command usage
  - Files: `README.md`, `docs/commands.md` (create if needed)
  - Dependencies: T19

- [ ] **T30**: Add troubleshooting guide for sync failures
  - Files: `docs/troubleshooting.md` (create if needed)
  - Dependencies: T13, T14

- [ ] **T31**: Add example configurations for GitHub workflow
  - Files: `docs/configuration.md`, `docs/examples/github-integration.md` (create if needed)
  - Dependencies: T27, T28

## Phase 7: Verification and Cleanup

- [ ] **T32**: Run full test suite
  - Dependencies: All test tasks (T3, T8-11, T16-18, T21-26)
  - Command: `npm test`

- [ ] **T33**: Run `make verify` to ensure all checks pass
  - Dependencies: T32
  - Command: `make verify`

- [ ] **T34**: Manual verification of sync behavior
  - Dependencies: T33
  - Details: Test against real GitHub repository (optional, in dev environment)

- [ ] **T35**: Review and update story document accuracy
  - Files: `.ai-sdlc/stories/S-0075/story.md`
  - Dependencies: T34
  - Details: Ensure all acceptance criteria are met and documented

---

## Key Implementation Details

### Error Handling Pattern

All write operations should follow this pattern:

```typescript
try {
  // Perform GitHub operation
  await ghIssueEdit(...);
  // Update local metadata
  story.frontmatter.ticket_synced_at = new Date().toISOString();
  await writeStory(story);
} catch (error) {
  logger.warn(`Failed to sync status to GitHub: ${error.message}`);
  // Continue workflow - don't throw
}
```

### Status Label Management

```typescript
async updateStatus(id: string, status: string): Promise<void> {
  const statusLabel = this.config?.statusLabels?.[status] ?? `status:${status}`;
  
  // Get current issue to find old status labels
  const issue = await this.get(id);
  const oldStatusLabels = issue.labels.filter(l => l.startsWith('status:'));
  
  // Remove old status labels, add new
  const removeArgs = oldStatusLabels.map(l => `--remove-label "${l}"`).join(' ');
  await ghIssueEdit(id, removeArgs, `--add-label "${statusLabel}"`);
  
  // Close/reopen based on status
  if (status === 'done') {
    await ghIssueClose(id);
  } else if (issue.state === 'closed') {
    await ghIssueReopen(id);
  }
}
```

### PR Linking Integration

In `src/agents/review.ts`, when creating PR:

```typescript
// Check if story has ticket_id
if (story.frontmatter.ticket_id && config.ticketing?.provider === 'github') {
  // Include issue reference in PR body
  prBody += `\n\nCloses #${story.frontmatter.ticket_id}`;
  
  // After PR creation, link to issue
  try {
    const provider = createTicketProvider(config);
    await provider.linkPR(story.frontmatter.ticket_id, prUrl);
  } catch (error) {
    logger.warn(`Failed to link PR to issue: ${error.message}`);
  }
}
```

### Configuration Structure

```json
{
  "ticketing": {
    "provider": "github",
    "syncOnRun": true,
    "postProgressComments": true,
    "github": {
      "repo": "owner/repo",
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

## Testing Strategy

- **Unit Tests**: Mock gh CLI functions, test each write method in isolation
- **Integration Tests**: Use mocked gh CLI to test end-to-end sync flows
- **Error Scenarios**: Test all error paths (gh not installed, not authenticated, permission denied, issue not found)
- **Graceful Degradation**: Verify sync failures log but don't block workflow

## Definition of Done Checklist

- [ ] All GitHubTicketProvider write methods implemented (create, updateStatus, addComment, linkPR)
- [ ] Status transitions automatically sync to GitHub labels when syncOnRun enabled
- [ ] PR creation includes "Closes #N" reference and links to issue
- [ ] `ai-sdlc sync` command implemented with --all flag
- [ ] Sync failures are graceful (logged warnings, workflow continues)
- [ ] All unit tests pass (>90% coverage for new code)
- [ ] All integration tests pass
- [ ] Documentation updated (configuration.md, README.md, troubleshooting)
- [ ] `make verify` passes with no errors
- [ ] Story document accuracy verified