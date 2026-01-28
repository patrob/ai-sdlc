---
*Generated: 2026-01-28*

Perfect! Now I have a comprehensive understanding of the codebase. Let me compile the research findings.

# Research: GitHub Projects Priority Sync

## Problem Summary

The goal is to enable priority synchronization from GitHub Projects (v2) board position or priority field to local story priority. This allows teams to manage priority in GitHub Projects, and ai-sdlc will automatically respect that ordering when selecting which stories to work on. The sync should happen during `import`, `sync`, and `run` commands, updating local story priority based on the issue's position in the GitHub Project board.

## Codebase Context

### Existing Architecture

**1. Story Priority Management (`src/core/story.ts`, `src/types/index.ts`)**
- Stories have a `priority` field in frontmatter (numeric with gaps: 10, 20, 30...)
- Lower numbers = higher priority
- `DEFAULT_PRIORITY_GAP = 10` (from types/index.ts line 5)
- Stories are sorted by priority ascending in `findStoriesByStatus()` (kanban.ts:175)

**2. Ticketing Integration Foundation (S-0073)**
- `TicketProvider` interface defined in `src/services/ticket-provider/types.ts`
- Factory pattern in `src/services/ticket-provider/index.ts`
- `Ticket` interface includes `priority: number` field (line 18 of types.ts)
- Configuration structure exists in `src/types/index.ts:657-673`:
  \`\`\`typescript
  export interface TicketingConfig {
    provider: 'none' | 'github' | 'jira';
    syncOnRun?: boolean;
    postProgressComments?: boolean;
    github?: {
      repo?: string;
      projectNumber?: number;
      statusLabels?: Record<string, string>;
    };
  }
  \`\`\`

**3. Story Selection Flow**
- `assessState()` in `src/core/kanban.ts:258` finds ready stories via `findStoriesByStatus(sdlcRoot, 'ready')`
- Stories are sorted by `priority` ascending (kanban.ts:175)
- First story (lowest priority number) is selected for execution

**4. GitHub CLI Usage Patterns**
- Story S-0074 shows `gh` CLI is used for GitHub integration
- Existing `gh` usage in `src/agents/review.ts:1862` for PR creation
- Pattern: `execSync('gh --version')` to check availability

**5. Story Frontmatter Fields**
- `ticket_provider?: 'github' | 'jira' | 'linear'` (types/index.ts:246)
- `ticket_id?: string` (types/index.ts:247)
- `ticket_url?: string` (types/index.ts:248)
- `ticket_synced_at?: string` (types/index.ts:249)

## Files Requiring Changes

### 1. **Path**: `src/types/index.ts`
- **Change Type**: Modify Existing
- **Reason**: Extend `TicketingConfig` interface to add GitHub Projects priority config
- **Specific Changes**:
  - Add `priorityField?: string` to `github` config
  - Add `priorityMapping?: Record<string, number>` to `github` config
- **Dependencies**: None

### 2. **Path**: `src/core/config.ts`
- **Change Type**: Modify Existing
- **Reason**: Add validation for new GitHub Projects priority config fields
- **Specific Changes**:
  - Add validation in `sanitizeUserConfig()` for `priorityField` and `priorityMapping`
  - Validate `priorityField` is a string if present
  - Validate `priorityMapping` is an object with string keys and number values
- **Dependencies**: Depends on types.ts changes

### 3. **Path**: `src/services/ticket-provider/types.ts`
- **Change Type**: Modify Existing
- **Reason**: Add `syncPriority()` method to `TicketProvider` interface
- **Specific Changes**:
  - Add optional method: `syncPriority?(ticketId: string): Promise<number | null>`
  - Document that it returns normalized priority value or null if not in project
- **Dependencies**: None

### 4. **Path**: `src/services/ticket-provider/null-provider.ts`
- **Change Type**: Modify Existing
- **Reason**: Implement no-op `syncPriority()` method for null provider
- **Specific Changes**:
  - Add method that returns `null` (no priority to sync)
- **Dependencies**: Depends on types.ts changes

### 5. **Path**: `src/services/ticket-provider/github-provider.ts` (NEW)
- **Change Type**: Create New
- **Reason**: Implement GitHub ticket provider (prerequisite from S-0074)
- **Specific Changes**:
  - Implement `TicketProvider` interface
  - Implement `syncPriority()` method using `gh` CLI
  - Query GitHub Projects v2 API via `gh api graphql`
  - Extract priority field or position from project items
  - Map priority values using config mapping
- **Dependencies**: Depends on S-0074 (GitHub provider implementation)

### 6. **Path**: `src/services/gh-cli.ts` (NEW)
- **Change Type**: Create New
- **Reason**: Utility functions for GitHub CLI operations
- **Specific Changes**:
  - `ghProjectItems()` - Query project items with GraphQL
  - `ghIssuePriority()` - Get priority for specific issue from project
  - `isGhAvailable()` - Check if gh CLI is available
  - Error handling for auth failures, network issues
- **Dependencies**: None (utility layer)

### 7. **Path**: `src/core/story.ts`
- **Change Type**: Modify Existing
- **Reason**: Add helper function to sync priority from ticket provider
- **Specific Changes**:
  - Add `syncPriorityFromTicket(story: Story, config: Config): Promise<Story | null>`
  - Query ticket provider's `syncPriority()` method
  - Update story frontmatter priority if different
  - Update `ticket_synced_at` timestamp
  - Return updated story or null if no sync needed
- **Dependencies**: Depends on github-provider.ts

### 8. **Path**: `src/cli/commands.ts`
- **Change Type**: Modify Existing
- **Reason**: Add priority sync to `import`, `sync`, and `run` commands
- **Specific Changes**:
  - **`import` command**: Call `syncPriorityFromTicket()` after creating story
  - **`sync` command** (new): Create command to manually sync priority for one or all stories
  - **`run` command**: Add priority sync before selecting next story (if `syncOnRun` enabled)
- **Dependencies**: Depends on story.ts changes

### 9. **Path**: `src/cli/table-renderer.ts`
- **Change Type**: Modify Existing
- **Reason**: Display priority source in status output
- **Specific Changes**:
  - Add logic to show "Source" column indicating "GitHub Project" vs "Local"
  - Check if `ticket_provider` and `ticket_synced_at` are set
- **Dependencies**: None

## Testing Strategy

### Test Files to Modify

**1. `src/services/ticket-provider/__tests__/null-provider.test.ts`**
- Add test for `syncPriority()` returning null

**2. `src/core/config.test.ts`**
- Add tests for validating GitHub Projects priority config
- Test invalid `priorityField` types
- Test invalid `priorityMapping` structures

### New Tests Needed

**1. `src/services/ticket-provider/__tests__/github-provider.test.ts`**
- Test `syncPriority()` with project position
- Test `syncPriority()` with explicit priority field
- Test `syncPriority()` with priority mapping (P0→10, P1→20)
- Test `syncPriority()` returns null when issue not in project
- Test error handling for gh CLI failures

**2. `src/services/__tests__/gh-cli.test.ts`**
- Test `ghProjectItems()` query construction
- Test GraphQL response parsing
- Test error handling (not authenticated, network failure)
- Test issue not found in project

**3. `src/core/story.test.ts`**
- Test `syncPriorityFromTicket()` updates priority
- Test `syncPriorityFromTicket()` skips update if priority unchanged
- Test `syncPriorityFromTicket()` updates `ticket_synced_at`
- Test `syncPriorityFromTicket()` with null provider

**4. `tests/integration/github-projects-priority-sync.test.ts`**
- Integration test: import syncs priority from project
- Integration test: sync command updates priority
- Integration test: run command respects synced priority order
- Integration test: issue not in project uses local priority

### Test Scenarios

**Happy Path:**
- Issue in project position 1 → priority 10
- Issue in project position 2 → priority 20
- Issue with P0 field → priority 10 (via mapping)
- Multiple issues sync correctly and maintain sort order

**Edge Cases:**
- Issue not in any project → return null, keep local priority
- Issue in project but no priority field → use position
- GitHub CLI not available → graceful error
- Not authenticated → graceful error
- Network timeout → graceful error

**Error Handling:**
- `gh` CLI not installed → skip sync, log warning
- API rate limit → retry with backoff
- Invalid GraphQL response → log error, continue

## Additional Context

### Relevant Patterns

**1. Ticket Provider Pattern**
From `src/services/ticket-provider/index.ts`:
\`\`\`typescript
export function createTicketProvider(config: Config): TicketProvider {
  const provider = config.ticketing?.provider ?? 'none';
  switch (provider) {
    case 'none': return new NullTicketProvider();
    case 'github': /* return new GitHubTicketProvider(config) */
    // ...
  }
}
\`\`\`

**2. Story Field Update Pattern**
From `src/core/story.ts:565`:
\`\`\`typescript
export async function updateStoryField<K extends keyof StoryFrontmatter>(
  story: Story,
  field: K,
  value: StoryFrontmatter[K]
): Promise<Story> {
  story.frontmatter[field] = value;
  await writeStory(story);
  return story;
}
\`\`\`

**3. GitHub Projects GraphQL Query**
From story content:
\`\`\`graphql
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
\`\`\`

### Potential Risks

**1. Performance**
- GitHub Projects API can be slow for large boards (100+ items)
- Solution: Cache project items for 5 minutes, only refresh on explicit sync

**2. Priority Conflicts**
- User manually sets priority locally, then sync overwrites it
- Solution: Only sync if `ticket_synced_at` is set (opt-in via initial import/link)

**3. GitHub Projects Pagination**
- Projects with >100 items need pagination
- Solution: MVP limits to first 100 items, add pagination in follow-up

**4. Organization vs User Projects**
- Qu