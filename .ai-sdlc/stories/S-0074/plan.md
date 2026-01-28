---
*Generated: 2026-01-28*

Excellent! I can see that the implementation has already been done. Now let me create a comprehensive implementation plan based on the story requirements and what I've learned about the codebase structure.

# Implementation Plan: GitHub Read Operations (import/link)

## Phase 1: Core Infrastructure Setup

- [ ] **T1**: Create GitHub CLI wrapper utility (`src/services/gh-cli.ts`)
  - Files: `src/services/gh-cli.ts`
  - Dependencies: none
  - Implement URL parsing for multiple GitHub URL formats
  - Add `isGhAvailable()` function to check gh CLI installation and authentication
  - Add `ghIssueView()` function to fetch single issue details
  - Add `ghIssueList()` function to list issues with filters
  - Define custom error classes: `GhNotInstalledError`, `GhNotAuthenticatedError`, `GhIssueNotFoundError`, `GhNoAccessError`

- [ ] **T2**: Create unit tests for GitHub CLI wrapper
  - Files: `src/services/gh-cli.test.ts`
  - Dependencies: T1
  - Test URL parsing for all supported formats (full URL, shorthand, with anchors)
  - Test `isGhAvailable()` with mocked `gh auth status`
  - Test `ghIssueView()` with mocked command execution
  - Test `ghIssueList()` with filters
  - Test all error scenarios (not installed, not authenticated, not found, no access)

## Phase 2: Provider Implementation

- [ ] **T3**: Implement GitHubTicketProvider class
  - Files: `src/services/ticket-provider/github-provider.ts`
  - Dependencies: T1
  - Implement `TicketProvider` interface
  - Implement `list(filter?: TicketFilter): Promise<Ticket[]>` method
  - Implement `get(id: string): Promise<Ticket>` method
  - Implement status mapping methods:
    - `mapStatusFromExternal()`: GitHub state → StoryStatus
    - `mapStatusToExternal()`: StoryStatus → GitHub state
  - Stub write operations for S-0075: `create()`, `updateStatus()`, `addComment()`, `linkPR()`
  - Parse GitHub issue JSON to Ticket objects

- [ ] **T4**: Create unit tests for GitHubTicketProvider
  - Files: `src/services/ticket-provider/__tests__/github-provider.test.ts`
  - Dependencies: T3
  - Test `list()` method with various filters
  - Test `get()` method with mocked gh CLI
  - Test status mapping in both directions
  - Test priority extraction from GitHub Projects
  - Test label mapping
  - Test error handling (gh CLI errors, missing config)

- [ ] **T5**: Update provider factory to instantiate GitHubTicketProvider
  - Files: `src/services/ticket-provider/index.ts`
  - Dependencies: T3
  - Add case for 'github' provider in `createTicketProvider()`
  - Pass `config.ticketing?.github` configuration
  - Export GitHubTicketProvider class

- [ ] **T6**: Update provider factory tests
  - Files: `src/services/ticket-provider/__tests__/factory.test.ts`
  - Dependencies: T5
  - Test GitHub provider instantiation with config
  - Test fallback to NullTicketProvider for unknown providers

## Phase 3: CLI Commands Implementation

- [ ] **T7**: Implement `import` command
  - Files: `src/cli/commands/import-issue.ts`
  - Dependencies: T3, T5
  - Parse issue URL using `parseGitHubIssueUrl()` from gh-cli
  - Check gh CLI availability with `isGhAvailable()`
  - Fetch issue details using `ghIssueView()`
  - Check for existing stories with same ticket_id (duplicate detection)
  - Create new story using `createStory()` with:
    - Title from issue title
    - Content from issue body
    - Frontmatter: `ticket_provider: 'github'`, `ticket_id`, `ticket_url`, `ticket_synced_at`
  - Display success message with story ID and link
  - Handle errors gracefully with clear messages

- [ ] **T8**: Implement `link` command
  - Files: `src/cli/commands/link-issue.ts`
  - Dependencies: T3, T5
  - Accept story ID/slug and issue URL as arguments
  - Add `--no-sync` flag to skip sync prompt
  - Find story using `findStoryById()` or `getStory()`
  - Fetch issue details using `ghIssueView()`
  - Check if story already linked (warn if overwriting)
  - Update story frontmatter with ticket fields
  - Optionally sync title/description with user confirmation (unless `--no-sync`)
  - Save story using `writeStory()`
  - Display success message with sync details

- [ ] **T9**: Export commands from commands module
  - Files: `src/cli/commands.ts`
  - Dependencies: T7, T8
  - Export `importIssue` function
  - Export `linkIssue` function

- [ ] **T10**: Register CLI commands in main entry point
  - Files: `src/index.ts`
  - Dependencies: T9
  - Add `import <issue-url>` command definition
  - Add `link <story-id> <issue-url>` command definition with `--no-sync` option
  - Wire up to imported functions from commands module

## Phase 4: Testing

- [ ] **T11**: Create integration test for import command
  - Files: `tests/integration/import-issue.test.ts` (new file)
  - Dependencies: T7, T10
  - Test successful import creates story with correct fields
  - Test duplicate detection warns user
  - Test error handling (gh not installed, not authenticated, issue not found)
  - Verify story file structure and frontmatter

- [ ] **T12**: Create integration test for link command
  - Files: `tests/integration/link-issue.test.ts` (new file)
  - Dependencies: T8, T10
  - Test successful link updates story
  - Test `--no-sync` flag behavior
  - Test user confirmation for sync
  - Test overwrite warning
  - Test error handling

- [ ] **T13**: Add test coverage for URL parsing edge cases
  - Files: `src/services/gh-cli.test.ts`
  - Dependencies: T2
  - Test URL with issue comment anchor (`#issuecomment-456`)
  - Test URL without protocol (`github.com/...`)
  - Test shorthand format (`owner/repo#123`)
  - Test invalid URLs throw appropriate errors

## Phase 5: Documentation

- [ ] **T14**: Update README.md with GitHub integration section
  - Files: `README.md`
  - Dependencies: T10
  - Add "GitHub Integration" section
  - Document prerequisites (gh CLI installation, authentication)
  - Add quick start guide with example commands
  - Link to detailed configuration documentation

- [ ] **T15**: Update configuration documentation
  - Files: `docs/configuration.md`
  - Dependencies: T3
  - Add "Ticketing Integration" section
  - Document `ticketing.provider: 'github'` configuration
  - Document `ticketing.github` options:
    - `repo`: Repository in `owner/repo` format
    - `projectNumber`: GitHub Projects v2 number
    - `statusLabels`: Status label mappings
  - Document `syncOnRun` and `postProgressComments` options
  - Add configuration examples

- [ ] **T16**: Create GitHub Integration Commands documentation section
  - Files: `docs/configuration.md`
  - Dependencies: T7, T8
  - Document `ai-sdlc import <issue-url>` command syntax and examples
  - Document `ai-sdlc link <story-id> <issue-url>` command syntax and examples
  - Document `--no-sync` flag
  - Add troubleshooting section:
    - gh CLI not installed
    - Not authenticated
    - Issue not found
    - No repository access
    - Permission errors

## Phase 6: Verification and Polish

- [ ] **T17**: Run full test suite
  - Files: none (verification step)
  - Dependencies: T2, T4, T6, T11, T12, T13
  - Execute `npm test` to ensure all unit tests pass
  - Execute `npm run test:integration` for integration tests
  - Verify test coverage for new code

- [ ] **T18**: Run build and linting
  - Files: none (verification step)
  - Dependencies: T1-T16
  - Execute `npm run build` to verify TypeScript compilation
  - Execute `npm run lint` to ensure code style compliance
  - Fix any type errors or linting issues

- [ ] **T19**: Run `make verify` to ensure all checks pass
  - Files: none (verification step)
  - Dependencies: T17, T18
  - Execute `make verify` command
  - Ensure all verification steps pass before commit

- [ ] **T20**: Manual testing with real GitHub repository
  - Files: none (verification step)
  - Dependencies: T10
  - Test `ai-sdlc import` with real GitHub issue
  - Test `ai-sdlc link` with existing story
  - Verify frontmatter fields are correctly populated
  - Test error scenarios manually
  - Verify documentation accuracy

## Summary

This plan breaks down the GitHub read operations implementation into 20 distinct tasks across 6 phases:

1. **Phase 1 (T1-T2)**: Core infrastructure - gh CLI wrapper and tests
2. **Phase 2 (T3-T6)**: Provider implementation - GitHubTicketProvider and factory integration
3. **Phase 3 (T7-T10)**: CLI commands - import and link commands
4. **Phase 4 (T11-T13)**: Testing - integration tests and edge cases
5. **Phase 5 (T14-T16)**: Documentation - README, configuration guide, troubleshooting
6. **Phase 6 (T17-T20)**: Verification - automated tests, build, and manual testing

**Key Implementation Notes:**
- Follow TDD where possible (write tests before implementation)
- Use existing patterns from `NullTicketProvider` and `migrate` command
- Ensure proper error handling with custom error classes
- Follow the codebase conventions (ActionType patterns, SOLID principles)
- Respect the "Tidy Rule" - only improve files being modified
- Run `make verify` before any commits

**Out of Scope (Future Stories):**
- Write operations (S-0075): `create()`, `updateStatus()`, `addComment()`, `linkPR()`
- GitHub Projects priority sync (S-0076)
- Progress comments (S-0077)
- Automatic sync on run