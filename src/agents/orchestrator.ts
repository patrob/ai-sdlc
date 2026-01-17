/**
 * Sequential Task Orchestrator
 *
 * Orchestrates implementation by running each task as an isolated agent,
 * preventing context window exhaustion and enabling intelligent retry/recovery.
 */

import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import {
  ImplementationTask,
  TaskProgress,
  TaskStatus,
  AgentTaskResult,
  OrchestratorOptions,
  OrchestratorResult,
  FailedTaskInfo,
  TaskContext,
  FileContent,
} from '../types/index.js';
import { parseImplementationTasks } from '../core/task-parser.js';
import {
  getTaskProgress,
  updateTaskProgress,
  initializeTaskProgress,
  readStoryFile,
} from '../core/task-progress.js';
import { runSingleTaskAgent } from './single-task.js';
import { getLogger } from '../core/logger.js';

const logger = getLogger();

/**
 * Default orchestrator options
 */
const DEFAULT_OPTIONS: Required<OrchestratorOptions> = {
  maxRetriesPerTask: 2,
  commitAfterEachTask: true,
  stopOnFirstFailure: true,
  dryRun: false,
};

/**
 * Build minimal context for a single task
 *
 * Extracts relevant acceptance criteria, existing file contents, and project conventions.
 * Truncates if context exceeds reasonable size (~2000 chars for projectPatterns).
 *
 * @param task - Task to build context for
 * @param storyContent - Full story content
 * @param workingDirectory - Working directory for task execution
 * @returns Minimal task context
 */
export function buildTaskContext(
  task: ImplementationTask,
  storyContent: string,
  workingDirectory: string
): TaskContext {
  // Extract acceptance criteria section
  const acceptanceCriteria: string[] = [];
  const acMatch = storyContent.match(/##\s+Acceptance\s+Criteria\s*\n([\s\S]*?)(?=\n##|$)/i);
  if (acMatch) {
    const acSection = acMatch[1];
    const lines = acSection.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('-') || trimmed.startsWith('*')) {
        // Remove checkbox and bullet
        const criterion = trimmed.replace(/^[-*]\s+\[[ x]\]\s*/, '').replace(/^[-*]\s+/, '');
        if (criterion) {
          acceptanceCriteria.push(criterion);
        }
      }
    }
  }

  // Filter acceptance criteria to only those relevant to task files
  const taskFiles = task.files || [];
  const relevantCriteria = acceptanceCriteria.filter((criterion) => {
    // Include if criterion mentions any task file
    return taskFiles.some((file) => {
      const fileName = path.basename(file);
      const fileBaseName = fileName.replace(/\.(ts|tsx|js|jsx)$/, '');
      return (
        criterion.includes(file) ||
        criterion.includes(fileName) ||
        criterion.includes(fileBaseName)
      );
    });
  });

  // If no specific matches, include first 3 criteria as general context
  const finalCriteria =
    relevantCriteria.length > 0 ? relevantCriteria : acceptanceCriteria.slice(0, 3);

  // Read existing files
  const existingFiles: FileContent[] = [];
  for (const file of taskFiles) {
    const filePath = path.join(workingDirectory, file);
    if (fs.existsSync(filePath)) {
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        existingFiles.push({ path: file, content });
      } catch (error: any) {
        logger.warn('orchestrator', `Failed to read file ${file}: ${error.message}`);
      }
    }
  }

  // Extract project conventions (brief summary)
  let projectPatterns = '';
  const conventionsMatch = storyContent.match(
    /##\s+(Technical\s+Specification|Project\s+Conventions)\s*\n([\s\S]*?)(?=\n##|$)/i
  );
  if (conventionsMatch) {
    projectPatterns = conventionsMatch[2].trim();
  }

  // Truncate if too long
  const MAX_PATTERN_LENGTH = 2000;
  if (projectPatterns.length > MAX_PATTERN_LENGTH) {
    projectPatterns =
      projectPatterns.substring(0, MAX_PATTERN_LENGTH) + '\n\n[... truncated for length]';
  }

  return {
    task,
    acceptanceCriteria: finalCriteria,
    existingFiles,
    projectPatterns,
    workingDirectory,
  };
}

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

/**
 * Commit task completion to git
 *
 * Stages modified files, creates commit with standard message format.
 * Verifies no files outside task scope were modified.
 *
 * @param task - Task that was completed
 * @param filesChanged - Files modified by task
 * @param storyId - Story ID for commit message
 * @param workingDir - Working directory
 * @throws Error if git operations fail
 */
async function commitTaskCompletion(
  task: ImplementationTask,
  filesChanged: string[],
  storyId: string,
  workingDir: string
): Promise<void> {
  if (filesChanged.length === 0) {
    logger.warn('orchestrator', `Task ${task.id} completed but no files changed, skipping commit`);
    return;
  }

  // Validate file paths
  const declaredFiles = task.files || [];
  const violations = filesChanged.filter((f) => !declaredFiles.includes(f));
  if (violations.length > 0) {
    throw new Error(
      `Task ${task.id} modified files outside declared scope: ${violations.join(', ')}`
    );
  }

  // Stage files using safe git invocation
  const addResult = spawnSync('git', ['add', ...filesChanged], {
    cwd: workingDir,
    encoding: 'utf8',
  });

  if (addResult.error) {
    throw new Error(`Failed to stage files: ${addResult.error.message}`);
  }

  if (addResult.status !== 0) {
    const stderr = addResult.stderr || addResult.stdout || '';
    throw new Error(`Failed to stage files: ${stderr}`);
  }

  // Create commit
  const commitMessage = `feat(${storyId}): Complete task ${task.id} - ${task.description}`;

  const commitResult = spawnSync('git', ['commit', '-m', commitMessage], {
    cwd: workingDir,
    encoding: 'utf8',
  });

  if (commitResult.error) {
    throw new Error(`Failed to commit: ${commitResult.error.message}`);
  }

  if (commitResult.status !== 0) {
    const stderr = commitResult.stderr || commitResult.stdout || '';
    throw new Error(`Failed to commit: ${stderr}`);
  }

  logger.info('orchestrator', `Committed task ${task.id}: ${commitMessage}`);
}

/**
 * Run implementation orchestrator
 *
 * Main orchestration loop:
 * 1. Parse tasks from plan
 * 2. Load/initialize progress
 * 3. Loop: get next task → run agent → evaluate → commit → repeat
 * 4. Return summary result
 *
 * @param storyPath - Absolute path to story.md file
 * @param sdlcRoot - SDLC root directory
 * @param options - Orchestrator options
 * @returns Orchestration result summary
 */
export async function runImplementationOrchestrator(
  storyPath: string,
  sdlcRoot: string,
  options?: OrchestratorOptions
): Promise<OrchestratorResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const workingDir = path.dirname(storyPath);

  logger.info('orchestrator', 'Starting implementation orchestration', {
    storyPath,
    options: opts,
  });

  // Parse tasks from plan
  const storyContent = await readStoryFile(storyPath);
  const tasks = parseImplementationTasks(storyContent);

  if (tasks.length === 0) {
    logger.warn('orchestrator', 'No tasks found in implementation plan');
    return {
      success: true,
      tasksCompleted: 0,
      tasksFailed: 0,
      tasksRemaining: 0,
      failedTasks: [],
      totalAgentInvocations: 0,
    };
  }

  logger.info('orchestrator', `Found ${tasks.length} tasks in plan`);

  // Load or initialize progress
  let progress = await getTaskProgress(storyPath);
  if (progress.length === 0) {
    logger.info('orchestrator', 'Initializing task progress tracking');
    await initializeTaskProgress(
      storyPath,
      tasks.map((t) => t.id)
    );
    progress = await getTaskProgress(storyPath);
  }

  // Extract story ID from path
  const storyId = path.basename(path.dirname(storyPath));

  // Track statistics
  // Count already-completed tasks from previous runs
  const alreadyCompleted = progress.filter((p) => p.status === 'completed').length;
  const alreadyFailed = progress.filter((p) => p.status === 'failed').length;
  let tasksCompleted = alreadyCompleted;
  let tasksFailed = alreadyFailed;
  let totalAgentInvocations = 0;
  const failedTasks: FailedTaskInfo[] = [];
  const retryCount = new Map<string, number>();

  // Main orchestration loop
  while (true) {
    // Get next eligible task
    let nextTask: ImplementationTask | null;
    try {
      nextTask = getNextTask(tasks, progress);
    } catch (error: any) {
      // Circular dependency or other fatal error
      logger.error('orchestrator', 'Failed to get next task', { error: error.message });
      return {
        success: false,
        tasksCompleted,
        tasksFailed: tasks.length - tasksCompleted,
        tasksRemaining: tasks.length - tasksCompleted - tasksFailed,
        failedTasks,
        totalAgentInvocations,
      };
    }

    if (!nextTask) {
      // No more eligible tasks
      break;
    }

    logger.info('orchestrator', `Executing task ${nextTask.id}: ${nextTask.description}`);

    // Mark task in progress
    await updateTaskProgress(storyPath, nextTask.id, 'in_progress');

    // Build task context
    const taskContext = buildTaskContext(nextTask, storyContent, workingDir);

    // Execute task agent (or simulate in dry run)
    let result: AgentTaskResult;
    if (opts.dryRun) {
      logger.info('orchestrator', `[DRY RUN] Would execute task ${nextTask.id}`);
      result = {
        success: true,
        task: nextTask,
        filesChanged: nextTask.files || [],
        verificationPassed: true,
      };
    } else {
      result = await runSingleTaskAgent(taskContext);
    }

    totalAgentInvocations++;
    const attempts = (retryCount.get(nextTask.id) || 0) + 1;
    retryCount.set(nextTask.id, attempts);

    // Evaluate result
    const evaluation = evaluateTaskResult(result, attempts, opts.maxRetriesPerTask);

    if (evaluation === 'success') {
      // Task succeeded
      await updateTaskProgress(storyPath, nextTask.id, 'completed');
      tasksCompleted++;

      // Commit if enabled
      if (opts.commitAfterEachTask && !opts.dryRun) {
        try {
          await commitTaskCompletion(nextTask, result.filesChanged, storyId, workingDir);
        } catch (error: any) {
          logger.error('orchestrator', `Failed to commit task ${nextTask.id}`, {
            error: error.message,
          });
          // Continue despite commit failure
        }
      }

      logger.info('orchestrator', `Task ${nextTask.id} completed successfully`);
    } else if (evaluation === 'recoverable') {
      // Recoverable failure - retry if under max attempts
      if (attempts <= opts.maxRetriesPerTask) {
        logger.warn(
          'orchestrator',
          `Task ${nextTask.id} failed (recoverable), will retry (attempt ${attempts}/${opts.maxRetriesPerTask})`
        );
        // Keep status as 'in_progress' to retry
      } else {
        // Max retries exceeded
        await updateTaskProgress(
          storyPath,
          nextTask.id,
          'failed',
          result.error || 'Max retries exceeded'
        );
        tasksFailed++;
        failedTasks.push({
          taskId: nextTask.id,
          error: result.error || 'Max retries exceeded',
          attempts,
        });

        logger.error('orchestrator', `Task ${nextTask.id} failed after ${attempts} attempts`);

        if (opts.stopOnFirstFailure) {
          logger.error('orchestrator', 'Stopping orchestration due to unrecoverable failure');
          break;
        }
      }
    } else {
      // Unrecoverable failure
      await updateTaskProgress(
        storyPath,
        nextTask.id,
        'failed',
        result.error || 'Unrecoverable failure'
      );
      tasksFailed++;
      failedTasks.push({
        taskId: nextTask.id,
        error: result.error || 'Unrecoverable failure',
        attempts,
      });

      logger.error('orchestrator', `Task ${nextTask.id} failed (unrecoverable)`);

      if (opts.stopOnFirstFailure) {
        logger.error('orchestrator', 'Stopping orchestration due to unrecoverable failure');
        break;
      }
    }

    // Reload progress for next iteration
    progress = await getTaskProgress(storyPath);
  }

  // Calculate remaining tasks
  const tasksRemaining = tasks.length - tasksCompleted - tasksFailed;

  const result: OrchestratorResult = {
    success: tasksFailed === 0 && tasksRemaining === 0,
    tasksCompleted,
    tasksFailed,
    tasksRemaining,
    failedTasks,
    totalAgentInvocations,
  };

  logger.info('orchestrator', 'Orchestration complete', result);

  return result;
}
