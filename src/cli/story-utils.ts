import { Story, ThemeColors } from '../types/index.js';

/**
 * Get story flags for display
 * Shows which workflow phases are complete
 *
 * @param story - The story to get flags for
 * @param c - Themed chalk instance
 * @returns Formatted flags string (e.g., "[RPIV!]")
 */
export function getStoryFlags(story: Story, c: ThemeColors): string {
  const flags: string[] = [];

  if (story.frontmatter.research_complete) flags.push('R');
  if (story.frontmatter.plan_complete) flags.push('P');
  if (story.frontmatter.implementation_complete) flags.push('I');
  if (story.frontmatter.reviews_complete) flags.push('V');
  if (story.frontmatter.last_error) flags.push('!');

  return flags.length > 0 ? `[${flags.join('')}]` : '';
}

/**
 * Format status with appropriate color
 *
 * @param status - Status string (backlog, ready, in-progress, done)
 * @param c - Themed chalk instance
 * @returns Colored status string
 */
export function formatStatus(status: string, c: ThemeColors): string {
  switch (status) {
    case 'backlog':
      return c.backlog(status);
    case 'ready':
      return c.ready(status);
    case 'in-progress':
      return c.inProgress(status);
    case 'done':
      return c.done(status);
    default:
      return status;
  }
}
