/**
 * Daemon - Continuous workflow monitoring and processing
 *
 * Watches backlog, ready, and in-progress folders for story files
 * and automatically processes them through the complete workflow pipeline
 * until they reach done.
 */

export { DaemonRunner } from './daemon/runner.js';
export { type DaemonOptions, type DaemonStats } from './daemon/stats.js';

/**
 * Create and start the daemon
 */
export async function startDaemon(options: any = {}): Promise<void> {
  const { DaemonRunner } = await import('./daemon/runner.js');
  const daemon = new DaemonRunner(options);
  await daemon.start();
}
