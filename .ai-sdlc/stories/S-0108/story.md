---
id: S-0108
title: Add Approval Gates UI Integration
priority: 8
status: backlog
type: feature
created: '2026-01-19'
labels:
  - tui
  - approval
  - hitl
  - epic-conversational-tui
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
slug: approval-gates-ui
dependencies:
  - S-0106
---
# Add Approval Gates UI Integration

## User Story

**As a** developer using the ai-sdlc TUI
**I want** to see and respond to approval prompts inline
**So that** I can review and approve workflow stages without interrupting my flow

## Summary

Integrate the Human-in-the-Loop approval gates (S-0090) with the TUI. When a workflow requires approval, display a rich approval prompt with context, diff preview, and keyboard shortcuts for approve/reject/details.

## Technical Context

**Current State:**
- S-0090 defines approval gate interfaces
- CLI would use basic prompts for approval
- No TUI-specific approval UI

**Target State:**
- Rich approval UI component
- Inline display in TUI
- Keyboard shortcuts for quick actions
- Diff/detail views available

## Acceptance Criteria

### Approval Prompt Display

- [ ] When approval needed, display prompt:
  ```
  ┌─────────────────────────────────────────────────────────────┐
  │  ⚠ Approval Required: Implementation Plan                   │
  ├─────────────────────────────────────────────────────────────┤
  │                                                             │
  │  Story: S-0078 - Create IProvider Interface                 │
  │  Phase: planning → implementation                           │
  │                                                             │
  │  Changes:                                                   │
  │  • Create src/providers/types.ts (new file)                 │
  │  • Create src/providers/index.ts (new file)                 │
  │  • Modify src/core/client.ts (add exports)                  │
  │                                                             │
  │  [A]pprove  [R]eject  [D]etails  [S]kip                    │
  │                                                             │
  └─────────────────────────────────────────────────────────────┘
  ```

### Keyboard Shortcuts

- [ ] `A` - Approve and continue workflow
- [ ] `R` - Reject with optional reason
- [ ] `D` - Show detailed diff/preview
- [ ] `S` - Skip this gate (continue without approval)
- [ ] `?` - Show help for shortcuts

### Detail View

- [ ] When `D` pressed, show expanded view:
  ```
  ┌─ File: src/providers/types.ts (new) ─────────────────────────┐
  │ + export interface IProvider {                               │
  │ +   readonly name: string;                                   │
  │ +   query(options: QueryOptions): Promise<string>;           │
  │ + }                                                          │
  │ +                                                            │
  │ + export interface QueryOptions {                            │
  │ +   prompt: string;                                          │
  │ +   ...                                                      │
  └──────────────────────────────────────────────────────────────┘
  [←] Previous file  [→] Next file  [Esc] Back to approval
  ```

### Reject Flow

- [ ] When `R` pressed, prompt for reason:
  ```
  Rejection reason (optional): _
  [Enter] Submit  [Esc] Cancel
  ```

- [ ] Rejection recorded in workflow history
- [ ] Workflow pauses for user to address feedback

### Integration with Workflows

- [ ] Approval prompts appear at configured gates:
  - After planning (before implementation)
  - After implementation (before commit)
  - After significant file changes
- [ ] Workflow blocks until user responds
- [ ] Approved/rejected status logged to output panel

## Files to Create

| File | Purpose |
|------|---------|
| `packages/tui/src/components/ApprovalPrompt.tsx` | Main approval UI |
| `packages/tui/src/components/DiffViewer.tsx` | File diff display |
| `packages/tui/src/components/ApprovalActions.tsx` | Action bar |
| `packages/tui/src/components/RejectDialog.tsx` | Rejection reason input |
| `packages/tui/src/hooks/useApprovalGate.ts` | Approval state management |
| `packages/tui/tests/ApprovalPrompt.test.tsx` | Approval UI tests |

## Implementation Notes

```tsx
// packages/tui/src/components/ApprovalPrompt.tsx
import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { DiffViewer } from './DiffViewer.js';
import { RejectDialog } from './RejectDialog.js';

interface ApprovalPromptProps {
  title: string;
  storyId: string;
  storyTitle: string;
  phase: string;
  changes: FileChange[];
  onApprove: () => void;
  onReject: (reason?: string) => void;
  onSkip: () => void;
}

type View = 'prompt' | 'details' | 'reject';

export function ApprovalPrompt({
  title,
  storyId,
  storyTitle,
  phase,
  changes,
  onApprove,
  onReject,
  onSkip,
}: ApprovalPromptProps) {
  const [view, setView] = useState<View>('prompt');
  const [selectedFile, setSelectedFile] = useState(0);

  useInput((input, key) => {
    if (view === 'prompt') {
      switch (input.toLowerCase()) {
        case 'a':
          onApprove();
          break;
        case 'r':
          setView('reject');
          break;
        case 'd':
          setView('details');
          break;
        case 's':
          onSkip();
          break;
      }
    } else if (view === 'details') {
      if (key.escape) {
        setView('prompt');
      } else if (key.leftArrow) {
        setSelectedFile(Math.max(0, selectedFile - 1));
      } else if (key.rightArrow) {
        setSelectedFile(Math.min(changes.length - 1, selectedFile + 1));
      }
    }
  });

  if (view === 'details') {
    return (
      <DiffViewer
        file={changes[selectedFile]}
        currentIndex={selectedFile}
        totalFiles={changes.length}
        onBack={() => setView('prompt')}
      />
    );
  }

  if (view === 'reject') {
    return (
      <RejectDialog
        onSubmit={(reason) => {
          onReject(reason);
          setView('prompt');
        }}
        onCancel={() => setView('prompt')}
      />
    );
  }

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="yellow"
      padding={1}
    >
      <Box marginBottom={1}>
        <Text color="yellow">⚠ </Text>
        <Text bold>Approval Required: {title}</Text>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        <Text>Story: {storyId} - {storyTitle}</Text>
        <Text>Phase: {phase}</Text>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        <Text bold>Changes:</Text>
        {changes.map((change, i) => (
          <Text key={i}>
            • {change.action} {change.path}
            {change.isNew && <Text dimColor> (new file)</Text>}
          </Text>
        ))}
      </Box>

      <Box>
        <Text color="green">[A]</Text><Text>pprove  </Text>
        <Text color="red">[R]</Text><Text>eject  </Text>
        <Text color="blue">[D]</Text><Text>etails  </Text>
        <Text color="gray">[S]</Text><Text>kip</Text>
      </Box>
    </Box>
  );
}
```

```tsx
// packages/tui/src/hooks/useApprovalGate.ts
import { useState, useCallback } from 'react';

interface ApprovalRequest {
  id: string;
  title: string;
  storyId: string;
  storyTitle: string;
  phase: string;
  changes: FileChange[];
}

interface ApprovalResult {
  approved: boolean;
  reason?: string;
  skipped?: boolean;
}

export function useApprovalGate() {
  const [pendingApproval, setPendingApproval] = useState<ApprovalRequest | null>(null);
  const [resolver, setResolver] = useState<((result: ApprovalResult) => void) | null>(null);

  const requestApproval = useCallback((request: ApprovalRequest): Promise<ApprovalResult> => {
    return new Promise((resolve) => {
      setPendingApproval(request);
      setResolver(() => resolve);
    });
  }, []);

  const approve = useCallback(() => {
    resolver?.({ approved: true });
    setPendingApproval(null);
    setResolver(null);
  }, [resolver]);

  const reject = useCallback((reason?: string) => {
    resolver?.({ approved: false, reason });
    setPendingApproval(null);
    setResolver(null);
  }, [resolver]);

  const skip = useCallback(() => {
    resolver?.({ approved: true, skipped: true });
    setPendingApproval(null);
    setResolver(null);
  }, [resolver]);

  return {
    pendingApproval,
    requestApproval,
    approve,
    reject,
    skip,
  };
}
```

## Testing Requirements

- [ ] Unit test: Approval prompt renders all elements
- [ ] Unit test: Keyboard shortcut A triggers approve
- [ ] Unit test: Keyboard shortcut R opens reject dialog
- [ ] Unit test: Keyboard shortcut D opens details view
- [ ] Unit test: Keyboard shortcut S triggers skip
- [ ] Unit test: Diff viewer navigates files
- [ ] Unit test: Reject dialog captures reason
- [ ] Integration test: Workflow pauses at approval gate
- [ ] Integration test: Approval continues workflow
- [ ] Integration test: Rejection stops workflow
- [ ] `npm test` passes
- [ ] `npm run build` succeeds

## Definition of Done

- [ ] Approval prompt displays with full context
- [ ] All keyboard shortcuts functional
- [ ] Detail view shows file diffs
- [ ] Reject dialog captures reason
- [ ] Integrates with workflow execution
- [ ] All tests pass
- [ ] `make verify` passes

## References

- S-0090: Human-in-the-Loop Approval Gates (interface definitions)
- Related: S-0106 (Workflow integration)
