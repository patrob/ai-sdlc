---
id: S-0067
title: Blocked Story Notification System
priority: 17
status: backlog
type: feature
created: '2026-01-18'
labels:
  - automation
  - notifications
  - ux
  - epic-backlog-processor
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
slug: blocked-story-notification-system
dependencies:
  - S-0066
---
# Blocked Story Notification System

## User Story

**As a** developer who started batch processing and walked away
**I want** to be notified when a story becomes blocked
**So that** I know when my input is needed without constantly monitoring the console

## Summary

When the backlog processor encounters a blocking condition, the user needs to be notified. This story implements a notification system that:
1. Writes blocked stories to a persistent queue file
2. Displays clear, actionable messages in the console
3. Provides suggested next steps based on the blocking category

## Technical Context

**MVP Approach:**
- File-based notifications (`.ai-sdlc/blocked-queue.json`)
- Console output with clear formatting
- Future: webhooks, email, Slack (out of scope for MVP)

## Acceptance Criteria

- [ ] Create `NotificationService` in `src/services/notifications.ts`
- [ ] Write blocked stories to `.ai-sdlc/blocked-queue.json`:
  ```json
  {
    "blockedAt": "2026-01-18T10:30:00Z",
    "stories": [
      {
        "id": "S-0042",
        "title": "Add user authentication",
        "blockedAt": "2026-01-18T10:30:00Z",
        "category": "requirements_unclear",
        "reason": "Missing details on OAuth provider preference",
        "suggestedAction": "Update acceptance criteria with OAuth provider choice"
      }
    ]
  }
  ```
- [ ] Display formatted console notification when blocking:
  ```
  ╭─────────────────────────────────────────────────────────╮
  │  ⚠️  BLOCKED: S-0042 - Add user authentication          │
  ├─────────────────────────────────────────────────────────┤
  │  Category: Requirements Unclear                         │
  │  Reason: Missing details on OAuth provider preference   │
  │                                                         │
  │  Suggested Action:                                      │
  │  Update acceptance criteria with OAuth provider choice  │
  │                                                         │
  │  To resume: npm run agent process --resume              │
  ╰─────────────────────────────────────────────────────────╯
  ```
- [ ] Display summary notification when batch processing pauses:
  ```
  Batch processing paused.
  Completed: 3 stories | Blocked: 1 story | Remaining: 5 stories

  Run 'npm run agent blocked list' to see blocked stories.
  Run 'npm run agent process --resume' after resolving blockers.
  ```
- [ ] Category-specific suggested actions:
  | Category | Suggested Action |
  |----------|------------------|
  | `requirements_unclear` | "Update the story's acceptance criteria" |
  | `test_failure` | "Review test output and fix the failing code" |
  | `approval_required` | "Get required approval and update story notes" |
  | `merge_conflict` | "Resolve git conflicts in the worktree" |
  | `external_dependency` | "Resolve the external blocker and retry" |
  | `max_retries_exceeded` | "Investigate root cause, consider breaking down the story" |
- [ ] Append to blocked queue (don't overwrite previous entries)
- [ ] Include timestamp for each blocked story

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/services/notifications.ts` | Create | NotificationService |
| `src/cli/backlog-processor.ts` | Modify | Integrate notifications |
| `tests/unit/notifications.test.ts` | Create | Unit tests |

## Console Formatting

Use existing `ora` spinner patterns and box-drawing characters for visual clarity. Keep notifications concise but actionable.

## Edge Cases

- Blocked queue file doesn't exist → Create it
- Blocked queue file is corrupted → Backup and recreate
- Same story blocked multiple times → Update existing entry (don't duplicate)
- Very long reason text → Truncate with ellipsis

## Out of Scope

- Email notifications
- Slack/webhook integrations
- Desktop notifications
- Sound alerts

## Definition of Done

- [ ] NotificationService implemented
- [ ] Blocked queue file written correctly
- [ ] Console notifications display clearly
- [ ] Category-specific suggested actions work
- [ ] Unit tests pass
- [ ] `npm test` passes
- [ ] `npm run build` succeeds
