---
id: story-verify-before-commit
title: Verify build and tests pass before committing implementation
priority: 20
status: backlog
type: feature
created: '2026-01-13'
labels:
  - p0-mvp
  - reliability
  - quality-gate
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
---
# Verify build and tests pass before committing implementation

## User Story

**As a** solopreneur using ai-sdlc
**I want** the implementation phase to verify tests and build succeed before committing
**So that** I never have broken code committed to my repository

## Summary

Currently, the implementation phase can commit code that may fail tests, with verification happening only at review time. This story adds a verification gate during implementation to ensure only working code gets committed. This is the highest-value gap - without this, users get broken commits.

## Acceptance Criteria

- [ ] After implementation completes, run test command (detected or configured) before committing
- [ ] After tests pass, run build command (detected or configured) before committing
- [ ] If tests fail, agent attempts to fix issues and re-verify (max 2 retry attempts)
- [ ] If build fails, agent attempts to fix issues and re-verify (max 2 retry attempts)
- [ ] If verification fails after retries, implementation status remains "in-progress" and agent reports failure with clear error message
- [ ] Only commit implementation if both test and build succeed
- [ ] Store commit SHA in story frontmatter as `implementation_commit`
- [ ] Commit message includes summary of what was implemented (following existing conventions)
- [ ] Add `--no-verify` flag to skip verification for edge cases

## Technical Notes

**Files to modify:**
- `src/agents/implementation.ts` - Add post-implementation verification (~line 715-720)
- `src/agents/review.ts` - Add commit check validation
- `src/types/index.ts` - Add `implementation_commit?: string` to StoryFrontmatter

**Implementation hints:**
- Reuse `runVerificationAsync` from `review.ts` (lines 271-319)
- Detection of test/build commands can start simple (look for `package.json` scripts)
- The retry logic prevents transient failures from blocking progress

**Complexity:** Medium (2-3 days)

## Out of Scope

- Custom verification commands per story type (use global config)
- Parallel test execution optimization
- Test coverage thresholds
