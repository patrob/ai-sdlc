/**
 * Task status in the implementation workflow
 */
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

/**
 * Structured task within an implementation plan
 *
 * Tasks use markdown checkbox format with embedded metadata:
 * - [ ] **T1**: Task description
 *   - Files: file1.ts, file2.ts
 *   - Dependencies: T2, T3
 */
export interface ImplementationTask {
  /** Task identifier (e.g., "T1", "T2") */
  id: string;
  /** Human-readable task description */
  description: string;
  /** Current status of the task */
  status: TaskStatus;
  /** Optional list of files to create or modify */
  files?: string[];
  /** Optional list of task IDs this task depends on */
  dependencies?: string[];
}

/**
 * Result of validating task format and dependencies
 */
export interface TaskValidationResult {
  /** Whether the task format is valid (no errors) */
  valid: boolean;
  /** Blocking issues (e.g., circular dependencies) */
  errors: string[];
  /** Non-blocking issues (e.g., missing task references) */
  warnings: string[];
}

/**
 * Task progress tracking for resumable implementations
 *
 * Persisted in story file as markdown table under "## Task Progress" section.
 * Enables orchestrator to resume from last completed task after interruptions.
 */
export interface TaskProgress {
  /** Task identifier matching ImplementationTask.id (e.g., "T1", "T2") */
  taskId: string;
  /** Current status of the task */
  status: TaskStatus;
  /** ISO 8601 timestamp when task was started (status -> in_progress) */
  startedAt?: string;
  /** ISO 8601 timestamp when task was completed or failed */
  completedAt?: string;
  /** Error message if status is 'failed' */
  error?: string;
}

/**
 * API for reading and writing task progress to story files
 *
 * All operations are atomic and handle file system errors gracefully.
 * Progress is stored as markdown table in story file for human readability.
 */
export interface TaskProgressAPI {
  /** Read all task progress entries from story file */
  getTaskProgress(storyPath: string): Promise<TaskProgress[]>;
  /** Update a specific task's status and timestamps */
  updateTaskProgress(
    storyPath: string,
    taskId: string,
    status: TaskStatus,
    error?: string
  ): Promise<void>;
  /** Get list of task IDs with status 'pending' */
  getPendingTasks(storyPath: string): Promise<string[]>;
  /** Get the task ID currently in 'in_progress' status (or null) */
  getCurrentTask(storyPath: string): Promise<string | null>;
  /** Initialize progress tracking for a list of task IDs (all start as 'pending') */
  initializeTaskProgress(storyPath: string, taskIds: string[]): Promise<void>;
}

// Action types for state assessor
export type ActionType =
  | 'refine'
  | 'research'
  | 'plan'
  | 'plan_review'
  | 'implement'
  | 'review'
  | 'rework'
  | 'create_pr'
  | 'merge'
  | 'move_to_done';

import type { Story } from './story.js';

export interface Action {
  type: ActionType;
  storyId: string;
  storyPath: string;
  reason: string;
  priority: number;
  context?: any; // Additional context for the action (e.g., review feedback for rework)
}

export interface StateAssessment {
  backlogItems: Story[];
  readyItems: Story[];
  inProgressItems: Story[];
  doneItems: Story[];
  recommendedActions: Action[];
}
