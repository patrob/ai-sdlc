/**
 * Workflow state persistence for resume functionality
 *
 * This module provides functions to save, load, and validate workflow execution state,
 * enabling the --continue flag to resume workflows after interruption.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import writeFileAtomic from 'write-file-atomic';
import {
  WorkflowExecutionState,
  WorkflowStateValidationResult,
  WorkflowStateVersion,
} from '../types/workflow-state.js';

const STATE_FILE_NAME = '.workflow-state.json';
const CURRENT_VERSION: WorkflowStateVersion = '1.0';

/**
 * Get the path to the workflow state file
 *
 * @param sdlcRoot - Path to the .ai-sdlc directory
 * @param storyId - Optional story ID for per-story state isolation
 * @returns Path to the workflow state file (story-specific or global)
 */
export function getStateFilePath(sdlcRoot: string, storyId?: string): string {
  if (storyId) {
    return path.join(sdlcRoot, 'stories', storyId, STATE_FILE_NAME);
  }
  return path.join(sdlcRoot, STATE_FILE_NAME);
}

/**
 * Generate a unique workflow ID based on timestamp
 */
export function generateWorkflowId(): string {
  const timestamp = Date.now();
  const random = crypto.randomBytes(4).toString('hex');
  return `workflow-${timestamp}-${random}`;
}

/**
 * Calculate SHA-256 hash of story content for change detection
 */
export function calculateStoryHash(storyPath: string): string {
  try {
    const content = fs.readFileSync(storyPath, 'utf-8');
    return crypto.createHash('sha256').update(content).digest('hex');
  } catch (error) {
    // If file doesn't exist or can't be read, return empty hash
    return '';
  }
}

/**
 * Save workflow state to disk atomically
 *
 * Uses write-file-atomic to ensure state file is never corrupted by crashes.
 *
 * @param state - The workflow execution state to save
 * @param sdlcRoot - Path to the .ai-sdlc directory
 * @param storyId - Optional story ID for per-story state isolation
 */
export async function saveWorkflowState(
  state: WorkflowExecutionState,
  sdlcRoot: string,
  storyId?: string
): Promise<void> {
  const statePath = getStateFilePath(sdlcRoot, storyId);
  const stateJson = JSON.stringify(state, null, 2);

  try {
    // Ensure the directory exists (including story subdirectories)
    const stateDir = path.dirname(statePath);
    await fs.promises.mkdir(stateDir, { recursive: true });

    // Write atomically to prevent corruption
    await writeFileAtomic(statePath, stateJson, { encoding: 'utf-8' });
  } catch (error) {
    throw new Error(
      `Failed to save workflow state: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Load workflow state from disk
 *
 * @param sdlcRoot - Path to the .ai-sdlc directory
 * @param storyId - Optional story ID for per-story state isolation
 * @returns The workflow state, or null if no state file exists
 */
export async function loadWorkflowState(
  sdlcRoot: string,
  storyId?: string
): Promise<WorkflowExecutionState | null> {
  const statePath = getStateFilePath(sdlcRoot, storyId);

  try {
    // Check if file exists
    if (!fs.existsSync(statePath)) {
      return null;
    }

    // Read and parse the state file
    const content = await fs.promises.readFile(statePath, 'utf-8');
    const state = JSON.parse(content) as WorkflowExecutionState;

    // Validate the state
    const validation = validateWorkflowState(state);
    if (!validation.valid) {
      throw new Error(`Invalid state file: ${validation.errors.join(', ')}`);
    }

    return state;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(
        `Corrupted workflow state file at ${statePath}. ` +
        `Delete the file to start fresh: rm "${statePath}"`
      );
    }
    throw error;
  }
}

/**
 * Validate workflow state structure
 *
 * @param state - The state object to validate
 * @returns Validation result with errors and warnings
 */
export function validateWorkflowState(state: any): WorkflowStateValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check required fields
  if (!state || typeof state !== 'object') {
    errors.push('State must be an object');
    return { valid: false, errors, warnings };
  }

  if (!state.version) {
    errors.push('Missing required field: version');
  } else if (state.version !== CURRENT_VERSION) {
    warnings.push(`State version ${state.version} differs from current version ${CURRENT_VERSION}`);
  }

  if (!state.workflowId) {
    errors.push('Missing required field: workflowId');
  }

  if (!state.timestamp) {
    errors.push('Missing required field: timestamp');
  }

  if (!Array.isArray(state.completedActions)) {
    errors.push('completedActions must be an array');
  }

  if (!state.context || typeof state.context !== 'object') {
    errors.push('Missing or invalid context object');
  } else {
    if (!state.context.sdlcRoot) {
      errors.push('Missing context.sdlcRoot');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Clear workflow state (delete the state file)
 *
 * @param sdlcRoot - Path to the .ai-sdlc directory
 * @param storyId - Optional story ID for per-story state isolation
 */
export async function clearWorkflowState(sdlcRoot: string, storyId?: string): Promise<void> {
  const statePath = getStateFilePath(sdlcRoot, storyId);

  try {
    if (fs.existsSync(statePath)) {
      await fs.promises.unlink(statePath);
    }
  } catch (error) {
    // Ignore errors if file doesn't exist or can't be deleted
    // This is a cleanup operation, not critical
  }
}

/**
 * Check if workflow state exists
 *
 * @param sdlcRoot - Path to the .ai-sdlc directory
 * @param storyId - Optional story ID for per-story state isolation
 * @returns True if state file exists
 */
export function hasWorkflowState(sdlcRoot: string, storyId?: string): boolean {
  const statePath = getStateFilePath(sdlcRoot, storyId);
  return fs.existsSync(statePath);
}

/**
 * Migrate global workflow state to story-specific location
 *
 * This function detects existing global .workflow-state.json files and moves them
 * to the appropriate story-specific location (.ai-sdlc/stories/{id}/.workflow-state.json).
 *
 * Migration is idempotent and non-destructive. It will:
 * - Check if global state file exists
 * - Extract story ID from state (context.options.story or completedActions[0].storyId)
 * - Move state to story-specific location
 * - Delete global state file only after successful migration
 * - Skip migration if no story ID can be determined
 *
 * @param sdlcRoot - Path to the .ai-sdlc directory
 * @returns Migration result with status and message
 */
export async function migrateGlobalWorkflowState(
  sdlcRoot: string
): Promise<{ migrated: boolean; message: string }> {
  const globalStatePath = getStateFilePath(sdlcRoot);

  // Check if global state file exists
  if (!fs.existsSync(globalStatePath)) {
    return { migrated: false, message: 'No global workflow state file found' };
  }

  try {
    // Read and parse the global state
    const content = await fs.promises.readFile(globalStatePath, 'utf-8');
    const state = JSON.parse(content) as WorkflowExecutionState;

    // Determine the story ID from the state
    let storyId: string | undefined;

    // Try to get story ID from context.options.story first
    if (state.context?.options?.story) {
      storyId = state.context.options.story;
    }
    // Fallback to first completed action's storyId
    else if (state.completedActions && state.completedActions.length > 0) {
      storyId = state.completedActions[0].storyId;
    }
    // Fallback to current action's storyId
    else if (state.currentAction) {
      storyId = state.currentAction.storyId;
    }

    // If no story ID found, leave state in place
    if (!storyId) {
      return {
        migrated: false,
        message: 'Cannot migrate: no story ID found in workflow state. Manual migration required.',
      };
    }

    // Check if target location already exists (idempotent)
    const targetPath = getStateFilePath(sdlcRoot, storyId);
    if (fs.existsSync(targetPath)) {
      // Target already exists - just delete global file
      await fs.promises.unlink(globalStatePath);
      return {
        migrated: true,
        message: `Migration skipped: story-specific state already exists for ${storyId}. Global state removed.`,
      };
    }

    // Check if workflow is currently in progress (currentAction is set)
    if (state.currentAction) {
      return {
        migrated: false,
        message: 'Migration skipped: workflow is currently in progress. Complete or abort workflow before migrating.',
      };
    }

    // Create target directory
    const targetDir = path.dirname(targetPath);
    await fs.promises.mkdir(targetDir, { recursive: true });

    // Write to target location atomically
    const stateJson = JSON.stringify(state, null, 2);
    await writeFileAtomic(targetPath, stateJson, { encoding: 'utf-8' });

    // Verify target file was created successfully
    if (!fs.existsSync(targetPath)) {
      throw new Error('Target state file was not created successfully');
    }

    // Delete global file only after successful write
    await fs.promises.unlink(globalStatePath);

    return {
      migrated: true,
      message: `Successfully migrated workflow state from global to story-specific location: ${storyId}`,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return {
      migrated: false,
      message: `Migration failed: ${errorMsg}`,
    };
  }
}
