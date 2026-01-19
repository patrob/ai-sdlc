---
id: S-0106
title: Integrate Existing Workflows with TUI
priority: 6
status: backlog
type: feature
created: '2026-01-19'
labels:
  - tui
  - workflows
  - integration
  - epic-conversational-tui
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
slug: workflow-integration
dependencies:
  - S-0105
  - S-0100
---
# Integrate Existing Workflows with TUI

## User Story

**As a** developer using the ai-sdlc TUI
**I want** natural language commands to trigger existing SDLC workflows
**So that** I can say "implement this story" and have the full workflow execute

## Summary

Wire the intent classifier to existing workflow runners (refine, research, plan, implement, review). Progress events stream to the output panel, and results update the conversation context.

## Technical Context

**Current State:**
- `WorkflowRunner` in `src/cli/runner.ts` executes workflows
- Workflows triggered by CLI flags
- Progress reported via `AgentProgressCallback`
- Intent classifier detects workflow intents (S-0105)

**Target State:**
- TUI triggers workflows from natural language
- Progress streams to output panel
- Results displayed in conversation
- Story context updated after workflow completion

## Acceptance Criteria

### Workflow Triggering

- [ ] When intent classifier returns workflow intent:
  1. Display "Starting {workflow} workflow for {storyId}..."
  2. Execute workflow via existing runner
  3. Stream progress to output panel
  4. Display result in conversation

### Progress Integration

- [ ] Map `AgentProgressEvent` to output panel:
  | Event | Display |
  |-------|---------|
  | `session_start` | `[SYS] Starting {workflow} session` |
  | `tool_start` | `[→] Running: {toolName}` |
  | `tool_end` | `[✓] Completed: {toolName}` |
  | `assistant_message` | `[INFO] {truncated content}` |
  | `completion` | `[✓] {workflow} completed successfully` |
  | `error` | `[✗] Error: {message}` |

### Status Updates

- [ ] Status indicator changes to PROCESSING during workflow
- [ ] Status returns to READY on completion
- [ ] Status shows ERROR if workflow fails

### Result Display

- [ ] On workflow completion, add assistant turn with summary:
  ```
  ✓ Refine workflow completed for S-0078

  Updated acceptance criteria:
  - Added 3 new criteria
  - Clarified 2 existing criteria

  The story is now ready for research phase.
  ```

### Error Handling

- [ ] Display error in output panel with [✗] prefix
- [ ] Add error to conversation as assistant turn
- [ ] Suggest next steps: "Try again?", "View details?", "Skip this step?"

### Workflow Options

- [ ] Support workflow options from conversation:
  - "implement with TDD" → `--tdd` flag
  - "force implementation" → `--force` flag
  - "dry run first" → `--dry-run` flag

## Files to Create

| File | Purpose |
|------|---------|
| `packages/tui/src/services/workflow-executor.ts` | Workflow execution wrapper |
| `packages/tui/src/hooks/useWorkflowExecution.ts` | Workflow state management |
| `packages/tui/tests/workflow-integration.test.ts` | Integration tests |

## Files to Modify

| File | Change |
|------|--------|
| `packages/core/src/cli/runner.ts` | Export for TUI consumption |
| `packages/tui/src/App.tsx` | Wire workflow execution |

## Implementation Notes

```typescript
// packages/tui/src/services/workflow-executor.ts
import { WorkflowRunner, AgentProgressCallback } from '@ai-sdlc/core';

export interface WorkflowExecutionOptions {
  storyId: string;
  workflow: 'refine' | 'research' | 'plan' | 'implement' | 'review';
  flags?: {
    tdd?: boolean;
    force?: boolean;
    dryRun?: boolean;
  };
  onProgress: AgentProgressCallback;
  onStatusChange: (status: 'processing' | 'ready' | 'error') => void;
}

export interface WorkflowResult {
  success: boolean;
  summary: string;
  details?: string;
  nextSuggestion?: string;
  error?: string;
}

export async function executeWorkflow(
  options: WorkflowExecutionOptions
): Promise<WorkflowResult> {
  const { storyId, workflow, flags, onProgress, onStatusChange } = options;

  onStatusChange('processing');
  onProgress({ type: 'session_start', sessionId: `${workflow}-${storyId}` });

  try {
    const runner = new WorkflowRunner({
      sdlcRoot: '.ai-sdlc',
      projectRoot: process.cwd(),
    });

    // Map workflow to runner method
    const result = await runWorkflowByType(runner, workflow, storyId, {
      ...flags,
      onProgress,
    });

    onProgress({ type: 'completion' });
    onStatusChange('ready');

    return {
      success: true,
      summary: buildSuccessSummary(workflow, storyId, result),
      nextSuggestion: suggestNextWorkflow(workflow),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    onProgress({ type: 'error', message });
    onStatusChange('error');

    return {
      success: false,
      summary: `${workflow} workflow failed`,
      error: message,
      nextSuggestion: 'Would you like to retry or view the error details?',
    };
  }
}

function runWorkflowByType(
  runner: WorkflowRunner,
  workflow: string,
  storyId: string,
  options: any
): Promise<any> {
  switch (workflow) {
    case 'refine':
      return runner.runRefinement(storyId, options);
    case 'research':
      return runner.runResearch(storyId, options);
    case 'plan':
      return runner.runPlanning(storyId, options);
    case 'implement':
      return runner.runImplementation(storyId, options);
    case 'review':
      return runner.runReview(storyId, options);
    default:
      throw new Error(`Unknown workflow: ${workflow}`);
  }
}

function suggestNextWorkflow(completedWorkflow: string): string {
  const suggestions: Record<string, string> = {
    refine: 'Ready for research? Say "research this story"',
    research: 'Ready to plan? Say "create a plan"',
    plan: 'Ready to implement? Say "implement it"',
    implement: 'Ready for review? Say "review the changes"',
    review: 'All done! Say "show status" to see the board',
  };
  return suggestions[completedWorkflow] || '';
}
```

```tsx
// packages/tui/src/hooks/useWorkflowExecution.ts
import { useState, useCallback } from 'react';
import { executeWorkflow, WorkflowResult } from '../services/workflow-executor.js';
import { useLogBuffer } from './useLogBuffer.js';

export function useWorkflowExecution() {
  const [isExecuting, setIsExecuting] = useState(false);
  const [lastResult, setLastResult] = useState<WorkflowResult | null>(null);
  const { addEntry } = useLogBuffer();

  const execute = useCallback(async (
    workflow: string,
    storyId: string,
    flags?: Record<string, boolean>
  ) => {
    setIsExecuting(true);

    const result = await executeWorkflow({
      workflow: workflow as any,
      storyId,
      flags,
      onProgress: (event) => {
        addEntry(mapProgressToEntry(event));
      },
      onStatusChange: (status) => {
        // Status change handled by parent
      },
    });

    setLastResult(result);
    setIsExecuting(false);

    return result;
  }, [addEntry]);

  return { execute, isExecuting, lastResult };
}
```

## Testing Requirements

- [ ] Integration test: Refine workflow executes from TUI
- [ ] Integration test: Research workflow executes from TUI
- [ ] Integration test: Plan workflow executes from TUI
- [ ] Integration test: Implement workflow executes from TUI
- [ ] Integration test: Review workflow executes from TUI
- [ ] Integration test: Progress events stream to output
- [ ] Integration test: Status indicator updates correctly
- [ ] Integration test: Error handling displays correctly
- [ ] Integration test: TDD flag passes through
- [ ] `npm test` passes
- [ ] `npm run build` succeeds

## Definition of Done

- [ ] All 5 workflows triggerable from TUI
- [ ] Progress streams to output panel
- [ ] Status indicator reflects execution state
- [ ] Results displayed in conversation
- [ ] Errors handled gracefully
- [ ] All tests pass
- [ ] `make verify` passes

## References

- WorkflowRunner: `packages/core/src/cli/runner.ts`
- Related: S-0100 (Output panel), S-0105 (Intent classifier)
