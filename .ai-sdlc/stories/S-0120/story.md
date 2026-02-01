---
id: S-0120
title: Copilot Event Stream Adapter
priority: 2
status: backlog
type: feature
created: '2026-02-01'
labels:
  - provider-integration
  - copilot
  - epic-copilot-integration
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
slug: copilot-event-adapter
dependencies:
  - S-0078
  - S-0119
---
# Copilot Event Stream Adapter

## User Story

**As a** developer using ai-sdlc with GitHub Copilot
**I want** Copilot's event stream parsed into standard progress events
**So that** the UI can display consistent progress regardless of provider

## Summary

This story implements the event stream adapter that parses the Copilot CLI's output stream and translates events into `ProviderProgressEvent` format. This enables consistent progress reporting across all providers.

## Technical Context

**Current State:**
- No Copilot event parsing
- Progress events specific to Claude format

**Target State:**
- Parse Copilot CLI stdout/stderr streams
- Map Copilot events to `ProviderProgressEvent`
- Handle streaming text output
- Support tool use events

> **Note**: GitHub Copilot SDK is in Technical Preview (Jan 2026). Event format may change.

## Acceptance Criteria

### EventAdapter Class

- [ ] Create `src/providers/copilot/event-adapter.ts` with:
  - [ ] `parseStream(readable: Readable)` - Async iterator for events
  - [ ] `parseEvent(line: string)` - Parse single event line
  - [ ] `toProgressEvent(copilotEvent)` - Map to standard format

### Event Type Mapping

- [ ] Map Copilot `message` events → `message` progress events
- [ ] Map Copilot `suggestion` events → `message` progress events
- [ ] Map Copilot `action` events → `tool_start` / `tool_end`
- [ ] Map Copilot `error` events → `error` progress events
- [ ] Map Copilot `done` events → `completion` progress events

### Stream Processing

- [ ] Handle line-delimited JSON (NDJSON) format
- [ ] Handle partial lines across chunks
- [ ] Buffer incomplete messages
- [ ] Emit events as they arrive (no batching)

### Error Handling

- [ ] Invalid JSON handling
- [ ] Unknown event type logging
- [ ] Stream errors propagation

## Files to Create

| File | Purpose |
|------|---------|
| `src/providers/copilot/event-adapter.ts` | Stream parsing and event mapping |

## Implementation Specification

```typescript
// src/providers/copilot/event-adapter.ts

import { Readable } from 'stream';
import { ProviderProgressEvent } from '../types.js';

export interface CopilotEvent {
  type: 'message' | 'suggestion' | 'action' | 'action_result' | 'error' | 'done';
  content?: string;
  action?: string;
  arguments?: Record<string, unknown>;
  result?: unknown;
  error?: string;
}

export class CopilotEventAdapter {
  private buffer = '';

  /**
   * Parse a stream of Copilot events into progress events
   */
  async *parseStream(readable: Readable): AsyncGenerator<ProviderProgressEvent> {
    for await (const chunk of readable) {
      this.buffer += chunk.toString();
      const lines = this.buffer.split('\n');
      this.buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.trim()) {
          const event = this.parseEvent(line);
          if (event) {
            yield this.toProgressEvent(event);
          }
        }
      }
    }

    // Process any remaining buffer
    if (this.buffer.trim()) {
      const event = this.parseEvent(this.buffer);
      if (event) {
        yield this.toProgressEvent(event);
      }
    }
  }

  /**
   * Parse a single line into a Copilot event
   */
  parseEvent(line: string): CopilotEvent | null {
    try {
      return JSON.parse(line) as CopilotEvent;
    } catch {
      console.warn('Failed to parse Copilot event:', line);
      return null;
    }
  }

  /**
   * Convert Copilot event to standard progress event
   */
  toProgressEvent(event: CopilotEvent): ProviderProgressEvent {
    switch (event.type) {
      case 'message':
      case 'suggestion':
        return { type: 'message', content: event.content || '' };

      case 'action':
        return {
          type: 'tool_start',
          toolName: event.action || 'unknown',
          input: event.arguments,
        };

      case 'action_result':
        return {
          type: 'tool_end',
          toolName: event.action || 'unknown',
          result: event.result,
        };

      case 'error':
        return { type: 'error', message: event.error || 'Unknown error' };

      case 'done':
        return { type: 'completion' };

      default:
        console.warn('Unknown Copilot event type:', event.type);
        return { type: 'message', content: '' };
    }
  }
}
```

## Testing Requirements

- [ ] Unit test: Single event parsing
- [ ] Unit test: Stream parsing with multiple events
- [ ] Unit test: Partial line buffering
- [ ] Unit test: Event type mapping (all types)
- [ ] Unit test: Invalid JSON handling
- [ ] `npm test` passes
- [ ] `npm run build` succeeds

## Definition of Done

- [ ] `CopilotEventAdapter` class implemented
- [ ] All event types mapped correctly
- [ ] Stream parsing handles edge cases
- [ ] Error handling for malformed input
- [ ] Unit tests with full coverage
- [ ] `make verify` passes

## References

- Node.js Streams: https://nodejs.org/api/stream.html
- NDJSON Format: http://ndjson.org/
- Depends on: S-0078, S-0119
