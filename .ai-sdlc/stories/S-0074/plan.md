---
*Generated: 2026-01-28*

Based on my exploration of the codebase, I can see that **the implementation is already complete**. The story shows that all files have been created and the implementation notes indicate it's ready for verification. 

However, since you've asked me to create an implementation plan, I'll provide a **comprehensive plan that documents what was implemented** and can serve as a reference for understanding the work that was done, or for any future similar implementations.

---

# Implementation Plan: GitHub Read Operations (Import/Link)

## Overview

This plan implements GitHub Issues integration for ai-sdlc using the `gh` CLI. Users will be able to import existing GitHub Issues as new stories, or link existing stories to issues.

---

## Implementation Tasks

### Phase 1: Core Infrastructure

- [ ] **T1**: Create GitHub CLI wrapper module
  - Files: `src/services/gh-cli.ts`
  - Dependencies: none
  - Tasks:
    - Implement `parseGitHubIssueUrl()` to handle multiple URL formats
    - Implement `isGhAvailable()` to check gh CLI installation and auth
    - Implement `ghIssueView()` to fetch single issue details
    - Implement `ghIssueList()` to list issues with filters
    - Define custom error types (GhNotInstalledError, GhNotAuthenticatedError, etc.)

- [ ] **T2**: Create unit tests for gh CLI wrapper
  - Files: `src/services/gh-cli.test.ts`
  - Dependencies: T1
  - Tasks:
    - Test URL parsing for all supported formats
    - Mock spawnSync for command execution tests
    - Test error handling scenarios (not installed, not authenticated, not found)
    - Test filter parameter handling

- [ ] **T3**: Create GitHubTicketProvider implementation
  - Files: `src/services/ticket-provider/github-provider.ts`
  - Dependencies: T1
  - Tasks:
    - Implement `list()` method using ghIssueList
    - Implement `get()` method using ghIssueView
    - Map GitHub issue state to StoryStatus
    - Implement status mapping methods (mapStatusToExternal, mapStatusFromExternal)
    - Stub write operations for future story S-0075

- [ ] **T4**: Create unit tests for GitHubTicketProvider
  - Files: `src/services/ticket-provider/__tests__/github-provider.test.ts`
  - Dependencies: T3
  - Tasks:
    - Test list() with various filters
    - Test get() for single issues
    - Test status mapping in both directions
    - Mock gh CLI wrapper calls

- [ ] **T5**: Update provider factory to support GitHub
  - Files: `src/services/ticket-provider/index.ts`
  - Dependencies: T3
  - Tasks:
    - Add case for 'github' provider in createTicketProvider()
    - Pass GitHub config to GitHubTicketProvider constructor

- [ ] **T6**: Update factory tests for GitHub provider
  - Files: `src/services/ticket-provider/__tests__/factory.test.ts`
  - Dependencies: T5
  - Tasks:
    - Add test case for GitHub provider instantiation
    - Verify config is passed correctly

---

### Phase 2: CLI Commands

- [ ] **T7**: Implement import command
  - Files: `src/cli/commands/import-issue.ts`
  - Dependencies: T3, T5
  - Tasks:
    - Parse issue URL from command arguments
    - Check if ai-sdlc is initialized
    - Verify GitHub provider is configured
    - Check gh CLI availability
    - Fetch issue details via provider
    - Check for duplicate imports (existing stories with same ticket_id)
    - Create new story with ticket metadata
    - Display success message with next steps

- [ ] **T8**: Implement link command
  - Files: `src/cli/commands/link-issue.ts`
  - Dependencies: T3, T5
  - Tasks:
    - Accept story ID/slug and issue URL as arguments
    - Find story by ID or slug
    - Fetch issue details
    - Check for existing ticket link (warn about overwrite)
    - Prompt for title/description sync (with --no-sync flag support)
    - Update story frontmatter with ticket metadata
    - Optionally sync title and description

- [ ] **T9**: Register CLI commands
  - Files: `src/cli/commands.ts`, `src/index.ts`
  - Dependencies: T7, T8
  - Tasks:
    - Export importIssue and linkIssue from commands.ts
    - Register 'import' command in index.ts
    - Register 'link' command in index.ts
    - Add command descriptions and usage examples

---

### Phase 3: Testing

- [ ] **T10**: Verify unit test coverage
  - Files: All test files created in T2, T4, T6
  - Dependencies: T2, T4, T6
  - Tasks:
    - Run `npm test` and verify all tests pass
    - Check coverage for gh CLI wrapper (URL parsing, error handling)
    - Check coverage for GitHubTicketProvider (list, get, status mapping)
    - Check coverage for factory (GitHub provider instantiation)

- [ ] **T11**: Manual integration testing
  - Files: N/A (manual testing)
  - Dependencies: T9
  - Tasks:
    - Test `ai-sdlc import <url>` with real GitHub issue
    - Test `ai-sdlc link <story-id> <url>` with existing story
    - Test error scenarios (gh not installed, not authenticated, invalid URL)
    - Test duplicate detection for import
    - Test overwrite warning for link
    - Test --no-sync flag for link command

---

### Phase 4: Documentation

- [ ] **T12**: Update README with GitHub Integration section
  - Files: `README.md`
  - Dependencies: T9
  - Tasks:
    - Add GitHub Integration section with quick start
    - Document gh CLI prerequisites
    - Show example commands (import and link)
    - Link to detailed configuration docs

- [ ] **T13**: Update configuration.md with GitHub commands
  - Files: `docs/configuration.md`
  - Dependencies: T9
  - Tasks:
    - Add GitHub Integration Commands section
    - Document prerequisites (gh CLI installation and authentication)
    - Document configuration (ticketing.provider = "github")
    - Document import command syntax and examples
    - Document link command syntax and examples
    - Add common troubleshooting scenarios

---

### Phase 5: Verification

- [ ] **T14**: Run full verification suite
  - Files: N/A (verification commands)
  - Dependencies: T10, T11, T12, T13
  - Tasks:
    - Run `make verify` to ensure all checks pass
    - Verify TypeScript compilation (`npm run lint`)
    - Verify build (`npm run build`)
    - Verify unit tests (`npm test`)
    - Verify integration tests if applicable
    - Fix any errors that arise

- [ ] **T15**: Final review and cleanup
  - Files: All implementation files
  - Dependencies: T14
  - Tasks:
    - Review all code for consistency with project conventions
    - Ensure no temporary files or debug code remains
    - Verify error messages are clear and actionable
    - Check that all acceptance criteria are met
    - Update story status to done

---

## Technical Details

### URL Parsing Support

The implementation supports these GitHub URL formats:
- `https://github.com/owner/repo/issues/123`
- `https://github.com/owner/repo/issues/123#issuecomment-456`
- `github.com/owner/repo/issues/123`
- `owner/repo#123` (shorthand)

### Status Mapping

| GitHub State | ai-sdlc Status |
|--------------|----------------|
| open         | ready (default)|
| closed       | done           |

Custom status label mapping can be configured via `config.ticketing.github.statusLabels`.

### Story Metadata Fields

When importing or linking, the following frontmatter fields are set:
- `ticket_provider: 'github'`
- `ticket_id: '123'` (issue number)
- `ticket_url: 'https://github.com/owner/repo/issues/123'`
- `ticket_synced_at: '2026-01-28T...'`

### Error Handling

Custom error types provide clear, actionable messages:
- **GhNotInstalledError**: Directs user to https://cli.github.com/
- **GhNotAuthenticatedError**: Instructs user to run `gh auth login`
- **GhIssueNotFoundError**: Shows which issue/repo was not found
- **GhNoAccessError**: Indicates permission problems

---

## Definition of Done

All acceptance criteria must be met:

✅ GitHubTicketProvider implements `list()` and `get()` methods  
✅ `ai-sdlc import <issue-url>` command works  
✅ `ai-sdlc link <story-id> <issue-url>` command works  
✅ gh CLI wrapper handles errors gracefully  
✅ All unit and integration tests pass  
✅ Documentation updated with GitHub setup instructions  
✅ `make verify` passes  

---

## Out of Scope

The following items are intentionally excluded from this story and will be implemented in future stories:

- Write operations to GitHub (S-0075): create, updateStatus, addComment, linkPR
- GitHub Projects priority sync (S-0076)
- Progress comments (S-0077)
- Automatic sync on run
- Jira provider implementation

---

## Notes

**Current Status**: Based on the implementation notes, this work appears to be complete. All files have been created, TypeScript errors have been fixed, and the implementation is ready for verification via `make verify`.

**Next Steps**:
1. Run `make verify` to confirm all tests pass
2. Perform manual testing with a real GitHub repository
3. Proceed to S-0075 (GitHub write operations)