import { spawnSync } from 'child_process';
import { getBaseBranch, getMergeBase } from '../../core/git-utils.js';
import type { ContentType, Story } from '../../types/index.js';

/**
 * Get the base commit reference for git diff comparisons
 *
 * Attempts to find the merge-base between the current branch and the base branch (main/master).
 * Falls back to HEAD~1 if merge-base cannot be determined.
 *
 * This allows detecting source code changes across the entire feature branch,
 * not just from the most recent commit.
 *
 * @param workingDir - Working directory to run git commands in
 * @returns Commit reference to use for git diff comparison
 */
function getBaseCommitForDiff(workingDir: string): string {
  try {
    const baseBranch = getBaseBranch(workingDir);
    const mergeBase = getMergeBase(workingDir, baseBranch);

    if (mergeBase) {
      return mergeBase;
    }
  } catch {
    // If we can't determine base branch or merge-base, fall back to HEAD~1
  }

  // Fallback to HEAD~1 (original behavior)
  return 'HEAD~1';
}

/**
 * Get source code changes from git diff
 *
 * Compares current branch HEAD against the base branch (main/master) merge-base
 * to detect all source code changes in the feature branch, not just the most recent commit.
 *
 * Returns list of source files that have been modified (excludes tests and story files).
 * Uses spawnSync for security (prevents command injection).
 *
 * @param workingDir - Working directory to run git diff in
 * @returns Array of source file paths that have changed, or ['unknown'] if git fails
 */
export function getSourceCodeChanges(workingDir: string): string[] {
  try {
    const baseCommit = getBaseCommitForDiff(workingDir);

    // Security: Use spawnSync with explicit args (not shell) to prevent injection
    const result = spawnSync('git', ['diff', '--name-only', baseCommit], {
      cwd: workingDir,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    if (result.status !== 0) {
      // Git command failed - fail open (assume changes exist)
      return ['unknown'];
    }

    const output = result.stdout.toString();

    return output
      .split('\n')
      .filter(f => f.trim())
      .filter(f => /\.(ts|tsx|js|jsx)$/.test(f))      // Source files only
      .filter(f => !f.includes('.test.'))              // Exclude test files
      .filter(f => !f.includes('.spec.'))              // Exclude spec files
      .filter(f => !f.startsWith('.ai-sdlc/'));        // Exclude story files
  } catch {
    // If git diff fails, assume there are changes (fail open, not closed)
    return ['unknown'];
  }
}

/**
 * Get configuration file changes from git diff
 *
 * Compares current branch HEAD against the base branch merge-base.
 *
 * Detects changes to configuration files including:
 * - .claude/ directory (Agent SDK skills, CLAUDE.md)
 * - .github/ directory (workflows, actions, issue templates)
 * - Root config files (tsconfig.json, package.json, .gitignore, vitest.config.ts, etc.)
 *
 * Uses spawnSync for security (prevents command injection).
 *
 * @param workingDir - Working directory to run git diff in
 * @returns Array of configuration file paths that have changed, or ['unknown'] if git fails
 */
export function getConfigurationChanges(workingDir: string): string[] {
  try {
    const baseCommit = getBaseCommitForDiff(workingDir);

    // Security: Use spawnSync with explicit args (not shell) to prevent injection
    const result = spawnSync('git', ['diff', '--name-only', baseCommit], {
      cwd: workingDir,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    if (result.status !== 0) {
      // Git command failed - fail open (assume changes exist)
      return ['unknown'];
    }

    const output = result.stdout.toString();

    return output
      .split('\n')
      .filter(f => f.trim())
      .filter(f => {
        // Configuration directories
        if (f.startsWith('.claude/')) return true;
        if (f.startsWith('.github/')) return true;

        // Root configuration files (common patterns)
        const rootConfigs = [
          'tsconfig.json',
          'package.json',
          'package-lock.json',
          '.gitignore',
          '.gitattributes',
          'vitest.config.ts',
          'vitest.config.js',
          'jest.config.js',
          'jest.config.ts',
          '.eslintrc',
          '.eslintrc.js',
          '.eslintrc.json',
          '.prettierrc',
          '.prettierrc.js',
          '.prettierrc.json',
          'Makefile',
          'Dockerfile',
          'docker-compose.yml',
          '.env.example',
        ];

        return rootConfigs.includes(f);
      });
  } catch {
    // If git diff fails, assume there are changes (fail open, not closed)
    return ['unknown'];
  }
}

/**
 * Get documentation file changes from git diff
 *
 * Compares current branch HEAD against the base branch merge-base.
 *
 * Detects changes to documentation files including:
 * - Markdown files (.md) anywhere in the project (excluding story files)
 * - docs/ directory (any file type)
 *
 * Uses spawnSync for security (prevents command injection).
 *
 * @param workingDir - Working directory to run git diff in
 * @returns Array of documentation file paths that have changed, or ['unknown'] if git fails
 */
export function getDocumentationChanges(workingDir: string): string[] {
  try {
    const baseCommit = getBaseCommitForDiff(workingDir);

    // Security: Use spawnSync with explicit args (not shell) to prevent injection
    const result = spawnSync('git', ['diff', '--name-only', baseCommit], {
      cwd: workingDir,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    if (result.status !== 0) {
      // Git command failed - fail open (assume changes exist)
      return ['unknown'];
    }

    const output = result.stdout.toString();

    return output
      .split('\n')
      .filter(f => f.trim())
      .filter(f => {
        // Markdown files (excluding story files in .ai-sdlc/stories/)
        if (f.endsWith('.md') && !f.startsWith('.ai-sdlc/stories/')) return true;

        // Files in docs/ directory (any file type - images, diagrams, etc.)
        if (f.startsWith('docs/')) return true;

        return false;
      });
  } catch {
    // If git diff fails, assume there are changes (fail open, not closed)
    return ['unknown'];
  }
}

/**
 * Determine the effective content type for validation
 *
 * Resolves the final content type based on story frontmatter fields:
 * 1. If requires_source_changes === false, treat as 'configuration'
 * 2. If requires_source_changes === true, treat as 'code'
 * 3. Otherwise, use content_type field (default: 'code' for backward compatibility)
 *
 * @param story - Story with frontmatter to analyze
 * @returns The effective content type to use for validation
 */
export function determineEffectiveContentType(story: Story): ContentType {
  const frontmatter = story.frontmatter;

  // Manual override takes precedence
  if (frontmatter.requires_source_changes === false) {
    return 'configuration';
  }
  if (frontmatter.requires_source_changes === true) {
    return 'code';
  }

  // Use explicit content_type or default to 'code'
  return frontmatter.content_type || 'code';
}

/**
 * Check if test files exist in git diff
 *
 * Compares current branch HEAD against the base branch merge-base.
 *
 * Returns true if any test files have been modified/added, false otherwise.
 * Uses spawnSync for security (prevents command injection).
 *
 * @param workingDir - Working directory to run git diff in
 * @returns True if test files exist in changes, false otherwise
 */
export function hasTestFiles(workingDir: string): boolean {
  try {
    const baseCommit = getBaseCommitForDiff(workingDir);

    // Security: Use spawnSync with explicit args (not shell) to prevent injection
    const result = spawnSync('git', ['diff', '--name-only', baseCommit], {
      cwd: workingDir,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    if (result.status !== 0) {
      // Git command failed - fail open (assume tests exist to avoid false blocks)
      return true;
    }

    const output = result.stdout.toString();
    const files = output.split('\n').filter(f => f.trim());

    // Check if any files match test patterns
    return files.some(f =>
      f.includes('.test.') ||
      f.includes('.spec.') ||
      f.includes('__tests__/')
    );
  } catch {
    // If git diff fails, assume tests exist (fail open, not closed)
    return true;
  }
}
