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
3. Make the necessary changes to satisfy the task requirements
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

  // Add project conventions
  if (projectPatterns) {
    prompt += `## Project Conventions\n\n${projectPatterns}\n\n`;
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
 * Verify changes using TypeScript and ESLint
 */
export async function verifyChanges(
  filesChanged: string[],
  workingDir: string
): Promise<{ passed: boolean; errors: string[] }> {
  const errors: string[] = [];

  if (filesChanged.length === 0) {
    return { passed: true, errors: [] };
  }

  // Run TypeScript type checking on changed files
  const tscResult = spawnSync('npx', ['tsc', '--noEmit'], {
    cwd: workingDir,
    encoding: 'utf8',
  });

  if (tscResult.status !== 0) {
    const stderr = tscResult.stderr || tscResult.stdout || '';
    if (stderr.trim()) {
      errors.push(`TypeScript errors:\n${stderr}`);
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

  return {
    passed: errors.length === 0,
    errors,
  };
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

  // Get files actually changed
  const filesChanged = getChangedFiles(workingDir);

  // Detect scope violations
  const declaredFiles = task.files || [];
  const scopeViolation = detectScopeViolation(declaredFiles, filesChanged);

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
  });

  return result;
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

  // Capture initial diff hash
  const initialDiffHash = getCurrentDiffHash(workingDirectory);

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
