import { getPhaseInfo } from './phase-display.js';
import { getStoryFlags as getStoryFlagsUtil, formatStatus as formatStatusUtil } from '../story-utils.js';
import type { Action, Story } from '../../types/index.js';

/**
 * Truncate story slug if it exceeds terminal width
 *
 * @param text - The text to truncate
 * @param maxWidth - Maximum width (defaults to terminal columns or 80)
 * @returns Truncated text with ellipsis if needed
 */
export function truncateForTerminal(text: string, maxWidth?: number): string {
  // Enforce minimum 40 and maximum 1000 width to prevent memory/performance issues
  const terminalWidth = Math.min(1000, Math.max(40, maxWidth || process.stdout.columns || 80));
  const minWidth = 40; // Reserve space for phase indicators and verbs

  if (text.length + minWidth <= terminalWidth) {
    return text;
  }

  const availableWidth = terminalWidth - minWidth - 3; // -3 for "..."
  if (availableWidth <= 0) {
    // When there's no room for truncation indicator, just return what fits
    return text.slice(0, 10);
  }

  return text.slice(0, availableWidth) + '...';
}

/**
 * Sanitize story slug by removing ANSI escape codes
 *
 * This function prevents ANSI injection attacks by stripping escape sequences
 * that could manipulate terminal output (colors, cursor movement, screen clearing, etc.)
 *
 * @security Prevents ANSI injection attacks through malicious story titles
 * @param text - The text to sanitize
 * @returns Sanitized text without ANSI codes
 */
export function sanitizeStorySlug(text: string): string {
  // Remove ANSI escape codes (security: prevent ANSI injection attacks)
  // Comprehensive regex that covers:
  // - SGR (Select Graphic Rendition): \x1b\[[0-9;]*m
  // - Cursor positioning and other CSI sequences: \x1b\[[0-9;]*[A-Za-z]
  // - OSC (Operating System Command): \x1b\][^\x07]*\x07
  // - Incomplete sequences: \x1b\[[^\x1b]*
  return text
    .replace(/\x1b\[[0-9;]*m/g, '') // SGR color codes (complete)
    .replace(/\x1b\[[0-9;]*[A-Za-z]/g, '') // Other CSI sequences (cursor movement, etc.)
    .replace(/\x1b\][^\x07]*\x07/g, '') // OSC sequences (complete)
    .replace(/\x1b\[[^\x1b]*/g, ''); // Incomplete CSI sequences
}

/**
 * Format an action for display with phase indicator
 *
 * @param action - The action to format
 * @param includePhaseIndicator - Whether to include phase indicator brackets
 * @param colors - The theme colors object (parameter renamed for clarity)
 * @returns Formatted action string
 */
export function formatAction(action: Action, includePhaseIndicator: boolean = false, colors?: any): string {
  const actionVerbs: Record<Action['type'], string> = {
    refine: 'Refine',
    research: 'Research',
    plan: 'Plan',
    plan_review: 'Plan Review',
    implement: 'Implement',
    review: 'Review',
    rework: 'Rework',
    create_pr: 'Create PR for',
    merge: 'Merge PR for',
    move_to_done: 'Move to done',
  };

  const storySlug = action.storyPath.split('/').pop()?.replace('.md', '') || action.storyId;
  const sanitizedSlug = sanitizeStorySlug(storySlug); // Security: sanitize ANSI codes
  const truncatedSlug = truncateForTerminal(sanitizedSlug);
  const verb = actionVerbs[action.type];

  // If no color context or phase indicator not requested, return simple format
  if (!includePhaseIndicator || !colors) {
    return `${verb} "${truncatedSlug}"`;
  }

  // Get phase info for RPIV actions
  const phaseInfo = getPhaseInfo(action.type, colors);
  if (!phaseInfo) {
    // Non-RPIV actions (create_pr, move_to_done) don't get phase indicators
    return `${verb} "${truncatedSlug}"`;
  }

  // Format with phase indicator
  const useAscii = process.env.NO_COLOR !== undefined;
  const icon = useAscii ? phaseInfo.iconAscii : phaseInfo.icon;
  const phaseLabel = phaseInfo.colorFn(`[${phaseInfo.name}]`);

  // Special formatting for review actions
  if (action.type === 'review') {
    return `${phaseLabel} ${icon} ${colors.reviewAction(verb)} "${truncatedSlug}"`;
  }

  return `${phaseLabel} ${icon} ${verb} "${truncatedSlug}"`;
}

/**
 * Get status flags for a story (wrapper for shared utility)
 * Adds dim styling and error color for backward compatibility
 */
export function getStoryFlags(story: Story, c: any): string {
  const flags = getStoryFlagsUtil(story, c);
  return flags ? c.dim(` ${flags}`) : '';
}
