---
id: S-0006
title: Validate clean git state before workflow execution
priority: 21
status: backlog
type: feature
created: '2026-01-13'
labels:
  - p0-mvp
  - safety
  - git
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
slug: validate-git-state-before-workflow
---
# Validate clean git state before workflow execution

## User Story

**As a** solopreneur using ai-sdlc
**I want** the system to check my git repository state before starting any workflow
**So that** I don't accidentally create commits on the wrong branch or with uncommitted changes

## Summary

Running automated workflows without validating git state can lead to messy situations - commits on wrong branches, lost uncommitted work, or merge conflicts mid-workflow. This story adds pre-flight validation to catch these issues before they cause problems.

## Acceptance Criteria

- [ ] Before executing any action that modifies git (implement, create_pr), check git status
- [ ] Verify working directory is clean (no uncommitted changes)
- [ ] Verify no untracked files that might conflict with implementation
- [ ] Verify current branch is not main/master (unless explicitly allowed)
- [ ] Verify local branch is not behind remote (would cause push failures)
- [ ] If validation fails, display clear error message explaining the issue and how to resolve
- [ ] If validation fails, exit gracefully without making any changes
- [ ] User can override validation with `--force` flag if they understand the risks

## Technical Notes

**Files to create:**
- `src/core/git-utils.ts` - New file for git validation utilities
- `src/core/git-utils.test.ts` - Unit tests

**Files to modify:**
- `src/cli/commands.ts` - Call validation at start of `executeAction()` (~line 713) for implement/review/create_pr actions

**Implementation hints:**
- Use `child_process.execSync` with `{ cwd: workingDir, stdio: 'pipe' }` pattern from existing code
- Check git status with `git status --porcelain`
- Security: validate branch names before using in shell commands (pattern from `review.ts:14-16`)
- Return clear error messages with suggested remediation (e.g., "commit your changes first")

**Complexity:** Small (1-2 days)

## Out of Scope

- Automatic stashing of uncommitted changes
- Branch creation/switching automation
- Remote repository validation (existence, permissions)
