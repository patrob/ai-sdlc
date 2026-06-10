/**
 * DaemonRunner - Continuous workflow monitoring and processing
 */

import chokidar, { type FSWatcher } from 'chokidar';
import path from 'path';

import { getSdlcRoot, loadConfig } from '../../core/config.js';
import { assessState } from '../../core/kanban.js';
import { getLogger, pinoLogger } from '../../core/logger.js';
import { ProcessManager } from '../../core/process-manager.js';
import { getStory, parseStory } from '../../core/story.js';
import { getThemedChalk } from '../../core/theme.js';
import { type Action } from '../../types/index.js';
import { executeAction } from './action-executor.js';
import { logError, logFileDetected, logIdleState, logShutdown, logStartup, logWorkflowComplete, logWorkflowStart } from './logging.js';
import { type DaemonOptions,type DaemonStats } from './stats.js';

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
  private sigintHandler: (() => void) | null = null;
  private sigtermHandler: (() => void) | null = null;

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

    pinoLogger.info({ category: 'daemon', sdlcRoot: this.sdlcRoot }, 'Daemon started');

    logStartup(this.sdlcRoot, this.options, this.config);

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
      this.watcher.on('error', (error: unknown) => logError(error, 'File watcher error', this.config));

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

    logFileDetected(filePath, this.config);

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
        logError(error, `Error processing ${filePath}`, this.config);
        // Continue processing other stories
      } finally {
        // Remove from active set
        this.activeStoryIds.delete(storyId);
      }
    }

    this.isProcessingQueue = false;

    // Log idle state only once when transitioning to idle
    if (this.processingQueue.length === 0 && !this.isShuttingDown && !this.hasLoggedIdle) {
      logIdleState(this.stats, this.config);
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

    logWorkflowStart(storyId, this.config);

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
        logWorkflowComplete(storyId, completed, actionCount, elapsedMs, this.options.verbose, this.config);

      } catch (error) {
        const elapsedMs = Date.now() - storyStartTime;
        logWorkflowComplete(storyId, false, actionCount, elapsedMs, this.options.verbose, this.config);
        logError(error, `Workflow failed for ${storyId}`, this.config);
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
      const result = await executeAction(action, this.sdlcRoot, getStory);

      if (result && !result.success) {
        console.log(c.error(`   ✗ Failed: ${action.type} for ${action.storyId}`));
        if (result.error) {
          console.log(c.error(`     Error: ${result.error}`));
        }
        throw new Error(`Action ${action.type} failed`);
      }

      console.log(c.success(`   ✓ Completed: ${action.type} for ${action.storyId}`));

    } catch (error) {
      if (error instanceof Error && error.message.includes('Story not found')) {
        console.log(c.error(`   ✗ Story not found: ${action.storyId}`));
        console.log(c.dim(`     ${error.message}`));
      }
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
        ProcessManager.getInstance().killAll('SIGKILL');
        process.exit(1);
      }

      this.ctrlCCount++;
      this.lastCtrlCTime = now;

      // Kill child processes gracefully before stopping daemon
      ProcessManager.getInstance().killAll('SIGTERM');

      // Call stop() and ensure process exits regardless of outcome
      this.stop()
        .catch(() => {
          // Ignore errors during shutdown
        })
        .finally(() => {
          ProcessManager.getInstance().killAll('SIGKILL');
          process.exit(0);
        });
    };

    // Raise the listener limit to accommodate multiple DaemonRunner instances in tests
    process.setMaxListeners(Math.max(process.getMaxListeners(), 50));

    // Store references so they can be removed in stop()
    this.sigintHandler = handleShutdown;
    this.sigtermHandler = handleShutdown;

    // Register SIGINT/SIGTERM handlers (may not work when run via npm)
    process.on('SIGINT', this.sigintHandler);
    process.on('SIGTERM', this.sigtermHandler);

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

    // Remove registered signal handlers to prevent listener accumulation
    if (this.sigintHandler) {
      process.off('SIGINT', this.sigintHandler);
      this.sigintHandler = null;
    }
    if (this.sigtermHandler) {
      process.off('SIGTERM', this.sigtermHandler);
      this.sigtermHandler = null;
    }

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

    logShutdown(this.stats, this.config);
  }
}
