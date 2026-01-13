---
id: story-guided-confirmation-mode
title: CLI guided mode with confirmation prompts at each step
priority: 25
status: backlog
type: feature
created: '2026-01-13'
labels:
  - p1-production
  - ux
  - onboarding
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
---
# CLI guided mode with confirmation prompts at each step

## User Story

**As a** solopreneur using ai-sdlc for the first time
**I want** to be prompted to confirm before each major action
**So that** I understand what's happening and maintain control over the workflow

## Summary

This is the onboarding experience. First-time users need to see what's happening and feel in control. Power users can omit the flag for full automation. The daemon mode already exists, so this is just adding the prompt logic to the CLI flow.

## Acceptance Criteria

- [ ] `sdlc auto --confirm-each` flag enables guided mode
- [ ] Before each action (refine, plan, implement, create_pr), display action description and prompt for confirmation
- [ ] Prompt shows: action name, story title, brief description of what will happen
- [ ] User can confirm (Y), skip this action (N), or abort workflow (Q/Ctrl-C)
- [ ] If user skips action, mark it as skipped and continue to next action
- [ ] If user aborts, exit gracefully with summary of completed actions
- [ ] Default behavior (no flag) runs all actions without confirmation
- [ ] Add integration test verifying confirmation prompts appear and respect user input

## Technical Notes

**Files to modify:**
- `src/cli/commands.ts` - Add confirmation logic to action execution loop
- `src/cli/runner.ts` - Integrate with existing auto mode

**Implementation hints:**
- Use `inquirer` or similar for prompts (or Node's built-in readline)
- The flag name `--confirm-each` is more descriptive than `--interactive`
- Consider adding a brief "what just happened" summary after each action completes
- Respect CI environments - auto-skip prompts if `CI=true` or non-interactive terminal

**Complexity:** Small (1-2 days)

## Out of Scope

- Web-based approval workflow
- Slack/Discord approval integration
- Per-action granular permissions
