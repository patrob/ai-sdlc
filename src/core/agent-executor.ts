#!/usr/bin/env node
/**
 * Agent Executor - Child process entry point for concurrent story execution
 *
 * This script is spawned as a child process by the orchestrator to execute
 * a single story in isolation. It runs in its own worktree and communicates
 * with the parent process via IPC.
 *
 * Usage: node agent-executor.js <storyId>
 * Environment: AI_SDLC_STORY_ID must be set
 */

import type { IPCMessage } from '../types/index.js';

/**
 * Send IPC message to parent process
 */
function sendToParent(message: IPCMessage): void {
  if (process.send) {
    process.send(message);
  }
}

/**
 * Send status update to parent
 */
function sendStatus(storyId: string, status: string, progress?: number): void {
  sendToParent({
    type: 'status_update',
    storyId,
    timestamp: Date.now(),
    payload: { progress },
  });
}

/**
 * Send error report to parent
 */
function sendError(storyId: string, error: string): void {
  sendToParent({
    type: 'error',
    storyId,
    timestamp: Date.now(),
    payload: { error },
  });
}

/**
 * Send completion message to parent
 */
function sendComplete(storyId: string, success: boolean, exitCode: number): void {
  sendToParent({
    type: 'complete',
    storyId,
    timestamp: Date.now(),
    payload: {
      result: {
        storyId,
        success,
        exitCode,
        signal: null,
        duration: Date.now() - startTime,
      },
    },
  });
}

/**
 * Handle IPC messages from parent
 */
function setupIPCHandlers(storyId: string): void {
  process.on('message', (msg: unknown) => {
    if (!msg || typeof msg !== 'object') return;

    const message = msg as IPCMessage;

    switch (message.type) {
      case 'health_check':
        // Respond to health check
        sendToParent({
          type: 'health_response',
          storyId,
          timestamp: Date.now(),
        });
        break;

      case 'shutdown':
        // Graceful shutdown requested
        console.log(`[${storyId}] Received shutdown signal, exiting...`);
        process.exit(0);
        break;
    }
  });
}

/**
 * Handle graceful shutdown on SIGTERM
 */
function setupShutdownHandlers(storyId: string): void {
  const shutdown = (signal: string) => {
    console.log(`[${storyId}] Received ${signal}, shutting down gracefully...`);
    sendToParent({
      type: 'shutdown',
      storyId,
      timestamp: Date.now(),
    });
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

// Track execution start time
const startTime = Date.now();

/**
 * Main entry point
 */
async function main(): Promise<void> {
  // Get story ID from arguments or environment
  const storyId = process.argv[2] || process.env.AI_SDLC_STORY_ID;

  if (!storyId) {
    console.error('Error: Story ID not provided');
    console.error('Usage: node agent-executor.js <storyId>');
    console.error('Or set AI_SDLC_STORY_ID environment variable');
    process.exit(1);
  }

  // Setup IPC and shutdown handlers
  setupIPCHandlers(storyId);
  setupShutdownHandlers(storyId);

  console.log(`[${storyId}] Agent executor started in worktree: ${process.cwd()}`);
  sendStatus(storyId, 'starting');

  try {
    // Import and execute the run command
    // This reuses the existing single-story execution logic
    const { run } = await import('../cli/commands.js');

    sendStatus(storyId, 'running');

    // Execute the story with auto mode and no-worktree flag
    // (since we're already in an isolated worktree)
    const result = await run({
      story: storyId,
      auto: true,
      worktree: false, // --no-worktree: already in a worktree
    });

    // Check execution result
    if (result.success) {
      console.log(`[${storyId}] Story execution completed successfully`);
      sendComplete(storyId, true, 0);
      process.exit(0);
    } else {
      console.log(`[${storyId}] Story execution failed`);
      sendComplete(storyId, false, 1);
      process.exit(1);
    }
  } catch (error) {
    // Execution failed
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[${storyId}] Story execution failed:`, errorMsg);
    sendError(storyId, errorMsg);
    sendComplete(storyId, false, 1);
    process.exit(1);
  }
}

// Run main with error handling
main().catch((error) => {
  console.error('Fatal error in agent executor:', error);
  process.exit(1);
});
