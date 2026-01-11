# Agent Refinement Feedback Loop

## Overview

This feature enables automatic feedback loops that send failed work back to agents for refinement based on structured review feedback. When a review identifies issues with completed work, the system automatically routes the work back to the original agent with detailed feedback, enabling iterative improvement without manual intervention.

## How It Works

### Workflow Flow

```
Ready → research → plan → implement → review (FAIL)
  → rework(implement, feedback) → implement → review (FAIL)
  → rework(implement, feedback) → implement → review (PASS)
  → create_pr → Done
```

### With Circuit Breaker

```
Ready → research → plan → implement → review (FAIL)
  → rework(1/3) → implement → review (FAIL)
  → rework(2/3) → implement → review (FAIL)
  → rework(3/3) → implement → review (FAIL)
  → [escalate to manual review, set last_error, stop auto mode]
```

## Key Components

### 1. Rework Agent (`src/agents/rework.ts`)

The rework agent coordinates sending failed work back to the appropriate agent:

- Records refinement attempts in story frontmatter
- Implements circuit breaker to prevent infinite loops
- Packages review feedback with original work
- Resets appropriate completion flags (research/plan/implement)
- Appends refinement notes to story content

### 2. State Assessor (`src/core/kanban.ts`)

Enhanced to detect failed reviews and generate rework actions:

- Checks for `ReviewDecision.REJECTED` in review history
- Generates `rework` actions with high priority (450)
- Enforces circuit breaker at max iterations
- Escalates to manual intervention when limit reached

### 3. Workflow Runner (`src/cli/runner.ts`)

Extended to handle rework actions:

- Executes rework agent to prepare story
- Automatically triggers target phase agent (research/plan/implement)
- Displays clear iteration counts in CLI output

## Configuration

Add to `.ai-sdlc.json`:

```json
{
  "refinement": {
    "maxIterations": 3,
    "escalateOnMaxAttempts": "manual",
    "enableCircuitBreaker": true
  }
}
```

### Configuration Options

- **maxIterations** (default: 3): Maximum number of refinement attempts before escalation
- **escalateOnMaxAttempts** (default: 'manual'): How to handle max iterations
  - `'manual'`: Stop and require manual intervention
  - `'error'`: Fail the story with an error
  - `'skip'`: Skip the story and continue with others
- **enableCircuitBreaker** (default: true): Enable/disable the circuit breaker pattern

### Per-Story Override

You can override the max iterations per story in frontmatter:

```yaml
---
id: story-abc123
title: Complex Feature
max_refinement_attempts: 5
---
```

## Story Frontmatter Tracking

Each story tracks refinement iterations:

```yaml
---
refinement_count: 2
refinement_iterations:
  - iteration: 1
    agentType: implement
    startedAt: "2024-01-09T10:30:00Z"
    reviewFeedback: "Review failed: 1 blocker(s), 2 critical"
    result: failed
  - iteration: 2
    agentType: implement
    startedAt: "2024-01-09T11:15:00Z"
    reviewFeedback: "Review failed: 1 critical"
    result: in_progress
---
```

## Review Feedback Structure

Reviews now return structured feedback:

```typescript
interface ReviewResult {
  passed: boolean;
  decision: ReviewDecision; // APPROVED, REJECTED, FAILED
  severity?: ReviewSeverity; // LOW, MEDIUM, HIGH, CRITICAL
  issues: ReviewIssue[];
  feedback: string;
}

interface ReviewIssue {
  severity: 'blocker' | 'critical' | 'major' | 'minor';
  category: string;
  description: string;
  file?: string;
  line?: number;
  suggestedFix?: string;
}
```

## Circuit Breaker Pattern

The circuit breaker prevents infinite refinement loops:

1. **Tracks iteration count** in story frontmatter
2. **Checks limit** before executing rework (default: 3 attempts)
3. **Escalates** when limit reached:
   - Sets `last_error` with escalation message
   - Generates low-priority manual intervention action
   - Stops automatic refinement attempts

## Target Phase Determination

The system intelligently determines which phase needs rework based on review feedback:

- **Research Phase**: Issues related to requirements, understanding, or missing information
- **Plan Phase**: Issues related to architecture, design, or approach
- **Implementation Phase** (default): Code quality, security, testing issues

## CLI Output

### Rework Action

```
⟳ Reworking "story-slug" (iteration 2/3, target: implement)
  → Recorded refinement attempt 2
  → Added refinement iteration 2 notes to story
  → Reset implement_complete flag for rework
  ↳ Triggering implement agent for refinement...
```

### Circuit Breaker Activation

```
🛑 Story "difficult-feature" reached max refinement attempts (3/3)
   Manual intervention required
```

## Testing

### Unit Tests

- `tests/agents/rework.test.ts`: Rework agent functionality
- `tests/core/kanban-rework.test.ts`: State assessment and action generation

### Integration Tests

- `tests/integration/refinement-loop.test.ts`: End-to-end refinement workflows

Run tests:

```bash
npm test
```

## Usage Example

### Automatic Mode

```bash
# Run in auto mode - refinement loops execute automatically
ai-sdlc run --auto
```

The system will:

1. Execute implement agent
2. Run review agent
3. Detect review failure
4. Generate rework action
5. Execute rework agent
6. Re-run implement agent with feedback
7. Run review agent again
8. Continue until pass or max iterations

### Manual Mode

```bash
# Run single action at a time
ai-sdlc run
```

Each rework action requires explicit execution.

## Edge Cases Handled

### 1. Infinite Loop Prevention

Circuit breaker stops refinement after N attempts (configurable).

### 2. Concurrent Refinement

Multiple stories can be in refinement simultaneously without state interference.

### 3. Mid-Cycle Config Changes

Per-story `max_refinement_attempts` snapshot protects against config changes mid-cycle.

### 4. Review Agent Failures

`ReviewDecision.FAILED` (agent error) doesn't trigger rework or count as iteration.

### 5. State Consistency

Atomic file writes ensure story state remains consistent even if process crashes.

## Acceptance Criteria Status

✅ System detects when review marks work as "failed"
✅ Failed work automatically routed back to original agent
✅ Review feedback packaged with specific issues and context
✅ Agent receives full historical context
✅ System tracks refinement iterations
✅ Circuit breaker prevents infinite loops
✅ Auto mode executes refinement without manual approval
✅ Updated work sent back through review process
✅ System logs each refinement iteration

## Troubleshooting

### Story stuck in refinement loop

Check the refinement count:

```bash
ai-sdlc details <story-slug>
```

If at max iterations, manually review and fix, then reset:

```bash
# Reset refinement count (manual operation)
# Edit story frontmatter and set refinement_count to 0
```

### Circuit breaker triggered too early

Increase max iterations in config or per-story:

```json
{
  "refinement": {
    "maxIterations": 5
  }
}
```

### Review feedback not actionable

Check review notes in story content. If feedback is vague, this indicates the review agent needs prompt improvements.

## Future Enhancements

- **Intelligent phase detection**: Use ML to better determine target phase from feedback
- **Feedback quality scoring**: Rate review feedback helpfulness
- **Refinement analytics**: Track which stories require most refinement
- **Adaptive max iterations**: Adjust limits based on story complexity
- **Parallel review phases**: Run code/security/PO reviews in stages

## Architecture Decisions

### Why separate rework agent?

- **Single responsibility**: Each agent has one clear purpose
- **Testability**: Easier to test rework logic in isolation
- **Extensibility**: Can add complex rework strategies without affecting other agents

### Why reset completion flags?

- **State consistency**: Clear signal that phase needs to run again
- **Workflow integrity**: Existing state machine logic handles re-execution
- **Audit trail**: Frontmatter shows exactly what was reset and when

### Why high priority for rework?

- **Fast feedback**: Get refinement results quickly
- **Context preservation**: Fix issues while context is fresh
- **Batch efficiency**: Complete refinement before starting new work

## Related Documentation

- [Review Agent](./src/agents/review.ts)
- [Story State Management](./src/core/story.ts)
- [Workflow Runner](./src/cli/runner.ts)
- [Configuration Guide](./.ai-sdlc.json)
