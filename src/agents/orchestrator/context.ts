/**
 * Task context building for orchestrator
 */

import fs from 'fs';
import path from 'path';

import { getLogger } from '../../core/logger.js';
import { type FileContent, type ImplementationTask, type TaskContext } from '../../types/index.js';

const logger = getLogger();

/**
 * Build minimal context for a single task
 *
 * Extracts relevant acceptance criteria, existing file contents, and project conventions.
 * Truncates if context exceeds reasonable size (~2000 chars for projectPatterns).
 *
 * @param task - Task to build context for
 * @param storyContent - Full story content
 * @param workingDirectory - Working directory for task execution
 * @returns Minimal task context
 */
export function buildTaskContext(
  task: ImplementationTask,
  storyContent: string,
  workingDirectory: string
): TaskContext {
  // Extract acceptance criteria section
  const acceptanceCriteria: string[] = [];
  const acMatch = storyContent.match(/##\s+Acceptance\s+Criteria\s*\n([\s\S]*?)(?=\n##|$)/i);
  if (acMatch) {
    const acSection = acMatch[1];
    const lines = acSection.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('-') || trimmed.startsWith('*')) {
        // Remove checkbox and bullet
        const criterion = trimmed.replace(/^[-*]\s+\[[ x]\]\s*/, '').replace(/^[-*]\s+/, '');
        if (criterion) {
          acceptanceCriteria.push(criterion);
        }
      }
    }
  }

  // Filter acceptance criteria to only those relevant to task files
  const taskFiles = task.files || [];
  const relevantCriteria = acceptanceCriteria.filter((criterion) => {
    // Include if criterion mentions any task file
    return taskFiles.some((file) => {
      const fileName = path.basename(file);
      const fileBaseName = fileName.replace(/\.(ts|tsx|js|jsx)$/, '');
      return (
        criterion.includes(file) ||
        criterion.includes(fileName) ||
        criterion.includes(fileBaseName)
      );
    });
  });

  // If no specific matches, include first 3 criteria as general context
  const finalCriteria =
    relevantCriteria.length > 0 ? relevantCriteria : acceptanceCriteria.slice(0, 3);

  // Read existing files
  const existingFiles: FileContent[] = [];
  for (const file of taskFiles) {
    const filePath = path.join(workingDirectory, file);
    if (fs.existsSync(filePath)) {
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        existingFiles.push({ path: file, content });
      } catch (error: any) {
        logger.warn('orchestrator', `Failed to read file ${file}: ${error.message}`);
      }
    }
  }

  // Extract project conventions (brief summary)
  let projectPatterns = '';
  const conventionsMatch = storyContent.match(
    /##\s+(Technical\s+Specification|Project\s+Conventions)\s*\n([\s\S]*?)(?=\n##|$)/i
  );
  if (conventionsMatch) {
    projectPatterns = conventionsMatch[2].trim();
  }

  // Truncate if too long
  const MAX_PATTERN_LENGTH = 2000;
  if (projectPatterns.length > MAX_PATTERN_LENGTH) {
    projectPatterns =
      projectPatterns.substring(0, MAX_PATTERN_LENGTH) + '\n\n[... truncated for length]';
  }

  return {
    task,
    acceptanceCriteria: finalCriteria,
    existingFiles,
    projectPatterns,
    workingDirectory,
  };
}
