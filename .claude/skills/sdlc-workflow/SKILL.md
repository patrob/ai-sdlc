---
name: sdlc-workflow
description: Use when running, debugging, or troubleshooting ai-sdlc workflow execution, including story progression, phase transitions, and recovery scenarios.
---

# SDLC Workflow Skill

This skill provides guidance for orchestrating and debugging ai-sdlc workflow execution.

## Overview

The ai-sdlc CLI manages story progression through phases (research → planning → implementation → review). This skill helps run workflows effectively and debug issues when stories get stuck.

## Workflow Commands

### Basic Execution

```bash
# Run workflow for a specific story
ai-sdlc run --story S-0001

# Run with verbose output (recommended for debugging)
ai-sdlc run --story S-0001 --verbose

# Dry run - show what would happen without executing
ai-sdlc run --story S-0001 --dry-run

# Auto mode - skip confirmations
ai-sdlc run --story S-0001 --auto
```

### Checking Status

```bash
# List all stories
ai-sdlc list

# Show story details including current phase
ai-sdlc show S-0001

# Filter by label
ai-sdlc list --label epic-auth
```

## Common Issues

### Story Not Progressing

**Symptoms:** Story stays in same phase after run completes

**Debugging Steps:**
1. Check story frontmatter status: `ai-sdlc show <story-id>`
2. Look for phase gate blockers in story.md
3. Check if acceptance criteria are met
4. Run with `--verbose` to see phase execution details

**Common Causes:**
- Missing required frontmatter fields
- Phase prerequisites not met
- Acceptance criteria validation failing

### Recovery Limits Hit

**Symptoms:** "Max recovery attempts reached" error

**What's Happening:** The workflow has a safety limit on automatic retries

**Resolution:**
1. Check verbose output for the actual failure
2. Manually fix the underlying issue
3. Reset story state if needed
4. Re-run with `--verbose`

### Stage Gate Failures

**Symptoms:** Phase completes but story doesn't advance

**Debugging:**
1. Check `story.md` for phase completion markers
2. Verify all checklist items are complete
3. Look for validation errors in output
4. Check frontmatter `status` and `phase` fields match

## Debugging Tips

### Always Use Verbose Mode When Debugging

```bash
ai-sdlc run --story S-0001 --verbose
```

Verbose mode shows:
- Phase transitions
- Agent spawning
- File operations
- Validation checks

### Check Story Folder Contents

```bash
# See what artifacts exist
ls -la .ai-sdlc/stories/S-0001/

# Common files:
# - story.md (main story document)
# - research.md (research phase output)
# - plan.md (planning phase output)
# - implementation-log.md (implementation notes)
```

### Verify Frontmatter State

The story frontmatter controls workflow progression:

```yaml
---
id: S-0001
title: Story Title
status: in-progress  # draft | in-progress | blocked | done
phase: planning      # research | planning | implementation | review
---
```

### Reset Story State

If a story is stuck, you may need to manually edit frontmatter:

1. Open `.ai-sdlc/stories/<id>/story.md`
2. Check `status` and `phase` fields
3. Adjust as needed
4. Re-run workflow

## Multi-Agent Workflow

The workflow spawns multiple agents for different phases. Debug agent issues by:

1. **Check agent output** - Verbose mode shows agent communication
2. **Verify environment** - Agents inherit parent environment
3. **Watch for timeouts** - Long-running agents may hit limits
4. **Check tool availability** - Some agents need specific tools enabled

## Quick Reference

| Issue | First Step |
|-------|------------|
| Story stuck | `ai-sdlc show <id>` to check state |
| Phase not advancing | Run with `--verbose` |
| Unexpected errors | Check story.md frontmatter |
| Agent failures | Check verbose output for spawn errors |
| Recovery limit | Fix root cause, then re-run |
