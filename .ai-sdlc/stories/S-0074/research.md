---
*Generated: 2026-01-28*

---
*Generated: 2026-01-28*

Excellent! Now I have enough information. Let me compile the comprehensive research findings:

---

# Research Findings: Implement GitHub Read Operations

## Problem Summary

The core goal is to enable users to import GitHub Issues into ai-sdlc as local stories or link existing stories to GitHub Issues. This requires:

1. **GitHubTicketProvider** - Implementation of the existing `TicketProvider` interface to interact with GitHub Issues via the `gh` CLI
2. **gh CLI Wrapper** - Utility functions to execute `gh` commands safely and parse JSON output
3. **CLI Commands** - Two new commands (`import` and `link`) to expose functionality to users
4. **URL Parsing** - Extract owner/repo/issue-number from various GitHub URL formats
5. **Error Handling** - Graceful degradation when `gh` CLI is not installed or authenticated

## Codebase Context

### Existing Architecture

The codebase already has a **ticketing integration foundation** in place:

**1. Provider Interface (`src/services/ticket-provider/types.ts`)**
- Defines `TicketProvider` interface with methods:
  - `list(filter?: TicketFilter): Promise<Ticket[]>` - List tickets
  - `get(id: string): Promise<Ticket>` - Get single ticket
  - `create(ticket: NewTicket): Promise<Ticket>` - Create ticket (out of scope for S-0074)
  - `updateStatus(id: string, status: string): Promise<void>` - Update status (out of scope)
  - `addComment(id: string, body: string): Promise<void>` - Add comment (out of scope)
  - `linkPR(id: string, prUrl: string): Promise<void>` - Link PR (out of scope)
  - `mapStatusToExternal(status: StoryStatus): string` - Map internal → external status
  - `mapStatusFromExternal(externalStatus: string): StoryStatus` - Map external → internal status

**2. NullTicketProvider (`src/services/ticket-provider/null-provider.ts`)**
- No-op implementation for local-only mode
- Returns empty arrays for `list()`, throws errors for `get()/create()`
- Write operations are silent no-ops
- Provides reference implementation pattern

**3. Factory Pattern (`src/services/ticket-provider/index.ts`)**
- `createTicketProvider(config: Config): TicketProvider`
- Currently throws "not yet implemented" for 'github' provider
- Switch case ready for GitHub implementation

**4. Story Metadata Support (`src/types/index.ts:245-249`)**
\`\`\`typescript
ticket_provider?: 'github' | 'jira' | 'linear';
ticket_id?: string;
ticket_url?: string;
ticket_synced_at?: string;
\`\`\`

**5. Configuration Support (`src/types/index.ts:657-673`)**
\`\`\`typescript
export interface TicketingConfig {
  provider: 'none' | 'github' | 'jira';
  syncOnRun?: boolean;
  postProgressComments?: boolean;
  github?: {
    repo?: string;  // 'owner/repo' format
    projectNumber?: number;
    statusLabels?: Record<string, string>;
  };
}
\`\`\`

### Patterns to Follow

**1. Command Execution Pattern** (`src/core/git-utils.ts:1-38`)
\`\`\`typescript
import { spawnSync } from 'child_process';

const result = spawnSync('git', ['status', '--porcelain'], {
  cwd: workingDir,
  encoding: 'utf-8',
  shell: false,
  stdio: ['ignore', 'pipe', 'pipe'],
});

if (result.status !== 0) {
  // Handle error
}

const output = result.stdout?.toString() || '';
\`\`\`

**Key learnings:**
- Use `spawnSync` for synchronous command execution
- Set `shell: false` for security (prevents shell injection)
- Use `encoding: 'utf-8'` to get string output automatically
- Check `result.status` for exit code
- Parse `result.stdout` and `result.stderr`

**2. CLI Command Pattern** (`src/index.ts:40-100`)
\`\`\`typescript
program
  .command('command-name <required> [optional]')
  .description('Command description')
  .option('-f, --flag <value>', 'Option description')
  .action((arg, options) => commandHandler(arg, options));
\`\`\`

**3. Testing Pattern** (`src/services/ticket-provider/__tests__/factory.test.ts`)
\`\`\`typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createTicketProvider } from '../index.js';

describe('createTicketProvider', () => {
  beforeEach(() => {
    // Setup
  });

  afterEach(() => {
    // Cleanup
  });

  it('should return correct provider for config', () => {
    const config = { ticketing: { provider: 'github' } } as Config;
    const provider = createTicketProvider(config);
    expect(provider.name).toBe('github');
  });
});
\`\`\`

**4. Error Handling Pattern** (from `NullTicketProvider`)
- Read operations throw descriptive errors: `throw new Error('No ticket provider configured')`
- Write operations are silent no-ops in local mode
- Providers should handle missing dependencies gracefully

## Files Requiring Changes

### 1. Create: `src/services/gh-cli.ts`
- **Change Type**: Create New
- **Reason**: Encapsulate all `gh` CLI interactions in a reusable utility module
- **Specific Changes**:
  - `export async function isGhAvailable(): Promise<boolean>` - Check if `gh` is installed and authenticated
  - `export async function ghIssueView(owner: string, repo: string, number: number): Promise<GitHubIssue>` - Fetch single issue
  - `export async function ghIssueList(owner: string, repo: string, filter?: IssueFilter): Promise<GitHubIssue[]>` - List issues
  - Define `GitHubIssue` interface matching gh CLI JSON output structure
  - Use `spawnSync` pattern from `git-utils.ts`
  - Handle errors: not installed, not authenticated, not found, no access
- **Dependencies**: None (foundational utility)

### 2. Create: `src/services/gh-cli.test.ts`
- **Change Type**: Create New
- **Reason**: Unit tests for gh CLI wrapper with mocked `spawnSync`
- **Specific Changes**:
  - Mock `spawnSync` to return test fixtures
  - Test successful gh commands
  - Test error scenarios (exit codes, stderr)
  - Test JSON parsing
- **Dependencies**: `gh-cli.ts` must exist first

### 3. Create: `src/services/ticket-provider/github-provider.ts`
- **Change Type**: Create New
- **Reason**: Implement TicketProvider interface for GitHub Issues
- **Specific Changes**:
  \`\`\`typescript
  export class GitHubTicketProvider implements TicketProvider {
    readonly name = 'github';
    
    constructor(private config?: GitHubConfig) {}
    
    async list(filter?: TicketFilter): Promise<Ticket[]> {
      // Call ghIssueList, map to Ticket[]
    }
    
    async get(id: string): Promise<Ticket> {
      // Call ghIssueView, map to Ticket
    }
    
    async create(ticket: NewTicket): Promise<Ticket> {
      throw new Error('Create operation not yet implemented (S-0075)');
    }
    
    // No-op implementations for write operations (S-0075)
    async updateStatus() {}
    async addComment() {}
    async linkPR() {}
    
    mapStatusToExternal(status: StoryStatus): string {
      // Map 'open' → 'ready', 'closed' → 'done'
      // Use config.statusLabels for custom mapping
    }
    
    mapStatusFromExternal(externalStatus: string): StoryStatus {
      // Reverse mapping
    }
  }
  \`\`\`
- **Dependencies**: `gh-cli.ts`, `ticket-provider/types.ts`

### 4. Create: `src/services/ticket-provider/__tests__/github-provider.test.ts`
- **Change Type**: Create New
- **Reason**: Unit tests for GitHubTicketProvider with mocked gh-cli
- **Specific Changes**:
  - Mock `gh-cli` functions
  - Test `list()` with various filters
  - Test `get()` with valid/invalid IDs
  - Test status mapping in both directions
  - Test error handling (gh not available, issue not found)
- **Dependencies**: `github-provider.ts`, `gh-cli.ts`

### 5. Modify: `src/services/ticket-provider/index.ts`
- **Change Type**: Modify Existing
- **Reason**: Update factory to instantiate GitHubTicketProvider
- **Specific Changes**:
  \`\`\`typescript
  import { GitHubTicketProvider } from './github-provider.js';
  
  export function createTicketProvider(config: Config): TicketProvider {
    switch (provider) {
      case 'github':
        return new GitHubTicketProvider(config.ticketing?.github);
      // ... rest unchanged
    }
  }
  \`\`\`
- **Dependencies**: `github-provider.ts` must exist first

### 6. Create: `src/cli/github-url-parser.ts`
- **Change Type**: Create New
- **Reason**: Parse various GitHub URL formats to extract owner/repo/issue-number
- **Specific Changes**:
  \`\`\`typescript
  export interface ParsedGitHubIssueURL {
    owner: string;
    repo: string;
    issueNumber: number;
  }
  
  export function parseGitHubIssueURL(url: string): ParsedGitHubIssueURL | null {
    // Support formats:
    // - https://github.com/owner/repo/issues/123
    // - https://github.com/owner/repo/issues/123#issuecomment-456
    // - github.com/owner/repo/issues/123
    // - owner/repo#123
  }
  \`\`\`
- **Dependencies**: None

### 7. Create: `src/cli/github-url-parser.test.ts`
- **Change Type**: Create New
- **Reason**: Unit tests for URL parsing with edge cases
- **Specific Changes**:
  - Test all supported URL formats
  - Test invalid URLs (return null)
  - Test edge cases (trailing slashes, fragments, etc.)
- **Dependencies**: `github-url-parser.ts`

### 8. Modify: `src/cli/commands.ts`
- **Change Type**: Modify Existing
- **Reason**: Add `import` and `link` command handlers
- **Specific Changes**:
  \`\`\`typescript
  export async function importIssue(issueUrl: string): Promise<void> {
    // 1. Parse URL to extract owner/repo/number
    // 2. Check gh CLI availability (isGhAvailable)
    // 3. Fetch issue details (ghIssueView)
    // 4. Check if already imported (search stories for ticket_id)
    // 5. Create story with ticket metadata
    // 6. Display success message with story ID and ticket URL
  }
  
  export async function linkIssue(storyId: string, issueUrl: string): Promise<void> {
    // 1. Parse URL
    // 2. Check gh CLI availability
    // 3. Fetch issue details
    // 4. Find existing story (getStory)
    // 5. Update story frontmatter with ticket fields
    // 6. Optionally sync title/description (with confirmation)
    // 7. Display success message
  }
  \`\`\`
- **Dependencies**: `github-url-parser.ts`, `gh-cli.ts`, `github-provider.ts`

### 9. Modify: `src/index.ts`
- **Change Type**: Modify Existi

## Web Research Findings

Web research tools are restricted. Based on the one successful fetch from Node.js documentation, I'll provide findings:

---

## Web Research Findings

### 1. Node.js Child Process Best Practices for gh CLI Execution

**Source**: Node.js Official Documentation v25.5.0 (https://nodejs.org/api/child_process.html)  
**FAR Score**: Factuality: 5, Actionability: 5, Relevance: 5  
**Justification**: 
- **Factuality (5)**: Official Node.js API documentation - authoritative source
- **Actionability (5)**: Provides copy-paste code examples and specific method recommendations
- **Relevance (5)**: Directly addresses the gh CLI wrapper implementation (`src/services/gh-cli.ts`) requirement in the story

#### Key Findings for gh CLI Wrapper Implementation:

**Recommended Approach: Use `execFile()` with promises**

\`\`\`typescript
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFilePromise = promisify(execFile);

export async function ghIssueView(
  owner: string,
  repo: string,
  number: number
): Promise<GitHubIssue> {
  try {
    const { stdout } = await execFilePromise('gh', [
      'issue',
      'view',
      number.toString(),
      '-R',
      `${owner}/${repo}`,
      '--json',
      'number,title,body,state,labels,assignees,projectItems'
    ], {
      encoding: 'utf8',
      timeout: 10000, // 10 second timeout
      maxBuffer: 10 * 1024 * 1024 // 10MB for large issue bodies
    });
    
    return JSON.parse(stdout);
  } catch (error) {
    // Handle gh not found, auth errors, etc.
    throw new Error(`Failed to fetch issue: ${error.message}`);
  }
}
\`\`\`

**Security: Why `execFile()` over `exec()`**
- ✅ **SAFE**: `execFile()` does not spawn a shell, preventing command injection
- ❌ **DANGEROUS**: `exec()` spawns a shell - vulnerable if user input isn't sanitized
- Since we're parsing GitHub URLs, using `execFile()` with argument array is critical

**Error Handling Patterns:**
\`\`\`typescript
export async function isGhAvailable(): Promise<boolean> {
  try {
    await execFilePromise('gh', ['--version'], { 
      encoding: 'utf8',
      timeout: 5000 
    });
    return true;
  } catch (error) {
    // gh not installed or not in PATH
    return false;
  }
}

export async function isGhAuthenticated(): Promise<boolean> {
  try {
    const { stdout } = await execFilePromise('gh', ['auth', 'status'], {
      encoding: 'utf8'
    });
    return stdout.includes('Logged in');
  } catch (error) {
    // Exit code 1 = not authenticated
    return false;
  }
}
\`\`\`

**JSON Output Handling:**
- Use `encoding: 'utf8'` to get string output instead of Buffer
- Use `JSON.parse(stdout)` to parse gh CLI JSON responses
- Set `maxBuffer` to 10MB for large issue bodies (default 1MB may be insufficient)

**Resource Management:**
- Set `timeout` option to prevent hanging on network issues (recommended: 10-30 seconds)
- Use `maxBuffer` for issues with large bodies or many comments
- gh CLI already returns JSON, no need for complex parsing

---

### 2. Additional Research Findings (Limited Access)

**Note**: WebSearch and most WebFetch requests were blocked. Here are research priorities if you can enable web tools:

**High Priority Topics:**
1. **gh CLI JSON field options**: Official list of all fields available in `--json` flag
2. **GitHub URL parsing patterns**: Regex patterns for various GitHub URL formats
3. **gh CLI exit codes**: Mapping error codes to specific failures (not found, auth, permissions)
4. **TypeScript error types**: Proper typing for child_process errors in TypeScript

**Recommended Official Sources:**
- `https://cli.github.com/manual/gh_issue_view` - Complete JSON field reference
- `https://cli.github.com/manual/gh_auth_status` - Auth checking methods
- GitHub API documentation - Issue object structure (gh CLI mirrors this)

---

### 3. Inferred Best Practices from Codebase Context

Based on the story requirements and Node.js documentation:

**URL Parsing Strategy:**
\`\`\`typescript
// Support multiple formats:
// https://github.com/owner/repo/issues/123
// https://github.com/owner/repo/issues/123#issuecomment-456
// github.com/owner/repo/issues/123
// owner/repo#123

export function parseGitHubIssueUrl(url: string): {
  owner: string;
  repo: string;
  number: number;
} | null {
  // Remove protocol and www
  const normalized = url
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '');
  
  // Match: github.com/owner/repo/issues/123
  const fullMatch = normalized.match(
    /^github\.com\/([^\/]+)\/([^\/]+)\/issues\/(\d+)/i
  );
  if (fullMatch) {
    return {
      owner: fullMatch[1],
      repo: fullMatch[2],
      number: parseInt(fullMatch[3], 10)
    };
  }
  
  // Match: owner/repo#123
  const shortMatch = normalized.match(/^([^\/]+)\/([^#]+)#(\d+)$/);
  if (shortMatch) {
    return {
      owner: shortMatch[1],
      repo: shortMatch[2],
      number: parseInt(shortMatch[3], 10)
    };
  }
  
  return null;
}
\`\`\`

**Error Message Mapping:**
\`\`\`typescript
function mapGhError(error: Error & { code?: string }): string {
  const message = error.message.toLowerCase();
  
  if (error.code === 'ENOENT' || message.includes('command not found')) {
    return 'Error: GitHub CLI (gh) is not installed.\nInstall it from: https://cli.github.com/';
  }
  
  if (message.includes('not logged') || message.includes('authentication')) {
    return 'Error: Not authenticated to GitHub.\nRun: gh auth login';
  }
  
  if (message.includes('not found') || message.includes('404')) {
    return 'Error: Issue not found or no access to repository.';
  }
  
  return `Error: ${error.message}`;
}
\`\`\`

---

## Summary

**Successfully Retrieved**: 1 high-quality official source (Node.js documentation)  
**Blocked**: 7 attempts (WebSearch and WebFetch require permissions)

**Key Actionable Insights:**
1. Use `execFile()` with promisify for security and modern async/await pattern
2. Set `encoding: 'utf8'` and `maxBuffer: 10MB` for JSON parsing
3. Implement timeout (10-30s) to prevent hanging processes
4. Check gh availability and auth status before operations
5. Parse GitHub URLs with regex supporting multiple formats

**Recommendation**: Grant WebSearch/WebFetch permissions to gather:
- Official gh CLI JSON field documentation
- Community patterns for TypeScript gh CLI wrappers
- Error code mappings for gh CLI exit codes