/**
 * Sequential Task Orchestrator
 *
 * Orchestrates implementation by running each task as an isolated agent,
 * preventing context window exhaustion and enabling intelligent retry/recovery.
 */

import { spawnSync } from 'child_process';
import path from 'path';

import { getLogger } from '../../core/logger.js';
import { parseImplementationTasks } from '../../core/task-parser.js';
import {
  getTaskProgress,
  initializeTaskProgress,
  readStoryFile,
  updateTaskProgress,
} from '../../core/task-progress.js';
import { type IProvider } from '../../providers/types.js';
import {
  type AgentTaskResult,
  type FailedTaskInfo,
  type ImplementationTask,
  type OrchestratorOptions,
  type OrchestratorResult,
} from '../../types/index.js';
import { runSingleTaskAgent } from '../single-task.js';
import { buildTaskContext } from './context.js';
import { evaluateTaskResult, getNextTask } from './evaluation.js';

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
  options?: OrchestratorOptions,
  provider?: IProvider
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
      result = await runSingleTaskAgent(taskContext, undefined, provider);
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
