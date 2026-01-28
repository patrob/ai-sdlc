---
*Generated: 2026-01-28*

Now I have a good understanding of the codebase structure. Let me create a detailed implementation plan for the TicketProvider abstraction story.

# Implementation Plan: Create TicketProvider Abstraction with NullProvider

## Phase 1: Setup & Type Definitions

- [ ] **T1**: Create ticket provider directory structure
  - Files: `src/services/ticket-provider/` (directory)
  - Dependencies: none
  - Create the base directory for ticket provider implementations

- [ ] **T2**: Define core TicketProvider interface and supporting types
  - Files: `src/services/ticket-provider/types.ts`
  - Dependencies: none
  - Define `Ticket` interface with id, url, title, description, status, priority, labels, assignee
  - Define `TicketFilter` interface for list operations
  - Define `NewTicket` interface for create operations
  - Define `TicketProvider` interface with read operations (list, get), write operations (create, updateStatus, addComment, linkPR), and mapping methods (mapStatusToExternal, mapStatusFromExternal)
  - Import `StoryStatus` type from `../types/index.js`

## Phase 2: Implementation

- [ ] **T3**: Implement NullTicketProvider
  - Files: `src/services/ticket-provider/null-provider.ts`
  - Dependencies: T2
  - Implement `NullTicketProvider` class that implements `TicketProvider` interface
  - `name` property returns `'none'`
  - `list()` returns empty array
  - `get()` throws "No ticket provider configured" error
  - `create()` throws "No ticket provider configured" error
  - `updateStatus()`, `addComment()`, `linkPR()` are no-ops (return void Promise)
  - `mapStatusToExternal()` returns input status unchanged
  - `mapStatusFromExternal()` returns input status as-is (cast to StoryStatus)

- [ ] **T4**: Create provider factory function
  - Files: `src/services/ticket-provider/index.ts`
  - Dependencies: T2, T3
  - Implement `createTicketProvider()` factory function that accepts `Config` parameter
  - Read `config.ticketing?.provider` (default to `'none'` if absent)
  - Return `NullTicketProvider` for `'none'` provider
  - Throw "not yet implemented" errors for `'github'` and `'jira'` providers
  - Default to `NullTicketProvider` for unknown provider values
  - Export all types from `types.ts` and `NullTicketProvider` class

- [ ] **T5**: Add ticketing configuration schema to Config type
  - Files: `src/types/index.ts`
  - Dependencies: none
  - Define `TicketingConfig` interface with provider ('none' | 'github' | 'jira'), syncOnRun (boolean, default true), postProgressComments (boolean, default true), and optional github config object (repo, projectNumber, statusLabels)
  - Add optional `ticketing?: TicketingConfig` field to `Config` interface

- [ ] **T6**: Add ticketing config defaults and validation to config loader
  - Files: `src/core/config.ts`
  - Dependencies: T5
  - Define `DEFAULT_TICKETING_CONFIG` constant with provider 'none', syncOnRun true, postProgressComments true
  - Add ticketing validation in `sanitizeUserConfig()` to validate provider is one of allowed values, validate boolean fields, validate github config structure if present
  - Merge ticketing config in `loadConfig()` similar to other config sections
  - Apply default ticketing config in `DEFAULT_CONFIG`

## Phase 3: Testing

- [ ] **T7**: Write unit tests for NullTicketProvider
  - Files: `src/services/ticket-provider/__tests__/null-provider.test.ts`
  - Dependencies: T3
  - Test `list()` returns empty array
  - Test `get()` throws "No ticket provider configured"
  - Test `create()` throws "No ticket provider configured"
  - Test `updateStatus()` completes without error (no-op)
  - Test `addComment()` completes without error (no-op)
  - Test `linkPR()` completes without error (no-op)
  - Test `mapStatusToExternal()` returns input unchanged for all StoryStatus values
  - Test `mapStatusFromExternal()` returns input as StoryStatus for valid statuses

- [ ] **T8**: Write unit tests for createTicketProvider factory
  - Files: `src/services/ticket-provider/__tests__/factory.test.ts`
  - Dependencies: T4
  - Test returns `NullTicketProvider` when provider is `'none'`
  - Test returns `NullTicketProvider` when ticketing config is absent
  - Test returns `NullTicketProvider` when ticketing config is undefined
  - Test throws for `'github'` provider (not yet implemented)
  - Test throws for `'jira'` provider (not yet implemented)
  - Test returns `NullTicketProvider` for unknown provider values

- [ ] **T9**: Write unit tests for ticketing config validation
  - Files: `src/core/config.test.ts` (add to existing test file)
  - Dependencies: T6
  - Test default config includes ticketing with provider 'none'
  - Test config loads with explicit ticketing section
  - Test invalid provider value is rejected or falls back to 'none'
  - Test boolean fields are validated (syncOnRun, postProgressComments)
  - Test github config validation if present

- [ ] **T10**: Verify no regression in existing tests
  - Files: N/A (verification step)
  - Dependencies: T7, T8, T9
  - Run full test suite with `npm test`
  - Confirm all existing tests still pass
  - Verify no breaking changes to Story type or parseStory/writeStory functions

## Phase 4: Documentation

- [ ] **T11**: Document ticketing configuration in configuration.md
  - Files: `docs/configuration.md`
  - Dependencies: T5, T6
  - Add "Ticketing Integration (`ticketing`)" section after GitHub Integration section
  - Document `ticketing.provider` field with allowed values and default
  - Document `ticketing.syncOnRun` boolean field with default
  - Document `ticketing.postProgressComments` boolean field with default
  - Document `ticketing.github` nested config (repo, projectNumber, statusLabels)
  - Add note that provider 'none' is default (local-only mode)
  - Add note that github/jira providers are coming in future stories
  - Add example configuration showing ticketing section

- [ ] **T12**: Add inline code documentation
  - Files: `src/services/ticket-provider/types.ts`, `src/services/ticket-provider/index.ts`
  - Dependencies: T2, T4
  - Add JSDoc comments to `TicketProvider` interface explaining each method
  - Add JSDoc to factory function explaining provider selection logic
  - Document that NullProvider is the safe default for local-only workflows

## Phase 5: Verification & Completion

- [ ] **T13**: Run full verification suite
  - Files: N/A (verification step)
  - Dependencies: T1-T12
  - Run `make verify` to execute all checks (lint, build, test)
  - Fix any errors or warnings that appear
  - Verify no TypeScript compilation errors
  - Verify all tests pass

- [ ] **T14**: Manual integration verification
  - Files: N/A (verification step)
  - Dependencies: T13
  - Verify `createTicketProvider()` can be imported from `src/services/ticket-provider/index.js`
  - Verify factory returns `NullTicketProvider` with default config
  - Verify no runtime errors when creating provider instance
  - Test that story parsing/writing still works unchanged (no regression)

- [ ] **T15**: Final story update and PR preparation
  - Files: `.ai-sdlc/worktrees/S-0073-create-ticketprovider-abstraction/story.md`
  - Dependencies: T14
  - Update story frontmatter to mark `implementation_complete: true`
  - Summarize implementation changes in story review section
  - Prepare commit message summarizing the abstraction layer creation

---

## Implementation Notes

### Key Design Principles

1. **Zero Breaking Changes**: The Story type remains unchanged. This abstraction is purely additive.
2. **Safe Defaults**: When no ticketing config exists, NullProvider is used automatically
3. **Graceful Degradation**: Write operations (updateStatus, addComment, linkPR) are no-ops in NullProvider, not errors
4. **Future Extensibility**: Factory pattern allows easy addition of GitHub/Jira providers in future stories

### Testing Strategy

- **Unit tests** cover all NullProvider methods and factory logic
- **Integration verification** ensures no regression in existing story workflows
- **Config validation** prevents invalid ticketing configurations

### Dependencies

- No external dependencies required
- Uses existing `Config` type and validation patterns from `src/core/config.ts`
- Imports `StoryStatus` from existing types

### Out of Scope (Future Stories)

- GitHub provider implementation (S-0074, S-0075)
- Jira provider implementation (future)
- StoryService wrapper (may be added in S-0074)
- Actual ticket synchronization logic