---
id: S-0123
title: Copilot Provider Testing Infrastructure
priority: 5
status: backlog
type: feature
created: '2026-02-01'
labels:
  - provider-integration
  - copilot
  - testing
  - epic-copilot-integration
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
slug: copilot-testing-infrastructure
dependencies:
  - S-0122
---
# Copilot Provider Testing Infrastructure

## User Story

**As a** developer maintaining ai-sdlc
**I want** robust testing infrastructure for the Copilot provider
**So that** I can test Copilot integration without requiring a live subscription

## Summary

This story creates mock implementations of the Copilot CLI and session management for testing purposes. This enables comprehensive testing without requiring a GitHub Copilot subscription or live CLI process.

## Technical Context

**Current State:**
- No Copilot testing infrastructure
- Would require live subscription for testing

**Target State:**
- Mock Copilot CLI client
- Mock session for process simulation
- Recorded response playback
- Error scenario simulation

## Acceptance Criteria

### Mock Client

- [ ] Create `src/providers/copilot/testing/mock-client.ts`:
  - [ ] Simulates Copilot CLI responses
  - [ ] Configurable response patterns
  - [ ] Support for streaming simulation
  - [ ] Error injection capability

### Mock Session

- [ ] Create `src/providers/copilot/testing/mock-session.ts`:
  - [ ] Simulates CLI process lifecycle
  - [ ] Configurable startup/shutdown behavior
  - [ ] Event stream simulation

### Response Recording

- [ ] Record real Copilot responses for playback
- [ ] Store in `.ai-sdlc/fixtures/copilot/`
- [ ] Load fixtures during testing

### Test Helpers

- [ ] Factory functions for common test scenarios
- [ ] Assertion helpers for event streams
- [ ] Timeout simulation for slow responses

## Files to Create

| File | Purpose |
|------|---------|
| `src/providers/copilot/testing/mock-client.ts` | Mock CLI client |
| `src/providers/copilot/testing/mock-session.ts` | Mock process session |
| `src/providers/copilot/testing/index.ts` | Test utility exports |
| `src/providers/copilot/testing/fixtures.ts` | Fixture loading utilities |

## Implementation Specification

```typescript
// src/providers/copilot/testing/mock-client.ts

import { EventEmitter } from 'events';
import { CopilotEvent } from '../event-adapter.js';

export interface MockClientOptions {
  /** Delay between events in ms */
  eventDelay?: number;
  /** Simulate slow startup */
  startupDelay?: number;
  /** Inject error at event index */
  errorAtEvent?: number;
}

export class MockCopilotClient extends EventEmitter {
  private options: MockClientOptions;
  private events: CopilotEvent[] = [];
  private eventIndex = 0;

  constructor(options: MockClientOptions = {}) {
    super();
    this.options = {
      eventDelay: 50,
      startupDelay: 100,
      ...options,
    };
  }

  /**
   * Load events to be emitted
   */
  setEvents(events: CopilotEvent[]): void {
    this.events = events;
    this.eventIndex = 0;
  }

  /**
   * Simulate a query with streaming response
   */
  async *query(prompt: string): AsyncGenerator<CopilotEvent> {
    await this.delay(this.options.startupDelay!);

    for (const event of this.events) {
      if (this.options.errorAtEvent === this.eventIndex) {
        yield { type: 'error', error: 'Simulated error' };
        return;
      }

      await this.delay(this.options.eventDelay!);
      yield event;
      this.eventIndex++;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Create mock events for a simple response
 */
export function createMockResponse(content: string): CopilotEvent[] {
  const words = content.split(' ');
  const events: CopilotEvent[] = [];

  for (const word of words) {
    events.push({ type: 'message', content: word + ' ' });
  }

  events.push({ type: 'done' });
  return events;
}
```

```typescript
// src/providers/copilot/testing/mock-session.ts

import { EventEmitter } from 'events';
import { Readable, Writable } from 'stream';

export class MockCopilotSession extends EventEmitter {
  private _stdin: Writable;
  private _stdout: Readable;
  private _isRunning = false;
  private responses: string[] = [];
  private responseIndex = 0;

  constructor() {
    super();
    this._stdin = new Writable({
      write: (chunk, encoding, callback) => {
        this.handleInput(chunk.toString());
        callback();
      },
    });
    this._stdout = new Readable({
      read() {},
    });
  }

  get stdin(): Writable {
    return this._stdin;
  }

  get stdout(): Readable {
    return this._stdout;
  }

  get isRunning(): boolean {
    return this._isRunning;
  }

  /**
   * Queue responses to be sent when input is received
   */
  queueResponses(responses: string[]): void {
    this.responses = responses;
    this.responseIndex = 0;
  }

  async start(): Promise<void> {
    this._isRunning = true;
    this.emit('ready');
  }

  async stop(): Promise<void> {
    this._isRunning = false;
    this.emit('exit', { code: 0, signal: null });
  }

  private handleInput(input: string): void {
    if (this.responseIndex < this.responses.length) {
      const response = this.responses[this.responseIndex++];
      this._stdout.push(response + '\n');
    }
  }
}
```

## Testing Requirements

- [ ] Unit test: Mock client event emission
- [ ] Unit test: Mock client error injection
- [ ] Unit test: Mock session stdin/stdout
- [ ] Unit test: Fixture loading
- [ ] Integration test: CopilotProvider with mock infrastructure
- [ ] `npm test` passes
- [ ] `npm run build` succeeds

## Definition of Done

- [ ] Mock client fully implemented
- [ ] Mock session fully implemented
- [ ] Fixture loading utilities working
- [ ] All CopilotProvider tests use mock infrastructure
- [ ] Test helpers documented
- [ ] `make verify` passes

## References

- Node.js Streams: https://nodejs.org/api/stream.html
- Testing patterns: `docs/testing.md`
- Depends on: S-0122 (CopilotProvider)
