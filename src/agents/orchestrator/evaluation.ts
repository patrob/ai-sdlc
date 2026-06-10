/**
 * Task result evaluation and dependency resolution for orchestrator
 */

import { getLogger } from '../../core/logger.js';
import {
  type AgentTaskResult,
  type ImplementationTask,
  type TaskProgress,
  type TaskStatus,
} from '../../types/index.js';

const logger = getLogger();

/**
 * Evaluate task result and categorize failure type
 *
 * Returns:
 * - 'success': Task completed successfully
 * - 'recoverable': Failure that can be retried (timeout, transient error, verification failed)
 * - 'unrecoverable': Failure that should stop orchestration (deps not met, impossible task, max retries)
 *
 * @param result - Result from single-task agent execution
 * @param attemptCount - Number of attempts made so far (including this one)
 * @param maxRetries - Maximum retry attempts allowed
 * @returns Failure category
 */
export function evaluateTaskResult(
  result: AgentTaskResult,
  attemptCount: number,
  maxRetries: number
): 'success' | 'recoverable' | 'unrecoverable' {
  if (result.success) {
    return 'success';
  }

  const error = result.error || '';
  const lowerError = error.toLowerCase();

  // Check if max retries exceeded (becomes unrecoverable)
  if (attemptCount > maxRetries) {
    logger.warn('orchestrator', `Task ${result.task.id} exceeded max retries (${maxRetries})`);
    return 'unrecoverable';
  }

  // Unrecoverable: Dependencies not met
  if (
    lowerError.includes('dependency') ||
    lowerError.includes('depends on') ||
    lowerError.includes('prerequisite')
  ) {
    return 'unrecoverable';
  }

  // Unrecoverable: Impossible task or design flaw
  if (
    lowerError.includes('impossible') ||
    lowerError.includes('cannot be done') ||
    lowerError.includes('design flaw')
  ) {
    return 'unrecoverable';
  }

  // Unrecoverable: Files outside scope modified
  if (result.scopeViolation && result.scopeViolation.length > 0) {
    logger.warn(
      'orchestrator',
      `Task ${result.task.id} modified files outside scope: ${result.scopeViolation.join(', ')}`
    );
    return 'unrecoverable';
  }

  // Recoverable: Timeout
  if (lowerError.includes('timeout') || lowerError.includes('timed out')) {
    return 'recoverable';
  }

  // Recoverable: Transient API error
  if (
    lowerError.includes('rate limit') ||
    lowerError.includes('network') ||
    lowerError.includes('connection') ||
    lowerError.includes('api error')
  ) {
    return 'recoverable';
  }

  // Recoverable: Verification failed (tests/lint/build)
  if (
    !result.verificationPassed ||
    lowerError.includes('test') ||
    lowerError.includes('lint') ||
    lowerError.includes('build')
  ) {
    return 'recoverable';
  }

  // Recoverable: Unclear requirements (agent needs clarification)
  if (
    lowerError.includes('unclear') ||
    lowerError.includes('need') ||
    lowerError.includes('missing file') ||
    result.missingDependencies
  ) {
    return 'recoverable';
  }

  // Default to recoverable for unknown errors (give it a chance to retry)
  return 'recoverable';
}

/**
 * Get next task to execute based on dependencies and progress
 *
 * Returns task with status 'pending' or 'in_progress' whose dependencies are all completed.
 * Detects circular dependencies and throws error.
 *
 * @param tasks - All tasks from implementation plan
 * @param progress - Current task progress
 * @returns Next eligible task or null if none available
 * @throws Error if circular dependency detected
 */
export function getNextTask(
  tasks: ImplementationTask[],
  progress: TaskProgress[]
): ImplementationTask | null {
  // Build progress map for quick lookup
  const progressMap = new Map<string, TaskStatus>();
  for (const p of progress) {
    progressMap.set(p.taskId, p.status);
  }

  // Find tasks eligible for execution
  const eligibleTasks = tasks.filter((task) => {
    const status = progressMap.get(task.id);

    // Only consider pending or in_progress tasks
    if (status !== 'pending' && status !== 'in_progress') {
      return false;
    }

    // Check if all dependencies are completed
    const deps = task.dependencies || [];
    const allDepsCompleted = deps.every((depId) => progressMap.get(depId) === 'completed');

    return allDepsCompleted;
  });

  // Prioritize in_progress tasks (resume interrupted work)
  const inProgressTask = eligibleTasks.find((task) => progressMap.get(task.id) === 'in_progress');
  if (inProgressTask) {
    return inProgressTask;
  }

  // Return first pending task
  const pendingTask = eligibleTasks.find((task) => progressMap.get(task.id) === 'pending');
  if (pendingTask) {
    return pendingTask;
  }

  // No eligible tasks - check for circular dependencies
  const incompleteTasks = tasks.filter((task) => {
    const status = progressMap.get(task.id);
    return status !== 'completed' && status !== 'failed';
  });

  if (incompleteTasks.length > 0) {
    // We have incomplete tasks but none are eligible - likely circular dependency
    const taskIds = incompleteTasks.map((t) => t.id).join(', ');
    throw new Error(
      `Circular dependency detected: tasks [${taskIds}] cannot be executed due to unmet dependencies`
    );
  }

  return null;
}
