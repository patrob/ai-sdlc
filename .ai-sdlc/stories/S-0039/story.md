---
id: S-0039
title: IPC Status Protocol
priority: 4
status: backlog
type: feature
created: '2026-01-15'
labels:
  - concurrent-workflows
  - phase-3
  - infrastructure
epic: concurrent-workflows
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
slug: ipc-status-protocol
---
# IPC Status Protocol

## User Story

**As a** developer using the concurrent orchestrator,
**I want** structured status updates from child agents,
**So that** the dashboard can display accurate, real-time progress.

## Summary

Defines the inter-process communication protocol between the orchestrator (parent) and agent executors (children). This protocol enables status updates, progress reporting, and error communication.

## Context

This is the second story in **Phase 3: Orchestrated Concurrency** of the Concurrent Workflows epic.

**Depends on:** S-0038 (Multi-Process Orchestrator)
**Blocks:** S-0041 (Terminal Dashboard)

**Reference:** `docs/ROADMAP_TO_CONCURRENT_WORK.md` (Section 9, Open Questions - IPC Protocol)

## Acceptance Criteria

- [ ] Define TypeScript types for all IPC messages
- [ ] Support status updates (phase, progress percentage, current action)
- [ ] Support error reporting with structured error info
- [ ] Support heartbeat messages for health monitoring
- [ ] Support log streaming from child to parent
- [ ] Message validation to prevent malformed messages
- [ ] Tests verify message serialization/deserialization
- [ ] All existing tests pass (`npm test`)
- [ ] TypeScript compilation succeeds (`npm run build`)

## Technical Notes

### Message Types

```typescript
// Base message structure
interface IPCMessageBase {
  type: string;
  timestamp: number;
  storyId: string;
}

// Status update from agent
interface IPCStatusMessage extends IPCMessageBase {
  type: 'status';
  payload: {
    phase: 'research' | 'plan' | 'implement' | 'review' | 'complete' | 'error';
    action?: string;  // Current action description
    progress: number; // 0-100
    retryCount?: number;
  };
}

// Log message from agent
interface IPCLogMessage extends IPCMessageBase {
  type: 'log';
  payload: {
    level: 'debug' | 'info' | 'warn' | 'error';
    message: string;
    context?: Record<string, unknown>;
  };
}

// Error message from agent
interface IPCErrorMessage extends IPCMessageBase {
  type: 'error';
  payload: {
    code: string;
    message: string;
    stack?: string;
    recoverable: boolean;
  };
}

// Heartbeat for health monitoring
interface IPCHeartbeatMessage extends IPCMessageBase {
  type: 'heartbeat';
  payload: {
    memoryUsage: number;
    cpuTime: number;
  };
}

// Request from parent to child
interface IPCCommandMessage extends IPCMessageBase {
  type: 'command';
  payload: {
    action: 'pause' | 'resume' | 'cancel' | 'status';
  };
}

// Union type for all messages
type IPCMessage =
  | IPCStatusMessage
  | IPCLogMessage
  | IPCErrorMessage
  | IPCHeartbeatMessage
  | IPCCommandMessage;
```

### Protocol Implementation

```typescript
// src/core/ipc-protocol.ts

class IPCProtocol {
  // Send message from child to parent
  static sendToParent(message: Omit<IPCMessage, 'timestamp'>): void {
    if (!process.send) {
      console.warn('Not running as child process, IPC unavailable');
      return;
    }

    const fullMessage: IPCMessage = {
      ...message,
      timestamp: Date.now()
    };

    // Validate before sending
    if (!this.validate(fullMessage)) {
      throw new Error(`Invalid IPC message: ${JSON.stringify(message)}`);
    }

    process.send(fullMessage);
  }

  // Send status update (convenience method)
  static sendStatus(
    storyId: string,
    phase: IPCStatusMessage['payload']['phase'],
    progress: number,
    action?: string
  ): void {
    this.sendToParent({
      type: 'status',
      storyId,
      payload: { phase, progress, action }
    });
  }

  // Send error (convenience method)
  static sendError(
    storyId: string,
    error: Error,
    recoverable: boolean = false
  ): void {
    this.sendToParent({
      type: 'error',
      storyId,
      payload: {
        code: error.name,
        message: error.message,
        stack: error.stack,
        recoverable
      }
    });
  }

  // Validate message structure
  static validate(message: unknown): message is IPCMessage {
    if (!message || typeof message !== 'object') return false;
    const msg = message as Record<string, unknown>;

    // Check required fields
    if (typeof msg.type !== 'string') return false;
    if (typeof msg.timestamp !== 'number') return false;
    if (typeof msg.storyId !== 'string') return false;

    // Type-specific validation
    switch (msg.type) {
      case 'status':
        return this.validateStatusPayload(msg.payload);
      case 'log':
        return this.validateLogPayload(msg.payload);
      case 'error':
        return this.validateErrorPayload(msg.payload);
      case 'heartbeat':
        return this.validateHeartbeatPayload(msg.payload);
      case 'command':
        return this.validateCommandPayload(msg.payload);
      default:
        return false;
    }
  }

  private static validateStatusPayload(payload: unknown): boolean {
    if (!payload || typeof payload !== 'object') return false;
    const p = payload as Record<string, unknown>;
    const validPhases = ['research', 'plan', 'implement', 'review', 'complete', 'error'];
    return validPhases.includes(p.phase as string) &&
           typeof p.progress === 'number' &&
           p.progress >= 0 && p.progress <= 100;
  }

  // ... other validation methods
}
```

### Parent-Side Handler

```typescript
// In orchestrator
child.on('message', (msg: unknown) => {
  if (!IPCProtocol.validate(msg)) {
    console.warn(`Invalid IPC message from ${storyId}:`, msg);
    return;
  }

  switch (msg.type) {
    case 'status':
      this.handleStatus(msg);
      break;
    case 'log':
      this.handleLog(msg);
      break;
    case 'error':
      this.handleError(msg);
      break;
    case 'heartbeat':
      this.handleHeartbeat(msg);
      break;
  }
});
```

### Files to Create/Modify

- `src/core/ipc-protocol.ts` - New protocol implementation
- `src/types/ipc.ts` - IPC message types
- `src/core/orchestrator.ts` - Integrate protocol
- `src/core/agent-executor.ts` - Use protocol for sending

## Edge Cases

1. **Malformed message**: Log warning, ignore message
2. **Message flood**: Rate limit status updates (max 10/second)
3. **Large payloads**: Truncate log messages > 10KB
4. **Unicode in messages**: Ensure proper encoding
5. **Lost messages**: IPC is reliable within process, but handle missing heartbeats

## Definition of Done

- [ ] Code review completed
- [ ] All tests passing (`npm test` shows 0 failures)
- [ ] TypeScript compilation succeeds (`npm run build`)
- [ ] All message types validated correctly
- [ ] Convenience methods work as expected
- [ ] Protocol handles edge cases gracefully

---

**Effort:** small
**Dependencies:** S-0038
**Blocks:** S-0041
