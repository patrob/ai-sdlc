/**
 * Phase Executor
 *
 * Orchestrates agent execution within a phase based on configuration.
 * Handles sequential, parallel, and nested compositions with
 * consensus-based conflict resolution.
 */

export { createPhaseExecutor, executePhase } from './convenience.js';
export { PhaseExecutor } from './executor.js';
export type { PhaseExecutorOptions } from './types.js';
