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


---

## Rework 2
*Generated: 2026-01-28*


### Unified Collaborative Review


#### 🛑 BLOCKER (1)

**test_alignment** [code, security, po]: Tests use incorrect StoryStatus literal 'in_progress' (underscore) but the actual TypeScript type is 'in-progress' (hyphen). This is a critical test-implementation misalignment. The tests pass because they mock the implementation, but they verify outdated behavior that doesn't match the actual type system. This means the tests are not actually validating correct behavior - they would accept invalid status values in production code.
  - File: `src/services/ticket-provider/__tests__/github-provider.test.ts`:83
  - Suggested fix: Replace all 6 instances of 'in_progress' with 'in-progress' in the test file:
- Line 83: Change filter status from ['ready', 'in_progress'] to ['ready', 'in-progress']
- Line 243: Change mapStatusToExternal test from 'in_progress' to 'in-progress'
- Line 254: Change statusLabels key from 'in_progress' to 'in-progress'
- Line 262: Change expectation from 'in_progress' to 'in-progress'
- Line 282: Change statusLabels key from 'in_progress' to 'in-progress'
- Line 289: Change mapStatusFromExternal expectation from 'in_progress' to 'in-progress'

The correct StoryStatus type is defined in src/types/index.ts line 2 as: 'backlog' | 'ready' | 'in-progress' | 'done' | 'blocked'


#### ⚠️ CRITICAL (1)

**testing** [code, po]: No integration tests exist for the import and link commands. The story's acceptance criteria explicitly requires 'Integration test: import command creates story with correct fields' and 'Integration test: link command updates story with ticket fields', but no integration test files were created. Only unit tests with mocked dependencies exist, which don't verify end-to-end functionality.
  - Suggested fix: Create integration tests in tests/integration/ directory for both commands:
1. tests/integration/import-issue.test.ts - Test actual story creation with gh CLI mocked at subprocess level
2. tests/integration/link-issue.test.ts - Test actual story updates with gh CLI mocked at subprocess level
These should verify the complete flow including file system operations, not just mocked function calls.


#### 📋 MAJOR (4)

**security** [security]: The gh-cli.ts uses shell: false which is good, but the spawnSync calls don't validate that the 'gh' command path is safe. An attacker who can place a malicious 'gh' binary earlier in PATH could intercept all GitHub operations. The code should validate the gh binary location or use an absolute path.
  - File: `src/services/gh-cli.ts`:129
  - Suggested fix: Add validation to check that 'gh' resolves to an expected location:
1. Use 'which gh' or 'where gh' to get the absolute path
2. Verify it's in a trusted location (e.g., /usr/local/bin, /opt/homebrew/bin, etc.)
3. Store and reuse the validated path
4. Alternatively, allow users to configure the gh binary path in config

**code_quality** [code]: The import-issue.ts contains a helper function findStoriesByTicketId() that performs synchronous file system operations (fs.readdirSync, fs.existsSync) inside an async function. This blocks the event loop unnecessarily. The function should use async fs operations (fs.promises) for consistency with the rest of the codebase.
  - File: `src/cli/commands/import-issue.ts`:108
  - Suggested fix: Refactor findStoriesByTicketId to use fs.promises:
```typescript
import { promises as fsPromises } from 'fs';

async function findStoriesByTicketId(sdlcRoot: string, ticketId: string): Promise<Story[]> {
  const storiesDir = path.join(sdlcRoot, 'stories');
  const result: Story[] = [];

  if (!(await fsPromises.stat(storiesDir).catch(() => false))) {
    return result;
  }

  const entries = await fsPromises.readdir(storiesDir, { withFileTypes: true });
  // ... rest of function using async operations
}
```

**requirements** [po]: The story acceptance criteria requires documenting the gh CLI requirements in docs/configuration.md with a 'troubleshooting section for common GitHub errors'. While the GitHub Integration Commands section was added, there is no dedicated troubleshooting section. The documentation shows command examples but doesn't provide a troubleshooting guide for common scenarios like network issues, rate limiting, or authentication problems.
  - File: `docs/configuration.md`
  - Suggested fix: Add a '### Troubleshooting' subsection under the GitHub Integration Commands section that covers:
1. Common gh CLI authentication issues and how to resolve them
2. Network connectivity problems
3. GitHub API rate limiting
4. Repository access permission errors
5. How to verify gh CLI installation and authentication status
6. What to do when 'gh issue view' returns unexpected data

**code_quality** [code]: The link-issue.ts command has poor error handling for readline cleanup. If an error occurs during the askYesNo prompt, the readline interface is not closed, potentially leaving the process hanging. The readline.close() call is only in the success path of the promise.
  - File: `src/cli/commands/link-issue.ts`:161
  - Suggested fix: Wrap the readline question in a try-finally block to ensure cleanup:
```typescript
async function askYesNo(question: string, defaultValue: boolean): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    return await new Promise((resolve) => {
      const defaultText = defaultValue ? 'Y/n' : 'y/N';
      rl.question(`${question} (${defaultText}): `, (answer) => {
        const normalized = answer.trim().toLowerCase();
        if (normalized === '') {
          resolve(defaultValue);
        } else {
          resolve(normalized === 'y' || normalized === 'yes');
        }
      });
    });
  } finally {
    rl.close();
  }
}
```


#### ℹ️ MINOR (3)

**code_quality** [code]: The GitHubTicketProvider.mapIssueToTicket method has a complex nested loop for extracting priority from projectItems. This logic could be extracted into a separate helper method for better readability and testability.
  - File: `src/services/ticket-provider/github-provider.ts`:65
  - Suggested fix: Extract priority extraction logic:
```typescript
private extractPriorityFromProject(issue: GitHubIssue): number {
  if (!issue.projectItems?.length) {
    return 3; // Default priority
  }

  for (const item of issue.projectItems) {
    if (!item.fieldValueByName) continue;
    
    const priorityField = item.fieldValueByName.find(
      (f) => f.field.name.toLowerCase() === 'priority'
    );
    
    if (priorityField) {
      const priorityValue = parseInt(priorityField.name, 10);
      if (!isNaN(priorityValue)) {
        return priorityValue;
      }
    }
  }
  
  return 3; // Default priority
}

// Then in mapIssueToTicket:
const priority = this.extractPriorityFromProject(issue);
```

**security** [security]: The gh-cli.ts sets maxBuffer to 10MB for issue bodies, but there's no validation that the parsed JSON doesn't contain excessively large data structures. A malicious or corrupted response could still cause memory issues through deeply nested objects or arrays.
  - File: `src/services/gh-cli.ts`:199
  - Suggested fix: Add JSON structure validation after parsing:
1. Check the depth of nested objects (limit to reasonable depth like 10)
2. Check array lengths (limit to reasonable size like 1000 items)
3. Validate that required fields exist and have expected types
4. Consider using a JSON schema validator like ajv

**requirements** [po]: The README.md mentions that issues can be imported with various URL formats including 'owner/repo#123' shorthand, but doesn't clarify that this requires the GitHub provider to be configured with a default repository. Users might expect this format to work without configuration and be confused when it fails.
  - File: `README.md`:162
  - Suggested fix: Add a note in the README under the URL formats section:
```markdown
# Supported URL formats:
# - https://github.com/owner/repo/issues/123
# - github.com/owner/repo/issues/123
# - owner/repo#123 (requires ticketing.github.repo configured)
```



### Perspective Summary
- Code Quality: ❌ Failed
- Security: ❌ Failed
- Requirements (PO): ❌ Failed

### Overall Result
❌ **FAILED** - Issues must be addressed

---
*Review completed: 2026-01-28*
