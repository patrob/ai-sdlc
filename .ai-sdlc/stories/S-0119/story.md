---
id: S-0119
title: Copilot CLI Process Lifecycle Manager
priority: 1
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
slug: copilot-process-manager
dependencies:
  - S-0078
---
# Copilot CLI Process Lifecycle Manager

## User Story

**As a** developer using ai-sdlc with GitHub Copilot
**I want** reliable management of the Copilot CLI process
**So that** the integration is stable and handles process lifecycle correctly

## Summary

This story implements the process manager for the GitHub Copilot CLI (`gh copilot`), handling spawning, monitoring, and termination of the CLI process. The Copilot SDK operates via CLI subprocess, requiring careful lifecycle management.

## Technical Context

**Current State:**
- No Copilot integration
- No subprocess management for CLI-based providers

**Target State:**
- Process spawning and monitoring
- Graceful shutdown handling
- Restart on unexpected termination
- Health check implementation

> **Note**: GitHub Copilot SDK is in Technical Preview (Jan 2026). API may change.

## Acceptance Criteria

### ProcessManager Class

- [ ] Create `src/providers/copilot/process-manager.ts` with:
  - [ ] `spawn()` - Start the Copilot CLI process
  - [ ] `terminate()` - Gracefully stop the process
  - [ ] `isRunning()` - Check if process is alive
  - [ ] `restart()` - Terminate and respawn
  - [ ] `onExit(callback)` - Register exit handler

### Process Spawning

- [ ] Use Node.js `child_process.spawn`
- [ ] Configure stdin/stdout for communication
- [ ] Set appropriate environment variables
- [ ] Handle spawn errors gracefully

### Health Monitoring

- [ ] Monitor process for unexpected exits
- [ ] Implement heartbeat/ping mechanism
- [ ] Auto-restart on crash (configurable)
- [ ] Maximum restart attempts before failure

### Graceful Shutdown

- [ ] Send SIGTERM first, then SIGKILL if needed
- [ ] Wait for pending operations to complete
- [ ] Clean up resources on exit
- [ ] Handle signals (SIGINT, SIGTERM) in parent process

## Files to Create

| File | Purpose |
|------|---------|
| `src/providers/copilot/process-manager.ts` | Process lifecycle management |

## Implementation Specification

```typescript
// src/providers/copilot/process-manager.ts

import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';

export interface ProcessManagerOptions {
  /** Command to run */
  command: string;
  /** Command arguments */
  args: string[];
  /** Auto-restart on crash */
  autoRestart?: boolean;
  /** Maximum restart attempts */
  maxRestarts?: number;
  /** Restart delay in ms */
  restartDelay?: number;
}

export class CopilotProcessManager extends EventEmitter {
  private process: ChildProcess | null = null;
  private restartCount = 0;
  private options: Required<ProcessManagerOptions>;

  constructor(options: ProcessManagerOptions) {
    super();
    this.options = {
      autoRestart: true,
      maxRestarts: 3,
      restartDelay: 1000,
      ...options,
    };
  }

  async spawn(): Promise<void> {
    if (this.process) {
      throw new Error('Process already running');
    }

    this.process = spawn(this.options.command, this.options.args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, COPILOT_CLI_MODE: 'sdk' },
    });

    this.process.on('exit', (code, signal) => {
      this.handleExit(code, signal);
    });

    this.process.on('error', (error) => {
      this.emit('error', error);
    });

    await this.waitForReady();
  }

  async terminate(): Promise<void> {
    if (!this.process) return;

    return new Promise((resolve) => {
      this.process!.once('exit', () => {
        this.process = null;
        resolve();
      });

      this.process!.kill('SIGTERM');

      // Force kill after timeout
      setTimeout(() => {
        if (this.process) {
          this.process.kill('SIGKILL');
        }
      }, 5000);
    });
  }

  isRunning(): boolean {
    return this.process !== null && !this.process.killed;
  }

  getStdin(): NodeJS.WritableStream | null {
    return this.process?.stdin || null;
  }

  getStdout(): NodeJS.ReadableStream | null {
    return this.process?.stdout || null;
  }

  private async waitForReady(): Promise<void> {
    // Wait for initial ready signal from Copilot CLI
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Copilot CLI startup timeout'));
      }, 30000);

      this.once('ready', () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  }

  private handleExit(code: number | null, signal: NodeJS.Signals | null): void {
    this.process = null;
    this.emit('exit', { code, signal });

    if (this.options.autoRestart && this.restartCount < this.options.maxRestarts) {
      this.restartCount++;
      setTimeout(() => this.spawn(), this.options.restartDelay);
    }
  }
}
```

## Testing Requirements

- [ ] Unit test: Process spawning
- [ ] Unit test: Graceful termination
- [ ] Unit test: Auto-restart on crash
- [ ] Unit test: Max restart limit
- [ ] Unit test: Exit event handling
- [ ] `npm test` passes
- [ ] `npm run build` succeeds

## Definition of Done

- [ ] `CopilotProcessManager` class implemented
- [ ] Process lifecycle fully managed
- [ ] Health monitoring working
- [ ] Error handling complete
- [ ] Unit tests with mocked child_process
- [ ] `make verify` passes

## References

- Node.js child_process: https://nodejs.org/api/child_process.html
- GitHub Copilot CLI: https://docs.github.com/en/copilot/github-copilot-in-the-cli
- Depends on: S-0078 (IProvider interface)
