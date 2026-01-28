---
*Generated: 2026-01-28*

# Implementation Plan: GitHub Read Operations (Import/Link)

## Phase 1: Setup & Infrastructure

### T1: Create gh CLI wrapper module
- [ ] **T1.1**: Create `src/services/gh-cli.ts` with base structure
  - Files: `src/services/gh-cli.ts`
  - Dependencies: none
  - Define `GitHubIssue` interface matching gh JSON output
  - Add utility function `isGhAvailable()` to check gh CLI installation/auth
  - Export error types: `GhNotInstalledError`, `GhNotAuthenticatedError`

- [ ] **T1.2**: Implement `ghIssueView()` function
  - Files: `src/services/gh-cli.ts`
  - Dependencies: T1.1
  - Execute `gh issue view {number} -R {owner}/{repo} --json number,title,body,state,labels,assignees,projectItems`
  - Parse JSON output to `GitHubIssue`
  - Handle errors: not found, no access, not authenticated

- [ ] **T1.3**: Implement `ghIssueList()` function
  - Files: `src/services/gh-cli.ts`
  - Dependencies: T1.1
  - Execute `gh issue list -R {owner}/{repo} --json number,title,body,state,labels,assignees`
  - Support optional `IssueFilter` parameter for state/labels
  - Parse JSON array to `GitHubIssue[]`

- [ ] **T1.4**: Add URL parsing utility
  - Files: `src/services/gh-cli.ts`
  - Dependencies: none
  - Create `parseGitHubIssueUrl()` function
  - Support formats: full URLs, URLs with anchors, shorthand `owner/repo#123`
  - Return `{ owner: string, repo: string, number: number }` or throw error

### T2: Unit tests for gh CLI wrapper
- [ ] **T2.1**: Test `isGhAvailable()`
  - Files: `tests/unit/services/gh-cli.test.ts`
  - Dependencies: T1.1
  - Mock exec to simulate gh not installed
  - Mock exec to simulate gh not authenticated
  - Mock exec to simulate gh available

- [ ] **T2.2**: Test `ghIssueView()`
  - Files: `tests/unit/services/gh-cli.test.ts`
  - Dependencies: T1.2
  - Mock successful issue fetch
  - Mock issue not found (404)
  - Mock no access to repo (403)
  - Verify JSON parsing

- [ ] **T2.3**: Test `ghIssueList()`
  - Files: `tests/unit/services/gh-cli.test.ts`
  - Dependencies: T1.3
  - Mock successful list with multiple issues
  - Mock empty list
  - Verify filter parameters passed to gh CLI

- [ ] **T2.4**: Test URL parsing
  - Files: `tests/unit/services/gh-cli.test.ts`
  - Dependencies: T1.4
  - Test full URL: `https://github.com/owner/repo/issues/123`
  - Test URL with anchor: `https://github.com/owner/repo/issues/123#issuecomment-456`
  - Test without protocol: `github.com/owner/repo/issues/123`
  - Test shorthand: `owner/repo#123`
  - Test invalid URLs (should throw)

## Phase 2: GitHubTicketProvider Implementation

### T3: Create GitHubTicketProvider class
- [ ] **T3.1**: Create provider file with interface implementation
  - Files: `src/services/ticket-provider/github-provider.ts`
  - Dependencies: T1.1
  - Implement `TicketProvider` interface
  - Add constructor accepting GitHub config
  - Add private helper: `mapIssueToTicket(issue: GitHubIssue): Ticket`

- [ ] **T3.2**: Implement state mapping logic
  - Files: `src/services/ticket-provider/github-provider.ts`
  - Dependencies: T3.1
  - Add `mapStateToStatus(state: string, labels?: Label[]): StoryStatus`
  - Default: `open` → `ready`, `closed` → `done`
  - Support label-based mapping from config (if present)

- [ ] **T3.3**: Implement `list()` method
  - Files: `src/services/ticket-provider/github-provider.ts`
  - Dependencies: T1.3, T3.1
  - Call `ghIssueList()` with owner/repo from config
  - Map each issue to `Ticket` object
  - Apply optional `TicketFilter` parameter

- [ ] **T3.4**: Implement `get()` method
  - Files: `src/services/ticket-provider/github-provider.ts`
  - Dependencies: T1.2, T3.1
  - Call `ghIssueView()` with owner/repo from config
  - Map issue to `Ticket` object
  - Extract priority from `projectItems` if available

### T4: Update provider factory
- [ ] **T4.1**: Register GitHub provider in factory
  - Files: `src/services/ticket-provider/index.ts`
  - Dependencies: T3.1
  - Add `case 'github'` to provider factory
  - Instantiate `GitHubTicketProvider` with config

### T5: Unit tests for GitHubTicketProvider
- [ ] **T5.1**: Test provider initialization
  - Files: `tests/unit/services/ticket-provider/github-provider.test.ts`
  - Dependencies: T3.1
  - Verify config is stored
  - Test error when config missing required fields

- [ ] **T5.2**: Test state mapping
  - Files: `tests/unit/services/ticket-provider/github-provider.test.ts`
  - Dependencies: T3.2
  - Test `open` → `ready`
  - Test `closed` → `done`
  - Test label-based override (if configured)

- [ ] **T5.3**: Test `list()` method
  - Files: `tests/unit/services/ticket-provider/github-provider.test.ts`
  - Dependencies: T3.3
  - Mock `ghIssueList()` response
  - Verify mapping to `Ticket[]`
  - Verify filter passed through

- [ ] **T5.4**: Test `get()` method
  - Files: `tests/unit/services/ticket-provider/github-provider.test.ts`
  - Dependencies: T3.4
  - Mock `ghIssueView()` response
  - Verify mapping to `Ticket`
  - Verify priority extracted from projectItems

## Phase 3: Import Command Implementation

### T6: Create import command
- [ ] **T6.1**: Create command file structure
  - Files: `src/commands/import.ts`
  - Dependencies: T1.4, T3.4
  - Define command with `<issue-url>` argument
  - Add help text and examples
  - Parse URL using `parseGitHubIssueUrl()`

- [ ] **T6.2**: Implement issue fetching logic
  - Files: `src/commands/import.ts`
  - Dependencies: T6.1
  - Check if gh CLI is available
  - Fetch issue using GitHubTicketProvider
  - Handle errors gracefully with user-friendly messages

- [ ] **T6.3**: Implement duplicate detection
  - Files: `src/commands/import.ts`
  - Dependencies: T6.2
  - Query existing stories for matching `ticket_id`
  - Warn user if issue already imported
  - Option to skip or update existing story

- [ ] **T6.4**: Implement story creation
  - Files: `src/commands/import.ts`
  - Dependencies: T6.3
  - Create new story with fields:
    - `title` from issue title
    - `description` from issue body
    - `ticket_provider: 'github'`
    - `ticket_id: '123'`
    - `ticket_url: <full-url>`
    - `ticket_synced_at: <now>`
  - Display success message with story ID

- [ ] **T6.5**: Register import command
  - Files: `src/index.ts` or main CLI entry
  - Dependencies: T6.4
  - Add import command to CLI

### T7: Unit tests for import command
- [ ] **T7.1**: Test URL parsing in command
  - Files: `tests/unit/commands/import.test.ts`
  - Dependencies: T6.1
  - Test valid URLs accepted
  - Test invalid URLs rejected with error

- [ ] **T7.2**: Test duplicate detection
  - Files: `tests/unit/commands/import.test.ts`
  - Dependencies: T6.3
  - Mock existing story with same ticket_id
  - Verify warning displayed
  - Test skip behavior

- [ ] **T7.3**: Test story creation
  - Files: `tests/unit/commands/import.test.ts`
  - Dependencies: T6.4
  - Mock GitHubTicketProvider.get()
  - Verify story created with correct fields
  - Verify success message

- [ ] **T7.4**: Test error handling
  - Files: `tests/unit/commands/import.test.ts`
  - Dependencies: T6.2
  - Test gh not installed error
  - Test gh not authenticated error
  - Test issue not found error
  - Test no access error

## Phase 4: Link Command Implementation

### T8: Create link command
- [ ] **T8.1**: Create command file structure
  - Files: `src/commands/link.ts`
  - Dependencies: T1.4
  - Define command with `<story-id> <issue-url>` arguments
  - Add help text and examples
  - Parse URL and validate story ID

- [ ] **T8.2**: Implement story validation
  - Files: `src/commands/link.ts`
  - Dependencies: T8.1
  - Check if story exists
  - Check if story already linked to different issue
  - Warn if overwriting existing link

- [ ] **T8.3**: Implement sync confirmation
  - Files: `src/commands/link.ts`
  - Dependencies: T8.2
  - Fetch issue details via GitHubTicketProvider
  - Ask user if they want to sync title/description
  - Add `--no-sync` flag to skip confirmation

- [ ] **T8.4**: Implement story update
  - Files: `src/commands/link.ts`
  - Dependencies: T8.3
  - Update story with ticket fields
  - Optionally update title/description based on user choice
  - Set `ticket_synced_at` timestamp
  - Display success message

- [ ] **T8.5**: Register link command
  - Files: `src/index.ts` or main CLI entry
  - Dependencies: T8.4
  - Add link command to CLI

### T9: Unit tests for link command
- [ ] **T9.1**: Test story validation
  - Files: `tests/unit/commands/link.test.ts`
  - Dependencies: T8.2
  - Test story not found error
  - Test warning when story already linked
  - Test successful validation

- [ ] **T9.2**: Test sync confirmation
  - Files: `tests/unit/commands/link.test.ts`
  - Dependencies: T8.3
  - Mock user accepting sync
  - Mock user declining sync
  - Test `--no-sync` flag

- [ ] **T9.3**: Test story update
  - Files: `tests/unit/commands/link.test.ts`
  - Dependencies: T8.4
  - Mock story update
  - Verify ticket fields set correctly
  - Verify title/description synced when requested
  - Verify timestamp set

- [ ] **T9.4**: Test error handling
  - Files: `tests/unit/commands/link.test.ts`
  - Dependencies: T8.2
  - Test invalid story ID
  - Test issue fetch errors

## Phase 5: Integration Testing

### T10: Integration tests for import workflow
- [ ] **T10.1**: Test end-to-end import
  - Files: `tests/integration/import.test.ts`
  - Dependencies: T6.4
  - Mock gh CLI responses
  - Run import command
  - Verify story created in database
  - Verify all ticket fields populated

- [ ] **T10.2**: Test import of already-imported issue
  - Files: `tests/integration/import.test.ts`
  - Dependencies: T6.3
  - Create story with ticket_id
  - Attempt to import same issue
  - Verify warning displayed
  - Verify no duplicate created

### T11: Integration tests for link workflow
- [ ] **T11.1**: Test end-to-end link
  - Files: `tests/integration/link.test.ts`
  - Dependencies: T8.4
  - Create story without ticket link
  - Mock gh CLI responses
  - Run link command
  - Verify story updated with ticket fields

- [ ] **T11.2**: Test link with sync
  - Files: `tests/integration/link.test.ts`
  - Dependencies: T8.3
  - Create story with different title
  - Link to issue
  - Accept sync
  - Verify title/description updated

## Phase 6: Documentation

### T12: Update documentation
- [ ] **T12.1**: Document GitHub provider setup
  - Files: `docs/configuration.md`
  - Dependencies: none
  - Add GitHub ticketing configuration section
  - Document required config fields: `owner`, `repo`
  - Document optional fields: label mapping

- [ ] **T12.2**: Document gh CLI requirements
  - Files: `docs/configuration.md` or `README.md`
  - Dependencies: none
  - Document gh CLI installation
  - Document authentication requirement
  - Link to https://cli.github.com/

- [ ] **T12.3**: Document import command
  - Files: `README.md` or `docs/commands.md`
  - Dependencies: T6.5
  - Add usage example
  - Document supported URL formats
  - Document behavior with existing stories

- [ ] **T12.4**: Document link command
  - Files: `README.md` or `docs/commands.md`
  - Dependencies: T8.5
  - Add usage example
  - Document sync behavior
  - Document `--no-sync` flag

- [ ] **T12.5**: Add troubleshooting section
  - Files: `docs/troubleshooting.md` or `docs/configuration.md`
  - Dependencies: none
  - Document common errors: gh not installed, not authenticated
  - Document permission issues
  - Document issue not found scenarios

## Phase 7: Verification

### T13: Final verification
- [ ] **T13.1**: Run all unit tests
  - Files: none
  - Dependencies: T2.1-T2.4, T5.1-T5.4, T7.1-T7.4, T9.1-T9.4
  - Execute test suite
  - Verify all tests pass
  - Check code coverage

- [ ] **T13.2**: Run all integration tests
  - Files: none
  - Dependencies: T10.1-T10.2, T11.1-T11.2
  - Execute integration test suite
  - Verify end-to-end workflows

- [ ] **T13.3**: Run `make verify`
  - Files: none
  - Dependencies: T13.1, T13.2
  - Execute full verification suite
  - Fix any linting errors
  - Fix any build errors

- [ ] **T13.4**: Manual testing
  - Files: none
  - Dependencies: T13.3
  - Test import command with real GitHub issue
  - Test link command with real story
  - Test error scenarios (gh not installed, etc.)
  - Verify output formatting and messages

- [ ] **T13.5**: Review acceptance criteria
  - Files: none
  - Dependencies: T13.4
  - Check all acceptance criteria met
  - Verify all DoD items complete
  - Update story status to done

## Summary

This plan breaks down the GitHub read operations implementation into 7 phases with 13 major tasks (T1-T13) and 54 specific subtasks. The workflow follows test-driven development principles where feasible, implements error handling at each layer, and includes comprehensive testing at unit and integration levels.

**Key milestones:**
- Phase 1-2: Core infrastructure (gh CLI wrapper + provider)
- Phase 3-4: User-facing commands (import + link)
- Phase 5: Integration testing
- Phase 6: Documentation
- Phase 7: Final verification

**Estimated effort:** This is a medium-large story with multiple moving parts. Each phase should be completed and tested before moving to the next to ensure quality and catch issues early.