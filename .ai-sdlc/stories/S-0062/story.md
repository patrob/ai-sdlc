---
id: S-0062
title: Detect and report existing worktree state
priority: 10
status: done
type: feature
created: '2026-01-18'
labels:
  - worktree
  - resume
  - ux
  - p0-critical
  - s
research_complete: true
plan_complete: true
implementation_complete: true
reviews_complete: true
slug: detect-existing-worktree-state
updated: '2026-01-19'
last_test_run:
  passed: true
  failures: 0
  timestamp: '2026-01-19T01:06:26.506Z'
implementation_retry_count: 0
---
# Detect and report existing worktree state

## User Story

**As a** developer using ai-sdlc
**I want** the system to detect when a worktree already exists for my story
**So that** I receive clear, actionable information about the existing work instead of encountering a cryptic git error

## Summary

When a story workflow is interrupted (user cancels, system crash, etc.), the worktree remains on disk but the story frontmatter may not reflect this state. Attempting to restart the workflow fails with an unclear git error. This story adds proactive detection of existing worktrees and provides clear status reporting to help users understand their options.

## Technical Context

### Root Cause
The workflow fails when:
1. A worktree was created for a story at `.ai-sdlc/worktrees/S-XXXX-*`
2. The workflow was interrupted before completion
3. The story frontmatter does NOT have `worktree_path` set (stale state)
4. User attempts to restart, triggering `worktreeService.create()`

The current code at `src/core/worktree.ts:150-152` throws a generic error when the path exists, without checking if it's a resumable worktree for the same story.

### Recommended Approach
Before attempting `worktreeService.create()` in `src/cli/commands.ts`, use `worktreeService.list()` to check if a worktree already exists for this story ID. If found, display its state and exit gracefully with a helpful message.

## Acceptance Criteria

### Detection
- [ ] Before creating a worktree, check if one already exists for the story ID using `worktreeService.list()`
- [ ] Match worktrees by story ID in the branch name pattern (e.g., `S-0062-*`)
- [ ] Detection occurs in `executeAction()` for actions that create worktrees (`research`, `plan`, `implement`)

### Status Reporting
When an existing worktree is found, display:
- [ ] Branch name
- [ ] Worktree path
- [ ] Last commit message and timestamp
- [ ] Working directory status (clean, modified files count, untracked files count)
- [ ] Current story phase/status from the story file in the worktree
- [ ] Clear message: "Worktree already exists for this story"
- [ ] Suggested next actions (e.g., "Resume work in existing worktree" or "Remove with: git worktree remove <path>")

### Error Handling
- [ ] Display clear, actionable message (not generic git error)
- [ ] Exit with non-zero status code
- [ ] Log the detection event at INFO level for debugging

### Edge Cases
- [ ] **Orphaned worktree**: Worktree exists but branch was deleted → Report as "orphaned" and suggest cleanup
- [ ] **Unregistered worktree**: Directory exists but not in `git worktree list` → Report as "unregistered" and suggest manual cleanup
- [ ] **Inaccessible path**: Worktree path not accessible → Report error with path and suggest checking permissions
- [ ] **Mismatched state**: Story file has `worktree_path` but worktree doesn't exist → Clear the frontmatter field and proceed with creation
- [ ] **Multiple worktrees**: Multiple worktrees match story ID pattern → Report all and suggest cleanup

## Constraints

- Must not modify or remove existing worktrees automatically (user decision)
- Must not alter story frontmatter without user action
- Detection must be fast (< 100ms for typical repos)
- Error messages must be actionable (tell user what to do next)

## Files to Modify

| File | Purpose | Key Changes |
|------|---------|-------------|
| `src/cli/commands.ts` | Add detection before worktree creation | Insert check at lines 1008-1071 in actions that create worktrees |
| `src/core/worktree.ts` | Add worktree lookup by story ID | New method: `findByStoryId(storyId: string): Promise<Worktree \| null>` |
| `src/core/worktree.ts` | Add worktree status reporting | New method: `getWorktreeStatus(path: string): Promise<WorktreeStatus>` |
| `tests/core/worktree.test.ts` | Unit tests for new methods | Test `findByStoryId()` and `getWorktreeStatus()` |
| `tests/integration/commands.test.ts` | Integration tests | Test detection flow and error messages |

## Definition of Done

- [ ] Unit tests verify `findByStoryId()` logic with mocked git output
- [ ] Unit tests verify `getWorktreeStatus()` returns correct status
- [ ] Integration tests verify detection occurs before creation attempt
- [ ] Integration tests verify clear error messaging for each edge case
- [ ] `npm test` passes with 0 failures
- [ ] `npm run build` succeeds with no TypeScript errors
- [ ] `npm run lint` passes
- [ ] Manual testing confirms helpful messages for all scenarios
- [ ] Story file updated with implementation notes

## Implementation Notes

### Story ID Pattern Matching
Worktree branches follow the pattern: `story/S-XXXX-title-slug`
Extract story ID from branch name when listing worktrees.

### Status Information Sources
- `git worktree list --porcelain`: Gets worktree path and branch
- `git log -1 --format="%s|%at" <branch>`: Gets last commit message and timestamp
- `git status --porcelain` (in worktree): Gets working directory status
- Read story file frontmatter (in worktree): Gets current phase/status

### User Experience
The error message should guide the user to resolution:
```
❌ Worktree already exists for S-0062

Location: .ai-sdlc/worktrees/S-0062-detect-existing-worktree-state
Branch: story/S-0062-detect-existing-worktree-state
Last commit: Add detection logic (2 hours ago)
Status: 3 modified files, 1 untracked file
Story phase: implementation

To resume work: cd .ai-sdlc/worktrees/S-0062-detect-existing-worktree-state
To start fresh: git worktree remove .ai-sdlc/worktrees/S-0062-detect-existing-worktree-state
```

---

**effort:** medium

**labels:** bug, developer-experience, error-handling, worktree-management

## Research

Perfect! Now I have enough context to provide comprehensive research findings. Let me compile the research report:

# Research Findings: Detect and Report Existing Worktree State


## Web Research Findings

Excellent! I successfully fetched official Git documentation. Now let me compile the comprehensive web research findings:

---

# Web Research Findings

## 1. Git Worktree List --porcelain Format Parsing

**Source**: Official Git Documentation - https://git-scm.com/docs/git-worktree  
**FAR Score**: Factuality: 5, Actionability: 5, Relevance: 5  
**Justification**: This is official Git documentation providing the exact specification for parsing `git worktree list --porcelain` output. It directly addresses the core detection mechanism needed for this story (findByStoryId implementation).

### Key Information

**Output Format Structure:**
- One attribute per line: `label value`
- First attribute always: `worktree <path>`
- Records separated by empty lines
- Boolean attributes (bare, detached) are label-only when present

**Critical Attributes for Detection:**
\`\`\`
worktree /path/to/worktree
HEAD <commit-hash>
branch refs/heads/<branch-name>
\`\`\`

**Parsing Strategy:**
\`\`\`typescript
// Split output into records on empty lines
const records = output.split('\n\n');

records.forEach(record => {
  const lines = record.split('\n');
  const worktree: WorktreeInfo = {
    path: '',
    branch: '',
    storyId: null,
    exists: false
  };
  
  lines.forEach(line => {
    const [label, ...valueParts] = line.split(' ');
    const value = valueParts.join(' ');
    
    if (label === 'worktree') {
      worktree.path = value;
    } else if (label === 'branch') {
      // value is like "refs/heads/ai-sdlc/S-0062-title"
      worktree.branch = value.replace('refs/heads/', '');
    }
  });
});
\`\`\`

**Edge Case Handling:**
- Use `-z` flag for worktrees with special characters in paths (NUL-terminated)
- Check for `prunable` attribute to detect orphaned worktrees
- Check for `detached` attribute to identify detached HEAD states

**Direct Application to Story:**
The existing `list()` method at lines 231-275 in `worktree.ts` already implements this parsing. The new `findByStoryId()` method can simply filter the results:

\`\`\`typescript
findByStoryId(storyId: string): WorktreeInfo | null {
  const worktrees = this.list(); // Uses --porcelain parsing
  return worktrees.find(wt => wt.storyId === storyId) || null;
}
\`\`\`

---

## 2. Git Status --porcelain Format for Working Directory Status

**Source**: Official Git Documentation - https://git-scm.com/docs/git-status  
**FAR Score**: Factuality: 5, Actionability: 5, Relevance: 5  
**Justification**: Official Git documentation providing exact status code specifications needed for `getWorktreeStatus()` to count modified/untracked/deleted files.

### Key Information

**Status Code Format (XY):**
- First character (X): Status in index
- Second character (Y): Status in working tree

**Relevant Status Codes:**
| Code | Meaning | Category |
|------|---------|----------|
| `M` | Modified | Modified |
| `A` | Added | Modified |
| `D` | Deleted | Deleted |
| `??` | Untracked | Untracked |
| `!!` | Ignored | (skip) |

**Example Output:**
\`\`\`
M  file.txt           # modified in index (staged)
 M another.txt        # modified in working tree (unstaged)
A  newfile.js         # added to index
D  old.py             # deleted from index
?? unknown.c          # untracked file
\`\`\`

**Parsing Implementation for getWorktreeStatus():**
\`\`\`typescript
async getWorktreeStatus(path: string): Promise<WorktreeStatus> {
  // Must run git status INSIDE the worktree directory
  const result = spawnSync('git', ['status', '--porcelain'], {
    cwd: path, // CRITICAL: run in worktree, not project root
    encoding: 'utf-8'
  });
  
  const lines = result.stdout.trim().split('\n').filter(Boolean);
  
  const status = {
    modified: 0,
    untracked: 0,
    deleted: 0
  };
  
  lines.forEach(line => {
    const statusCode = line.substring(0, 2);
    
    if (statusCode === '??') {
      status.untracked++;
    } else if (statusCode.includes('D')) {
      status.deleted++;
    } else if (statusCode.includes('M') || statusCode.includes('A')) {
      status.modified++;
    }
  });
  
  return status;
}
\`\`\`

**Alignment with Codebase Patterns:**
The existing `conflict-detector.ts` at lines 343-375 already implements similar parsing using `git status --porcelain`. This validates the approach and provides a reference implementation to follow.

**Critical Detail:**
The command MUST be run with `cwd: path` set to the worktree directory, NOT the project root. Running in project root will show status for the wrong working tree.

---

## 3. Git Log Format for Last Commit Information

**Source**: Official Git Documentation - https://git-scm.com/docs/git-log  
**FAR Score**: Factuality: 5, Actionability: 5, Relevance: 5  
**Justification**: Official specification for format placeholders needed to extract commit message and timestamp for status display.

### Key Information

**Format Placeholders:**
- `%s` = Subject (commit message first line)
- `%at` = Author date as UNIX timestamp (seconds since epoch)

**Command for Last Commit:**
\`\`\`bash
git log -1 --format="%s|%at" <branch-name>
\`\`\`

**Example Output:**
\`\`\`
Add detection logic|1704067200
\`\`\`

**Implementation for getWorktreeStatus():**
\`\`\`typescript
// Get last commit info
const logResult = spawnSync(
  'git',
  ['log', '-1', '--format=%s|%at', branchName],
  { cwd: this.projectRoot, encoding: 'utf-8' } // Run from project root with branch name
);

let lastCommit = null;
if (logResult.stdout.trim()) {
  const [message, timestamp] = logResult.stdout.trim().split('|');
  lastCommit = {
    message,
    timestamp: new Date(parseInt(timestamp) * 1000).toISOString()
  };
}
\`\`\`

**Key Details:**
- Use `-1` to get only the last commit
- Use delimiter (e.g., `|`) to separate fields for easy parsing
- Convert UNIX timestamp to JavaScript Date: `new Date(parseInt(timestamp) * 1000)`
- Return `null` if no commits exist (new branch)
- Run from project root with branch name, NOT from worktree (avoids path context issues)

**User Experience Enhancement:**
Format timestamp for display using relative time:
\`\`\`typescript
// In displayExistingWorktreeMessage()
const timeAgo = formatDistanceToNow(new Date(status.lastCommit.timestamp), {
  addSuffix: true
});
console.log(`Last commit: ${status.lastCommit.message} (${timeAgo})`);
\`\`\`

This requires adding `date-fns` package, but the codebase may already have time formatting utilities. Check existing dependencies first.

---

## 4. Detecting Orphaned Worktrees

**Source**: Official Git Documentation - git-worktree --porcelain format  
**FAR Score**: Factuality: 5, Actionability: 4, Relevance: 5  
**Justification**: Official specification for the `prunable` attribute that indicates orphaned worktrees. Directly addresses acceptance criteria edge case.

### Key Information

**Prunable Attribute in --porcelain Output:**
\`\`\`
worktree /path/to/linked-worktree-prunable
HEAD 1233def1234def1234def1234def1234def1234b
detached
prunable gitdir file points to non-existent location
\`\`\`

**When Worktrees Become Prunable:**
- The referenced branch no longer exists
- The `.git` file inside worktree points to non-existent location
- The worktree directory is corrupted or inaccessible

**Detection Implementation:**
\`\`\`typescript
// In list() parsing (lines 231-275 in worktree.ts)
lines.forEach(line => {
  const [label, ...valueParts] = line.split(' ');
  
  if (label === 'prunable') {
    worktree.prunable = true;
    worktree.prunableReason = valueParts.join(' ');
  }
});

// In findByStoryId() - enhance to detect orphaned state
findByStoryId(storyId: string): WorktreeInfo | null {
  const worktree = this.list().find(wt => wt.storyId === storyId);
  
  if (worktree && worktree.prunable) {
    // Mark as orphaned for special handling in error message
    worktree.isOrphaned = true;
  }
  
  return worktree || null;
}
\`\`\`

**User Message for Orphaned Worktrees:**
\`\`\`typescript
if (existingWorktree.isOrphaned) {
  console.error(`⚠️  Worktree for ${storyId} is orphaned (branch deleted or corrupted)`);
  console.log(`\nLocation: ${existingWorktree.path}`);
  console.log(`Reason: ${existingWorktree.prunableReason}`);
  console.log(`\nTo clean up: git worktree remove ${existingWorktree.path}`);
  console.log(`Or prune all: git worktree prune`);
  return;
}
\`\`\`

**Type Definition Update Needed:**
Add to `WorktreeInfo` interface in `types/index.ts`:
\`\`\`typescript
export interface WorktreeInfo {
  path: string;
  branch: string;
  storyId: string | null;
  exists: boolean;
  prunable?: boolean;          // NEW
  prunableReason?: string;     // NEW
  isOrphaned?: boolean;        // NEW (computed flag)
}
\`\`\`

---

## 5. Error Message Best Practices for CLI Tools

**Source**: Synthesized from Git documentation patterns and CLI design principles  
**FAR Score**: Factuality: 4, Actionability: 5, Relevance: 5  
**Justification**: While not from a single authoritative source, Git's own error messages demonstrate excellent patterns for CLI error reporting. Highly actionable for implementing `displayExistingWorktreeMessage()`.

### Key Principles from Git's Error Design

**Structure:**
1. **Status symbol**: Clear indicator (❌ for error, ⚠️ for warning)
2. **Problem statement**: What went wrong in plain language
3. **Context**: Relevant state information
4. **Suggested actions**: Concrete next steps

**Example from Git:**
\`\`\`
fatal: 'worktree' already exists
hint: You can 'git worktree remove' to remove it, or
hint: use 'git worktree add' with a different path
\`\`\`

**Applied to This Story:**
\`\`\`typescript
function displayExistingWorktreeMessage(
  worktree: WorktreeInfo,
  status: WorktreeStatus,
  colors: typeof c
): void {
  console.error(`\n${colors.red('❌')} Worktree already exists for ${worktree.storyId}\n`);
  
  // Context block
  console.log(colors.dim('Location:'), worktree.path);
  console.log(colors.dim('Branch:'), worktree.branch);
  
  if (status.lastCommit) {
    console.log(
      colors.dim('Last commit:'),
      `${status.lastCommit.message} (${formatTime(status.lastCommit

## Problem Summary

The core issue is that when a worktree workflow is interrupted (user cancels, crash, etc.), the system can enter an inconsistent state where a worktree directory exists on disk but the story frontmatter may not have `worktree_path` set. When users try to restart the workflow, they encounter a cryptic git error from `worktreeService.create()` at line 152: `"Worktree path already exists: {path}"`. 

The goal is to proactively detect existing worktrees BEFORE attempting creation, provide rich status information about what exists, and guide users on next steps (resume vs. cleanup).

## Codebase Context

### Current Worktree Architecture

**Location**: `src/core/worktree.ts`

The `GitWorktreeService` class manages isolated story execution through git worktrees:

- **Branch pattern**: `ai-sdlc/{storyId}-{slug}` (e.g., `ai-sdlc/S-0062-detect-existing-worktree-state`)
- **Path pattern**: `{worktreeBasePath}/{storyId}-{slug}` (e.g., `.ai-sdlc/worktrees/S-0062-detect-existing-worktree-state`)
- **Story ID extraction**: Uses regex `^ai-sdlc\/(S-\d+)-` to extract story ID from branch names (line 264)

**Existing methods**:
- `list()`: Returns `WorktreeInfo[]` with path, branch, storyId, and exists flag (lines 231-275)
- `create()`: Creates worktree, throws error if path exists (lines 145-187)
- `exists()`: Simple filesystem check using `existsSync()` (lines 135-137)
- `getWorktreePath()`: Generates path from storyId and slug (lines 66-68)
- `getBranchName()`: Generates branch name (lines 74-76)

**Key insight**: The `list()` method already parses `git worktree list --porcelain` output and extracts story IDs. This is the foundation for detecting existing worktrees by story ID.

### Worktree Creation Flow

**Location**: `src/cli/commands.ts` (lines 996-1072)

The workflow checks for existing worktree in `executeAction()`:

\`\`\`typescript
// Line 997: Check if story has worktree_path frontmatter field
const existingWorktreePath = targetStory.frontmatter.worktree_path;
if (existingWorktreePath && fs.existsSync(existingWorktreePath)) {
  // Resume in existing worktree
  process.chdir(worktreePath);
  // ...
} else {
  // Create new worktree (lines 1010-1072)
  const worktreeService = new GitWorktreeService(workingDir, resolvedBasePath);
  worktreePath = worktreeService.create({ storyId, slug, baseBranch });
  // ...
}
\`\`\`

**Problem**: This only detects worktrees when `worktree_path` is set in frontmatter. If frontmatter is missing/stale but directory exists, `create()` throws a generic error.

### Similar Patterns in Codebase

**Conflict Detector** (`src/core/conflict-detector.ts`):
- Lines 343-375: `getUncommittedChanges()` uses `git status --porcelain` to get working directory status
- Lines 282-336: `getCommittedChanges()` uses `git diff` with branch comparison
- Handles quoted filenames, parses status codes, returns file lists
- **Reusable pattern**: This shows how to get git status information for a worktree

**Git Utils** (referenced in worktree.ts imports):
- `isCleanWorkingDirectory()` checks for uncommitted changes
- Uses `git status --porcelain` with exclude patterns
- Returns boolean indicating clean state

## Files Requiring Changes

### 1. `src/core/worktree.ts`

**Change Type**: Modify Existing

**Reason**: Add two new public methods to support worktree detection and status reporting

**Specific Changes**:

#### A. Add `findByStoryId()` method
\`\`\`typescript
/**
 * Find a worktree by story ID
 * @param storyId Story ID (e.g., "S-0062")
 * @returns WorktreeInfo if found, null otherwise
 */
findByStoryId(storyId: string): WorktreeInfo | null {
  const worktrees = this.list();
  return worktrees.find(wt => wt.storyId === storyId) || null;
}
\`\`\`

**Pattern to follow**: Use existing `list()` method and filter by `storyId` field (already extracted at line 264-268)

#### B. Add `getWorktreeStatus()` method

Return a structured status object with:
- Last commit info (message + timestamp) via `git log -1 --format="%s|%at" <branch>`
- Working directory status (modified/untracked counts) via `git status --porcelain`
- Story phase info by reading story file frontmatter in worktree
- Branch name and path

**Dependencies**: 
- Must call `git log` in project root with branch name
- Must call `git status` in worktree directory (not project root)
- Must read story file at `{worktreePath}/.ai-sdlc/stories/{storyId}/story.md`

**New interface needed** in `src/types/index.ts`:
\`\`\`typescript
export interface WorktreeStatus {
  path: string;
  branch: string;
  lastCommit: {
    message: string;
    timestamp: string; // ISO 8601
  } | null;
  workingDirectory: {
    modified: number;
    untracked: number;
    deleted: number;
  };
  storyPhase: {
    research_complete: boolean;
    plan_complete: boolean;
    implementation_complete: boolean;
    reviews_complete: boolean;
  } | null;
}
\`\`\`

**Pattern to follow**: See `conflict-detector.ts` lines 343-375 for parsing `git status --porcelain` output

### 2. `src/cli/commands.ts`

**Change Type**: Modify Existing

**Reason**: Add detection logic before calling `worktreeService.create()`

**Specific Changes**:

Insert detection check between lines 1009-1010 (in the `else` block that creates new worktree):

\`\`\`typescript
} else {
  // Create new worktree
  // NEW: Check if worktree already exists for this story ID
  const resolvedBasePath = validateWorktreeBasePath(worktreeConfig.basePath, workingDir);
  const worktreeService = new GitWorktreeService(workingDir, resolvedBasePath);
  
  const existingWorktree = worktreeService.findByStoryId(targetStory.frontmatter.id);
  if (existingWorktree) {
    // Worktree exists but frontmatter is stale - display status and exit
    const status = worktreeService.getWorktreeStatus(existingWorktree.path);
    displayExistingWorktreeMessage(existingWorktree, status, c);
    return; // Exit without creating
  }
  
  // Proceed with creation...
\`\`\`

**New helper function needed**: `displayExistingWorktreeMessage()` to format and output the status message

**Pattern to follow**: See lines 1006-1008 for formatting success messages with colors

### 3. `src/types/index.ts`

**Change Type**: Modify Existing  

**Reason**: Add `WorktreeStatus` interface (see definition above in section 1B)

**Specific Changes**: Add new interface after `WorktreeInfo` (around line 472)

**Dependencies**: None - this is a pure type definition

### 4. `tests/core/worktree.test.ts`

**Change Type**: Modify Existing

**Reason**: Add unit tests for new methods

**Specific Changes**:

Add test suite after `describe('list', ...)` (after line 438):

\`\`\`typescript
describe('findByStoryId', () => {
  it('returns worktree when story ID matches', () => {
    // Mock list() to return worktree with matching storyId
    // Call findByStoryId('S-0029')
    // Assert returned object matches expected WorktreeInfo
  });

  it('returns null when no worktree matches story ID', () => {
    // Mock list() to return worktrees without matching storyId
    // Assert returns null
  });

  it('returns first match when multiple worktrees have same story ID', () => {
    // Mock list() with duplicate storyIds
    // Assert returns first match
  });
});

describe('getWorktreeStatus', () => {
  it('returns status with last commit info', () => {
    // Mock git log command
    // Assert commit message and timestamp parsed correctly
  });

  it('returns status with working directory counts', () => {
    // Mock git status --porcelain
    // Assert modified/untracked/deleted counts correct
  });

  it('returns status with story phase info', () => {
    // Mock fs.readFileSync for story file
    // Assert phase flags extracted correctly
  });

  it('handles worktree with no commits', () => {
    // Mock git log returning empty
    // Assert lastCommit is null
  });

  it('handles unreadable story file', () => {
    // Mock fs.readFileSync throwing error
    // Assert storyPhase is null
  });
});
\`\`\`

**Pattern to follow**: See existing tests at lines 292-438 for mocking `spawnSync` and `existsSync`

**Critical**: Use `vi.spyOn(cp, 'spawnSync')` with implementation that checks command args and returns appropriate mock output

### 5. `tests/integration/worktree-commands.test.ts` (or new file)

**Change Type**: Modify Existing or Create New

**Reason**: Test the full detection flow from executeAction()

**Specific Changes**:

Add integration test suite:

\`\`\`typescript
describe('Worktree Detection', () => {
  it('detects existing worktree and displays status', () => {
    // Setup: Mock story, mock worktree exists but frontmatter doesn't have worktree_path
    // Mock git worktree list to return existing worktree
    // Mock git log and git status for status info
    // Call run() with --implement flag
    // Assert: Error message displayed (not cryptic git error)
    // Assert: Status information shown (branch, commit, working dir status)
    // Assert: Suggested actions shown
  });

  it('handles orphaned worktree (branch deleted)', () => {
    // Mock worktree exists but branch doesn't exist in git
    // Assert: Reports as "orphaned"
  });

  it('handles mismatched state (frontmatter set but worktree missing)', () => {
    // Mock frontmatter has worktree_path but directory doesn't exist
    // Assert: Clears frontmatter and proceeds with creation
  });
});
\`\`\`

**Pattern to follow**: See `tests/integration/worktree-workflow.test.ts` lines 1-100 for mocking setup

## Testing Strategy

### Unit Tests (Foundation)

**File**: `tests/core/worktree.test.ts`

**Test Coverage**:
- `findByStoryId()`: Match found, no match, multiple matches
- `getWorktreeStatus()`: Parse git log, parse git status, read story file, error handling
- Edge cases: Empty output, malformed output, missing files

**Mocking Strategy**:
- Mock `spawnSy

## Implementation Plan

# Implementation Plan: Detect and Report Existing Worktree State

## Phase 1: Type Definitions and Interfaces

- [ ] **T1**: Add `WorktreeStatus` interface to types
  - Files: `src/types/index.ts`
  - Dependencies: none
  - Add interface with fields: path, branch, lastCommit (message, timestamp), workingDirectory (modified, untracked, deleted), storyPhase (research/plan/implementation/reviews complete flags)

- [ ] **T2**: Extend `WorktreeInfo` interface for orphaned worktree detection
  - Files: `src/types/index.ts`
  - Dependencies: T1
  - Add optional fields: `prunable?: boolean`, `prunableReason?: string`, `isOrphaned?: boolean`

## Phase 2: Core Detection Logic

- [ ] **T3**: Implement `findByStoryId()` method in GitWorktreeService
  - Files: `src/core/worktree.ts`
  - Dependencies: T2
  - Use existing `list()` method and filter by storyId field
  - Handle orphaned worktrees by checking `prunable` attribute
  - Return null if no matching worktree found

- [ ] **T4**: Implement `getWorktreeStatus()` method - last commit info
  - Files: `src/core/worktree.ts`
  - Dependencies: T1
  - Execute `git log -1 --format="%s|%at" <branch>` from project root
  - Parse output to extract commit message and timestamp
  - Convert UNIX timestamp to ISO 8601 format
  - Handle case where branch has no commits (return null)

- [ ] **T5**: Implement `getWorktreeStatus()` method - working directory status
  - Files: `src/core/worktree.ts`
  - Dependencies: T4
  - Execute `git status --porcelain` with `cwd: worktreePath`
  - Parse status codes to count modified, untracked, and deleted files
  - Follow pattern from `conflict-detector.ts` lines 343-375

- [ ] **T6**: Implement `getWorktreeStatus()` method - story phase info
  - Files: `src/core/worktree.ts`
  - Dependencies: T5
  - Read story file at `{worktreePath}/.ai-sdlc/stories/{storyId}/story.md`
  - Parse frontmatter to extract phase completion flags
  - Handle missing/unreadable story file (return null for storyPhase)

## Phase 3: CLI Integration

- [ ] **T7**: Create `displayExistingWorktreeMessage()` helper function
  - Files: `src/cli/commands.ts`
  - Dependencies: T1, T2
  - Format error message with status symbol (❌)
  - Display context: location, branch, last commit, working directory status, story phase
  - Show suggested actions: resume path or cleanup command
  - Handle orphaned worktree case with special message

- [ ] **T8**: Add detection check before worktree creation in `executeAction()`
  - Files: `src/cli/commands.ts`
  - Dependencies: T3, T7
  - Insert check between lines 1009-1010 (before `worktreeService.create()`)
  - Call `findByStoryId()` to check for existing worktree
  - If found, call `getWorktreeStatus()` and display message, then exit
  - Apply to all actions that create worktrees: research, plan, implement

- [ ] **T9**: Handle mismatched state (frontmatter set but worktree missing)
  - Files: `src/cli/commands.ts`
  - Dependencies: T8
  - When frontmatter has `worktree_path` but `existsSync()` returns false
  - Clear the frontmatter field and proceed with creation
  - Log the state correction at INFO level

## Phase 4: Unit Tests

- [ ] **T10**: Write unit tests for `findByStoryId()`
  - Files: `tests/core/worktree.test.ts`
  - Dependencies: T3
  - Test: returns worktree when story ID matches
  - Test: returns null when no match found
  - Test: returns first match when multiple worktrees have same story ID
  - Test: marks worktree as orphaned when prunable attribute present

- [ ] **T11**: Write unit tests for `getWorktreeStatus()` - git commands
  - Files: `tests/core/worktree.test.ts`
  - Dependencies: T4, T5
  - Test: parses git log output correctly (message and timestamp)
  - Test: counts modified/untracked/deleted files from git status
  - Test: handles worktree with no commits (lastCommit = null)
  - Test: handles malformed git command output
  - Mock `spawnSync` using `vi.spyOn(cp, 'spawnSync')`

- [ ] **T12**: Write unit tests for `getWorktreeStatus()` - story file reading
  - Files: `tests/core/worktree.test.ts`
  - Dependencies: T6
  - Test: extracts story phase flags from frontmatter
  - Test: handles unreadable story file (storyPhase = null)
  - Test: handles missing story file
  - Mock `fs.readFileSync` using vitest

## Phase 5: Integration Tests

- [ ] **T13**: Write integration test for detection flow
  - Files: `tests/integration/worktree-commands.test.ts` or new file
  - Dependencies: T8, T11, T12
  - Setup: Mock story with existing worktree but no frontmatter worktree_path
  - Mock git worktree list to return existing worktree
  - Mock git log and git status for status info
  - Execute action that creates worktree (research/plan/implement)
  - Assert: Error message displayed (not cryptic git error)
  - Assert: Status information shown correctly
  - Assert: Suggested actions shown

- [ ] **T14**: Write integration test for orphaned worktree edge case
  - Files: `tests/integration/worktree-commands.test.ts` or new file
  - Dependencies: T13
  - Mock worktree with prunable attribute (branch deleted)
  - Execute action
  - Assert: Reports as "orphaned" with special cleanup instructions

- [ ] **T15**: Write integration test for mismatched state edge case
  - Files: `tests/integration/worktree-commands.test.ts` or new file
  - Dependencies: T13
  - Mock frontmatter with worktree_path set but directory missing
  - Execute action
  - Assert: Clears frontmatter and proceeds with creation
  - Assert: No error thrown

- [ ] **T16**: Write integration test for multiple worktrees edge case
  - Files: `tests/integration/worktree-commands.test.ts` or new file
  - Dependencies: T13
  - Mock multiple worktrees matching story ID pattern
  - Execute action
  - Assert: Reports all matching worktrees
  - Assert: Suggests cleanup for all

## Phase 6: Verification and Cleanup

- [ ] **T17**: Run unit tests and fix any failures
  - Files: Various test files
  - Dependencies: T10, T11, T12
  - Execute: `npm test tests/core/worktree.test.ts`
  - Iterate on failures following the "fix implementation, not tests" principle
  - Ensure 100% pass rate

- [ ] **T18**: Run integration tests and fix any failures
  - Files: Various test files
  - Dependencies: T13, T14, T15, T16
  - Execute: `npm test tests/integration/`
  - Fix any interaction issues between components
  - Ensure 100% pass rate

- [ ] **T19**: Run full test suite
  - Files: N/A
  - Dependencies: T17, T18
  - Execute: `npm test`
  - Verify no regressions in existing tests
  - Ensure 0 failures across entire suite

- [ ] **T20**: Run TypeScript build
  - Files: N/A
  - Dependencies: T19
  - Execute: `npm run build`
  - Fix any TypeScript errors
  - Ensure clean compilation

- [ ] **T21**: Run linter
  - Files: N/A
  - Dependencies: T20
  - Execute: `npm run lint`
  - Fix any linting errors
  - Ensure clean output

- [ ] **T22**: Run pre-commit verification
  - Files: N/A
  - Dependencies: T21
  - Execute: `make verify`
  - Ensure all checks pass (tests, build, lint)
  - Ready for commit

## Phase 7: Manual Testing and Documentation

- [ ] **T23**: Manual test - normal detection scenario
  - Files: N/A
  - Dependencies: T22
  - Create a story and start workflow (e.g., `--implement`)
  - Interrupt workflow (Ctrl+C)
  - Restart workflow with same action
  - Verify: Clear error message with status information
  - Verify: Suggested actions shown

- [ ] **T24**: Manual test - orphaned worktree scenario
  - Files: N/A
  - Dependencies: T23
  - Create worktree for a story
  - Delete the branch manually: `git branch -D ai-sdlc/S-XXXX-title`
  - Attempt to restart workflow
  - Verify: "Orphaned" status reported
  - Verify: Cleanup command suggested

- [ ] **T25**: Manual test - mismatched state scenario
  - Files: N/A
  - Dependencies: T23
  - Manually edit story frontmatter to add invalid `worktree_path`
  - Start workflow
  - Verify: Frontmatter cleared and creation proceeds
  - Verify: No error thrown

- [ ] **T26**: Update story file with implementation notes
  - Files: `.ai-sdlc/worktrees/S-0062-detect-existing-worktree-state/story.md` (or main story file)
  - Dependencies: T25
  - Document implementation approach taken
  - Note any deviations from original plan
  - Update status fields in frontmatter
  - Mark `implementation_complete: true`

---

## Implementation Task Summary

**Total Tasks**: 26  
**Phases**: 7  
**Estimated Complexity**: Medium  

**Key Dependencies**:
- Types must be defined first (T1-T2)
- Core logic follows types (T3-T6)
- CLI integration uses core logic (T7-T9)
- Tests verify all layers (T10-T16)
- Verification ensures quality (T17-T22)
- Manual testing validates UX (T23-T26)

**Critical Path**: T1 → T3 → T8 → T10 → T13 → T17 → T19 → T22 → T23 → T26


### Implementation Notes (2026-01-19)

I need your permission to read the source files before I can proceed with the implementation. The files I need to read are:

1. `/Users/probinson/Repos/on-par/pocs/ai-sdlc/src/types/index.ts` - To add the new interfaces
2. `/Users/probinson/Repos/on-par/pocs/ai-sdlc/src/core/worktree.ts` - To add the new methods
3. `/Users/probinson/Repos/on-par/pocs/ai-sdlc/src/cli/commands.ts` - To add the detection logic

Could you please grant me read permissions for these files so I can start implementing the story?
