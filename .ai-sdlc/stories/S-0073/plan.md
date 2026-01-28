---
*Generated: 2026-01-28*

# Implementation Plan: Create TicketProvider abstraction with NullProvider

## Overview
This plan implements a TicketProvider interface abstraction with a NullProvider default implementation. This provides the foundation for ticketing integration while maintaining backward compatibility with existing code.

---

## Phase 1: Setup and Architecture

- [ ] **T1**: Review existing Story type and parseStory/writeStory usage
  - Files: `src/types/index.ts`, `src/core/story.ts`
  - Dependencies: none
  - Purpose: Understand current Story structure to ensure no breaking changes

- [ ] **T2**: Review existing config structure and validation
  - Files: `src/core/config.ts`, `src/types/index.ts`
  - Dependencies: none
  - Purpose: Understand where to add ticketing configuration

---

## Phase 2: Type Definitions

- [ ] **T3**: Create TicketProvider types and interfaces
  - Files: `src/services/ticket-provider/types.ts`
  - Dependencies: none
  - Define: `Ticket`, `TicketFilter`, `NewTicket`, `TicketProvider` interface
  - Include JSDoc documentation for all interfaces and methods

- [ ] **T4**: Add TicketingConfig to type definitions
  - Files: `src/types/index.ts`
  - Dependencies: T3
  - Add: `TicketingConfig` interface with provider, syncOnRun, postProgressComments, github fields
  - Update: `Config` interface to include optional `ticketing` field

---

## Phase 3: NullProvider Implementation

- [ ] **T5**: Implement NullTicketProvider class
  - Files: `src/services/ticket-provider/null-provider.ts`
  - Dependencies: T3
  - Implement all interface methods:
    - Read operations (list, get, create) throw "No ticket provider configured"
    - Write operations (updateStatus, addComment, linkPR) are no-ops
    - Status mapping returns input unchanged

---

## Phase 4: Provider Factory

- [ ] **T6**: Create provider factory function
  - Files: `src/services/ticket-provider/index.ts`
  - Dependencies: T3, T5
  - Implement: `createTicketProvider(config)` factory
  - Handle: 'none', 'github', 'jira' with appropriate errors for unimplemented
  - Re-export: types and NullTicketProvider

---

## Phase 5: Configuration Integration

- [ ] **T7**: Add ticketing default configuration
  - Files: `src/core/config.ts`
  - Dependencies: T4
  - Add: `DEFAULT_TICKETING_CONFIG` constant with provider='none'

- [ ] **T8**: Add ticketing configuration validation
  - Files: `src/core/config.ts`
  - Dependencies: T7
  - Validate: provider enum, boolean flags, GitHub config shape
  - Add validation to `sanitizeUserConfig()` function

- [ ] **T9**: Add ticketing config merge logic
  - Files: `src/core/config.ts`
  - Dependencies: T7, T8
  - Update: `loadConfig()` to merge ticketing configuration with defaults

---

## Phase 6: Unit Testing (TDD)

- [ ] **T10**: Write NullProvider unit tests
  - Files: `src/services/ticket-provider/__tests__/null-provider.test.ts`
  - Dependencies: T5
  - Test cases:
    - `list()` returns empty array
    - `get()` throws "No ticket provider configured"
    - `create()` throws "No ticket provider configured"
    - `updateStatus()` completes without error (no-op)
    - `addComment()` completes without error (no-op)
    - `linkPR()` completes without error (no-op)
    - `mapStatusToExternal()` returns input unchanged
    - `mapStatusFromExternal()` returns input unchanged

- [ ] **T11**: Write provider factory unit tests
  - Files: `src/services/ticket-provider/__tests__/factory.test.ts`
  - Dependencies: T6
  - Test cases:
    - Returns NullProvider when provider is 'none'
    - Returns NullProvider when ticketing config is undefined
    - Throws for 'github' provider (not yet implemented)
    - Throws for 'jira' provider (not yet implemented)
    - Returns NullProvider for unknown provider values

- [ ] **T12**: Write configuration validation tests
  - Files: `src/core/__tests__/config.test.ts` (or create if needed)
  - Dependencies: T8, T9
  - Test cases:
    - Valid ticketing config with 'none' provider
    - Invalid provider value is rejected
    - Boolean flags validated correctly
    - Ticketing config defaults to 'none' when absent
    - GitHub config shape validation

---

## Phase 7: Documentation

- [ ] **T13**: Document ticketing configuration
  - Files: `docs/configuration.md`
  - Dependencies: T4, T7
  - Document:
    - Ticketing configuration section structure
    - Default behavior (provider='none', local-only mode)
    - Available providers and their status
    - Configuration options (syncOnRun, postProgressComments)

- [ ] **T14**: Add inline code documentation
  - Files: `src/services/ticket-provider/types.ts`, `src/services/ticket-provider/null-provider.ts`, `src/services/ticket-provider/index.ts`
  - Dependencies: T3, T5, T6
  - Ensure JSDoc comments explain:
    - Purpose of TicketProvider abstraction
    - NullProvider behavior (no-ops vs errors)
    - Factory usage and future extensibility

---

## Phase 8: Verification

- [ ] **T15**: Run all unit tests
  - Dependencies: T10, T11, T12
  - Command: `npm test` or test runner
  - Verify: All new tests pass

- [ ] **T16**: Run regression tests
  - Dependencies: T15
  - Verify: All existing tests still pass (no breaking changes)

- [ ] **T17**: Run full verification
  - Dependencies: T16
  - Command: `make verify`
  - Verify: Linting, type checking, and all tests pass

- [ ] **T18**: Manual smoke test
  - Dependencies: T17
  - Test: Run CLI commands to ensure no regression
  - Verify: System works in local-only mode (NullProvider active)

---

## Phase 9: Final Review

- [ ] **T19**: Review all acceptance criteria
  - Dependencies: T1-T18
  - Verify each checkbox in the story's Acceptance Criteria section

- [ ] **T20**: Verify Definition of Done
  - Dependencies: T19
  - Confirm:
    - All files created in correct locations
    - All tests pass
    - Documentation updated
    - `make verify` passes
    - No breaking changes to existing code

---

## Risk Mitigation

**Key Risks:**
1. **Breaking changes to Story type**: Mitigated by T1 review and leaving Story unchanged
2. **Config validation regression**: Mitigated by comprehensive tests in T12
3. **Existing test failures**: Mitigated by T16 regression testing

**Critical Path:**
T1,T2 → T3,T4 → T5 → T6 → T7,T8,T9 → T10,T11,T12 → T15 → T16 → T17

**Estimated Complexity:** Medium (3-4 hours)
- Type definitions: Simple
- NullProvider implementation: Simple
- Config integration: Moderate (validation logic)
- Testing: Moderate (comprehensive coverage needed)