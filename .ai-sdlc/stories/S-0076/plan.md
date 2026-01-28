---
*Generated: 2026-01-28*

Perfect! Now I have enough context to create a comprehensive implementation plan. Let me create a detailed plan for implementing GitHub Projects priority sync.

# Implementation Plan: GitHub Projects Priority Sync

## Phase 1: Configuration & Types

### Configuration Schema

- [ ] **T1**: Extend TicketingConfig type with GitHub Projects priority fields
  - Files: `src/types/index.ts`
  - Dependencies: none
  - Add `priorityField`, `priorityMapping`, `usePositionPriority` fields to GitHubConfig
  - Add validation types for priority mapping (e.g., `Record<string, number>`)

- [ ] **T2**: Update config validation to handle GitHub Projects priority fields
  - Files: `src/core/config.ts`
  - Dependencies: T1
  - Add validation in `sanitizeUserConfig()` for `github.priorityField` (string)
  - Add validation for `github.priorityMapping` (object with string keys, number values)
  - Add validation for `github.usePositionPriority` (boolean)
  - Validate priority values are positive numbers
  - Ensure projectNumber is validated (already present based on line 506-512)

- [ ] **T3**: Write unit tests for config validation
  - Files: `src/core/config.test.ts`
  - Dependencies: T2
  - Test valid priority mapping configuration
  - Test invalid priority field (non-string, empty)
  - Test invalid priority mapping (non-object, invalid values)
  - Test missing optional fields use defaults

## Phase 2: GitHub Projects API Integration

### GraphQL & CLI Utilities

- [ ] **T4**: Create GitHub Projects GraphQL query utility module
  - Files: `src/services/github-projects/queries.ts`
  - Dependencies: none
  - Export `PROJECT_ITEMS_QUERY` GraphQL query constant
  - Export `PROJECT_ITEM_PRIORITY_QUERY` for single issue lookup
  - Include fields: issue number, priority field value, position

- [ ] **T5**: Create GitHub Projects API client
  - Files: `src/services/github-projects/client.ts`
  - Dependencies: T4
  - Implement `getProjectItems()` - fetch all project items with priority
  - Implement `getIssuePriorityFromProject()` - get priority for specific issue
  - Handle `gh` CLI execution with proper error handling
  - Parse JSON response and extract priority data
  - Handle organization vs user projects

- [ ] **T6**: Write unit tests for GitHub Projects client
  - Files: `src/services/github-projects/client.test.ts`
  - Dependencies: T5
  - Mock `child_process.execSync` for gh CLI calls
  - Test successful project items fetch
  - Test successful single issue priority fetch
  - Test error handling (gh not installed, invalid project, network errors)
  - Test parsing of GraphQL response
  - Test organization vs user project paths

### Priority Normalization

- [ ] **T7**: Create priority normalization utility
  - Files: `src/services/github-projects/priority-normalizer.ts`
  - Dependencies: none
  - Implement `normalizePositionPriority(position: number): number` - position × 10
  - Implement `normalizeMappedPriority(value: string, mapping: Record<string, number>): number | null`
  - Handle unmapped values gracefully (return null)
  - Validate numeric ranges

- [ ] **T8**: Write unit tests for priority normalizer
  - Files: `src/services/github-projects/priority-normalizer.test.ts`
  - Dependencies: T7
  - Test position-based priority (1→10, 2→20, etc.)
  - Test P0/P1/P2 mapping
  - Test custom priority mappings
  - Test unmapped values return null
  - Test edge cases (position 0, negative, very large)

### Index & Types

- [ ] **T9**: Create GitHub Projects service index and types
  - Files: `src/services/github-projects/index.ts`, `src/services/github-projects/types.ts`
  - Dependencies: T4, T5, T7
  - Export public API from index
  - Define `ProjectItem`, `ProjectPriorityData` interfaces
  - Define `PrioritySource` type ('project-position' | 'project-field' | 'local')

## Phase 3: TicketProvider Integration

### Extend TicketProvider Interface

- [ ] **T10**: Add syncPriority method to TicketProvider interface
  - Files: `src/services/ticket-provider/types.ts`
  - Dependencies: none
  - Add `syncPriority(ticketId: string): Promise<number | null>` method
  - Document return value: normalized priority or null if not in project
  - Add JSDoc explaining when null is returned

- [ ] **T11**: Implement syncPriority in NullTicketProvider
  - Files: `src/services/ticket-provider/null-provider.ts`
  - Dependencies: T10
  - Return null (no-op for local-only mode)
  - Add JSDoc explaining behavior

- [ ] **T12**: Write unit tests for NullTicketProvider.syncPriority
  - Files: `src/services/ticket-provider/__tests__/null-provider.test.ts`
  - Dependencies: T11
  - Test returns null
  - Test doesn't throw errors

### Create GitHubTicketProvider

- [ ] **T13**: Create GitHubTicketProvider class skeleton
  - Files: `src/services/ticket-provider/github-provider.ts`
  - Dependencies: T10
  - Implement TicketProvider interface
  - Add constructor accepting config
  - Stub out all required methods (list, get, create, updateStatus, etc.)
  - Add private helper for extracting issue number from ID/URL

- [ ] **T14**: Implement syncPriority method in GitHubTicketProvider
  - Files: `src/services/ticket-provider/github-provider.ts`
  - Dependencies: T13, T5, T7, T9
  - Check if projectNumber is configured, return null if not
  - Extract issue number from ticketId
  - Call GitHub Projects client to get priority
  - Normalize priority using priority normalizer
  - Handle errors gracefully (return null on failure)
  - Add detailed logging

- [ ] **T15**: Implement basic read operations in GitHubTicketProvider
  - Files: `src/services/ticket-provider/github-provider.ts`
  - Dependencies: T13
  - Implement `get()` using `gh issue view`
  - Implement `list()` using `gh issue list`
  - Parse JSON output from gh CLI
  - Map to Ticket interface

- [ ] **T16**: Implement status mapping in GitHubTicketProvider
  - Files: `src/services/ticket-provider/github-provider.ts`
  - Dependencies: T13
  - Implement `mapStatusToExternal()` using config.github.statusLabels
  - Implement `mapStatusFromExternal()` with reverse mapping
  - Handle unmapped statuses with sensible defaults

- [ ] **T17**: Write unit tests for GitHubTicketProvider
  - Files: `src/services/ticket-provider/__tests__/github-provider.test.ts`
  - Dependencies: T14, T15, T16
  - Mock GitHub Projects client
  - Test syncPriority returns correct value from project field
  - Test syncPriority returns correct value from position
  - Test syncPriority returns null when not in project
  - Test syncPriority returns null when projectNumber not configured
  - Test priority mapping (P0/P1/P2 → numeric)
  - Test get/list operations
  - Test status mapping bidirectional

### Provider Factory

- [ ] **T18**: Update provider factory to support GitHub provider
  - Files: `src/services/ticket-provider/index.ts`
  - Dependencies: T13
  - Add case for 'github' provider
  - Instantiate GitHubTicketProvider with config
  - Ensure backward compatibility (default to NullTicketProvider)

- [ ] **T19**: Write unit tests for provider factory
  - Files: `src/services/ticket-provider/__tests__/factory.test.ts`
  - Dependencies: T18
  - Test creates GitHubTicketProvider when provider='github'
  - Test creates NullTicketProvider when provider='none'
  - Test creates NullTicketProvider when config missing

## Phase 4: Story Priority Sync Integration

### Priority Sync Service

- [ ] **T20**: Create story priority sync service
  - Files: `src/services/priority-sync.ts`
  - Dependencies: T14, T18
  - Implement `syncStoryPriority(story: Story, provider: TicketProvider): Promise<void>`
  - Extract ticket ID from story metadata or labels
  - Call provider.syncPriority()
  - Update story.frontmatter.priority if value returned
  - Track priority source in story metadata (add `priority_source` field)
  - Write story back to disk
  - Handle stories without ticket IDs gracefully

- [ ] **T21**: Implement bulk priority sync function
  - Files: `src/services/priority-sync.ts`
  - Dependencies: T20
  - Implement `syncAllStoriesPriority(stories: Story[], provider: TicketProvider): Promise<number>`
  - Iterate through stories and sync each
  - Return count of successfully synced stories
  - Add error handling for individual failures (continue on error)
  - Add optional progress callback for UI updates

- [ ] **T22**: Write unit tests for priority sync service
  - Files: `src/services/priority-sync.test.ts`
  - Dependencies: T20, T21
  - Mock TicketProvider
  - Test syncStoryPriority updates priority when value returned
  - Test syncStoryPriority doesn't update when null returned
  - Test syncStoryPriority updates priority_source field
  - Test syncStoryPriority handles missing ticket ID
  - Test bulk sync processes all stories
  - Test bulk sync continues on individual failures
  - Use mocked dates (vi.useFakeTimers())

### Story Metadata

- [ ] **T23**: Add priority_source field to StoryFrontmatter type
  - Files: `src/types/index.ts`
  - Dependencies: none
  - Add optional `priority_source?: 'github-project' | 'local'` field
  - Document field purpose in JSDoc

## Phase 5: CLI Command Integration

### Import Command

- [ ] **T24**: Add priority sync to import workflow
  - Files: `src/cli/commands.ts` (or wherever import is implemented)
  - Dependencies: T20, T21, T22
  - After creating story from ticket, call syncStoryPriority
  - Log priority sync result to user
  - Handle sync failures gracefully (don't block import)

### Sync Command

- [ ] **T25**: Create or extend sync command to support priority sync
  - Files: `src/cli/commands.ts` (or new `src/cli/commands/sync.ts`)
  - Dependencies: T20, T21
  - Add `sync <story-id>` command to sync single story
  - Add `sync --all` flag to sync all stories
  - Show before/after priority values
  - Display priority source in output
  - Add `--dry-run` flag to preview changes

- [ ] **T26**: Write integration tests for sync command
  - Files: `tests/integration/priority-sync.test.ts`
  - Dependencies: T25
  - Mock gh CLI responses
  - Test single story sync updates priority
  - Test bulk sync updates multiple stories
  - Test sync handles stories not in project
  - Test dry-run mode doesn't write changes
  - Mock dates for deterministic tests

### Run Command

- [ ] **T27**: Add priority sync to run workflow
  - Files: `src/cli/runner.ts` (or main run loop)
  - Dependencies: T21
  - Before selecting next story, sync priorities if configured
  - Only sync if `config.ticketing.syncOnRun === true`
  - Only sync if `config.ticketing.github.projectNumber` is set
  - Add logging for sync operation
  - Handle sync failures gracefully (proceed with stale priorities)

- [ ] **T28**: Write integration tests for run with priority sync
  - Files: `tests/integration/run-priority-sync.test.ts`
  - Dependencies: T27
  - Mock runner setup and story selection
  - Test priorities synced before story selection
  - Test sync respects syncOnRun config
  - Test run proceeds on sync failure
  - Test story with higher synced priority selected first

## Phase 6: Display & Reporting

### Status Command

- [ ] **T29**: Enhance status command to show priority source
  - Files: `src/cli/commands.ts` or status display component
  - Dependencies: T23
  - Add "Source" column to status table
  - Display "GitHub Project", "Local", or "-" based on priority_source
  - Ensure column width doesn't break layout

- [ ] **T30**: Write integration tests for status display
  - Files: `tests/integration/status-priority-display.test.ts`
  - Dependencies: T29
  - Create stories with mixed priority sources
  - Test status output includes Source column
  - Test correct source values displayed
  - Test layout remains intact

## Phase 7: Caching (Optional Performance Enhancement)

### Cache Implementation

- [ ] **T31**: Create project data cache service
  - Files: `src/services/github-projects/cache.ts`
  - Dependencies: T5, T9
  - Implement in-memory cache with TTL (5 minutes default)
  - Implement `getCachedProjectItems()` with cache-or-fetch logic
  - Add cache invalidation method
  - Make TTL configurable via config

- [ ] **T32**: Integrate cache into GitHub Projects client
  - Files: `src/services/github-projects/client.ts`
  - Dependencies: T31
  - Use cache for project items queries
  - Skip cache for single-issue priority queries (more likely to change)
  - Add cache statistics logging (hits/misses)

- [ ] **T33**: Write unit tests for cache
  - Files: `src/services/github-projects/cache.test.ts`
  - Dependencies: T31, T32
  - Test cache returns cached data within TTL
  - Test cache fetches fresh data after TTL expires
  - Test cache invalidation works
  - Mock dates for deterministic TTL tests

## Phase 8: Documentation

### User Documentation

- [ ] **T34**: Document GitHub Projects configuration
  - Files: `docs/configuration.md` or create `docs/github-projects.md`
  - Dependencies: T2
  - Document priorityField setting
  - Document priorityMapping configuration
  - Document usePositionPriority option
  - Provide example configurations for common setups

- [ ] **T35**: Document sync commands and workflows
  - Files: `README.md`, docs as needed
  - Dependencies: T25, T27
  - Document `ai-sdlc sync` command usage
  - Document automatic sync on run
  - Document priority source tracking
  - Provide troubleshooting tips for gh CLI issues

- [ ] **T36**: Add examples for common GitHub Projects setups
  - Files: `docs/github-projects-examples.md` or in main docs
  - Dependencies: T34, T35
  - Example: Position-based priority
  - Example: P0/P1/P2 priority field
  - Example: Custom priority field values
  - Example: Mixed local and synced priorities

### Code Documentation

- [ ] **T37**: Add JSDoc to all public APIs
  - Files: All new modules
  - Dependencies: All implementation tasks
  - Document all exported functions with JSDoc
  - Include @param, @returns, @throws annotations
  - Add usage examples where helpful

## Phase 9: Testing & Verification

### Integration Testing

- [ ] **T38**: Write end-to-end priority sync scenario test
  - Files: `tests/integration/priority-sync-e2e.test.ts`
  - Dependencies: All prior tasks
  - Test full workflow: import → sync → run with priority ordering
  - Mock gh CLI for realistic GitHub Projects responses
  - Verify priority ordering affects story selection
  - Test error recovery (gh CLI failures)

### Manual Verification

- [ ] **T39**: Create manual test checklist
  - Files: None (checklist in plan/review doc)
  - Dependencies: All prior tasks
  - Test import with real GitHub project (if available)
  - Test sync command with real project
  - Test run selects correct story based on synced priority
  - Test configuration validation catches errors
  - Test graceful fallback when gh CLI unavailable

### Build & Test Pass

- [ ] **T40**: Run full test suite and build
  - Files: None
  - Dependencies: All prior tasks
  - Execute `make verify` (runs tests and build)
  - Fix any failing tests
  - Fix any TypeScript compilation errors
  - Fix any linting issues
  - Ensure all tests pass with no warnings

## Phase 10: Definition of Done

### Final Checklist

- [ ] **T41**: Verify all acceptance criteria met
  - Files: Review story.md acceptance criteria
  - Dependencies: All prior tasks
  - Configuration options implemented and validated
  - syncPriority() method in GitHubTicketProvider works
  - Priority syncs on import, sync, and run commands
  - Priority mapping configuration works
  - Fallback to local priority when issue not in project
  - All unit and integration tests pass
  - Documentation updated

- [ ] **T42**: Ensure backward compatibility
  - Files: All modified files
  - Dependencies: T41
  - Stories without priority_source field work correctly
  - Systems without GitHub Projects config continue working
  - NullTicketProvider maintains no-op behavior
  - No breaking changes to existing APIs

- [ ] **T43**: Final review and cleanup
  - Files: All new and modified files
  - Dependencies: T41, T42
  - Remove any debug logging
  - Remove any commented-out code
  - Ensure consistent code style
  - Verify no TODOs or FIXMEs remain
  - Run `make verify` one final time

---

## Summary

This plan implements GitHub Projects priority sync through 10 phases and 43 tasks:

1. **Configuration**: Extend config schema with priority fields (T1-T3)
2. **GitHub API**: Build GraphQL/CLI integration and priority normalization (T4-T9)
3. **TicketProvider**: Extend interface and implement GitHubTicketProvider (T10-T19)
4. **Priority Sync**: Create sync service and integrate with story metadata (T20-T23)
5. **CLI Commands**: Integrate sync into import, sync, and run commands (T24-T28)
6. **Display**: Enhance status command to show priority source (T29-T30)
7. **Caching**: Optional performance optimization with 5-minute cache (T31-T33)
8. **Documentation**: User and code documentation (T34-T37)
9. **Testing**: E2E tests and manual verification (T38-T40)
10. **Completion**: Final verification and cleanup (T41-T43)

**Key Design Decisions:**

- Priority source tracking via `priority_source` field enables users to see which priorities are synced vs local
- Graceful fallback to local priority when issue not in project maintains backward compatibility
- Cache layer (Phase 7) is optional but recommended for performance with large projects
- All write operations use proper file locking (already present in writeStory)
- Test pyramid: Heavy unit test coverage (T3, T6, T8, T12, T17, T19, T22, T33), moderate integration tests (T26, T28, T30, T38), ensuring maintainable test suite