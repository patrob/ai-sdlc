/**
 * Logging utilities for daemon
 */

import path from 'path';

import { getLogger } from '../../core/logger.js';
import { getThemedChalk } from '../../core/theme.js';
import { formatCompactStoryCompletion, formatSummaryStatus } from '../formatting.js';
import { type DaemonOptions,type DaemonStats } from './stats.js';

/**
 * Log daemon startup
 */
export function logStartup(sdlcRoot: string, options: DaemonOptions, config: any): void {
  const c = getThemedChalk(config);

  console.log(c.bold('\n🤖 AI-SDLC Daemon Mode Started'));
  console.log(c.dim('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
  console.log(c.info(`   SDLC Root: ${sdlcRoot}`));
  console.log(c.info(`   Watching: backlog/, ready/, in-progress/`));
  if (options.maxIterations) {
    console.log(c.info(`   Max iterations: ${options.maxIterations}`));
  }
  console.log(c.dim('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'));
}

/**
 * Log file detection
 */
export function logFileDetected(filePath: string, config: any): void {
  const c = getThemedChalk(config);
  const fileName = path.basename(filePath);
  console.log(c.success(`\n📄 New story detected: ${fileName}`));
}

/**
 * Log workflow start
 */
export function logWorkflowStart(storyId: string, config: any): void {
  const c = getThemedChalk(config);
  console.log(c.info(`   ▶️  Starting workflow for: ${storyId}`));
}

/**
 * Log workflow completion
 */
export function logWorkflowComplete(
  storyId: string,
  success: boolean,
  actionCount: number,
  elapsedMs: number,
  verbose: boolean | undefined,
  config: any
): void {
  const c = getThemedChalk(config);
  const logger = getLogger();

  logger.info('daemon', 'Story workflow completed', {
    storyId,
    success,
    actionCount,
    durationMs: elapsedMs,
  });

  if (verbose) {
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
export function logError(error: unknown, context: string, config: any): void {
  const c = getThemedChalk(config);
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
export function logShutdown(stats: DaemonStats, config: any): void {
  const c = getThemedChalk(config);
  const logger = getLogger();
  const msg = '\n✨ Daemon shutdown complete\n';
  console.log(c?.success?.(msg) || msg);

  logger.info('daemon', 'Daemon shutdown complete', {
    storiesProcessed: stats.done,
    uptime: Date.now() - stats.startTime.getTime(),
  });
}

/**
 * Log idle state
 */
export function logIdleState(stats: DaemonStats, config: any): void {
  const c = getThemedChalk(config);
  stats.queued = 0;
  const summary = formatSummaryStatus(stats);
  console.log(c.dim(`\n👀 Waiting for work... (${summary})`));
}
