---
id: story-error-recovery-reporting
title: Clear error reporting and recovery suggestions
priority: 24
status: backlog
type: feature
created: '2026-01-13'
labels:
  - p1-production
  - ux
  - error-handling
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
---
# Clear error reporting and recovery suggestions

## User Story

**As a** solopreneur using ai-sdlc
**I want** helpful error messages when something goes wrong
**So that** I know what failed and how to fix it without digging through logs

## Summary

Good error messages turn frustration into trust. This isn't a separate feature - it's improving error handling throughout the codebase. Focus on the most likely error scenarios and make errors feel like helpful guidance, not technical vomit.

## Acceptance Criteria

- [ ] All error messages follow consistent format: [What failed] [Why it failed] [How to fix]
- [ ] Errors distinguish between user-fixable issues (bad config, git state) and system issues (API errors, bugs)
- [ ] When workflow fails mid-execution, report what succeeded and what failed
- [ ] When workflow fails mid-execution, suggest next steps (e.g., "Run `sdlc auto` again to continue from plan phase")
- [ ] Critical errors (crashes, unexpected exceptions) are logged with full stack trace to debug log file
- [ ] User-facing errors never show raw stack traces (unless `--debug` flag is used)
- [ ] Create error message templates for top 5 most likely scenarios:
  1. Git conflicts/dirty state
  2. Test failures
  3. LLM API errors (rate limits, timeouts)
  4. Missing credentials (GitHub token)
  5. Invalid story format

## Technical Notes

**Files to modify:**
- `src/cli/commands.ts` - Error handling in executeAction and related functions
- `src/core/client.ts` - API error handling
- Various agent files - Consistent error formatting

**Implementation hints:**
- Create error type enum and message templates
- Add `--debug` flag to show verbose output
- Consider using a logging library with levels (debug, info, warn, error)
- Log to `~/.ai-sdlc/debug.log` or similar for debugging

**Complexity:** Medium (2-3 days)

## Out of Scope

- Automatic error reporting/telemetry
- Error recovery automation (just suggestions)
- Internationalization of error messages
