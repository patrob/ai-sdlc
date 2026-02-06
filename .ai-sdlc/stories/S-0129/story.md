---
id: S-0129
title: Add JSON output format to the status command via --json flag
slug: add-json-output-format-to-the-status-command-via-j
priority: 80
status: ready
type: feature
created: '2026-02-06'
labels: []
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
content_type: code
---


## Summary

The `ai-sdlc status` command displays a kanban board with columns (Backlog, Ready, In-Progress, Done). Adding a `--json` flag outputs the board data as structured JSON, enabling scripting, CI integration, and programmatic access to board state.

## Acceptance Criteria

- [ ] `ai-sdlc status --json` outputs valid JSON to stdout
- [ ] JSON includes columns with story arrays: `{ backlog: [...], ready: [...], inProgress: [...], done: [...] }`
- [ ] Each story object includes: `id`, `title`, `status`, `priority`, `type`, `created`
- [ ] Column counts are included in the output
- [ ] Existing text board output is unchanged without `--json`
- [ ] Exit code 0 on success
