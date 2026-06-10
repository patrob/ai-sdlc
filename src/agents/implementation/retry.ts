/**
 * Retry logic and helper utilities for implementation agent
 */

import { spawnSync } from 'child_process';
import { createHash } from 'crypto';
import path from 'path';

import { classifyAndSortErrors,parseTypeScriptErrors } from '../../services/error-classifier.js';
import { RECOVERY_STRATEGIES } from './prompts.js';
import type { AttemptHistoryEntry } from './retry-attempt.js';
import { detectMissingDependencies,truncateTestOutput } from './test-output.js';

// Re-export truncateTestOutput for convenience in tdd and other modules
export { truncateTestOutput } from './test-output.js';

/**
 * Validate working directory path for safety
 * @param workingDir The working directory path to validate
 * @throws Error if path contains shell metacharacters or traversal attempts
 */
export function validateWorkingDir(workingDir: string): void {
  // Check for shell metacharacters that could be used in command injection
  if (/[;&|`$()<>]/.test(workingDir)) {
    throw new Error('Invalid working directory: contains shell metacharacters');
  }

  // Prevent path traversal attempts
  const normalizedPath = path.normalize(workingDir);
  if (normalizedPath.includes('..')) {
    throw new Error('Invalid working directory: path traversal attempt detected');
  }
}

/**
 * Validate branch name for safety
 * @param branchName The branch name to validate
 * @throws Error if branch name contains invalid characters
 */
export function validateBranchName(branchName: string): void {
  // Git branch names must match safe pattern (alphanumeric, dash, slash, underscore)
  if (!/^[a-zA-Z0-9_/-]+$/.test(branchName)) {
    throw new Error('Invalid branch name: contains unsafe characters');
  }
}

/**
 * Capture the current git diff hash for no-change detection
 * @param workingDir The working directory
 * @returns SHA256 hash of git diff HEAD
 */
export function captureCurrentDiffHash(workingDir: string): string {
  try {
    // Security: Validate working directory before use
    validateWorkingDir(workingDir);

    // Use spawnSync with shell: false to prevent command injection
    const result = spawnSync('git', ['diff', 'HEAD'], {
      cwd: workingDir,
      shell: false,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    if (result.status === 0 && result.stdout) {
      return createHash('sha256').update(result.stdout as string).digest('hex');
    }

    // Git command failed, return empty hash
    return '';
  } catch (_error) {
    // If validation fails or git command fails, return empty hash
    return '';
  }
}

/**
 * Check if changes have occurred since last diff hash
 * @param previousHash Previous diff hash
 * @param currentHash Current diff hash
 * @returns True if changes occurred (hashes are different)
 */
export function hasChangesOccurred(previousHash: string, currentHash: string): boolean {
  return previousHash !== currentHash;
}

/**
 * Extract list of changed files from git diff
 * @param workingDir The working directory
 * @returns Comma-separated list of changed files, or descriptive message
 */
export function extractChangedFiles(workingDir: string): string {
  try {
    validateWorkingDir(workingDir);

    const result = spawnSync('git', ['diff', 'HEAD', '--name-only'], {
      cwd: workingDir,
      shell: false,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    if (result.status === 0 && result.stdout) {
      const files = (result.stdout as string).trim().split('\n').filter(Boolean);
      if (files.length === 0) {
        return 'No changes detected';
      }
      return files.join(', ');
    }

    return 'No changes detected';
  } catch {
    return 'Unable to determine changes';
  }
}

/**
 * Build formatted retry history section for agent prompts
 * @param history Array of attempt history entries
 * @returns Formatted string for inclusion in retry prompts
 */
export function buildRetryHistorySection(history: AttemptHistoryEntry[]): string {
  if (!history || history.length === 0) {
    return '';
  }

  const recentHistory = history.slice(-3);

  let section = `PREVIOUS ATTEMPT HISTORY (Last ${recentHistory.length} attempts):

`;

  for (const entry of recentHistory) {
    const outcomeLabel =
      entry.outcome === 'failed_tests'
        ? 'Tests failed'
        : entry.outcome === 'failed_build'
          ? 'Build failed'
          : 'No changes made';

    section += `Attempt ${entry.attempt}: ${entry.changesSummary} -> ${outcomeLabel}\n`;

    const errors: string[] = [];
    if (entry.testSnippet && entry.testSnippet.trim()) {
      errors.push(entry.testSnippet.trim());
    }
    if (entry.buildSnippet && entry.buildSnippet.trim()) {
      errors.push(entry.buildSnippet.trim());
    }

    const errorsToShow = errors.slice(0, 2);
    if (errorsToShow.length > 0) {
      for (const err of errorsToShow) {
        section += `  - ${err.substring(0, 100)}\n`;
      }
    }
  }

  section += `
**IMPORTANT: Do NOT repeat the same fixes. Try a different approach.**
`;

  return section;
}


/**
 * Build retry prompt for implementation agent
 * @param testOutput Test failure output
 * @param buildOutput Build output
 * @param attemptNumber Current attempt number (1-indexed)
 * @param maxRetries Maximum number of retries
 * @param attemptHistory Optional history of previous attempts
 * @returns Prompt string for retry attempt
 */
export function buildRetryPrompt(
  testOutput: string,
  buildOutput: string,
  attemptNumber: number,
  maxRetries: number,
  attemptHistory?: AttemptHistoryEntry[]
): string {
  const truncatedTestOutput = truncateTestOutput(testOutput);
  const truncatedBuildOutput = truncateTestOutput(buildOutput);

  // Detect if this is a dependency issue
  const combinedOutput = (buildOutput || '') + '\n' + (testOutput || '');
  const missingDeps = detectMissingDependencies(combinedOutput);

  // Parse and classify TypeScript errors from build output
  const tsErrors = parseTypeScriptErrors(buildOutput || '');
  const classified = classifyAndSortErrors(tsErrors);

  let prompt = `CRITICAL: Tests are failing. You attempted implementation but verification failed.

This is retry attempt ${attemptNumber} of ${maxRetries}. Previous attempts failed with similar errors.

`;

  // Add special guidance for missing dependencies
  if (missingDeps.length > 0) {
    prompt += `**DEPENDENCY ISSUE DETECTED**

The errors indicate missing npm packages: ${missingDeps.join(', ')}

This is NOT a code bug - the packages need to be installed. Before making any code changes:
1. Run \`npm install ${missingDeps.join(' ')}\` to add the missing packages
2. If these are type definitions, also run \`npm install -D @types/${missingDeps.filter(d => !d.startsWith('@')).join(' @types/')}\`
3. Re-run the build/tests after installing

`;
  }

  // Add TypeScript error classification if errors were found
  if (classified.source.length > 0 || classified.cascading.length > 0) {
    prompt += `TYPESCRIPT ERROR CLASSIFICATION

`;

    if (classified.source.length > 0) {
      prompt += `⚠️ SOURCE ERRORS (Fix these first - root causes):

`;
      classified.source.forEach((err) => {
        const location = err.line ? `${err.filePath}:${err.line}` : err.filePath;
        prompt += `- ${err.code} in ${location}: ${err.message}\n`;
      });
      prompt += '\n';
    }

    if (classified.cascading.length > 0) {
      prompt += `💡 CASCADING ERRORS (may automatically resolve):

`;
      classified.cascading.forEach((err) => {
        const location = err.line ? `${err.filePath}:${err.line}` : err.filePath;
        prompt += `- ${err.code} in ${location}: ${err.message}\n`;
      });
      prompt += '\n';
    }

    prompt += `**Strategy:** Fix source errors first, as they may automatically resolve multiple cascading errors.

`;
  }

  if (attemptHistory && attemptHistory.length > 0) {
    prompt += buildRetryHistorySection(attemptHistory);
    prompt += '\n';
  }

  if (buildOutput && buildOutput.trim().length > 0) {
    prompt += `Build Output:
\`\`\`
${truncatedBuildOutput}
\`\`\`

`;
  }

  if (testOutput && testOutput.trim().length > 0) {
    prompt += `Test Output:
\`\`\`
${truncatedTestOutput}
\`\`\`

`;
  }

  prompt += RECOVERY_STRATEGIES;

  return prompt;
}

