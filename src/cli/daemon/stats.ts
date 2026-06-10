/**
 * Daemon statistics and formatting
 */

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
