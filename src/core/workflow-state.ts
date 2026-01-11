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
 */
export function getStateFilePath(sdlcRoot: string): string {
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
 */
export async function saveWorkflowState(
  state: WorkflowExecutionState,
  sdlcRoot: string
): Promise<void> {
  const statePath = getStateFilePath(sdlcRoot);
  const stateJson = JSON.stringify(state, null, 2);

  try {
    // Ensure the directory exists
    await fs.promises.mkdir(sdlcRoot, { recursive: true });

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
 * @returns The workflow state, or null if no state file exists
 */
export async function loadWorkflowState(
  sdlcRoot: string
): Promise<WorkflowExecutionState | null> {
  const statePath = getStateFilePath(sdlcRoot);

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
 */
export async function clearWorkflowState(sdlcRoot: string): Promise<void> {
  const statePath = getStateFilePath(sdlcRoot);

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
 * @returns True if state file exists
 */
export function hasWorkflowState(sdlcRoot: string): boolean {
  const statePath = getStateFilePath(sdlcRoot);
  return fs.existsSync(statePath);
}
