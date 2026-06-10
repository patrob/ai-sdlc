/**
 * Convenience functions for phase execution
 */

import type { PhaseExecutionContext, PhaseExecutionResult, WorkflowConfig } from '../../types/workflow-config.js';
import { PhaseExecutor } from './executor.js';
import type { PhaseExecutorOptions } from './types.js';

/**
 * Create a phase executor for the given SDLC root
 */
export function createPhaseExecutor(sdlcRoot: string, config?: WorkflowConfig): PhaseExecutor {
  return new PhaseExecutor(sdlcRoot, config);
}

/**
 * Execute a phase with default configuration
 * Convenience function for simple use cases
 */
export async function executePhase(
  phase: string,
  storyPath: string,
  sdlcRoot: string,
  options: PhaseExecutorOptions = {}
): Promise<PhaseExecutionResult> {
  const executor = new PhaseExecutor(sdlcRoot);
  const context: PhaseExecutionContext = {
    phase,
    storyPath,
    sdlcRoot,
    onProgress: options.onProgress,
  };
  return executor.execute(phase, context, options);
}
