---
id: S-0019
title: Recover and continue from partial workflow completion
priority: 27
status: backlog
type: feature
created: '2026-01-13'
labels:
  - p2-polish
  - ux
  - resilience
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
slug: resume-from-partial-workflow
---
# Recover and continue from partial workflow completion

## User Story

**As a** solopreneur using ai-sdlc
**I want** to resume a workflow if it was interrupted
**So that** I don't have to restart from scratch when something fails

## Summary

This turns partial failures from disasters into minor inconveniences. Users can Ctrl-C, fix something manually, and re-run `sdlc auto` without losing progress. The story file is already the state machine - just read it properly.

## Acceptance Criteria

- [ ] When `sdlc auto` starts, check story file for completed actions
- [ ] Skip actions that are already marked complete in story file (e.g., `research_complete: true`)
- [ ] Display message showing which actions are being skipped (e.g., "Refine and Plan already complete, starting from Implement")
- [ ] If current action failed previously, retry it (don't skip)
- [ ] If story file shows conflicting state (e.g., PR created but no commit), warn user and offer to reset or continue
- [ ] Add `--from-scratch` flag to force restart from beginning
- [ ] Add unit tests for action state detection logic

## Technical Notes

**Files to modify:**
- `src/cli/runner.ts` - Add state detection at workflow start
- `src/cli/commands.ts` - Handle `--from-scratch` flag

**Implementation hints:**
- Read frontmatter flags: `research_complete`, `plan_complete`, `implementation_complete`, `reviews_complete`
- The checkpoint file (`.workflow-state.json`) already tracks some state - consider consolidating
- Conflicting state detection: PR exists but `implementation_complete: false` is a red flag

**Complexity:** Small (1-2 days)

## Out of Scope

- Automatic conflict resolution
- State synchronization across multiple machines
- Partial action recovery (within a single action)
