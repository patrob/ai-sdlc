---
*Generated: 2026-01-28*


### Unified Collaborative Review


#### 🛑 BLOCKER (4)

**security** [security]: Command injection vulnerability in GraphQL query execution. The buildProjectItemsQuery function embeds config.owner and config.priorityField directly into the GraphQL query string without validation or escaping. An attacker controlling these config values could inject malicious GraphQL or shell commands. For example, owner: 'foo"}){evil:query}#' could break out of the query structure.
  - File: `src/services/github-projects/queries.ts`:13
  - Suggested fix: Add input validation to buildProjectItemsQuery to ensure owner, projectNumber, and priorityField only contain safe characters (alphanumeric, dash, underscore). Use a whitelist regex like /^[a-zA-Z0-9_-]+$/ and reject any values that don't match.

**security** [security]: Command injection vulnerability in addComment method. The body parameter is only escaped for double quotes but can still contain other dangerous shell characters. The command template uses double quotes but doesn't protect against newlines, backticks, or $() substitution. Example: body containing `\n$(rm -rf /)` could execute arbitrary commands.
  - File: `src/services/ticket-provider/github-provider.ts`:223
  - Suggested fix: Use gh CLI's ability to read from stdin or a file instead of inline parameters. Change to: `echo ${JSON.stringify(body)} | gh issue comment ${issueNumber} --repo ${repoInfo.owner}/${repoInfo.repo} --body-file -` or use proper shell escaping that handles all metacharacters.

**security** [security]: Insufficient validation of repo string in parseRepoString. The function accepts arbitrary strings and uses them in shell commands without validating they contain only safe characters. A malicious repo value like 'owner/repo; rm -rf /' could inject commands when passed to execSync.
  - File: `src/services/ticket-provider/github-provider.ts`:17
  - Suggested fix: Add validation after parsing to ensure owner and repo only contain safe characters (alphanumeric, dash, underscore, dot). Reject any values containing shell metacharacters: /[;&|`$()\n]/

**test_alignment** [code, security]: No tests exist for the GraphQL query building function (buildProjectItemsQuery). This function handles untrusted user input (owner, priorityField) and constructs queries, but has zero test coverage. The client tests mock execSync but never verify the actual query string structure or validate that dangerous inputs are handled safely.
  - File: `src/services/github-projects/queries.ts`:13
  - Suggested fix: Create src/services/github-projects/__tests__/queries.test.ts with tests for: (1) basic query structure, (2) query with priorityField, (3) query without priorityField, (4) query with special characters in owner/field names, (5) injection attempt patterns. Verify the generated query string matches expected structure.


#### ⚠️ CRITICAL (3)

**code_quality** [code, po]: The GraphQL query in buildProjectItemsQuery is limited to 100 items (first: 100) with no pagination support. For projects with more than 100 issues, priority sync will silently fail for issues beyond the first 100. This creates inconsistent behavior and could cause high-priority items to be ignored if they're positioned later in large projects.
  - File: `src/services/github-projects/queries.ts`:34
  - Suggested fix: Implement pagination using GitHub's GraphQL cursor-based pagination. Add a loop in getProjectItems to fetch all pages using the pageInfo.hasNextPage and pageInfo.endCursor fields. Or document the 100-item limit clearly and add a warning when the limit is reached.

**requirements** [po, code]: The priority sync integration in the run command (lines 1186-1204 of commands.ts) only syncs stories in backlog, ready, and in-progress states. However, the acceptance criteria and story description don't specify this limitation. Users might expect priority sync to work for all stories, or at least be informed why 'done' stories are excluded. The filtering logic is reasonable but undocumented.
  - File: `src/cli/commands.ts`:1190
  - Suggested fix: Add a comment explaining why only these three states are synced (e.g., 'done' stories are immutable). Consider adding a config option like `syncStates: ['backlog', 'ready', 'in-progress']` to make this explicit and configurable. Update documentation to clarify which stories are synced.

**testing** [code]: The priority sync integration in commands.ts has no tests. The run command's priority sync logic (detecting when to sync, filtering stories by state, error handling) is completely untested. This is critical functionality that could silently fail or skip stories.
  - File: `src/cli/commands.ts`:1186
  - Suggested fix: Add integration tests in src/cli/__tests__/commands.test.ts covering: (1) run command syncs priorities when syncOnRun=true and projectNumber is set, (2) run command skips sync when config is missing, (3) only backlog/ready/in-progress stories are synced, (4) sync failures are logged but don't halt execution. Mock createTicketProvider and syncAllStoriesPriority.


#### 📋 MAJOR (4)

**code_quality** [code, po]: Error handling in syncStoryPriority logs warnings to console.warn but the warnings are swallowed and never reported to the user. Users have no visibility into why priority sync might be failing for specific stories. The implementation notes mention 'graceful fallback' but this creates a silent failure mode that's hard to debug.
  - File: `src/services/priority-sync.ts`:51
  - Suggested fix: Use the structured logger (getLogger) instead of console.warn for consistent logging. Consider collecting failed sync attempts and reporting a summary to the user after syncAllStoriesPriority completes (e.g., 'Synced 5/10 stories, 5 failed'). Add a --verbose flag to show detailed sync errors.

**requirements** [po, code]: The acceptance criteria specify showing priority source in status command output with a 'Source' column, but this is not implemented. The priority_source field exists in frontmatter and is being set correctly, but the status command doesn't display it. The implementation notes say 'Infrastructure in place for displaying priority source' but the actual display is missing.
  - File: `src/cli/commands.ts`:74
  - Suggested fix: Update the status command's story rendering to include a 'Source' column that displays the priority_source field. Map 'github-project' to 'GitHub Project', 'local' to 'Local', and show empty/'-' for undefined. Check the renderStories/renderKanbanBoard functions in table-renderer.ts.

**security** [security]: The execSync calls in github-provider.ts construct commands using string interpolation with user-controlled data (repoInfo.owner, repoInfo.repo). While extractIssueNumber validates issue numbers, owner/repo come from config or git remote and could contain shell metacharacters. The repo is used in multiple command constructions without consistent validation.
  - File: `src/services/ticket-provider/github-provider.ts`:144
  - Suggested fix: After parsing in getRepoInfo, validate that owner and repo match /^[a-zA-Z0-9._-]+$/ before storing in this.repoInfo. Add a private validateRepoComponent method. This ensures all subsequent uses in command construction are safe from injection.

**code_quality** [code, po]: The priority_source field can be 'github-project' or 'local' according to types, but the code never explicitly sets it to 'local'. When a story is created or priority is manually updated, priority_source remains undefined. This means the 'Source' display (when implemented) won't accurately distinguish between GitHub-synced and locally-set priorities.
  - File: `src/services/priority-sync.ts`:37
  - Suggested fix: When creating a story or manually updating priority (outside of syncStoryPriority), set priority_source to 'local'. Update the createStory and updateStoryField functions to handle this. Default to 'local' if priority_source is undefined when displaying.


#### ℹ️ MINOR (3)

**code_quality** [code]: The client.ts file has inconsistent error message formatting. Some errors include context (line 48: 'Project #${projectNumber} not found for owner'), while others are generic (line 81: 'Failed to fetch GitHub Project items'). The outer error wrapping hides the original gh CLI error details.
  - File: `src/services/github-projects/client.ts`:79
  - Suggested fix: Preserve original error messages by including them in wrapped errors: `throw new Error('Failed to fetch GitHub Project items: ' + error.message)`. Consider adding structured error types for different failure modes (auth, not found, rate limit) to enable better error handling upstream.

**requirements** [po]: The story acceptance criteria include 'Sync priority on `ai-sdlc import`' and 'Sync priority on `ai-sdlc sync`' but these commands don't exist or aren't modified in this implementation. Only the `run` command has priority sync integration. This is a gap between requirements and implementation.
  - File: `src/cli/commands.ts`:1186
  - Suggested fix: Either implement priority sync in import/sync commands (if they exist), update the story to mark those acceptance criteria as out of scope, or clarify that 'import' refers to ticket import and 'sync' refers to the syncOnRun feature. Check if import and sync commands exist elsewhere in the codebase.

**testing** [code]: The priority-normalizer tests don't cover edge cases like very large position values that could cause integer overflow when multiplied by 10 (e.g., position 2^31 would overflow). While unlikely in practice, proper validation would prevent potential issues.
  - File: `src/services/github-projects/__tests__/priority-normalizer.test.ts`:18
  - Suggested fix: Add a maximum position limit (e.g., 10000) to normalizePositionPriority and throw an error for values exceeding it. Add test: `expect(() => normalizePositionPriority(Number.MAX_SAFE_INTEGER)).toThrow()`. This prevents unexpected behavior with extreme inputs.



### Perspective Summary
- Code Quality: ❌ Failed
- Security: ❌ Failed
- Requirements (PO): ❌ Failed

### Overall Result
❌ **FAILED** - Issues must be addressed

---
*Review completed: 2026-01-28*
