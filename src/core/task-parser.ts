import { ImplementationTask, TaskValidationResult, TaskStatus } from '../types/index.js';
import { getLogger } from './logger.js';

/**
 * Extracts structured tasks from implementation plan markdown content.
 * Returns empty array if no tasks section found (logs warning).
 * Skips malformed tasks with warnings, continues parsing.
 *
 * @param content - Markdown content containing implementation tasks
 * @returns Array of parsed implementation tasks
 *
 * @example
 * ```typescript
 * const content = `
 * ## Implementation Tasks
 * - [ ] **T1**: Create auth service
 *   - Files: \`src/auth.ts\`
 *   - Dependencies: none
 * `;
 * const tasks = parseImplementationTasks(content);
 * // => [{ id: 'T1', description: 'Create auth service', ... }]
 * ```
 */
export function parseImplementationTasks(content: string): ImplementationTask[] {
  const logger = getLogger();
  const tasks: ImplementationTask[] = [];

  // Find the Implementation Tasks section
  const sectionMatch = content.match(/##\s+Implementation\s+Tasks/i);
  if (!sectionMatch) {
    logger.warn('task-parser', 'No Implementation Tasks section found in content');
    return [];
  }

  // Extract content after the Implementation Tasks header
  const startIndex = sectionMatch.index! + sectionMatch[0].length;
  const remainingContent = content.substring(startIndex);

  // Split into lines for processing
  const lines = remainingContent.split('\n');

  let currentTask: ImplementationTask | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Stop if we hit another h2 header
    if (line.match(/^##\s+/)) {
      break;
    }

    // Match task line: - [ ] or - [x] followed by **T{n}**: description
    const taskMatch = line.match(/^-\s+\[([ x])\]\s+\*\*T(\d+)\*\*:\s*(.+)$/i);
    if (taskMatch) {
      // Save previous task if exists
      if (currentTask) {
        tasks.push(currentTask);
      }

      const [, checkbox, taskNum, description] = taskMatch;
      const status: TaskStatus = checkbox.toLowerCase() === 'x' ? 'completed' : 'pending';

      currentTask = {
        id: `T${taskNum}`,
        description: description.trim(),
        status,
      };
      continue;
    }

    // Match metadata lines (indented with - Field: value)
    if (currentTask) {
      // Match metadata with flexible indentation (spaces or tabs)
      const metadataMatch = line.match(/^\s+-\s+(files|dependencies):\s*(.*)$/i);
      if (metadataMatch) {
        const [, fieldName, value] = metadataMatch;
        const field = fieldName.toLowerCase();
        const trimmedValue = value.trim();

        if (field === 'files') {
          if (trimmedValue) {
            // Split by comma, trim, remove backticks
            currentTask.files = trimmedValue
              .split(',')
              .map(f => f.trim().replace(/`/g, ''))
              .filter(f => f.length > 0);

            if (currentTask.files.length === 0) {
              currentTask.files = undefined;
            }
          }
        } else if (field === 'dependencies') {
          if (trimmedValue && trimmedValue.toLowerCase() !== 'none') {
            // Split by comma and trim
            currentTask.dependencies = trimmedValue
              .split(',')
              .map(d => d.trim())
              .filter(d => d.length > 0);
          } else {
            // "none" or empty means no dependencies
            currentTask.dependencies = [];
          }
        }
      }
    }
  }

  // Don't forget the last task
  if (currentTask) {
    tasks.push(currentTask);
  }

  logger.debug('task-parser', `Parsed ${tasks.length} tasks from content`);
  return tasks;
}

/**
 * Converts task objects back to markdown format.
 * Useful for updating plan files after task status changes.
 *
 * @param tasks - Array of implementation tasks to format
 * @returns Markdown string representing the tasks
 *
 * @example
 * ```typescript
 * const tasks = [
 *   { id: 'T1', description: 'Create service', status: 'pending', files: ['src/service.ts'] }
 * ];
 * const markdown = formatImplementationTasks(tasks);
 * // => "## Implementation Tasks\n\n- [ ] **T1**: Create service\n  - Files: `src/service.ts`"
 * ```
 */
export function formatImplementationTasks(tasks: ImplementationTask[]): string {
  const lines: string[] = ['## Implementation Tasks', ''];

  for (const task of tasks) {
    // Map status to checkbox
    const checkbox = task.status === 'completed' ? '[x]' : '[ ]';

    // Task line
    lines.push(`- ${checkbox} **${task.id}**: ${task.description}`);

    // Files metadata (if present)
    if (task.files !== undefined) {
      const filesStr = task.files.map(f => `\`${f}\``).join(', ');
      lines.push(`  - Files: ${filesStr}`);
    }

    // Dependencies metadata (if present)
    if (task.dependencies !== undefined) {
      const depsStr = task.dependencies.length === 0 ? 'none' : task.dependencies.join(', ');
      lines.push(`  - Dependencies: ${depsStr}`);
    }

    // Blank line between tasks
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Validates task format and dependencies.
 * Checks for circular dependencies and missing references.
 *
 * @param content - Markdown content containing implementation tasks
 * @returns Validation result with errors and warnings
 *
 * @example
 * ```typescript
 * const result = validateTaskFormat(content);
 * if (!result.valid) {
 *   console.error('Validation errors:', result.errors);
 * }
 * if (result.warnings.length > 0) {
 *   console.warn('Validation warnings:', result.warnings);
 * }
 * ```
 */
export function validateTaskFormat(content: string): TaskValidationResult {
  const tasks = parseImplementationTasks(content);
  const errors: string[] = [];
  const warnings: string[] = [];

  // Build a set of all task IDs for reference checking
  const taskIds = new Set(tasks.map(t => t.id));

  // Check for missing dependency references
  for (const task of tasks) {
    if (task.dependencies) {
      for (const depId of task.dependencies) {
        if (!taskIds.has(depId)) {
          warnings.push(`Task ${task.id} depends on ${depId}, which does not exist`);
        }
      }
    }
  }

  // Check for circular dependencies using DFS
  const circularErrors = detectCircularDependencies(tasks);
  errors.push(...circularErrors);

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Detects circular dependencies in the task graph using depth-first search.
 * Returns an array of error messages describing any circular dependencies found.
 *
 * Algorithm: O(V + E) where V = number of tasks, E = number of dependency edges
 *
 * @param tasks - Array of tasks to check
 * @returns Array of error messages (empty if no circular dependencies)
 */
function detectCircularDependencies(tasks: ImplementationTask[]): string[] {
  const errors: string[] = [];

  // Build adjacency list: task ID -> array of task IDs it depends on
  const graph = new Map<string, string[]>();
  for (const task of tasks) {
    graph.set(task.id, task.dependencies || []);
  }

  // Track visited nodes and recursion stack
  const visited = new Set<string>();
  const recStack = new Set<string>();

  function dfs(taskId: string, path: string[]): boolean {
    if (recStack.has(taskId)) {
      // Found a cycle - build error message
      const cycleStart = path.indexOf(taskId);
      const cycle = [...path.slice(cycleStart), taskId];
      errors.push(`Circular dependency detected: ${cycle.join(' → ')}`);
      return true;
    }

    if (visited.has(taskId)) {
      return false; // Already processed this node
    }

    visited.add(taskId);
    recStack.add(taskId);
    const newPath = [...path, taskId];

    const dependencies = graph.get(taskId) || [];
    for (const depId of dependencies) {
      if (dfs(depId, newPath)) {
        // Propagate cycle detection up (but only report once)
        recStack.delete(taskId);
        return false; // Don't report multiple times
      }
    }

    recStack.delete(taskId);
    return false;
  }

  // Check each task as potential starting point
  for (const task of tasks) {
    if (!visited.has(task.id)) {
      dfs(task.id, []);
    }
  }

  return errors;
}
