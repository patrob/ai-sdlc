---
id: story-test-pattern-001
title: Test pattern detection - warn when tests duplicate production logic
priority: 10
status: ready
type: feature
created: '2026-01-10'
labels:
  - quality
  - testing
  - s
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
updated: '2026-01-11'
---
# Test pattern detection - warn when tests duplicate production logic

## User Story

As a **developer using the AI-SDLC system**, I want **the review agent to detect when tests duplicate production logic instead of importing actual functions**, so that **I can maintain test quality and avoid false confidence from tests that pass while production code is broken**.

## Problem Statement

Test files sometimes contain local helper functions that re-implement production logic (e.g., `getPhaseInfoTest()` instead of importing `getPhaseInfo()`). This anti-pattern causes:
- Tests to pass even when production code is broken
- Maintenance burden from duplicate logic
- False confidence in test coverage
- Drift between test helpers and actual implementation

## Acceptance Criteria

- [ ] Review agent detects test helper functions that duplicate production logic
- [ ] Flags functions with naming patterns indicating duplication:
  - Functions ending with `Test` suffix (e.g., `functionNameTest`)
  - Functions starting with `test` prefix (e.g., `testFunctionName`)
  - Functions with similar names to production exports
- [ ] Review suggests exporting production functions when tests can't import them
- [ ] Clear, actionable guidance provided: "Export this function from `<file>` and import it in tests instead of duplicating the logic"
- [ ] Low false-positive rate: does NOT flag legitimate test utilities such as:
  - Test fixtures/factories (e.g., `createMockUser()`)
  - Test setup/teardown helpers
  - Assertion helpers specific to testing
- [ ] Detection works across common test file patterns:
  - Colocated tests (`*.test.ts` next to `*.ts`)
  - Centralized test directories (`tests/**/*.test.ts`)
- [ ] Review output includes file locations and line numbers for flagged patterns
- [ ] Detection integrates with existing review agent workflow without breaking changes

## Edge Cases & Constraints

### Edge Cases
1. **Intentional test utilities**: Some test-only functions are legitimate (factories, mocks, setup helpers)
2. **Private functions**: Production code may have internal functions that shouldn't be exported
3. **Different signatures**: Test helpers might have simplified signatures for testing convenience
4. **Cross-file duplication**: Logic duplicated from a different file than the one being tested

### Constraints
1. **Static analysis only**: Cannot execute code to detect behavioral duplication
2. **Name-based heuristics**: Primary detection relies on naming patterns, which may miss some cases
3. **Language support**: Initially focused on TypeScript/JavaScript patterns
4. **Performance**: Must not significantly slow down review agent execution

## Implementation Considerations

- Leverage existing review agent architecture in `src/agents/review.ts`
- May need AST parsing to detect function definitions and imports reliably
- Consider configurable patterns to support different project conventions
- Should output suggestions in same format as other review feedback

## Related Context

Per `CLAUDE.md`:
- Tests should import from production code, not recreate logic
- Unit tests should be colocated with files they test
- Integration tests go in `tests/integration/`

---

**Effort**: medium

**Labels**: code-quality, testing, review-agent, technical-debt
