---
id: daemon-config-defaults
title: Set sensible config defaults
type: chore
status: backlog
priority: 8
created: 2025-01-12
labels: [daemon, config, PRD-daemon-workflow-engine]
estimated_effort: small
sequence_file: .ai-sdlc/docs/daemon-workflow-engine-sequence.md
sequence_order: 8
parallel_safe: true
---

# Set Sensible Config Defaults

## User Story

**As a** developer using ai-sdlc without custom config
**I want** sensible default values for daemon-related settings
**So that** the tool works well out of the box without extensive configuration

## Context

Some current defaults aren't ideal for autonomous daemon operation. For example, `maxRetries: Infinity` means stories can fail review forever without blocking. This story updates defaults to enable effective autonomous operation.

**Sequence**: This is Story 8 of the Daemon Workflow Engine PRD. See [sequence file](../docs/daemon-workflow-engine-sequence.md).
**Parallel-safe**: This story has no dependencies and can be worked alongside others.

## Acceptance Criteria

- [ ] `reviewConfig.maxRetries` default changed from `Infinity` to `3`
- [ ] `daemon.pollInterval` default set to `5000` (5 seconds)
- [ ] `daemon.maxIterationsPerStory` default remains `100` (verify documented)
- [ ] `refinement.maxIterations` default remains `3` (verify documented)
- [ ] All defaults documented in config file comments or README
- [ ] Existing user configs with explicit values are NOT overridden
- [ ] Unit test: verify default values are applied correctly
- [ ] Type definitions updated if new config fields added

## Technical Notes

- Config defaults are in `src/core/config.ts`
- Be careful: changing `maxRetries` from Infinity to 3 is a breaking change for users relying on infinite retries
- Consider: should we log a warning if user still has `maxRetries: Infinity`?
- Ensure `pollInterval` is added to config types if not present

## Config Summary After This Story

```typescript
{
  refinement: {
    maxIterations: 3,  // unchanged
  },
  reviewConfig: {
    maxRetries: 3,     // CHANGED from Infinity
  },
  daemon: {
    pollInterval: 5000,      // NEW
    maxIterationsPerStory: 100,  // verify exists
    shutdownTimeout: 30000,  // unchanged
  }
}
```

## Out of Scope

- Making all config values CLI-overridable
- Config validation/migration tooling
- Environment variable support for config

## Definition of Done

- [ ] All acceptance criteria checked
- [ ] `npm test` passes
- [ ] `npm run build` succeeds
- [ ] Manual verification: run without config, verify new defaults applied
