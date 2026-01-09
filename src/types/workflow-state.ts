/**
 * Workflow state types for resume functionality
 */

/**
 * Version of the workflow state file format
 */
export type WorkflowStateVersion = '1.0';

/**
 * Record of a completed action
 */
export interface CompletedActionRecord {
  type: string;
  storyId: string;
  storyPath: string;
  completedAt: string;
}

/**
 * Context for the currently executing action
 */
export interface CurrentActionContext {
  type: string;
  storyId: string;
  storyPath: string;
  startedAt: string;
}

/**
 * Complete workflow execution state
 */
export interface WorkflowExecutionState {
  version: WorkflowStateVersion;
  workflowId: string;
  timestamp: string;
  currentAction: CurrentActionContext | null;
  completedActions: CompletedActionRecord[];
  context: {
    sdlcRoot: string;
    options: {
      auto?: boolean;
      dryRun?: boolean;
    };
    storyContentHash?: string;
  };
}

/**
 * Result of validating a workflow state
 */
export interface WorkflowStateValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}
