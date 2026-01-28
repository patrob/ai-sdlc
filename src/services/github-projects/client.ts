/**
 * GitHub Projects v2 API client using gh CLI.
 */

import { execSync } from 'child_process';
import { ProjectItem, GitHubProjectsConfig } from './types.js';
import { buildProjectItemsQuery, extractPriorityValue } from './queries.js';
import { normalizePositionPriority, normalizeMappedPriority } from './priority-normalizer.js';

/**
 * Check if gh CLI is available.
 */
export function isGhAvailable(): boolean {
  try {
    execSync('gh --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get all items from a GitHub Project.
 *
 * @param config - GitHub Projects configuration
 * @returns Array of project items
 * @throws Error if gh CLI is not available or API call fails
 */
export async function getProjectItems(config: GitHubProjectsConfig): Promise<ProjectItem[]> {
  if (!isGhAvailable()) {
    throw new Error('gh CLI is not available. Please install it: https://cli.github.com/');
  }

  const query = buildProjectItemsQuery(config.owner, config.projectNumber, config.priorityField);

  try {
    const result = execSync(`gh api graphql -f query='${query.replace(/'/g, "'\\''")}'`, {
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer for large projects
    });

    const data = JSON.parse(result);

    // Try organization path first, then user path
    const projectData = data.data?.org?.projectV2 || data.data?.user?.projectV2;

    if (!projectData) {
      throw new Error(`Project #${config.projectNumber} not found for owner "${config.owner}"`);
    }

    const items: ProjectItem[] = [];
    const nodes = projectData.items?.nodes || [];

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];

      // Skip non-issue items (could be draft issues, pull requests, etc.)
      if (!node.content?.number) {
        continue;
      }

      const item: ProjectItem = {
        issueNumber: node.content.number,
        position: i + 1, // 1-indexed position
      };

      // Extract priority field value if present
      if (node.priorityValue) {
        const priorityValue = extractPriorityValue(node.priorityValue);
        if (priorityValue) {
          item.priorityValue = priorityValue;
        }
      }

      items.push(item);
    }

    return items;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to fetch GitHub Project items: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Get priority for a specific issue from a GitHub Project.
 *
 * @param config - GitHub Projects configuration
 * @param issueNumber - Issue number to look up
 * @returns Normalized priority value, or null if issue not in project
 */
export async function getIssuePriorityFromProject(
  config: GitHubProjectsConfig,
  issueNumber: number
): Promise<number | null> {
  const items = await getProjectItems(config);

  const item = items.find((i) => i.issueNumber === issueNumber);
  if (!item) {
    return null; // Issue not in project
  }

  // If priorityField is configured and item has a value, use mapping
  if (config.priorityField && item.priorityValue && config.priorityMapping) {
    const mappedPriority = normalizeMappedPriority(item.priorityValue, config.priorityMapping);
    if (mappedPriority !== null) {
      return mappedPriority;
    }
    // Fall through to position-based if mapping doesn't contain the value
  }

  // Use position-based priority as fallback
  if (item.position) {
    return normalizePositionPriority(item.position);
  }

  return null;
}
