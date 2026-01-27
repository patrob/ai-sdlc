/**
 * Multi-Process Orchestrator
 *
 * Manages concurrent execution of multiple stories via isolated child processes.
 * Each story runs in its own git worktree with its own Node.js process.
 *
 * Key Features:
 * - Spawns child processes with concurrency limiting
 * - IPC communication for status updates and health checks
 * - Graceful shutdown with SIGTERM → SIGKILL fallback
 * - Error isolation (child crash doesn't affect parent or siblings)
 * - Worktree lifecycle management
 */

import { spawn } from 'child_process';
import path from 'path';
import type {
  ProcessOrchestratorOptions,
  ProcessExecutionResult,
  ChildProcessInfo,
  Story,
} from '../types/index.js';
import { GitWorktreeService } from './worktree.js';
import { ProcessManager } from './process-manager.js';
import { getSdlcRoot } from './config.js';

/**
 * Multi-Process Orchestrator
 *
 * Coordinates concurrent story execution across isolated child processes.
 * Uses a manual queue pattern (similar to epic-processor) for concurrency control.
 */
export class Orchestrator {
  private children: Map<string, ChildProcessInfo> = new Map();
  private results: ProcessExecutionResult[] = [];
  private shuttingDown = false;
  private worktreeService: GitWorktreeService;
  private processManager: ProcessManager;

  constructor(private options: ProcessOrchestratorOptions) {
    const sdlcRoot = getSdlcRoot();
    const worktreeBasePath = options.worktreeBasePath || path.join(sdlcRoot, '.ai-sdlc', 'worktrees');
    this.worktreeService = new GitWorktreeService(sdlcRoot, worktreeBasePath);
    this.processManager = ProcessManager.getInstance();
  }

  /**
   * Execute multiple stories concurrently with concurrency limiting
   */
  async execute(stories: Story[]): Promise<ProcessExecutionResult[]> {
    if (stories.length === 0) {
      return [];
    }

    console.log(`🚀 Starting orchestrator with ${stories.length} stories (concurrency: ${this.options.concurrency})`);

    // Setup graceful shutdown handlers
    this.setupShutdownHandlers();

    try {
      // Use manual queue pattern (same as epic-processor)
      const queue = [...stories];
      const active = new Set<Promise<ProcessExecutionResult>>();

      while (queue.length > 0 || active.size > 0) {
        // Fill up to maxConcurrent
        while (active.size < this.options.concurrency && queue.length > 0 && !this.shuttingDown) {
          const story = queue.shift()!;
          const promise = this.executeStory(story);

          active.add(promise);

          // Remove from active when done
          promise.finally(() => active.delete(promise));
        }

        if (active.size > 0) {
          // Wait for at least one to complete
          const result = await Promise.race(active);
          this.results.push(result);

          // If shutdown requested, cancel queued stories
          if (this.shuttingDown) {
            console.log(`⚠️  Shutdown in progress, canceling ${queue.length} queued stories`);
            break;
          }
        }
      }

      // Wait for all active processes to complete
      if (active.size > 0) {
        const remaining = await Promise.all(active);
        this.results.push(...remaining);
      }

      return this.results;
    } finally {
      await this.cleanup();
    }
  }

  /**
   * Execute a single story in an isolated child process
   */
  private async executeStory(story: Story): Promise<ProcessExecutionResult> {
    const storyId = story.frontmatter.id;
    const startTime = Date.now();

    try {
      // Create worktree for story
      const slug = this.generateSlug(story.frontmatter.title || storyId);
      const worktreePath = this.worktreeService.getWorktreePath(storyId, slug);

      console.log(`📝 [${storyId}] Creating worktree: ${worktreePath}`);

      try {
        this.worktreeService.create({
          storyId,
          slug,
          baseBranch: 'main',
        });
      } catch (error) {
        // Worktree creation failure - skip story
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`❌ [${storyId}] Worktree creation failed: ${errorMsg}`);
        return {
          storyId,
          success: false,
          exitCode: null,
          signal: null,
          duration: Date.now() - startTime,
          error: `Worktree creation failed: ${errorMsg}`,
        };
      }

      // Spawn child process
      const result = await this.spawnChild(storyId, worktreePath, startTime);

      // Cleanup worktree if not keeping
      if (!this.options.keepWorktrees) {
        try {
          this.worktreeService.remove(worktreePath, false);
        } catch (cleanupError) {
          console.warn(`⚠️  [${storyId}] Failed to cleanup worktree: ${cleanupError}`);
        }
      }

      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`❌ [${storyId}] Execution failed: ${errorMsg}`);
      return {
        storyId,
        success: false,
        exitCode: null,
        signal: null,
        duration: Date.now() - startTime,
        error: errorMsg,
      };
    }
  }

  /**
   * Spawn child process for story execution
   */
  private async spawnChild(
    storyId: string,
    worktreePath: string,
    startTime: number
  ): Promise<ProcessExecutionResult> {
    return new Promise((resolve) => {
      // Spawn ai-sdlc run process in worktree
      // Use the same invocation method as the current process (handles global install, npx, or dev mode)
      // Use --no-worktree since we're already in an isolated worktree
      const proc = spawn(
        process.execPath,
        [process.argv[1], 'run', '--story', storyId, '--auto', '--no-worktree'],
        {
          cwd: worktreePath,
          stdio: ['ignore', 'pipe', 'pipe'], // No IPC needed for this pattern
          shell: false,
          env: {
            ...process.env,
            AI_SDLC_STORY_ID: storyId,
          },
        }
      );

      // Track child process
      if (proc.pid) {
        this.children.set(storyId, {
          storyId,
          pid: proc.pid,
          worktreePath,
          startTime,
        });
        this.processManager.registerChild(proc);
      }

      // Capture stdout/stderr
      let stdout = '';
      let stderr = '';

      proc.stdout?.on('data', (data) => {
        stdout += data.toString();
        // Echo to parent console with prefix
        const lines = data.toString().split('\n').filter((l: string) => l.trim());
        lines.forEach((line: string) => console.log(`  [${storyId}] ${line}`));
      });

      proc.stderr?.on('data', (data) => {
        stderr += data.toString();
        // Echo to parent console with prefix
        const lines = data.toString().split('\n').filter((l: string) => l.trim());
        lines.forEach((line: string) => console.error(`  [${storyId}] ${line}`));
      });

      // Handle process exit
      proc.on('close', (code, signal) => {
        this.children.delete(storyId);

        const duration = Date.now() - startTime;
        const success = code === 0;

        if (success) {
          console.log(`✅ [${storyId}] Completed successfully (${duration}ms)`);
        } else {
          console.error(`❌ [${storyId}] Failed with code ${code} (${duration}ms)`);
        }

        resolve({
          storyId,
          success,
          exitCode: code,
          signal,
          duration,
          error: success ? undefined : stderr || `Process exited with code ${code}`,
        });
      });

      // Handle spawn errors
      proc.on('error', (err) => {
        this.children.delete(storyId);
        console.error(`❌ [${storyId}] Process error: ${err.message}`);

        resolve({
          storyId,
          success: false,
          exitCode: null,
          signal: null,
          duration: Date.now() - startTime,
          error: err.message,
        });
      });
    });
  }

  /**
   * Setup graceful shutdown handlers
   */
  private setupShutdownHandlers(): void {
    const shutdown = async (signal: string) => {
      if (this.shuttingDown) return;

      console.log(`\n⚠️  Received ${signal}, shutting down orchestrator...`);
      this.shuttingDown = true;

      await this.shutdown();
      process.exit(0);
    };

    process.once('SIGINT', () => shutdown('SIGINT'));
    process.once('SIGTERM', () => shutdown('SIGTERM'));
  }

  /**
   * Graceful shutdown: SIGTERM → wait → SIGKILL
   */
  async shutdown(): Promise<void> {
    if (this.children.size === 0) return;

    console.log(`⏳ Shutting down ${this.children.size} child processes...`);

    const shutdownTimeout = this.options.shutdownTimeout || 10000;

    // Send SIGTERM to all children
    for (const [storyId, info] of this.children.entries()) {
      try {
        process.kill(info.pid, 'SIGTERM');
        console.log(`  [${storyId}] Sent SIGTERM`);
      } catch (error) {
        // Process may already be dead
      }
    }

    // Wait for graceful shutdown
    const waitStart = Date.now();
    const checkInterval = 100;

    while (this.children.size > 0 && Date.now() - waitStart < shutdownTimeout) {
      await new Promise((resolve) => setTimeout(resolve, checkInterval));
    }

    // Force kill remaining processes
    if (this.children.size > 0) {
      console.warn(`⚠️  Force killing ${this.children.size} unresponsive processes`);
      for (const [storyId, info] of this.children.entries()) {
        try {
          process.kill(info.pid, 'SIGKILL');
          console.log(`  [${storyId}] Sent SIGKILL`);
        } catch (error) {
          // Process may already be dead
        }
      }
      this.children.clear();
    }

    console.log('✅ All child processes terminated');
  }

  /**
   * Cleanup resources
   */
  private async cleanup(): Promise<void> {
    // Ensure all children are terminated
    if (this.children.size > 0) {
      await this.shutdown();
    }
  }

  /**
   * Generate URL-safe slug from title
   */
  private generateSlug(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 50);
  }

  /**
   * Get current execution results
   */
  getResults(): ProcessExecutionResult[] {
    return [...this.results];
  }

  /**
   * Get count of active child processes
   */
  getActiveCount(): number {
    return this.children.size;
  }
}
