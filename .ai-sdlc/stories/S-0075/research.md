---
*Generated: 2026-01-28*

Now I have enough context to provide comprehensive research findings. Let me compile the research report:

# Research: Implement GitHub write operations (status sync)

## Problem Summary

The goal is to implement bidirectional sync between local stories and GitHub Issues by adding write operations to the GitHubTicketProvider. When story status changes locally (backlog → ready → in-progress → done), the corresponding GitHub Issue should be updated with labels and state changes. When a PR is created, it should be linked to the issue. Additionally, a manual `ai-sdlc sync` command is needed for on-demand synchronization.

## Codebase Context

### Existing Architecture

**Ticket Provider System** (`src/services/ticket-provider/`)
- **Interface**: `TicketProvider` interface in `types.ts` defines read and write methods
- **Factory**: `createTicketProvider()` in `index.ts` instantiates providers based on config
- **Implementation**: `GitHubTicketProvider` in `github-provider.ts` currently has:
  - ✅ Read operations: `list()`, `get()` fully implemented
  - ⚠️ Write operations: `create()`, `updateStatus()`, `addComment()`, `linkPR()` are stubs/no-ops
  - ✅ Status mapping: `mapStatusToExternal()` and `mapStatusFromExternal()` working with label support

**GitHub CLI Integration** (`src/services/gh-cli.ts`)
- Provides `ghIssueView()` and `ghIssueList()` using `spawnSync` for security
- Includes comprehensive error handling (authentication, permissions, not found)
- **No write operations exist** - needs new functions: `ghIssueEdit()`, `ghIssueComment()`, `ghIssueClose()`, `ghIssueReopen()`, `ghIssueCreate()`

**Configuration System** (`src/core/config.ts`)
- Ticketing config at `config.ticketing` with:
  - `provider`: 'none' | 'github' | 'jira'
  - `syncOnRun`: boolean (default: true)
  - `postProgressComments`: boolean (default: true)
  - `github.repo`: string (format: 'owner/repo')
  - `github.statusLabels`: Record<StoryStatus, string>
- Config validation already exists in `sanitizeUserConfig()`

**Story Frontmatter** (`src/types/index.ts:158-250`)
- Existing fields for external ticketing:
  - `ticket_provider`: 'github' | 'jira' | 'linear'
  - `ticket_id`: string (issue number)
  - `ticket_url`: string (full URL)
  - `ticket_synced_at`: string (ISO timestamp)

**Story Status Transitions** (`src/core/story.ts:153-168`)
- `updateStoryStatus()` is the central place for status changes
- Currently NO sync hooks - this is where we need to add GitHub sync calls
- Validates status transitions (e.g., can't set 'done' without completion flags)

**PR Creation** (`src/agents/review.ts:1900-1996`)
- Review agent creates PRs via `gh pr create` command (line 1945)
- PR body format available in `formatPRDescription()` function
- Currently does NOT include issue reference in PR body
- Currently does NOT call any ticket provider linking method

**Existing Commands**
- `import-issue`: Creates story from GitHub Issue, sets ticket fields
- `link-issue`: Links existing story to GitHub Issue, updates ticket fields
- Both use `createTicketProvider()` to fetch issue details

### Relevant Patterns

**Error Handling Pattern** (from `gh-cli.ts:204-236`)
\`\`\`typescript
// Check for specific error types in stderr
if (stderrLower.includes('not logged in') || stderrLower.includes('authentication')) {
  throw new GhNotAuthenticatedError();
}
if (stderrLower.includes('not found')) {
  throw new GhIssueNotFoundError(owner, repo, number);
}
\`\`\`

**Command Execution Pattern** (from `gh-cli.ts:183-201`)
\`\`\`typescript
const result = spawnSync('gh', [args], {
  encoding: 'utf-8',
  shell: false,  // CRITICAL: prevents command injection
  stdio: ['ignore', 'pipe', 'pipe'],
  timeout: 30000,
  maxBuffer: 10 * 1024 * 1024,
});
\`\`\`

**Configuration Access Pattern** (from `github-provider.ts:42-53`)
\`\`\`typescript
private getOwnerRepo(): { owner: string; repo: string } {
  if (!this.config?.repo) {
    throw new Error('GitHub repository not configured. Set ticketing.github.repo in config.');
  }
  const [owner, repo] = this.config.repo.split('/');
  if (!owner || !repo) {
    throw new Error(`Invalid GitHub repository format: "${this.config.repo}". Expected "owner/repo".`);
  }
  return { owner, repo };
}
\`\`\`

## Files Requiring Changes

### 1. `src/services/gh-cli.ts`
- **Change Type**: Modify Existing
- **Reason**: Add write operation wrappers for gh CLI commands
- **Specific Changes**:
  - Add `ghIssueEdit()` function to modify labels and state
  - Add `ghIssueComment()` function to post comments
  - Add `ghIssueCreate()` function to create new issues
  - Add `ghIssueClose()` and `ghIssueReopen()` helper functions (optional, can use edit)
- **Dependencies**: None
- **Pattern to Follow**: Copy security model from `ghIssueView()` - use `spawnSync` with explicit args array, no shell execution

### 2. `src/services/ticket-provider/github-provider.ts`
- **Change Type**: Modify Existing
- **Reason**: Implement write methods that are currently no-ops
- **Specific Changes**:
  - Implement `updateStatus(id, status)`:
    - Get current issue to read existing labels
    - Remove old `status:*` labels
    - Add new status label (from config or `status:${status}`)
    - If status is 'done', close issue; if previously closed, reopen
    - Update `ticket_synced_at` timestamp
  - Implement `addComment(id, body)`:
    - Call `ghIssueComment()` with issue number and markdown body
  - Implement `linkPR(id, prUrl)`:
    - Add comment with PR reference
    - Note: Actual linking happens via PR body "Closes #123"
  - Implement `create(ticket)`:
    - Call `ghIssueCreate()` with title, body, labels
    - Return created issue as Ticket object
- **Dependencies**: Requires `src/services/gh-cli.ts` changes first
- **Pattern to Follow**: Use `getOwnerRepo()` for validation, handle errors gracefully (log warnings, don't throw)

### 3. `src/core/story.ts`
- **Change Type**: Modify Existing
- **Reason**: Add sync hook in `updateStoryStatus()` function
- **Specific Changes**:
  - After line 165 (after setting status/updated), add sync logic:
    \`\`\`typescript
    // Sync to external ticketing system if configured
    if (story.frontmatter.ticket_id && story.frontmatter.ticket_provider) {
      const config = loadConfig(); // Need to accept or load config
      if (config.ticketing?.syncOnRun && config.ticketing?.provider !== 'none') {
        try {
          const provider = createTicketProvider(config);
          const externalStatus = provider.mapStatusToExternal(newStatus);
          await provider.updateStatus(story.frontmatter.ticket_id, externalStatus);
          story.frontmatter.ticket_synced_at = new Date().toISOString();
        } catch (error) {
          // Log but don't fail - graceful degradation
          console.warn(`Failed to sync status to ${story.frontmatter.ticket_provider}: ${error.message}`);
        }
      }
    }
    \`\`\`
  - Need to import `createTicketProvider` from ticket-provider module
- **Dependencies**: Requires `github-provider.ts` implementation
- **Critical Note**: Must maintain graceful degradation - sync failures should not block workflow

### 4. `src/agents/review.ts`
- **Change Type**: Modify Existing
- **Reason**: Add issue reference to PR body and call linkPR after creation
- **Specific Changes**:
  - In `formatPRDescription()` function (~line 1933), check for `story.frontmatter.ticket_id`:
    - If exists, append `\n\nCloses #${ticket_id}` to PR body
    - This enables GitHub's automatic PR-Issue linking
  - After PR creation success (line 1953), add linking call:
    \`\`\`typescript
    // Link PR to external ticket if configured
    if (story.frontmatter.ticket_id && story.frontmatter.ticket_provider) {
      try {
        const provider = createTicketProvider(config);
        await provider.linkPR(story.frontmatter.ticket_id, prUrl);
      } catch (error) {
        // Log but don't fail
        console.warn(`Failed to link PR to ticket: ${error.message}`);
      }
    }
    \`\`\`
- **Dependencies**: Requires `github-provider.ts` implementation
- **Risk**: Must not break existing PR creation flow - keep error handling defensive

### 5. `src/cli/commands.ts` (or new file `src/cli/commands/sync.ts`)
- **Change Type**: Create New or Modify Existing
- **Reason**: Add `ai-sdlc sync` command
- **Specific Changes**:
  - Create `syncStory(storyId)` function:
    - Load story by ID
    - Validate ticket_id exists
    - Load config and create provider
    - Get current story status
    - Call `provider.updateStatus()` with mapped status
    - Update `ticket_synced_at` timestamp
    - Display success/failure message
  - Create `syncAllStories()` function:
    - Find all stories with `ticket_id` set
    - Loop through and sync each
    - Collect success/failure stats
    - Display summary table
  - Register command in CLI router
- **Dependencies**: Requires all previous changes
- **Pattern to Follow**: Similar to `import-issue.ts` and `link-issue.ts` - use ora spinner, themed chalk, graceful error handling

### 6. `src/services/ticket-provider/__tests__/github-provider.test.ts`
- **Change Type**: Modify Existing
- **Reason**: Add tests for new write operations
- **Specific Changes**:
  - Update describe('write operations') block (lines 220-235):
    - Remove "no-ops" tests
    - Add test: `updateStatus` removes old status labels and adds new
    - Add test: `updateStatus` closes issue when status is 'done'
    - Add test: `updateStatus` reopens issue when moving from done to in-progress
    - Add test: `addComment` posts comment to issue
    - Add test: `linkPR` adds PR reference comment
    - Add test: `create` creates issue with title, body, labels
  - Mock `gh-cli.ts` functions with vi.mock
- **Dependencies**: Requires implementation files
- **Pattern to Follow**: Existing test structure in same file (lines 55-149)

### 7. `src/services/gh-cli.test.ts`
- **Change Type**: Create New (if doesn't exist) or Modify Existing
- **Reason**: Add tests for new gh CLI wrapp