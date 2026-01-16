import chokidar, { FSWatcher } from 'chokidar';
import path from 'path';
import { getSdlcRoot, loadConfig } from '../core/config.js';
import { getLogger } from '../core/logger.js';
import { assessState } from '../core/kanban.js';
import { parseStory, getStory } from '../core/story.js';
import { getThemedChalk } from '../core/theme.js';
import { runRefinementAgent } from '../agents/refinement.js';
import { runResearchAgent } from '../agents/research.js';
import { runPlanningAgent } from '../agents/planning.js';
import { runImplementationAgent } from '../agents/implementation.js';
import { runReviewAgent } from '../agents/review.js';
import { runReworkAgent } from '../agents/rework.js';
import { Action } from '../types/index.js';
import { formatSummaryStatus, formatCompactStoryCompletion } from './formatting.js';

/**
 * Daemon statistics tracking
 */
export interface DaemonStats {
  done: number;
  active: number;
  queued: number;
  blocked: number;
  startTime: Date;
  currentStoryStartTime?: Date;
}

/**
 * Options for the DaemonRunner
 */
export interface DaemonOptions {
  maxIterations?: number;
  verbose?: boolean;
}

/**
 * Story item in the processing queue
 */
interface QueuedStory {
  path: string;
  id: string;
}

/**
 * DaemonRunner - Continuous workflow monitoring and processing
 *
 * Watches backlog, ready, and in-progress folders for story files
 * and automatically processes them through the complete workflow pipeline
 * until they reach done.
 */
export class DaemonRunner {
  private sdlcRoot: string;
  private config: ReturnType<typeof loadConfig>;
  private options: DaemonOptions;
  private isShuttingDown: boolean = false;
  private currentProcessing: Promise<void> | null = null;
  private completedStoryIds: Set<string> = new Set();  // Stories that reached done
  private activeStoryIds: Set<string> = new Set();     // Stories currently being processed
  private processingQueue: QueuedStory[] = [];
  private watcher: FSWatcher | null = null;
  private isProcessingQueue: boolean = false;
  private hasLoggedIdle: boolean = false;  // Prevent repeated "Queue empty" messages
  private ctrlCCount: number = 0;
  private lastCtrlCTime: number = 0;
  private pollTimerId: ReturnType<typeof setTimeout> | null = null;
  private stats: DaemonStats;

  constructor(options: DaemonOptions = {}) {
    this.sdlcRoot = getSdlcRoot();
    this.config = loadConfig();
    this.options = options;
    this.stats = {
      done: 0,
      active: 0,
      queued: 0,
      blocked: 0,
      startTime: new Date(),
    };
  }

  /**
   * Start polling for new work at regular intervals
   * Uses recursive setTimeout pattern to respect shutdown state
   */
  private startPolling(): void {
    const poll = async () => {
      if (this.isShuttingDown) return;

      // Only poll if not currently processing
      if (!this.isProcessingQueue) {
        const assessment = await assessState(this.sdlcRoot);
        if (assessment.recommendedActions.length > 0) {
          const topAction = assessment.recommendedActions[0];
          // Queue if not already queued/active/completed
          if (!this.completedStoryIds.has(topAction.storyId) &&
              !this.activeStoryIds.has(topAction.storyId) &&
              !this.processingQueue.some(q => q.id === topAction.storyId)) {
            this.hasLoggedIdle = false;
            this.processingQueue.push({ path: topAction.storyPath, id: topAction.storyId });
            if (!this.isProcessingQueue) {
              this.processQueue();
            }
          }
        }
      }

      // Schedule next poll
      this.pollTimerId = setTimeout(poll, this.config.daemon?.pollingInterval || 5000);
    };

    // Start first poll after initial delay
    this.pollTimerId = setTimeout(poll, this.config.daemon?.pollingInterval || 5000);
  }

  /**
   * Start the daemon and begin watching for new stories
   */
  async start(): Promise<void> {
    const c = getThemedChalk(this.config);
    const logger = getLogger();

    logger.info('daemon', 'Daemon starting', {
      pollingInterval: this.config.daemon?.pollingInterval || 5000,
    });

    this.logStartup();

    // Setup signal handlers for graceful shutdown
    this.setupSignalHandlers();

    // Initialize chokidar watcher
    // Watch all active workflow directories (not done)
    const watchDirs = [
      path.join(this.sdlcRoot, 'backlog'),
      path.join(this.sdlcRoot, 'ready'),
      path.join(this.sdlcRoot, 'in-progress'),
    ];

    try {
      this.watcher = chokidar.watch(watchDirs, {
        persistent: true,
        ignoreInitial: true, // Manual initial assessment below
        awaitWriteFinish: {
          stabilityThreshold: this.config.daemon?.processDelay || 500,
          pollInterval: 100,
        },
        followSymlinks: false, // Security: don't follow symlinks
        depth: 0, // Only watch immediate files, not subdirectories
      });

      this.watcher.on('add', (filePath: string) => {
        // Filter for .md files only (skip .gitkeep and other files)
        if (!filePath.endsWith('.md')) {
          return;
        }
        this.onFileAdded(filePath);
      });
      this.watcher.on('change', (_filePath: string) => {
        // Currently we don't process file changes, only new files
      });
      this.watcher.on('error', (error: unknown) => this.logError(error, 'File watcher error'));

      console.log(c.info('👀 Watching for stories...'));
      console.log(c.dim(`   Press Ctrl+C to shutdown gracefully`));
      console.log();

      // Initial assessment - pick single highest priority story
      const initialAssessment = await assessState(this.sdlcRoot);
      if (initialAssessment.recommendedActions.length > 0) {
        const topAction = initialAssessment.recommendedActions[0];
        console.log(c.info(`Found ${initialAssessment.recommendedActions.length} stories, starting with: ${topAction.storyId}`));
        console.log(c.dim(`   Reason: ${topAction.reason}`));
        this.processingQueue.push({ path: topAction.storyPath, id: topAction.storyId });
        this.processQueue();
      }

      // Start polling for new work at regular intervals
      this.startPolling();

    } catch (error) {
      console.log(c.error('Failed to start file watcher:'));
      console.log(c.error(error instanceof Error ? error.message : String(error)));
      throw error;
    }
  }

  /**
   * Handler for when a new file is detected
   */
  private onFileAdded(filePath: string): void {
    const c = getThemedChalk(this.config);

    // Parse story early to get frontmatter.id for consistent tracking
    let story;
    try {
      story = parseStory(filePath);
    } catch (err) {
      console.log(c.warning(`  Cannot parse story at ${filePath}: ${err}`));
      return;
    }

    const storyId = story.frontmatter.id;

    // Skip if already completed (reached done in this session)
    if (this.completedStoryIds.has(storyId)) {
      return;
    }

    // Skip if currently being processed (prevents duplicate processing when story moves folders)
    if (this.activeStoryIds.has(storyId)) {
      return;
    }

    // Skip if already in queue
    if (this.processingQueue.some(q => q.id === storyId)) {
      return;
    }

    // Skip if shutdown in progress
    if (this.isShuttingDown) {
      console.log(c.warning(`\nSkipping ${story.frontmatter.title} - shutdown in progress`));
      return;
    }

    this.logFileDetected(filePath);

    // Reset idle flag when new work arrives
    this.hasLoggedIdle = false;

    // Add to queue with both path and id
    this.processingQueue.push({ path: filePath, id: storyId });

    // Start processing queue if not already processing
    if (!this.isProcessingQueue) {
      this.processQueue();
    }
  }

  /**
   * Process queued story files sequentially
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue || this.isShuttingDown) {
      return;
    }

    this.isProcessingQueue = true;

    while (this.processingQueue.length > 0 && !this.isShuttingDown) {
      const { path: filePath, id: storyId } = this.processingQueue.shift()!;

      // Mark as actively processing
      this.activeStoryIds.add(storyId);

      try {
        const completed = await this.processStory(filePath, storyId);

        // Mark as completed if it reached done
        if (completed) {
          this.completedStoryIds.add(storyId);
        }
      } catch (error) {
        this.logError(error, `Error processing ${filePath}`);
        // Continue processing other stories
      } finally {
        // Remove from active set
        this.activeStoryIds.delete(storyId);
      }
    }

    this.isProcessingQueue = false;

    // Log idle state only once when transitioning to idle
    if (this.processingQueue.length === 0 && !this.isShuttingDown && !this.hasLoggedIdle) {
      const c = getThemedChalk(this.config);
      // Update queued count for summary
      this.stats.queued = 0;
      const summary = formatSummaryStatus(this.stats);
      console.log(c.dim(`\n👀 Waiting for work... (${summary})`));
      this.hasLoggedIdle = true;
    }
  }

  /**
   * Process a single story through the complete workflow until done or no more actions
   * Returns true if story reached completion (done folder or no more actions)
   */
  private async processStory(filePath: string, storyId: string): Promise<boolean> {
    const c = getThemedChalk(this.config);

    // Validate story can still be parsed (file might have moved/changed)
    try {
      parseStory(filePath);
    } catch (err) {
      console.log(c.error(`   Failed to parse story at ${filePath}: ${err}`));
      return false;
    }

    this.logWorkflowStart(storyId);

    // Track start time for elapsed time calculation
    const storyStartTime = Date.now();
    this.stats.currentStoryStartTime = new Date();
    this.stats.active = 1;

    let completed = false;
    let actionCount = 0;

    // Create processing promise and store it for graceful shutdown
    this.currentProcessing = (async () => {
      try {
        let iterationCount = 0;
        const maxIterations = this.options.maxIterations ?? 100; // Safety limit

        while (iterationCount < maxIterations && !this.isShuttingDown) {
          // Re-assess state to get current actions
          const assessment = await assessState(this.sdlcRoot);

          // Find action for this story by ID (path changes as story moves folders)
          const storyAction = assessment.recommendedActions.find(
            (action) => action.storyId === storyId
          );

          if (!storyAction) {
            // No more actions - story is either done or needs manual intervention
            completed = true;
            break;
          }

          // Execute the action
          await this.executeAction(storyAction);
          iterationCount++;
          actionCount++;

          if (this.options.verbose) {
            console.log(c.dim(`   (${iterationCount}/${maxIterations} iterations)`));
          }
        }

        if (iterationCount >= maxIterations) {
          console.log(c.warning(`   ⚠️  Max iterations (${maxIterations}) reached for ${storyId}`));
        }

        // Calculate elapsed time
        const elapsedMs = Date.now() - storyStartTime;
        this.logWorkflowComplete(storyId, completed, actionCount, elapsedMs);

      } catch (error) {
        const elapsedMs = Date.now() - storyStartTime;
        this.logWorkflowComplete(storyId, false, actionCount, elapsedMs);
        this.logError(error, `Workflow failed for ${storyId}`);
      }
    })();

    await this.currentProcessing;
    this.currentProcessing = null;

    // Update stats after story completes
    this.stats.active = 0;
    if (completed) {
      this.stats.done++;
    }
    this.stats.currentStoryStartTime = undefined;

    return completed;
  }

  /**
   * Execute a single action for the daemon
   */
  private async executeAction(action: Action): Promise<void> {
    const c = getThemedChalk(this.config);

    try {
      // Resolve story by ID to get current path (handles moves between folders)
      let currentStoryPath: string;
      try {
        const story = getStory(this.sdlcRoot, action.storyId);
        currentStoryPath = story.path;
      } catch (error) {
        console.log(c.error(`   ✗ Story not found: ${action.storyId}`));
        if (error instanceof Error) {
          console.log(c.dim(`     ${error.message}`));
        }
        throw new Error(`Story not found: ${action.storyId}`);
      }

      let result;

      switch (action.type) {
        case 'refine':
          result = await runRefinementAgent(currentStoryPath, this.sdlcRoot);
          break;

        case 'research':
          result = await runResearchAgent(currentStoryPath, this.sdlcRoot);
          break;

        case 'plan':
          result = await runPlanningAgent(currentStoryPath, this.sdlcRoot);
          break;

        case 'implement':
          result = await runImplementationAgent(currentStoryPath, this.sdlcRoot);
          break;

        case 'review':
          result = await runReviewAgent(currentStoryPath, this.sdlcRoot);
          break;

        case 'rework':
          if (!action.context) {
            throw new Error('Rework action requires context with review feedback');
          }
          result = await runReworkAgent(currentStoryPath, this.sdlcRoot, action.context as any);
          break;

        default:
          throw new Error(`Unknown action type: ${action.type}`);
      }

      if (result && !result.success) {
        console.log(c.error(`   ✗ Failed: ${action.type} for ${action.storyId}`));
        if (result.error) {
          console.log(c.error(`     Error: ${result.error}`));
        }
        throw new Error(`Action ${action.type} failed`);
      }

      console.log(c.success(`   ✓ Completed: ${action.type} for ${action.storyId}`));

    } catch (error) {
      throw error;
    }
  }

  /**
   * Setup signal handlers for graceful shutdown
   */
  private setupSignalHandlers(): void {
    const handleShutdown = () => {
      const now = Date.now();

      // Handle double Ctrl+C for force quit
      if (this.ctrlCCount > 0 && now - this.lastCtrlCTime < 2000) {
        console.log('\n\n⚠️  Force quitting...');
        process.exit(1);
      }

      this.ctrlCCount++;
      this.lastCtrlCTime = now;

      // Call stop() and ensure process exits regardless of outcome
      this.stop()
        .catch(() => {
          // Ignore errors during shutdown
        })
        .finally(() => {
          process.exit(0);
        });
    };

    // Register SIGINT/SIGTERM handlers (may not work when run via npm)
    process.on('SIGINT', handleShutdown);
    process.on('SIGTERM', handleShutdown);

    // Also listen for raw stdin to catch Ctrl+C when signals are intercepted
    // This handles the case when running through npm/tsx which may not forward signals
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.on('data', (data: Buffer) => {
        // Ctrl+C sends byte 0x03 (ETX)
        if (data[0] === 0x03) {
          handleShutdown();
        }
        // Ctrl+D sends byte 0x04 (EOT) - also treat as shutdown
        if (data[0] === 0x04) {
          handleShutdown();
        }
      });
    }
  }

  /**
   * Stop the daemon gracefully
   */
  async stop(): Promise<void> {
    if (this.isShuttingDown) {
      return; // Already shutting down
    }

    this.isShuttingDown = true;

    // Get themed chalk with fallback for test environments
    const c = getThemedChalk(this.config);
    const log = (fn: ((s: string) => string) | undefined, msg: string) =>
      console.log(fn?.(msg) || msg);

    log(c?.warning, '\n\n🛑 Shutting down gracefully...');

    // Restore stdin to normal mode
    if (process.stdin.isTTY && process.stdin.setRawMode) {
      try {
        process.stdin.setRawMode(false);
        process.stdin.pause();
      } catch {
        // Ignore errors if stdin is already closed
      }
    }

    // Close file watcher (with timeout to prevent hanging)
    if (this.watcher) {
      try {
        await Promise.race([
          this.watcher.close(),
          new Promise((resolve) => setTimeout(resolve, 5000)),
        ]);
        log(c?.dim, '   File watcher stopped');
      } catch {
        log(c?.warning, '   File watcher close timed out');
      }
    }

    // Clear polling timer
    if (this.pollTimerId) {
      clearTimeout(this.pollTimerId);
      this.pollTimerId = null;
      log(c?.dim, '   Polling timer cleared');
    }

    // Wait for current processing to complete (with timeout)
    if (this.currentProcessing) {
      log(c?.dim, '   Waiting for current story to complete...');

      const shutdownTimeout = this.config.daemon?.shutdownTimeout || 30000;

      try {
        await Promise.race([
          this.currentProcessing,
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Shutdown timeout')), shutdownTimeout)
          ),
        ]);
        log(c?.success, '   Current story completed');
      } catch (error) {
        if (error instanceof Error && error.message === 'Shutdown timeout') {
          log(c?.warning, `   Shutdown timeout (${shutdownTimeout}ms) exceeded`);
        } else {
          log(c?.error, '   Story processing failed during shutdown');
        }
      }
    }

    this.logShutdown();
  }

  /**
   * Log daemon startup
   */
  private logStartup(): void {
    const c = getThemedChalk(this.config);

    console.log(c.bold('\n🤖 AI-SDLC Daemon Mode Started'));
    console.log(c.dim('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
    console.log(c.info(`   SDLC Root: ${this.sdlcRoot}`));
    console.log(c.info(`   Watching: backlog/, ready/, in-progress/`));
    if (this.options.maxIterations) {
      console.log(c.info(`   Max iterations: ${this.options.maxIterations}`));
    }
    console.log(c.dim('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'));
  }

  /**
   * Log file detection
   */
  private logFileDetected(filePath: string): void {
    const c = getThemedChalk(this.config);
    const fileName = path.basename(filePath);
    console.log(c.success(`\n📄 New story detected: ${fileName}`));
  }

  /**
   * Log workflow start
   */
  private logWorkflowStart(storyId: string): void {
    const c = getThemedChalk(this.config);
    console.log(c.info(`   ▶️  Starting workflow for: ${storyId}`));
  }

  /**
   * Log workflow completion
   */
  private logWorkflowComplete(storyId: string, success: boolean, actionCount: number = 0, elapsedMs: number = 0): void {
    const c = getThemedChalk(this.config);
    const logger = getLogger();

    logger.info('daemon', 'Story workflow completed', {
      storyId,
      success,
      actionCount,
      durationMs: elapsedMs,
    });

    if (this.options.verbose) {
      // Verbose: show multi-line output
      if (success) {
        console.log(c.success(`   ✅ Workflow completed: ${storyId}`));
      } else {
        console.log(c.error(`   ❌ Workflow failed: ${storyId}`));
      }
    } else {
      // Compact: show single line with stats
      if (success) {
        const compactMsg = formatCompactStoryCompletion(storyId, actionCount, elapsedMs);
        console.log(c.success(compactMsg));
      } else {
        const compactMsg = formatCompactStoryCompletion(storyId, actionCount, elapsedMs);
        console.log(c.error(compactMsg));
      }
    }
  }

  /**
   * Log errors without stopping daemon
   */
  private logError(error: unknown, context: string): void {
    const c = getThemedChalk(this.config);
    console.log(c.error(`\n⚠️  ${context}`));
    if (error instanceof Error) {
      console.log(c.error(`   ${error.message}`));
      if (error.stack) {
        console.log(c.dim(error.stack));
      }
    } else {
      console.log(c.error(`   ${String(error)}`));
    }
    console.log(c.warning('   Daemon continues running...\n'));
  }

  /**
   * Log shutdown completion
   */
  private logShutdown(): void {
    const c = getThemedChalk(this.config);
    const logger = getLogger();
    const msg = '\n✨ Daemon shutdown complete\n';
    console.log(c?.success?.(msg) || msg);

    logger.info('daemon', 'Daemon shutdown complete', {
      storiesProcessed: this.stats.done,
      uptime: Date.now() - this.stats.startTime.getTime(),
    });
  }
}

/**
 * Create and start the daemon
 */
export async function startDaemon(options: DaemonOptions = {}): Promise<void> {
  const daemon = new DaemonRunner(options);
  await daemon.start();
}
