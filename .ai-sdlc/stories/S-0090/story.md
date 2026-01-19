---
id: S-0090
title: Implement Human-in-the-Loop Approval Gates
priority: 13
status: backlog
type: feature
created: '2026-01-19'
labels:
  - architecture
  - patterns
  - google-adk
  - safety
  - epic-modular-architecture
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
slug: implement-human-in-the-loop
dependencies:
  - S-0089
---
# Implement Human-in-the-Loop Approval Gates

## User Story

**As a** developer using ai-sdlc
**I want** explicit approval checkpoints for high-stakes operations
**So that** critical decisions require human authorization before proceeding

## Summary

This story implements the Human-in-the-Loop pattern from Google's ADK. It provides configurable approval gates that pause agent execution at critical decision points, requiring human authorization before continuing.

## Technical Context

**Current State:**
- Some implicit approval points exist
- No formal approval gate system
- No configurable approval policies

**Target State:**
- `HumanApprovalManager` for gate management
- Configurable approval gates with conditions
- Integration with CLI for interactive approval
- Support for async approval (future: Slack, email)

## Acceptance Criteria

### ApprovalGate Interface

- [ ] Create `src/patterns/human-approval.ts` with:
  - [ ] `ApprovalGate` interface
  - [ ] `HumanApprovalManager` class
  - [ ] `ApprovalResult` type

### Gate Configuration

```typescript
interface ApprovalGate {
  name: string;
  description: string;
  condition: (context: ApprovalContext) => boolean;
  timeout?: number;
  fallback?: 'approve' | 'reject' | 'error';
}

interface ApprovalContext {
  operation: string;
  storyId: string;
  changesSummary: ChangesSummary;
  riskLevel: 'low' | 'medium' | 'high';
  metadata: Record<string, unknown>;
}
```

### HumanApprovalManager

- [ ] `addGate(gate: ApprovalGate)` - Register approval gate
- [ ] `checkApproval(context: ApprovalContext): Promise<ApprovalResult>` - Check all gates
- [ ] `requestApproval(gate: ApprovalGate, context: ApprovalContext): Promise<boolean>` - Request approval

### Built-in Gates

- [ ] **Breaking Change Gate**: Triggered when public APIs modified
- [ ] **Security Sensitive Gate**: Triggered when auth/security code touched
- [ ] **Large Change Gate**: Triggered when >500 lines changed
- [ ] **Destructive Operation Gate**: Triggered for file deletions, DB migrations
- [ ] **Production Deploy Gate**: Triggered before production deployments

### CLI Integration

- [ ] Interactive approval prompt in terminal
- [ ] Show change summary before approval
- [ ] Support `--auto-approve` flag for CI (with warnings)
- [ ] Timeout handling with configurable fallback

### Approval UI

```
┌─────────────────────────────────────────────────────────────┐
│  Approval Required: Breaking Change                        │
├─────────────────────────────────────────────────────────────┤
│  Story: S-0042 - Add user authentication                   │
│  Operation: Modify public API                               │
│                                                             │
│  Changes:                                                   │
│    • Modified: src/api/auth.ts (public interface changed)  │
│    • Added: src/types/auth.ts                              │
│                                                             │
│  Risk: MEDIUM - Public API signature change                │
│                                                             │
│  This change modifies public APIs that may affect          │
│  downstream consumers.                                      │
├─────────────────────────────────────────────────────────────┤
│  [A]pprove  [R]eject  [D]etails  [S]kip                    │
└─────────────────────────────────────────────────────────────┘
```

### Integration Points

- [ ] Hook into review stage completion
- [ ] Hook into implementation completion (before commit)
- [ ] Hook into PR creation
- [ ] Configurable in `.ai-sdlc.json`

## Configuration Schema

```json
{
  "approvalGates": {
    "enabled": true,
    "gates": {
      "breakingChange": { "enabled": true, "fallback": "reject" },
      "securitySensitive": { "enabled": true, "fallback": "reject" },
      "largeChange": { "enabled": true, "threshold": 500 },
      "destructiveOperation": { "enabled": true }
    },
    "defaultTimeout": 300000,
    "allowAutoApprove": false
  }
}
```

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/patterns/human-approval.ts` | Create | HumanApprovalManager |
| `src/patterns/gates/index.ts` | Create | Built-in gate definitions |
| `src/cli/approval-ui.ts` | Create | CLI approval interface |
| `src/core/config.ts` | Modify | Add approval gate config |

## Testing Requirements

- [ ] Unit tests for gate condition evaluation
- [ ] Unit tests for approval flow
- [ ] Integration tests with mock approval
- [ ] `npm test` passes
- [ ] `npm run build` succeeds

## Definition of Done

- [ ] `HumanApprovalManager` implemented
- [ ] All 5 built-in gates implemented
- [ ] CLI approval UI working
- [ ] Configuration support added
- [ ] All tests pass
- [ ] Build succeeds

## References

- Architecture Analysis: `docs/architecture-analysis.md` Section 10.8
- Google ADK Pattern: Human-in-the-Loop (Safety Net)
