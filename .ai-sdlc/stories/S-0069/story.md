---
id: S-0069
title: Backlog Processor CLI Integration
priority: 19
status: backlog
type: feature
created: '2026-01-18'
labels:
  - automation
  - cli
  - ux
  - epic-backlog-processor
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
slug: backlog-processor-cli-integration
dependencies:
  - S-0065
  - S-0068
---
# Backlog Processor CLI Integration

## User Story

**As a** developer using ai-sdlc
**I want** simple CLI commands for batch processing
**So that** I can easily start, stop, resume, and monitor batch processing

## Summary

This story adds polished CLI commands for the backlog processor. It wraps the BacklogProcessor class with user-friendly commands, clear help text, and progress indicators.

## Technical Context

**Existing CLI Pattern:**
- Commands in `src/cli/commands.ts`
- Commander.js for argument parsing
- Ora for spinners and progress

**New Commands:**
- `npm run agent process` - Start batch processing
- `npm run agent process --resume` - Resume from blocked state
- `npm run agent process --status` - Show current status
- `npm run agent blocked list` - List blocked stories
- `npm run agent blocked unblock <id>` - Mark story as unblocked

## Acceptance Criteria

### Command: `process`

- [ ] `npm run agent process` - Start processing all backlog stories
- [ ] `npm run agent process --resume` - Resume from last state
- [ ] `npm run agent process --resume --skip` - Skip blocked story, continue to next
- [ ] `npm run agent process --status` - Show current processor status
- [ ] `npm run agent process --dry-run` - Preview what would be processed
- [ ] `npm run agent process --max-stories N` - Limit to N stories
- [ ] Display clear progress during processing:
  ```
  ● Processing S-0042 (1/8): Add user authentication
    └─ Phase: implement (3/5)
  ```

### Command: `blocked`

- [ ] `npm run agent blocked list` - List all blocked stories with reasons
  ```
  Blocked Stories (2):

  1. S-0042 - Add user authentication
     Blocked: 2 hours ago
     Category: Requirements Unclear
     Reason: Missing OAuth provider preference
     Action: Update acceptance criteria

  2. S-0045 - Implement payment flow
     Blocked: 30 minutes ago
     Category: Approval Required
     Reason: Security review needed for PCI compliance
     Action: Get security team sign-off
  ```
- [ ] `npm run agent blocked unblock S-0042` - Clear blocked status, set to 'ready'
- [ ] `npm run agent blocked skip S-0042` - Mark to skip on next resume

### Progress Display

- [ ] Show spinner with current story and phase
- [ ] Update spinner text as phases complete
- [ ] Show elapsed time for long-running operations
- [ ] On Ctrl+C, display graceful shutdown message:
  ```
  Received interrupt signal. Completing current action...
  Saved state. Run 'npm run agent process --resume' to continue.
  ```

### Help Text

- [ ] `npm run agent process --help` shows clear usage
- [ ] Include examples in help text
- [ ] Document all flags and options

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/cli/commands.ts` | Modify | Add process and blocked commands |
| `src/cli/process-command.ts` | Create | Process command implementation |
| `src/cli/blocked-command.ts` | Create | Blocked command implementation |
| `tests/integration/cli-process.test.ts` | Create | CLI integration tests |

## Command Reference

```
ai-sdlc process [options]
  Start or resume batch processing of backlog stories

Options:
  --resume         Resume from previous state
  --skip           Skip currently blocked story (use with --resume)
  --status         Show current processor status
  --dry-run        Preview without executing
  --max-stories N  Process at most N stories
  -h, --help       Show help

Examples:
  npm run agent process              # Start processing
  npm run agent process --resume     # Resume after resolving blocker
  npm run agent process --status     # Check current status
  npm run agent process --dry-run    # Preview processing order

ai-sdlc blocked <command>
  Manage blocked stories

Commands:
  list             List all blocked stories
  unblock <id>     Clear blocked status for a story
  skip <id>        Mark story to skip on resume

Examples:
  npm run agent blocked list         # Show all blocked
  npm run agent blocked unblock S-0042  # Unblock story
```

## Edge Cases

- Running process while another instance running → Warn and exit
- No stories to process → "No actionable stories in backlog"
- Invalid story ID for unblock → "Story S-XXXX not found"
- Story not blocked for unblock → "Story S-XXXX is not blocked"

## Definition of Done

- [ ] All CLI commands implemented
- [ ] Help text complete and accurate
- [ ] Progress display working
- [ ] Graceful shutdown working
- [ ] Integration tests for CLI commands
- [ ] `npm test` passes
- [ ] `npm run build` succeeds
- [ ] Manual testing of all commands
