---
id: story-github-pr-creation
title: Create GitHub PR with story summary and implementation details
priority: 22
status: backlog
type: feature
created: '2026-01-13'
labels:
  - p0-mvp
  - github
  - integration
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
slug: create-github-pr-with-story-summary
---
# Create GitHub PR with story summary and implementation details

## User Story

**As a** solopreneur using ai-sdlc
**I want** a PR automatically created when implementation completes
**So that** I can review and merge the changes without manual PR creation

## Summary

This completes the "wow moment" - user sees a PR ready to review. The PR should have a comprehensive description derived from story content so reviewers have full context without opening the story file.

## Acceptance Criteria

- [ ] After successful implementation and commit, create PR via GitHub API (using `gh` CLI)
- [ ] PR title matches story title
- [ ] PR description includes: story ID, user story, acceptance criteria, implementation summary
- [ ] PR description does not include unfinished checkboxes (per CLAUDE.md)
- [ ] PR is created from story branch to main branch
- [ ] If PR creation fails (auth, network, etc.), report error clearly and continue (story is still implemented and committed)
- [ ] GitHub token is read from environment variable or git credential helper
- [ ] Limit PR body to 65K characters (GitHub limit) with truncation indicator if needed
- [ ] Add `--draft` flag option for draft PR creation
- [ ] Include link to story file in PR description

## Technical Notes

**Files to modify:**
- `src/agents/review.ts` - Enhance `createPullRequest` function (~line 839-970)

**Implementation hints:**
- Create helper function `formatPRDescription(story: Story): string`
- Use existing section parsing from `parseContentSections` in `commands.ts:1362-1395`
- Leverage `gh pr create` options: `--title`, `--body`, `--draft`
- Security: Escape all story content before interpolation (use escapeShellArg pattern ~line 22-25)
- Make auth simple: env var first, expand later if needed

**Complexity:** Small (1-2 days)

## Out of Scope

- Adding reviewers automatically
- Adding labels to PRs
- GitLab/Bitbucket support (GitHub only for MVP)
- PR templates beyond story content
