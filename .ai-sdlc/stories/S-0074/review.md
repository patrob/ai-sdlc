---
*Generated: 2026-01-28*


### Unified Collaborative Review


#### 🛑 BLOCKER (2)

**test_alignment** [code, po]: Tests use incorrect StoryStatus literal 'in_progress' (underscore) but implementation correctly uses 'in-progress' (hyphen). Tests pass because they mock the implementation, but they verify outdated behavior. Line 83 uses 'in_progress' in filter, lines 243, 254, 262, 283, 289 use 'in_progress' expecting it to map correctly, but the actual type is 'in-progress' with hyphen.
  - File: `src/services/ticket-provider/__tests__/github-provider.test.ts`:83
  - Suggested fix: Replace all instances of 'in_progress' with 'in-progress' in the test file to match the actual StoryStatus type definition. Change lines 83, 243, 254, 262, 283, and 289 from 'in_progress' to 'in-progress'.

**testing** [code, po]: No integration tests exist for the import-issue and link-issue CLI commands despite the acceptance criteria explicitly requiring them. The story specifies: 'Integration test: import command creates story with correct fields' and 'Integration test: link command updates story with ticket fields'. These commands handle critical user workflows and filesystem operations that need integration testing.
  - Suggested fix: Create integration tests in tests/integration/ directory covering: (1) import command creates story with ticket_provider, ticket_id, ticket_url, ticket_synced_at fields; (2) link command updates existing story frontmatter; (3) duplicate detection on import; (4) sync confirmation on link; (5) error scenarios (gh not available, invalid URLs, story not found).


#### ⚠️ CRITICAL (2)

**security** [security]: The gh CLI wrapper uses shell: false which is good, but doesn't validate or sanitize the owner, repo, and number parameters before passing them to spawnSync. While GitHub URLs are parsed first, a malicious user could potentially craft inputs that bypass URL parsing. For example, directly calling ghIssueView with malicious parameters could lead to command injection if parameters contain shell metacharacters.
  - File: `src/services/gh-cli.ts`:183
  - Suggested fix: Add input validation before constructing command arguments: (1) Validate owner and repo match ^[a-zA-Z0-9-_.]+$ pattern; (2) Validate number is a positive integer; (3) Add maximum length checks (e.g., owner/repo <= 100 chars). Example: if (!/^[a-zA-Z0-9-_.]+$/.test(owner)) throw new Error('Invalid owner format');

**code_quality** [code]: The findStoriesByTicketId function in import-issue.ts performs synchronous filesystem operations (fs.readdirSync, fs.existsSync) inside an async function, blocking the event loop. This can cause performance issues when scanning directories with many stories. The function should use async filesystem methods.
  - File: `src/cli/commands/import-issue.ts`:120
  - Suggested fix: Convert to async filesystem operations: (1) Use fs.promises.readdir() instead of fs.readdirSync(); (2) Use fs.promises.stat() to check file existence; (3) Use Promise.all() to parallelize story parsing. Example: const entries = await fs.promises.readdir(storiesDir, { withFileTypes: true });


#### 📋 MAJOR (5)

**requirements** [code, po]: The acceptance criteria states 'Handle already-imported issues (check existing stories for ticket_id)' but the current implementation uses a private helper function findStoriesByTicketId that is not exported or tested independently. This critical deduplication logic should be a reusable utility function in the core story module, properly tested, and available for other commands.
  - File: `src/cli/commands/import-issue.ts`:108
  - Suggested fix: Move findStoriesByTicketId to src/core/story.ts as an exported function named findStoriesByTicketId(sdlcRoot: string, ticketId: string): Promise<Story[]>. Add unit tests to src/core/story.test.ts covering: empty directory, single match, multiple matches, stories without ticket_id field.

**code_quality** [code]: Error handling in CLI commands (import-issue.ts and link-issue.ts) catches all errors and exits with process.exit(1), which makes the functions untestable and prevents proper error propagation. Functions that call process.exit() cannot be unit tested because they terminate the test runner.
  - File: `src/cli/commands/import-issue.ts`:97
  - Suggested fix: Separate CLI handling from business logic: (1) Extract core logic into testable functions that throw errors instead of calling process.exit(); (2) Keep the CLI command functions thin wrappers that catch errors and call process.exit(); (3) Write unit tests for the extracted logic functions. Example: extract async function importIssueCore(issueUrl, sdlcRoot, config) that throws errors, then have importIssue() wrapper call it and handle process.exit().

**security** [security, code]: User input (readline response) in link-issue.ts askYesNo function is not properly validated. While it checks for 'y', 'yes', and empty string, it doesn't handle potentially malicious input like extremely long strings or control characters. Additionally, the readline interface is not properly cleaned up if an error occurs during the promise.
  - File: `src/cli/commands/link-issue.ts`:161
  - Suggested fix: Add input validation and proper cleanup: (1) Limit answer length to reasonable max (e.g., 10 chars): if (answer.length > 10) answer = ''; (2) Wrap the promise in a try-finally to ensure rl.close() is always called; (3) Strip control characters: answer = answer.replace(/[\x00-\x1F\x7F]/g, '');

**requirements** [po, code]: The link command's behavior when syncing story content (lines 133-136) only updates content if it's < 50 characters, but this threshold is arbitrary and not documented in the acceptance criteria or user-facing documentation. Users won't know why their story content sometimes syncs and sometimes doesn't. This magic number should either be configurable or the behavior should be clearly documented.
  - File: `src/cli/commands/link-issue.ts`:134
  - Suggested fix: Document the 50-character threshold in: (1) docs/configuration.md under Link Command section; (2) Add a comment explaining the rationale in code; (3) Consider making it configurable via config.ticketing.github.syncContentThreshold. Also consider prompting user separately for content sync when content exists.

**code_quality** [code]: The gh CLI wrapper hardcodes timeout and maxBuffer values (30000ms, 10MB) which may not be appropriate for all use cases. Large repositories with many issues or issues with very large bodies could exceed these limits. The timeout and buffer size should be configurable.
  - File: `src/services/gh-cli.ts`:198
  - Suggested fix: Make timeout and maxBuffer configurable through GitHubConfig: (1) Add optional fields to GitHubConfig interface: commandTimeout?: number; maxBufferSize?: number; (2) Pass config to gh CLI functions; (3) Use config values with fallback to current defaults; (4) Document these options in docs/configuration.md.


#### ℹ️ MINOR (4)

**code_quality** [code]: The import-issue.ts uses dynamic imports (await import('fs')) inside the findStoriesByTicketId function, which is called every time. These should be imported at the module level for better performance and code clarity. Dynamic imports are typically used for conditional loading, not for standard dependencies.
  - File: `src/cli/commands/import-issue.ts`:109
  - Suggested fix: Move imports to top of file: import fs from 'fs'; import path from 'path'; import { parseStory } from '../../core/story.js'; Remove the dynamic imports from inside the function.

**code_quality** [code, po]: The GitHubTicketProvider's mapIssueToTicket method uses optional chaining for assignees[0]?.login but doesn't handle the case where there are multiple assignees. GitHub Issues can have multiple assignees, but the Ticket interface only supports a single assignee. This could lead to data loss when importing issues with multiple assignees.
  - File: `src/services/ticket-provider/github-provider.ts`:62
  - Suggested fix: Either: (1) Update Ticket interface to support assignees: string[] instead of assignee?: string, then map all assignees; OR (2) Document the limitation in code comments and docs/configuration.md that only the first assignee is imported. The first option is preferred for feature completeness.

**requirements** [code, po]: The acceptance criteria specifies 'Test error scenarios (gh not installed, not authenticated, issue not found)' but while unit tests exist for gh-cli.ts error handling, there are no tests verifying that the CLI commands (import-issue, link-issue) properly handle and display these errors to users with appropriate messages.
  - Suggested fix: Add unit tests for CLI command error handling: (1) Test import command with gh not available shows correct error message; (2) Test link command with invalid story ID shows correct error; (3) Test both commands with invalid URL format; (4) Verify spinner.fail() is called with appropriate messages.

**code_quality** [code]: The parseGitHubIssueUrl function doesn't handle edge cases like URLs with query parameters (?page=1) or URLs with trailing slashes. While these are uncommon, users might copy-paste URLs from their browser that include these elements, leading to parsing failures.
  - File: `src/services/gh-cli.ts`:91
  - Suggested fix: Enhance URL parsing to handle edge cases: (1) Strip query parameters before parsing: url.split('?')[0]; (2) Remove trailing slashes: url.replace(/\/+$/, ''); (3) Add test cases for these scenarios in gh-cli.test.ts.



### Perspective Summary
- Code Quality: ❌ Failed
- Security: ❌ Failed
- Requirements (PO): ❌ Failed

### Overall Result
❌ **FAILED** - Issues must be addressed

---
*Review completed: 2026-01-28*
