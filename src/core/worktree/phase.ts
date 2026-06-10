import { type ActionType, type Story } from '../../types/index.js';

/**
 * Get the last completed phase from a story
 * @param story - The story to check
 * @returns The last completed phase name, or null if no phases are complete
 */
export function getLastCompletedPhase(story: Story): string | null {
  if (story.frontmatter.reviews_complete) {
    return 'review';
  }
  if (story.frontmatter.implementation_complete) {
    return 'implementation';
  }
  if (story.frontmatter.plan_complete) {
    return 'plan';
  }
  if (story.frontmatter.research_complete) {
    return 'research';
  }
  return null;
}

/**
 * Get the next phase that should be executed for a story
 * Uses the same logic as assessState() in kanban.ts
 * @param story - The story to check
 * @returns The next action type to execute, or null if story is complete
 */
export function getNextPhase(story: Story): ActionType | null {
  // Check if story is blocked
  if (story.frontmatter.status === 'blocked') {
    return null;
  }

  // For ready stories, follow: research → plan → implement
  if (story.frontmatter.status === 'ready') {
    if (!story.frontmatter.research_complete) {
      return 'research';
    }
    if (!story.frontmatter.plan_complete) {
      return 'plan';
    }
    return 'implement';
  }

  // For in-progress stories, check all phases in order: research → plan → implement → review → create_pr
  if (story.frontmatter.status === 'in-progress') {
    if (!story.frontmatter.research_complete) {
      return 'research';
    }
    if (!story.frontmatter.plan_complete) {
      return 'plan';
    }
    if (!story.frontmatter.implementation_complete) {
      return 'implement';
    }
    if (!story.frontmatter.reviews_complete) {
      return 'review';
    }
    return 'create_pr';
  }

  // For done stories, no next phase
  if (story.frontmatter.status === 'done') {
    return null;
  }

  // Default: backlog stories should be refined first
  return 'refine';
}
