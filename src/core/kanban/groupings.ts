import { DEFAULT_GROUPINGS, type GroupingDimension, type GroupingSummary, type StoryStatus } from '../../types/index.js';
import { findAllStories } from './discovery.js';

/**
 * Get grouping summaries for a specific dimension.
 * Returns groupings sorted by story count descending.
 *
 * @param sdlcRoot - Path to .ai-sdlc folder
 * @param dimension - Grouping dimension ('thematic', 'temporal', 'structural')
 * @returns Array of grouping summaries with story counts and status breakdowns
 *
 * @example
 * getGroupings(sdlcRoot, 'thematic')
 * // [
 * //   { id: 'ticketing', label: 'epic-ticketing', dimension: 'thematic',
 * //     storyCount: 5, statusBreakdown: { backlog: 2, ready: 1, ... } },
 * //   ...
 * // ]
 */
export function getGroupings(sdlcRoot: string, dimension: GroupingDimension): GroupingSummary[] {
  // Find the default configuration for this dimension
  const config = DEFAULT_GROUPINGS.find(g => g.dimension === dimension);
  if (!config) {
    return [];
  }

  const allStories = findAllStories(sdlcRoot);
  const prefix = config.prefix;

  // Collect all labels matching this dimension's prefix
  const groupingMap = new Map<string, {
    label: string;
    stories: any[];
  }>();

  for (const story of allStories) {
    const matchingLabels = story.frontmatter.labels.filter(label => label.startsWith(prefix));

    // Check for cardinality violations (multiple labels when cardinality is 'single')
    if (config.cardinality === 'single' && matchingLabels.length > 1) {
      console.warn(
        `Story ${story.frontmatter.id} has multiple ${dimension} labels (${matchingLabels.join(', ')}) ` +
        `but cardinality is 'single'. Consider using only one ${prefix}* label per story.`
      );
    }

    for (const label of matchingLabels) {
      if (!groupingMap.has(label)) {
        groupingMap.set(label, {
          label,
          stories: [],
        });
      }
      groupingMap.get(label)!.stories.push(story);
    }
  }

  // Convert to GroupingSummary array
  const summaries: GroupingSummary[] = [];
  for (const [label, data] of groupingMap.entries()) {
    // Extract ID by removing prefix
    const id = label.substring(prefix.length);

    // Calculate status breakdown
    const statusBreakdown: Record<StoryStatus, number> = {
      backlog: 0,
      ready: 0,
      'in-progress': 0,
      done: 0,
      blocked: 0,
    };

    for (const story of data.stories) {
      const status = story.frontmatter.status as StoryStatus;
      statusBreakdown[status]++;
    }

    summaries.push({
      id,
      label,
      dimension,
      storyCount: data.stories.length,
      statusBreakdown,
    });
  }

  // Sort by story count descending
  return summaries.sort((a, b) => b.storyCount - a.storyCount);
}
