/**
 * Action execution logic for daemon
 */

import { runImplementationAgent } from '../../agents/implementation.js';
import { runMergeAgent } from '../../agents/merge.js';
import { runPlanReviewAgent } from '../../agents/plan-review.js';
import { runPlanningAgent } from '../../agents/planning.js';
import { runRefinementAgent } from '../../agents/refinement.js';
import { runResearchAgent } from '../../agents/research.js';
import { createPullRequest, runReviewAgent } from '../../agents/review.js';
import { runReworkAgent } from '../../agents/rework.js';
import { type Action } from '../../types/index.js';

/**
 * Execute a single action for the daemon
 */
export async function executeAction(
  action: Action,
  sdlcRoot: string,
  getStory: (root: string, id: string) => any
): Promise<any> {
  // Resolve story by ID to get current path (handles moves between folders)
  let currentStoryPath: string;
  try {
    const story = getStory(sdlcRoot, action.storyId);
    currentStoryPath = story.path;
  } catch (_error) {
    throw new Error(`Story not found: ${action.storyId}`);
  }

  let result;

  switch (action.type) {
    case 'refine':
      result = await runRefinementAgent(currentStoryPath, sdlcRoot);
      break;

    case 'research':
      result = await runResearchAgent(currentStoryPath, sdlcRoot);
      break;

    case 'plan':
      result = await runPlanningAgent(currentStoryPath, sdlcRoot);
      break;

    case 'plan_review':
      result = await runPlanReviewAgent(currentStoryPath, sdlcRoot);
      break;

    case 'implement':
      result = await runImplementationAgent(currentStoryPath, sdlcRoot);
      break;

    case 'review':
      result = await runReviewAgent(currentStoryPath, sdlcRoot);
      break;

    case 'rework':
      if (!action.context) {
        throw new Error('Rework action requires context with review feedback');
      }
      result = await runReworkAgent(currentStoryPath, sdlcRoot, action.context as any);
      break;

    case 'create_pr':
      result = await createPullRequest(currentStoryPath, sdlcRoot);
      break;

    case 'merge':
      result = await runMergeAgent(currentStoryPath, sdlcRoot);
      break;

    default:
      throw new Error(`Unknown action type: ${action.type}`);
  }

  return result;
}
