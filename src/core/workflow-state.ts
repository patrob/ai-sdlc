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
import { STORIES_FOLDER } from '../types/index.js';
import { sanitizeStoryId } from './story.js';
import { getLogger } from './logger.js';

const STATE_FILE_NAME = '.workflow-state.json';
const CURRENT_VERSION: WorkflowStateVersion = '1.0';

/**
 * Get the path to the workflow state file.
 *
 * SECURITY: storyId is sanitized using sanitizeStoryId() to prevent path traversal attacks.
 * Never construct paths manually - always use this function to ensure proper sanitization.
 *
 * @param sdlcRoot - Path to the .ai-sdlc directory
 * @param storyId - Optional story ID for per-story state isolation
 * @returns Path to the workflow state file (story-specific or global)
 */
export function getStateFilePath(sdlcRoot: string, storyId?: string): string {
  if (storyId) {
    const sanitized = sanitizeStoryId(storyId);
    return path.join(sdlcRoot, STORIES_FOLDER, sanitized, STATE_FILE_NAME);
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
  const logger = getLogger();
  const statePath = getStateFilePath(sdlcRoot, storyId);
  const stateJson = JSON.stringify(state, null, 2);

  logger.debug('workflow-state', 'Saving workflow state', {
    workflowId: state.workflowId,
    storyId,
    actionCount: state.completedActions.length,
  });

  try {
    // Ensure the directory exists (including story subdirectories)
    const stateDir = path.dirname(statePath);
    await fs.promises.mkdir(stateDir, { recursive: true });

    // Write atomically to prevent corruption
    await writeFileAtomic(statePath, stateJson, { encoding: 'utf-8' });
  } catch (error) {
    // Specific permission error handling
    if (error && typeof error === 'object' && 'code' in error) {
      const code = (error as { code: string }).code;
      if (code === 'EACCES' || code === 'EPERM') {
        throw new Error(
          `Permission denied: Cannot write workflow state to ${statePath}. ` +
          `Check file permissions for the directory and ensure it is writable.`
        );
      }
    }

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
  const logger = getLogger();
  const statePath = getStateFilePath(sdlcRoot, storyId);

  try {
    // Check if file exists
    if (!fs.existsSync(statePath)) {
      logger.debug('workflow-state', 'No workflow state found', { storyId });
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

    logger.debug('workflow-state', 'Loaded workflow state', {
      workflowId: state.workflowId,
      storyId,
      actionCount: state.completedActions.length,
      ageMs: Date.now() - new Date(state.timestamp).getTime(),
    });

    return state;
  } catch (error) {
    if (error instanceof SyntaxError) {
      logger.error('workflow-state', 'Corrupted state file', { statePath });
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
 * Migrate global workflow state to story-specific location.
 *
 * Call this function at CLI startup (before loading workflow state) to automatically
 * move legacy global state files to the new per-story location.
 *
 * Migration behavior:
 * - Extracts story ID from context.options.story, completedActions, or currentAction
 * - Skips migration if workflow is currently in progress (currentAction set)
 * - Skips migration if no story ID can be determined
 * - Validates target file if it already exists before deleting global file
 * - Deletes global file only after successful write to target location
 *
 * @param sdlcRoot - Path to the .ai-sdlc directory
 * @returns Promise resolving to migration result object:
 *   - migrated: boolean - true if migration was performed, false if skipped
 *   - message: string - Human-readable description of what happened
 *
 * @example
 * const result = await migrateGlobalWorkflowState(sdlcRoot);
 * if (result.migrated) {
 *   console.log(result.message); // "Successfully migrated workflow state to story S-0033"
 * }
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

    // Check if workflow in progress IMMEDIATELY after reading state
    if (state.currentAction) {
      return {
        migrated: false,
        message: 'Skipping migration: workflow currently in progress. Complete or reset workflow before migrating.',
      };
    }

    // Determine the story ID from the state
    let storyId: string | undefined;

    // Try to get story ID from context.options.story first
    if (state.context?.options?.story) {
      storyId = state.context.options.story;
    }
    // Fallback to first completed action's storyId
    if (!storyId && state.completedActions && state.completedActions.length > 0) {
      const firstAction = state.completedActions[0];
      if (firstAction && 'storyId' in firstAction) {
        storyId = firstAction.storyId;
      }
    }

    // If no story ID found, leave state in place
    if (!storyId) {
      return {
        migrated: false,
        message: 'Cannot migrate: no story ID found in workflow state. Manual migration required.',
      };
    }

    // SECURITY: Sanitize story ID to prevent path traversal
    let sanitizedStoryId: string;
    try {
      sanitizedStoryId = sanitizeStoryId(storyId);
    } catch (error) {
      return {
        migrated: false,
        message: `Cannot migrate: invalid story ID "${storyId}". ${error instanceof Error ? error.message : String(error)}`,
      };
    }

    // Check if target location already exists (idempotent)
    const targetPath = getStateFilePath(sdlcRoot, sanitizedStoryId);
    if (fs.existsSync(targetPath)) {
      // Validate existing target is not corrupt before deleting global backup
      try {
        const targetContent = await fs.promises.readFile(targetPath, 'utf-8');
        const targetState = JSON.parse(targetContent);
        const validation = validateWorkflowState(targetState);

        if (!validation.valid) {
          return {
            migrated: false,
            message: `Target state file exists but is invalid. Keeping global file as backup. Manual intervention required. Errors: ${validation.errors.join(', ')}`,
          };
        }

        // Target is valid, safe to delete global
        await fs.promises.unlink(globalStatePath);
        return {
          migrated: true,
          message: `Global workflow state already migrated to story ${sanitizedStoryId}. Removed duplicate global file.`,
        };
      } catch (error) {
        return {
          migrated: false,
          message: `Target state file exists but is corrupted. Keeping global file as backup. Manual intervention required. Error: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
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
      message: `Successfully migrated workflow state from global to story-specific location: ${sanitizedStoryId}`,
    };
  } catch (error) {
    // Specific error handling for common cases
    if (error && typeof error === 'object' && 'code' in error) {
      const code = (error as { code: string }).code;

      if (code === 'ENOENT') {
        return {
          migrated: false,
          message: 'Global state file disappeared during migration. No action taken.',
        };
      }

      if (code === 'EACCES' || code === 'EPERM') {
        return {
          migrated: false,
          message: `Permission denied during migration. Check file permissions for: ${globalStatePath}`,
        };
      }
    }

    if (error instanceof SyntaxError) {
      return {
        migrated: false,
        message: 'Global state file contains invalid JSON. Manual migration required.',
      };
    }

    const errorMsg = error instanceof Error ? error.message : String(error);
    return {
      migrated: false,
      message: `Migration failed: ${errorMsg}`,
    };
  }
}
