/**
 * Task progress tracking for resumable implementations
 *
 * Persists task-level progress in story files as markdown tables,
 * enabling orchestrator to resume from last completed task after interruptions.
 */

import fs from 'fs';
import path from 'path';
import writeFileAtomic from 'write-file-atomic';
import { TaskProgress, TaskStatus } from '../types/index.js';

const TASK_PROGRESS_SECTION = '## Task Progress';

/**
 * Parse progress table from markdown content
 *
 * Expected format:
 * ## Task Progress
 *
 * | Task | Status | Started | Completed |
 * |------|--------|---------|-----------|
 * | T1 | completed | 2026-01-16T10:00:00Z | 2026-01-16T10:05:00Z |
 * | T2 | in_progress | 2026-01-16T10:05:30Z | - |
 *
 * @param content - Story file markdown content
 * @returns Array of TaskProgress objects (empty if section missing or corrupted)
 */
export function parseProgressTable(content: string): TaskProgress[] {
  const sectionIndex = content.indexOf(TASK_PROGRESS_SECTION);
  if (sectionIndex === -1) {
    return [];
  }

  // Find the table rows (skip header and separator)
  const afterSection = content.slice(sectionIndex);
  const lines = afterSection.split('\n');

  const taskProgress: TaskProgress[] = [];
  let foundTable = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip section header, empty lines, and markdown table separator
    if (!trimmed || trimmed.startsWith('#') || trimmed.match(/^\|[\s-:|]+\|$/)) {
      continue;
    }

    // Stop at next section
    if (trimmed.startsWith('##') && !trimmed.includes(TASK_PROGRESS_SECTION)) {
      break;
    }

    // Parse table row
    if (trimmed.startsWith('|')) {
      foundTable = true;
      const cells = trimmed
        .split('|')
        .map(cell => cell.trim())
        .filter(cell => cell.length > 0);

      // Skip header row
      if (cells[0] === 'Task' || cells[1] === 'Status') {
        continue;
      }

      // Validate we have at least 4 columns
      if (cells.length < 4) {
        console.warn(`[task-progress] Skipping malformed table row: ${trimmed}`);
        continue;
      }

      const [taskId, statusStr, startedStr, completedStr] = cells;

      // Validate status
      const validStatuses: TaskStatus[] = ['pending', 'in_progress', 'completed', 'failed'];
      if (!validStatuses.includes(statusStr as TaskStatus)) {
        console.warn(`[task-progress] Invalid status '${statusStr}' for task ${taskId}, skipping row`);
        continue;
      }

      const progress: TaskProgress = {
        taskId,
        status: statusStr as TaskStatus,
      };

      // Parse timestamps (handle "-" as missing)
      if (startedStr && startedStr !== '-') {
        progress.startedAt = startedStr;
      }
      if (completedStr && completedStr !== '-') {
        progress.completedAt = completedStr;
      }

      // Handle error column if present (5th column)
      if (cells.length >= 5 && cells[4] && cells[4] !== '-') {
        progress.error = cells[4];
      }

      taskProgress.push(progress);
    }
  }

  if (foundTable && taskProgress.length === 0) {
    console.warn('[task-progress] Found progress table but no valid task rows, table may be corrupted');
  }

  return taskProgress;
}

/**
 * Generate markdown table from TaskProgress array
 *
 * @param progress - Array of task progress entries
 * @returns Markdown table string
 */
export function generateProgressTable(progress: TaskProgress[]): string {
  const rows: string[] = [];

  // Header
  rows.push('| Task | Status | Started | Completed |');
  rows.push('|------|--------|---------|-----------|');

  // Task rows
  for (const task of progress) {
    const started = task.startedAt || '-';
    const completed = task.completedAt || '-';
    rows.push(`| ${task.taskId} | ${task.status} | ${started} | ${completed} |`);
  }

  return rows.join('\n');
}

/**
 * Read story file content
 *
 * @param storyPath - Absolute path to story.md file
 * @returns Story file content
 * @throws Error if file doesn't exist or can't be read
 */
export async function readStoryFile(storyPath: string): Promise<string> {
  try {
    return await fs.promises.readFile(storyPath, 'utf-8');
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      throw new Error(`Story file not found: ${path.basename(storyPath)}`);
    }
    if (error.code === 'EACCES' || error.code === 'EPERM') {
      throw new Error(`Permission denied reading story file: ${path.basename(storyPath)}`);
    }
    throw new Error(`Failed to read story file: ${error.message}`);
  }
}

/**
 * Write story file content atomically with retry logic
 *
 * @param storyPath - Absolute path to story.md file
 * @param content - New story content
 * @throws Error after all retries exhausted
 */
export async function writeStoryFile(storyPath: string, content: string): Promise<void> {
  const maxRetries = 3;
  const retryDelays = [100, 200, 400]; // Exponential backoff

  // Ensure parent directory exists first (outside retry loop)
  const storyDir = path.dirname(storyPath);
  await fs.promises.mkdir(storyDir, { recursive: true });

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Atomic write
      await writeFileAtomic(storyPath, content, { encoding: 'utf-8' });
      return; // Success
    } catch (error: any) {
      const isLastAttempt = attempt === maxRetries - 1;

      // Don't retry on permission errors - throw immediately
      if (error.code === 'EACCES' || error.code === 'EPERM') {
        throw new Error(`Permission denied writing story file: ${path.basename(storyPath)}`);
      }

      if (isLastAttempt) {
        throw new Error(`Failed to write story file after ${maxRetries} attempts`);
      }

      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, retryDelays[attempt]));
    }
  }
}

/**
 * Get all task progress entries from story file
 *
 * @param storyPath - Absolute path to story.md file
 * @returns Array of TaskProgress objects (empty if section missing)
 */
export async function getTaskProgress(storyPath: string): Promise<TaskProgress[]> {
  const content = await readStoryFile(storyPath);
  return parseProgressTable(content);
}

/**
 * Initialize progress tracking for a list of tasks
 *
 * Creates "## Task Progress" section with all tasks in 'pending' status.
 * If section already exists, logs warning and skips initialization.
 *
 * @param storyPath - Absolute path to story.md file
 * @param taskIds - Array of task IDs (e.g., ['T1', 'T2', 'T3'])
 */
export async function initializeTaskProgress(
  storyPath: string,
  taskIds: string[]
): Promise<void> {
  const content = await readStoryFile(storyPath);

  // Check if progress section already exists
  if (content.includes(TASK_PROGRESS_SECTION)) {
    console.warn('[task-progress] Progress section already exists, skipping initialization');
    return;
  }

  // Create initial progress entries (all pending)
  const progress: TaskProgress[] = taskIds.map(taskId => ({
    taskId,
    status: 'pending' as TaskStatus,
  }));

  const progressTable = generateProgressTable(progress);
  const progressSection = `\n${TASK_PROGRESS_SECTION}\n\n${progressTable}\n`;

  // Append to end of file
  const newContent = content.trimEnd() + '\n' + progressSection;

  await writeStoryFile(storyPath, newContent);
}

/**
 * Update a specific task's status and timestamps
 *
 * Modifies the task row in the progress table and writes back to disk atomically.
 * Sets timestamps based on status transitions:
 * - 'in_progress': Sets startedAt (if not already set)
 * - 'completed' or 'failed': Sets completedAt
 *
 * @param storyPath - Absolute path to story.md file
 * @param taskId - Task ID to update (e.g., 'T1')
 * @param status - New status
 * @param error - Optional error message (only used with 'failed' status)
 * @throws Error if task not found in progress table
 */
export async function updateTaskProgress(
  storyPath: string,
  taskId: string,
  status: TaskStatus,
  error?: string
): Promise<void> {
  const content = await readStoryFile(storyPath);
  const progress = parseProgressTable(content);

  // Find task to update
  const taskIndex = progress.findIndex(t => t.taskId === taskId);
  if (taskIndex === -1) {
    throw new Error(`Task ${taskId} not found in progress table`);
  }

  const task = progress[taskIndex];
  const now = new Date().toISOString();

  // Update status
  task.status = status;

  // Set timestamps based on status transition
  if (status === 'in_progress' && !task.startedAt) {
    task.startedAt = now;
  }
  if (status === 'completed' || status === 'failed') {
    task.completedAt = now;
  }

  // Store error message if provided
  if (error) {
    task.error = error;
  }

  // Regenerate table
  const newTable = generateProgressTable(progress);

  // Replace progress section in content
  const sectionIndex = content.indexOf(TASK_PROGRESS_SECTION);
  if (sectionIndex === -1) {
    throw new Error('Progress section disappeared during update, this should not happen');
  }

  // Find next section or end of file
  const afterSection = content.slice(sectionIndex + TASK_PROGRESS_SECTION.length);
  const nextSectionMatch = afterSection.match(/\n## [^#]/);
  const nextSectionOffset = nextSectionMatch
    ? sectionIndex + TASK_PROGRESS_SECTION.length + nextSectionMatch.index!
    : content.length;

  // Rebuild content
  const beforeSection = content.slice(0, sectionIndex);
  const afterNextSection = content.slice(nextSectionOffset);
  const newContent = `${beforeSection}${TASK_PROGRESS_SECTION}\n\n${newTable}\n${afterNextSection}`;

  await writeStoryFile(storyPath, newContent);
}

/**
 * Get list of task IDs with status 'pending'
 *
 * @param storyPath - Absolute path to story.md file
 * @returns Array of pending task IDs
 */
export async function getPendingTasks(storyPath: string): Promise<string[]> {
  const progress = await getTaskProgress(storyPath);
  return progress
    .filter(task => task.status === 'pending')
    .map(task => task.taskId);
}

/**
 * Get the task ID currently in 'in_progress' status
 *
 * @param storyPath - Absolute path to story.md file
 * @returns Task ID or null if no task is in progress
 */
export async function getCurrentTask(storyPath: string): Promise<string | null> {
  const progress = await getTaskProgress(storyPath);
  const currentTask = progress.find(task => task.status === 'in_progress');
  return currentTask ? currentTask.taskId : null;
}
