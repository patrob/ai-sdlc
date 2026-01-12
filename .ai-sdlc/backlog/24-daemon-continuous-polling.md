---
id: daemon-continuous-polling
title: Daemon runs continuously
type: feature
status: backlog
priority: 5
created: 2025-01-12
labels: [daemon, lifecycle, PRD-daemon-workflow-engine]
estimated_effort: small
sequence_file: .ai-sdlc/docs/daemon-workflow-engine-sequence.md
sequence_order: 5
parallel_safe: true
---

# Daemon Runs Continuously

## User Story

**As a** developer running ai-sdlc daemon
**I want** the daemon to keep running when there's no work
**So that** it automatically picks up new stories without me restarting it

## Context

Currently the daemon watches for file changes but may log "Queue empty" in a way that suggests it's idle. Users expect the daemon to run indefinitely until explicitly stopped with Ctrl+C, continuously polling for new work.

**Sequence**: This is Story 5 of the Daemon Workflow Engine PRD. See [sequence file](../docs/daemon-workflow-engine-sequence.md).
**Parallel-safe**: This story has no dependencies and can be worked alongside Stories 1-4.

## Acceptance Criteria

- [ ] Daemon continues running after processing queue becomes empty
- [ ] Add configurable `pollInterval` option (default: 5000ms)
- [ ] When idle, daemon actively polls folders for new stories at pollInterval
- [ ] Idle message changes from "Queue empty" to "Waiting for work..." (logged once, not repeatedly)
- [ ] Daemon only stops on explicit Ctrl+C or SIGTERM
- [ ] Status output shows uptime and stories processed count
- [ ] Unit test: verify daemon doesn't exit when queue empties
- [ ] Config option added: `daemon.pollInterval`

## Technical Notes

- Current behavior uses chokidar file watching which IS continuous
- The issue may be perception: "Queue empty" message sounds like exit
- Add a `setInterval` poll that calls `assessState()` periodically
- Chokidar + polling together provides both reactive AND proactive detection
- Consider: debounce repeated "Waiting for work" messages

## Out of Scope

- Web dashboard showing daemon status
- Notifications when daemon starts/stops
- Automatic restart on crash

## Definition of Done

- [ ] All acceptance criteria checked
- [ ] `npm test` passes
- [ ] `npm run build` succeeds
- [ ] Manual verification: start daemon, add story to backlog, verify pickup
