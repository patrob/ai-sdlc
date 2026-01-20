import { spawnSync } from 'child_process';
import { createHash } from 'crypto';
import { runAgentQuery } from '../core/client.js';
import { getLogger } from '../core/logger.js';
import {
  TaskContext,
  AgentTaskResult,
  SingleTaskAgentOptions,
  ImplementationTask,
} from '../types/index.js';

/**
 * System prompt for single-task implementation agent
 * Focused instructions without full story context
 */
export const TASK_AGENT_SYSTEM_PROMPT = `You are a senior software engineer executing a single implementation task.

Your job is to:
1. Read and understand the task description
2. Review the existing code in the target files
3. Make the necessary changes per the story's content_type requirements
4. Follow the project conventions strictly
5. Write clean, maintainable code that follows existing patterns

CRITICAL RULES:
- Modify ONLY the files listed in the task context
- If you need a file that's not provided, state this clearly in your output
- Do NOT create new files unless explicitly listed in the task
- Follow the acceptance criteria relevant to this task
- Ensure your changes are focused and minimal (do what's needed, nothing more)

When complete, provide a brief summary of:
- What you changed
- Which files you modified
- Any issues or missing dependencies encountered`;

/**
 * Build minimal context prompt for a single task
 */
export function buildTaskPrompt(context: TaskContext): string {
  const { task, acceptanceCriteria, existingFiles, projectPatterns } = context;

  let prompt = `# Implementation Task\n\n`;
  prompt += `**Task ID:** ${task.id}\n`;
  prompt += `**Description:** ${task.description}\n\n`;

  // Add existing files
  if (existingFiles.length > 0) {
    prompt += `## Target Files\n\n`;
    for (const file of existingFiles) {
      prompt += `### ${file.path}\n\n`;
      prompt += `\`\`\`\n${file.content}\n\`\`\`\n\n`;
    }
  } else {
    prompt += `## Target Files\n\nNo existing files provided. You may need to create new files as specified in the task.\n\n`;
  }

  // Add relevant acceptance criteria
  if (acceptanceCriteria.length > 0) {
    prompt += `## Acceptance Criteria\n\n`;
    for (const ac of acceptanceCriteria) {
      prompt += `- ${ac}\n`;
    }
    prompt += `\n`;
  }

  // Add project conventions (enforce max length)
  if (projectPatterns) {
    const MAX_PATTERN_LENGTH = 2000; // ~500 tokens
    let patterns = projectPatterns;

    if (patterns.length > MAX_PATTERN_LENGTH) {
      console.warn(
        `projectPatterns truncated from ${patterns.length} to ${MAX_PATTERN_LENGTH} characters`
      );
      patterns = patterns.substring(0, MAX_PATTERN_LENGTH) + '\n\n[... truncated for length]';
    }

    prompt += `## Project Conventions\n\n${patterns}\n\n`;
  }

  prompt += `## Instructions\n\n`;
  prompt += `1. Implement the task by modifying the files listed above\n`;
  prompt += `2. Follow the project conventions strictly\n`;
  prompt += `3. Ensure your changes satisfy the relevant acceptance criteria\n`;
  prompt += `4. Report if you need additional files not provided\n\n`;

  prompt += `Proceed with the implementation.`;

  return prompt;
}

/**
 * Detect if agent modified files outside the declared scope
 */
export function detectScopeViolation(
  declaredFiles: string[],
  actualFiles: string[]
): string[] | undefined {
  const violations = actualFiles.filter((f) => !declaredFiles.includes(f));
  return violations.length > 0 ? violations : undefined;
}

/**
 * Get current git diff hash to detect changes
 */
function getCurrentDiffHash(workingDir: string): string {
  const result = spawnSync('git', ['diff', 'HEAD'], {
    cwd: workingDir,
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
  });

  if (result.error) {
    throw new Error(`Failed to get git diff: ${result.error.message}`);
  }

  const diff = result.stdout || '';
  return createHash('sha256').update(diff).digest('hex');
}

/**
 * Get list of files changed in working directory
 */
function getChangedFiles(workingDir: string): string[] {
  const result = spawnSync('git', ['diff', '--name-only', 'HEAD'], {
    cwd: workingDir,
    encoding: 'utf8',
  });

  if (result.error) {
    throw new Error(`Failed to get changed files: ${result.error.message}`);
  }

  const files = (result.stdout || '')
    .split('\n')
    .map((f) => f.trim())
    .filter((f) => f.length > 0);

  return files;
}

/**
 * Validate file paths to prevent command injection
 * Throws an error if any path contains suspicious characters or patterns
 */
export function validateFilePaths(paths: string[]): void {
  // Shell metacharacters that could be used for injection
  const dangerousChars = /[;|&`$()<>]/;

  for (const path of paths) {
    // Check for shell metacharacters
    if (dangerousChars.test(path)) {
      throw new Error(
        `Invalid file path "${path}": contains shell metacharacters that could be used for command injection`
      );
    }

    // Check for directory traversal attempts
    if (path.includes('..')) {
      throw new Error(
        `Invalid file path "${path}": directory traversal is not allowed`
      );
    }

    // Ensure path starts with expected directories (basic sanity check)
    // Allow: src/, tests/, dist/, .ai-sdlc/, or relative paths starting with ./
    const validPrefixes = ['src/', 'tests/', 'dist/', '.ai-sdlc/', './', ''];
    const hasValidPrefix = validPrefixes.some((prefix) =>
      path.startsWith(prefix) || path === prefix.slice(0, -1)
    );

    if (!hasValidPrefix && !path.match(/^[a-zA-Z0-9_.-]+$/)) {
      throw new Error(
        `Invalid file path "${path}": must start with an expected directory (src/, tests/, etc.) or be a simple filename`
      );
    }
  }
}

/**
 * Detect test files related to changed modules
 * Checks for co-located .test.ts files
 */
function detectTestFiles(filesChanged: string[]): string[] {
  const testFiles = new Set<string>();

  for (const file of filesChanged) {
    // Check for co-located test files (e.g., foo.ts -> foo.test.ts)
    if (file.endsWith('.ts') || file.endsWith('.tsx')) {
      const testFile = file.replace(/\.(ts|tsx)$/, '.test.$1');
      testFiles.add(testFile);
    }
  }

  return Array.from(testFiles);
}

/**
 * Verify changes using TypeScript, ESLint, and tests
 */
export async function verifyChanges(
  filesChanged: string[],
  workingDir: string
): Promise<{ passed: boolean; errors: string[]; testsRun: boolean }> {
  const errors: string[] = [];
  let testsRun = false;

  if (filesChanged.length === 0) {
    return { passed: true, errors: [], testsRun: false };
  }

  // Validate file paths to prevent command injection
  try {
    validateFilePaths(filesChanged);
  } catch (error: any) {
    errors.push(`Path validation failed: ${error.message}`);
    return { passed: false, errors, testsRun: false };
  }

  // Run TypeScript type checking
  // NOTE: TypeScript doesn't support true per-file checking - it always checks the whole project
  // to ensure type safety across module boundaries. This is a TypeScript limitation.
  const tscResult = spawnSync('npx', ['tsc', '--noEmit'], {
    cwd: workingDir,
    encoding: 'utf8',
  });

  if (tscResult.status !== 0) {
    const stderr = tscResult.stderr || tscResult.stdout || '';
    if (stderr.trim()) {
      errors.push(`TypeScript errors (whole project checked):\n${stderr}`);
    }
  }

  // Run ESLint on changed files
  const tsFiles = filesChanged.filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'));
  if (tsFiles.length > 0) {
    const eslintResult = spawnSync('npx', ['eslint', ...tsFiles], {
      cwd: workingDir,
      encoding: 'utf8',
    });

    if (eslintResult.status !== 0) {
      const stderr = eslintResult.stderr || eslintResult.stdout || '';
      if (stderr.trim()) {
        errors.push(`ESLint errors:\n${stderr}`);
      }
    }
  }

  // Run tests for changed modules
  const testFiles = detectTestFiles(filesChanged);
  if (testFiles.length > 0) {
    // Check if test files actually exist before running
    const testResult = spawnSync('npm', ['test', '--', ...testFiles], {
      cwd: workingDir,
      encoding: 'utf8',
    });

    testsRun = true;

    if (testResult.status !== 0) {
      const stderr = testResult.stderr || testResult.stdout || '';
      if (stderr.trim()) {
        errors.push(`Test failures:\n${stderr}`);
      }
    }
  } else {
    errors.push('No tests detected for changed files');
  }

  return {
    passed: errors.length === 0,
    errors,
    testsRun,
  };
}

/**
 * Detect missing dependencies or files mentioned in agent output
 * Scans for phrases indicating the agent needs additional files
 */
export function detectMissingDependencies(agentOutput: string): string[] | undefined {
  const missingFiles: string[] = [];
  const lines = agentOutput.split('\n');

  // Keywords that indicate missing dependencies
  const keywords = ['need', 'missing file', 'not provided', 'required file', 'cannot find'];

  for (const line of lines) {
    const lowerLine = line.toLowerCase();

    // Check if line contains any missing dependency keywords
    if (keywords.some((keyword) => lowerLine.includes(keyword))) {
      // Try to extract file paths from the line
      // Match common path patterns: src/foo.ts, ./foo.ts, foo.ts, etc.
      // Note: Order extensions from longest to shortest to avoid partial matches (json before js, tsx before ts)
      const pathMatches = line.match(/[\w/./-]+\.(json|tsx|jsx|ts|js)/g);
      if (pathMatches) {
        missingFiles.push(...pathMatches);
      }
    }
  }

  return missingFiles.length > 0 ? missingFiles : undefined;
}

/**
 * Parse agent output and construct structured result
 */
export async function parseTaskResult(
  agentOutput: string,
  task: ImplementationTask,
  workingDir: string
): Promise<AgentTaskResult> {
  const logger = getLogger();

  try {
    // Get files actually changed
    const filesChanged = getChangedFiles(workingDir);

    // Detect scope violations
    const declaredFiles = task.files || [];
    const scopeViolation = detectScopeViolation(declaredFiles, filesChanged);

    // Detect missing dependencies from agent output
    const missingDependencies = detectMissingDependencies(agentOutput);

    // Run verification on changed files
    const verification = await verifyChanges(filesChanged, workingDir);

    // Determine overall success
    const success = verification.passed && filesChanged.length > 0;

    const result: AgentTaskResult = {
      success,
      task,
      filesChanged,
      verificationPassed: verification.passed,
      agentOutput,
      scopeViolation,
      missingDependencies,
    };

    if (!verification.passed) {
      result.error = verification.errors.join('\n\n');
    } else if (filesChanged.length === 0) {
      result.error = 'No files were modified';
      result.success = false;
    }

    logger.debug('single-task', 'Task result parsed', {
      taskId: task.id,
      success,
      filesChanged: filesChanged.length,
      verificationPassed: verification.passed,
      hasScopeViolation: !!scopeViolation,
      hasMissingDependencies: !!missingDependencies,
    });

    return result;
  } catch (error: any) {
    // Git operation failed - this is an environment issue
    logger.error('single-task', 'Git operation failed during result parsing', {
      error: error.message,
    });

    return {
      success: false,
      task,
      filesChanged: [],
      verificationPassed: false,
      agentOutput,
      error: `Git operation failed: ${error.message}`,
    };
  }
}

/**
 * Execute a single implementation task with minimal context
 */
export async function runSingleTaskAgent(
  context: TaskContext,
  options?: SingleTaskAgentOptions
): Promise<AgentTaskResult> {
  const logger = getLogger();
  const { task, workingDirectory } = context;

  logger.info('single-task', `Starting task ${task.id}: ${task.description}`);

  // Build focused prompt
  const prompt = buildTaskPrompt(context);

  // Handle dry run
  if (options?.dryRun) {
    logger.info('single-task', 'DRY RUN MODE - Prompt generated but not executed');
    logger.debug('single-task', 'Generated prompt', { prompt });
    return {
      success: false,
      task,
      filesChanged: [],
      verificationPassed: false,
      error: 'Dry run - no execution performed',
      agentOutput: prompt,
    };
  }

  try {
    // Execute agent query
    const agentOutput = await runAgentQuery({
      prompt,
      systemPrompt: TASK_AGENT_SYSTEM_PROMPT,
      workingDirectory,
      timeout: options?.timeout,
      onProgress: options?.onProgress,
    });

    // Parse and return structured result
    const result = await parseTaskResult(agentOutput, task, workingDirectory);

    if (result.success) {
      logger.info('single-task', `Task ${task.id} completed successfully`);
    } else {
      logger.warn('single-task', `Task ${task.id} failed`, { error: result.error });
    }

    return result;
  } catch (error: any) {
    logger.error('single-task', `Task ${task.id} execution failed`, { error: error.message });

    return {
      success: false,
      task,
      filesChanged: [],
      verificationPassed: false,
      error: error.message || 'Unknown error during task execution',
      agentOutput: undefined,
    };
  }
}
