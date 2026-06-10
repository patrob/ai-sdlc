import { type Story } from '../../types/index.js';
import { findAllStories } from './discovery.js';
import { labelMatchesPattern } from './patterns.js';

/**
 * Find stories by exact label match.
 * Returns stories sorted by priority ascending.
 *
 * @param sdlcRoot - Path to .ai-sdlc folder
 * @param label - Exact label to match
 * @returns Array of stories with the specified label
 *
 * @example
 * findStoriesByLabel(sdlcRoot, 'epic-ticketing')
 */
export function findStoriesByLabel(sdlcRoot: string, label: string): Story[] {
  const allStories = findAllStories(sdlcRoot);

  return allStories
    .filter(story => story.frontmatter.labels.includes(label))
    .sort((a, b) => {
      // Sort by priority ascending
      if (a.frontmatter.priority !== b.frontmatter.priority) {
        return a.frontmatter.priority - b.frontmatter.priority;
      }
      // Tiebreaker: sort by creation date
      return a.frontmatter.created.localeCompare(b.frontmatter.created);
    });
}

/**
 * Find stories by multiple labels with AND/OR logic.
 * Returns stories sorted by priority ascending.
 *
 * @param sdlcRoot - Path to .ai-sdlc folder
 * @param labels - Array of labels to match
 * @param mode - 'all' requires all labels (AND), 'any' requires at least one (OR)
 * @returns Array of matching stories
 *
 * @example
 * // Stories with BOTH epic-ticketing AND team-backend
 * findStoriesByLabels(sdlcRoot, ['epic-ticketing', 'team-backend'], 'all')
 *
 * // Stories with EITHER epic-ticketing OR epic-auth
 * findStoriesByLabels(sdlcRoot, ['epic-ticketing', 'epic-auth'], 'any')
 */
export function findStoriesByLabels(
  sdlcRoot: string,
  labels: string[],
  mode: 'all' | 'any'
): Story[] {
  // Return empty array for empty labels input
  if (labels.length === 0) {
    return [];
  }

  const allStories = findAllStories(sdlcRoot);

  const filtered = allStories.filter(story => {
    if (mode === 'all') {
      // All labels must be present (AND logic)
      return labels.every(label => story.frontmatter.labels.includes(label));
    } else {
      // At least one label must be present (OR logic)
      return labels.some(label => story.frontmatter.labels.includes(label));
    }
  });

  return filtered.sort((a, b) => {
    // Sort by priority ascending
    if (a.frontmatter.priority !== b.frontmatter.priority) {
      return a.frontmatter.priority - b.frontmatter.priority;
    }
    // Tiebreaker: sort by creation date
    return a.frontmatter.created.localeCompare(b.frontmatter.created);
  });
}

/**
 * Find stories by glob pattern matching on labels.
 * Returns deduplicated stories sorted by priority ascending.
 *
 * @param sdlcRoot - Path to .ai-sdlc folder
 * @param pattern - Glob pattern (e.g., 'epic-*', '*-test', 'team-*-backend')
 * @returns Array of stories with at least one matching label
 *
 * @example
 * findStoriesByPattern(sdlcRoot, 'epic-*') // All stories with epic-* labels
 * findStoriesByPattern(sdlcRoot, '*-test') // All stories with *-test labels
 */
export function findStoriesByPattern(sdlcRoot: string, pattern: string): Story[] {
  // Return empty array for empty pattern
  if (pattern === '') {
    return [];
  }

  const allStories = findAllStories(sdlcRoot);

  const filtered = allStories.filter(story => {
    // Check if any label matches the pattern
    return story.frontmatter.labels.some(label => labelMatchesPattern(label, pattern));
  });

  // Deduplicate by story ID (in case multiple labels match)
  const seen = new Set<string>();
  const deduplicated = filtered.filter(story => {
    if (seen.has(story.frontmatter.id)) {
      return false;
    }
    seen.add(story.frontmatter.id);
    return true;
  });

  return deduplicated.sort((a, b) => {
    // Sort by priority ascending
    if (a.frontmatter.priority !== b.frontmatter.priority) {
      return a.frontmatter.priority - b.frontmatter.priority;
    }
    // Tiebreaker: sort by creation date
    return a.frontmatter.created.localeCompare(b.frontmatter.created);
  });
}

/**
 * Get all unique labels across all stories.
 * Returns labels sorted alphabetically.
 *
 * @param sdlcRoot - Path to .ai-sdlc folder
 * @returns Sorted array of unique labels
 *
 * @example
 * getUniqueLabels(sdlcRoot) // ['epic-auth', 'epic-ticketing', 'team-backend', ...]
 */
export function getUniqueLabels(sdlcRoot: string): string[] {
  const allStories = findAllStories(sdlcRoot);

  const labelsSet = new Set<string>();
  for (const story of allStories) {
    for (const label of story.frontmatter.labels) {
      labelsSet.add(label);
    }
  }

  return Array.from(labelsSet).sort();
}

/**
 * Find stories belonging to a specific epic.
 * Checks both the epic frontmatter field (primary) and labels (backwards compatibility).
 *
 * @param sdlcRoot - Path to .ai-sdlc folder
 * @param epicId - Epic identifier (without 'epic-' prefix)
 * @returns Array of stories belonging to the specified epic
 *
 * @example
 * findStoriesByEpic(sdlcRoot, 'ticketing-integration')
 * // Returns stories with epic: 'ticketing-integration' or label 'epic-ticketing-integration'
 */
export function findStoriesByEpic(sdlcRoot: string, epicId: string): Story[] {
  const allStories = findAllStories(sdlcRoot);

  return allStories.filter(story => {
    // Check epic frontmatter field (primary)
    if (story.frontmatter.epic === epicId || story.frontmatter.epic === `epic-${epicId}`) {
      return true;
    }
    // Check labels for backwards compatibility
    return story.frontmatter.labels.some(label =>
      labelMatchesPattern(label, `epic-${epicId}`)
    );
  });
}

/**
 * Find stories by sprint label (convenience wrapper).
 * Queries for stories with 'sprint-{sprintId}' label.
 *
 * @param sdlcRoot - Path to .ai-sdlc folder
 * @param sprintId - Sprint identifier (without 'sprint-' prefix)
 * @returns Array of stories with the specified sprint label
 *
 * @example
 * findStoriesBySprint(sdlcRoot, '2024-q1')
 * // Returns stories with label 'sprint-2024-q1'
 */
export function findStoriesBySprint(sdlcRoot: string, sprintId: string): Story[] {
  return findStoriesByPattern(sdlcRoot, `sprint-${sprintId}`);
}

/**
 * Find stories by team label (convenience wrapper).
 * Queries for stories with 'team-{teamId}' label.
 *
 * @param sdlcRoot - Path to .ai-sdlc folder
 * @param teamId - Team identifier (without 'team-' prefix)
 * @returns Array of stories with the specified team label
 *
 * @example
 * findStoriesByTeam(sdlcRoot, 'backend')
 * // Returns stories with label 'team-backend'
 */
export function findStoriesByTeam(sdlcRoot: string, teamId: string): Story[] {
  return findStoriesByPattern(sdlcRoot, `team-${teamId}`);
}
