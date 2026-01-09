import { StateAssessment, Action } from '../types/index.js';
import { assessState } from '../core/kanban.js';

/**
 * State Assessment Agent
 *
 * Analyzes the current state of the kanban board and determines
 * what actions need to be taken next.
 *
 * This is a simple implementation that delegates to the kanban module.
 * In the future, this could use an LLM to make smarter decisions about
 * prioritization and workflow optimization.
 */
export function runStateAssessor(sdlcRoot: string): StateAssessment {
  return assessState(sdlcRoot);
}

/**
 * Get the next recommended action
 */
export function getNextAction(sdlcRoot: string): Action | null {
  const assessment = assessState(sdlcRoot);
  return assessment.recommendedActions[0] || null;
}

/**
 * Check if there's any work to be done
 */
export function hasWork(sdlcRoot: string): boolean {
  const assessment = assessState(sdlcRoot);
  return assessment.recommendedActions.length > 0;
}
