---
id: story-e2e-smoke-test
title: End-to-end smoke test for complete workflow
priority: 28
status: backlog
type: chore
created: '2026-01-13'
labels:
  - p2-polish
  - testing
  - dx
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
---
# End-to-end smoke test for complete workflow

## User Story

**As a** developer working on ai-sdlc
**I want** an automated test that runs the entire workflow
**So that** I can verify nothing breaks when I make changes

## Summary

This is the safety net for refactoring and hardening. It's not testing the LLM or GitHub - it's testing that the orchestration logic works end-to-end. Mock the boundaries, test the integration.

## Acceptance Criteria

- [ ] Create integration test that runs full workflow: refine -> plan -> implement -> review -> create_pr
- [ ] Test uses mocked LLM responses (realistic but deterministic)
- [ ] Test uses mocked GitHub API (successful PR creation)
- [ ] Test uses real git operations in temporary test repository
- [ ] Test verifies: commits created, branches created, PR data formatted correctly
- [ ] Test runs in CI without requiring external API credentials
- [ ] Test completes in under 30 seconds
- [ ] Test cleans up temporary files/repos after completion

## Technical Notes

**Files to create:**
- `tests/integration/workflow-e2e.test.ts`

**Implementation hints:**
- Use `vitest` (already in project)
- Create temporary git repo with `git init` in temp directory
- Mock `runAgentQuery` to return predetermined responses
- Mock `gh pr create` to capture and validate PR data
- Use realistic story content that exercises all phases

**Complexity:** Small (1-2 days)

## Out of Scope

- Performance benchmarking
- Load testing
- Testing actual LLM responses
- Testing actual GitHub integration
