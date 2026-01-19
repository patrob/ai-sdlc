import { Story } from '../types/index.js';

/**
 * Result of dependency validation
 */
export interface DependencyValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Group stories into parallel execution phases based on dependencies.
 * Uses iterative topological sort to identify stories that can run concurrently.
 *
 * @param stories - Array of stories to group
 * @returns Array of phases, where each phase contains stories that can run in parallel
 * @throws Error if circular dependencies detected
 *
 * @example
 * // Stories: A -> B, A -> C, B -> D, C -> D
 * // Returns: [[A], [B, C], [D]]
 */
export function groupStoriesByPhase(stories: Story[]): Story[][] {
  const phases: Story[][] = [];
  const remaining = new Set(stories);
  const completed = new Set<string>();

  while (remaining.size > 0) {
    // Find all stories whose dependencies are satisfied
    const currentPhase = Array.from(remaining).filter(story => {
      const deps = story.frontmatter.dependencies || [];
      return deps.every(dep => completed.has(dep));
    });

    // If no stories can be processed, we have a circular dependency
    if (currentPhase.length === 0) {
      const cycle = detectCircularDependencies(Array.from(remaining));
      throw new Error(`Circular dependency detected: ${cycle.join(' → ')}`);
    }

    phases.push(currentPhase);

    // Mark current phase stories as completed
    currentPhase.forEach(story => {
      remaining.delete(story);
      completed.add(story.frontmatter.id);
    });
  }

  return phases;
}

/**
 * Detect circular dependencies using depth-first search.
 *
 * @param stories - Array of stories to check
 * @returns Array of story IDs forming the cycle, or empty array if no cycle
 *
 * @example
 * // Stories: A -> B, B -> C, C -> A
 * // Returns: ['S-001', 'S-002', 'S-003', 'S-001']
 */
export function detectCircularDependencies(stories: Story[]): string[] {
  const storyMap = new Map<string, Story>();
  stories.forEach(story => storyMap.set(story.frontmatter.id, story));

  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  const path: string[] = [];

  function dfs(storyId: string): string[] | null {
    if (recursionStack.has(storyId)) {
      // Found a cycle - return the path from cycle start to current
      const cycleStart = path.indexOf(storyId);
      return [...path.slice(cycleStart), storyId];
    }

    if (visited.has(storyId)) {
      return null; // Already processed this branch
    }

    visited.add(storyId);
    recursionStack.add(storyId);
    path.push(storyId);

    const story = storyMap.get(storyId);
    if (story) {
      const deps = story.frontmatter.dependencies || [];
      for (const dep of deps) {
        const cycle = dfs(dep);
        if (cycle) {
          return cycle;
        }
      }
    }

    recursionStack.delete(storyId);
    path.pop();

    return null;
  }

  // Check all stories as starting points
  for (const story of stories) {
    const cycle = dfs(story.frontmatter.id);
    if (cycle) {
      return cycle;
    }
  }

  return [];
}

/**
 * Validate that all story dependencies are satisfied.
 * Checks for missing dependencies and circular references.
 *
 * @param stories - Array of stories to validate
 * @returns Validation result with errors if any
 *
 * @example
 * const result = validateDependencies(stories);
 * if (!result.valid) {
 *   console.error(result.errors);
 * }
 */
export function validateDependencies(stories: Story[]): DependencyValidationResult {
  const errors: string[] = [];
  const storyIds = new Set(stories.map(s => s.frontmatter.id));

  // Check for missing dependencies
  for (const story of stories) {
    const deps = story.frontmatter.dependencies || [];
    for (const dep of deps) {
      if (!storyIds.has(dep)) {
        errors.push(
          `Story ${story.frontmatter.id} depends on ${dep}, but ${dep} is not in the epic`
        );
      }
    }
  }

  // Only check for circular dependencies if all dependencies exist
  // (missing dependencies will cause groupStoriesByPhase to fail with misleading error)
  if (errors.length === 0) {
    try {
      groupStoriesByPhase(stories);
    } catch (error) {
      if (error instanceof Error) {
        errors.push(error.message);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
