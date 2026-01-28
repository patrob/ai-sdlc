---
*Generated: 2026-01-28*

Perfect! Now I have all the information I need to create a detailed implementation plan. Based on my analysis:

1. **StoryFrontmatter** is defined in `src/types/index.ts` (lines 158-245)
2. **parseStory()** is in `src/core/story.ts` (lines 26-62)
3. **writeStory()** is in `src/core/story.ts` (lines 89-140)
4. Test patterns are established in `src/core/story.test.ts`
5. Documentation exists at `docs/configuration.md`

Here's the detailed implementation plan:

---

# Implementation Plan: Add Ticket Fields to Story Schema

## Phase 1: Type Definition
- [ ] **T1**: Add optional ticket fields to `StoryFrontmatter` interface
  - Files: `src/types/index.ts`
  - Dependencies: none
  - Add after existing fields (around line 245, before closing brace):
    ```typescript
    // External ticket integration (optional)
    ticket_provider?: 'github' | 'jira' | 'linear';
    ticket_id?: string;
    ticket_url?: string;
    ticket_synced_at?: string;
    ```

## Phase 2: Core Functionality Verification
- [ ] **T2**: Verify `parseStory()` handles new optional fields
  - Files: `src/core/story.ts`
  - Dependencies: T1
  - No code changes needed - gray-matter automatically parses optional YAML fields
  - Verify that parseStory() doesn't require modification (lines 26-62)

- [ ] **T3**: Verify `writeStory()` preserves new optional fields
  - Files: `src/core/story.ts`
  - Dependencies: T1
  - No code changes needed - gray-matter.stringify() preserves all frontmatter fields
  - Verify that writeStory() doesn't require modification (lines 89-140)

## Phase 3: Testing

### Unit Tests for Ticket Fields
- [ ] **T4**: Add test: parseStory handles story with all ticket fields
  - Files: `src/core/story.test.ts`
  - Dependencies: T1, T2
  - Add new `describe` block: "Story ticket fields integration"
  - Test parsing story with ticket_provider, ticket_id, ticket_url, ticket_synced_at

- [ ] **T5**: Add test: parseStory handles story without ticket fields
  - Files: `src/core/story.test.ts`
  - Dependencies: T1, T2
  - Verify backward compatibility with existing stories (no ticket fields)
  - Assert ticket fields are `undefined` when not present

- [ ] **T6**: Add test: parseStory handles story with partial ticket fields
  - Files: `src/core/story.test.ts`
  - Dependencies: T1, T2
  - Test edge case: some ticket fields present, others missing
  - Verify no errors when only subset of fields provided

- [ ] **T7**: Add test: writeStory preserves ticket fields when present
  - Files: `src/core/story.test.ts`
  - Dependencies: T1, T3
  - Create story with ticket fields, write to disk, read back
  - Assert all ticket fields are preserved

- [ ] **T8**: Add test: writeStory works without ticket fields
  - Files: `src/core/story.test.ts`
  - Dependencies: T1, T3
  - Create story without ticket fields, write to disk, read back
  - Verify backward compatibility maintained

### Validation Tests
- [ ] **T9**: Add test: ticket_provider validates allowed values
  - Files: `src/core/story.test.ts`
  - Dependencies: T1
  - Verify TypeScript enforces 'github' | 'jira' | 'linear' constraint
  - Test parsing story with invalid provider (should work at runtime since TypeScript is compile-time only)

- [ ] **T10**: Add test: ticket_synced_at accepts ISO timestamp format
  - Files: `src/core/story.test.ts`
  - Dependencies: T1
  - Test with valid ISO 8601 timestamp
  - Verify string is stored as-is (no automatic parsing)

### Integration Tests
- [ ] **T11**: Run existing test suite to verify no regressions
  - Files: All test files
  - Dependencies: T1, T2, T3
  - Execute: `npm test` or `make verify`
  - Ensure all existing tests still pass

## Phase 4: Documentation
- [ ] **T12**: Update `docs/configuration.md` with ticket field descriptions
  - Files: `docs/configuration.md`
  - Dependencies: T1
  - Add new section: "Ticket Integration Fields (Optional)"
  - Document each field: purpose, format, example values
  - Note that fields are optional and used by future ticketing integration

- [ ] **T13**: Add note about backward compatibility
  - Files: `docs/configuration.md`
  - Dependencies: T12
  - Clarify that existing stories without ticket fields continue to work
  - Mention no behavior changes - fields are metadata only

## Phase 5: Verification
- [ ] **T14**: Run full verification suite
  - Files: N/A (command execution)
  - Dependencies: T11
  - Execute: `make verify`
  - Ensure linting, type checking, and all tests pass

- [ ] **T15**: Manual verification with sample story
  - Files: N/A (manual testing)
  - Dependencies: T1, T2, T3
  - Create test story with ticket fields
  - Verify parseStory() reads correctly
  - Verify writeStory() preserves fields
  - Clean up test story

## Success Criteria Checklist

All acceptance criteria from the story must be met:

**Schema Changes:**
- [x] Optional fields added to `StoryFrontmatter` (T1)
- [x] `parseStory()` handles stories with/without ticket fields (T2, T4, T5)
- [x] `writeStory()` preserves ticket fields (T3, T7, T8)

**Backward Compatibility:**
- [x] Existing stories parse correctly (T5, T8)
- [x] Existing stories write correctly (T8)
- [x] No behavior changes (verified through testing)

**Testing:**
- [x] Unit tests for ticket field handling (T4-T10)
- [x] All existing tests pass (T11)

**Documentation:**
- [x] Configuration docs updated (T12, T13)

**Verification:**
- [x] `make verify` passes (T14)

---

## Implementation Notes

### Key Design Decisions

1. **Type-only change**: This story only adds optional fields to the TypeScript interface. No runtime validation is added (out of scope per story requirements).

2. **Backward compatibility**: All fields are optional (`?:`), ensuring existing stories without ticket fields continue to work without modification.

3. **No behavior changes**: Fields are pure metadata storage. No logic reads or acts on these fields (that's deferred to S-0073+).

4. **Testing strategy**: Follow existing test patterns in `story.test.ts` using describe blocks and helper functions.

### Risk Mitigation

- **Risk**: Existing stories fail to parse
  - **Mitigation**: All fields are optional; gray-matter handles missing fields gracefully
  
- **Risk**: Type errors in consuming code
  - **Mitigation**: TypeScript will catch any type mismatches at compile time

- **Risk**: Test failures
  - **Mitigation**: Run full test suite (T11) to catch regressions early

### Out of Scope

Per the story requirements, the following are explicitly NOT included:
- Ticketing provider logic (S-0073)
- Reading/writing to external tickets (S-0074, S-0075)
- Validation or behavior based on ticket fields
- UI changes or CLI commands for ticket management