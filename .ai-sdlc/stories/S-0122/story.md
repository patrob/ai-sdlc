---
id: S-0122
title: CopilotProvider Implementation
priority: 4
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
slug: copilot-provider-implementation
dependencies:
  - S-0078
  - S-0079
  - S-0119
  - S-0120
  - S-0121
---
# CopilotProvider Implementation

## User Story

**As a** developer using ai-sdlc
**I want** a GitHub Copilot provider implementation
**So that** I can run SDLC agents using Copilot instead of Claude or OpenAI

## Summary

This story implements the core `CopilotProvider` class that integrates GitHub Copilot CLI with ai-sdlc's provider abstraction. It orchestrates the process manager, event adapter, and authenticator to provide a unified provider interface.

## Technical Context

**Current State:**
- Process manager exists (S-0119)
- Event adapter exists (S-0120)
- Authenticator exists (S-0121)

**Target State:**
- Full `CopilotProvider` implementing `IProvider`
- Query execution via Copilot CLI
- Streaming progress events
- Registered with `ProviderRegistry`

> **Note**: GitHub Copilot SDK is in Technical Preview (Jan 2026). API may change.

## Acceptance Criteria

### CopilotProvider Class

- [ ] Create `src/providers/copilot/copilot-provider.ts` implementing `IProvider`:
  - [ ] `name` property returns 'copilot'
  - [ ] `capabilities` returns Copilot-specific capabilities
  - [ ] `query()` executes prompts via Copilot CLI
  - [ ] `validateConfiguration()` checks subscription and connectivity
  - [ ] `getAuthenticator()` returns `CopilotAuthenticator`

### Query Execution

- [ ] Spawn Copilot CLI process (or reuse existing)
- [ ] Send prompt via stdin
- [ ] Parse response stream via EventAdapter
- [ ] Return accumulated response text

### Streaming Support

- [ ] Emit `ProviderProgressEvent` as events arrive
- [ ] Support `onProgress` callback in options
- [ ] Handle long-running queries

### Lifecycle Management

- [ ] Lazy process startup (spawn on first query)
- [ ] Keep process alive for multiple queries
- [ ] Graceful shutdown on provider disposal

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/providers/copilot/copilot-provider.ts` | Create | Main provider implementation |
| `src/providers/copilot/index.ts` | Create | Barrel exports |
| `src/providers/index.ts` | Modify | Export Copilot provider |

## Implementation Specification

```typescript
// src/providers/copilot/copilot-provider.ts

import { IProvider, ProviderCapabilities, ProviderQueryOptions } from '../types.js';
import { CopilotAuthenticator } from './copilot-authenticator.js';
import { CopilotProcessManager } from './process-manager.js';
import { CopilotEventAdapter } from './event-adapter.js';

export class CopilotProvider implements IProvider {
  readonly name = 'copilot';
  private processManager: CopilotProcessManager | null = null;
  private eventAdapter: CopilotEventAdapter;
  private authenticator: CopilotAuthenticator;

  readonly capabilities: ProviderCapabilities = {
    supportsStreaming: true,
    supportsTools: true,
    supportsSystemPrompt: true,
    supportsMultiTurn: true,
    maxContextTokens: 100000, // Estimate for Copilot
    supportedModels: ['copilot-gpt-4'], // Copilot's underlying model
  };

  constructor() {
    this.eventAdapter = new CopilotEventAdapter();
    this.authenticator = new CopilotAuthenticator();
  }

  async query(options: ProviderQueryOptions): Promise<string> {
    await this.ensureProcess();

    const stdin = this.processManager!.getStdin();
    const stdout = this.processManager!.getStdout();

    if (!stdin || !stdout) {
      throw new Error('Copilot CLI process not ready');
    }

    // Send query
    const request = JSON.stringify({
      type: 'query',
      prompt: options.prompt,
      systemPrompt: options.systemPrompt,
      workingDirectory: options.workingDirectory,
    });
    stdin.write(request + '\n');

    // Collect response
    let response = '';
    for await (const event of this.eventAdapter.parseStream(stdout)) {
      options.onProgress?.(event);

      if (event.type === 'message') {
        response += event.content;
      }

      if (event.type === 'completion' || event.type === 'error') {
        break;
      }
    }

    return response;
  }

  async validateConfiguration(): Promise<boolean> {
    return this.authenticator.validateCredentials();
  }

  getAuthenticator(): CopilotAuthenticator {
    return this.authenticator;
  }

  async dispose(): Promise<void> {
    if (this.processManager) {
      await this.processManager.terminate();
      this.processManager = null;
    }
  }

  private async ensureProcess(): Promise<void> {
    if (this.processManager?.isRunning()) {
      return;
    }

    this.processManager = new CopilotProcessManager({
      command: 'gh',
      args: ['copilot', 'suggest', '--mode', 'sdk'],
      autoRestart: true,
    });

    await this.processManager.spawn();
  }
}
```

## Testing Requirements

- [ ] Unit test: Provider instantiation
- [ ] Unit test: `query()` with mocked process manager
- [ ] Unit test: Streaming with progress callbacks
- [ ] Unit test: Process lifecycle management
- [ ] Unit test: `dispose()` cleanup
- [ ] Integration test: Real Copilot CLI (optional, requires subscription)
- [ ] `npm test` passes
- [ ] `npm run build` succeeds

## Definition of Done

- [ ] `CopilotProvider` class fully implemented
- [ ] Process lifecycle properly managed
- [ ] Streaming support working
- [ ] Registered with `ProviderRegistry`
- [ ] Unit tests with mocked dependencies
- [ ] `make verify` passes

## References

- GitHub Copilot CLI: https://docs.github.com/en/copilot/github-copilot-in-the-cli
- Depends on: S-0078, S-0079, S-0119, S-0120, S-0121
