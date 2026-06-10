/**
 * Main implementation agent orchestrator
 */

import path from 'path';
import { spawnSync } from 'child_process';
import { Story, AgentResult } from '../../types/index.js';
import { AgentProgressCallback, runAgentQuery } from '../../core/client.js';
import type { IProvider } from '../../providers/types.js';
import { getLogger } from '../../core/logger.js';
import { parseStory, updateStoryStatus, updateStoryField, getEffectiveMaxImplementationRetries } from '../../core/story.js';
import { loadConfig } from '../../core/config.js';
import { AgentOptions } from '../research.js';
import { attemptImplementationWithRetries } from './retry-attempt.js';
import { validateWorkingDir, validateBranchName } from './retry.js';
import { runTDDImplementation } from './tdd.js';
import { commitIfAllTestsPass } from './test-runners.js';
import { verifyImplementation } from '../verification.js';
import { truncateTestOutput } from './retry.js';

/**
 * Implementation Agent
 *
 * Executes the implementation plan, creating code changes and tests.
 */
export async function runImplementationAgent(
  storyPath: string,
  sdlcRoot: string,
  options: AgentOptions = {},
  provider?: IProvider
): Promise<AgentResult> {
  const logger = getLogger();
  const startTime = Date.now();
  let story = parseStory(storyPath);
  let currentStoryPath = storyPath;
  const changesMade: string[] = [];
  const workingDir = path.dirname(sdlcRoot);

  logger.info('implementation', 'Starting implementation phase', {
    storyId: story.frontmatter.id,
    retryCount: story.frontmatter.implementation_retry_count || 0,
  });

  try {
    // Security: Validate working directory before git operations
    validateWorkingDir(workingDir);

    // Create a feature branch for this story
    const branchName = `ai-sdlc/${story.slug}`;

    // Security: Validate branch name before use
    validateBranchName(branchName);

    try {
      // Check if we're in a git repo using spawn with shell: false
      const revParseResult = spawnSync('git', ['rev-parse', '--git-dir'], {
        cwd: workingDir,
        shell: false,
        stdio: 'pipe',
      });

      if (revParseResult.status !== 0) {
        changesMade.push('No git repo detected, skipping branch creation');
      } else {
        // Create and checkout branch (or checkout if exists) using spawn with shell: false
        const checkoutNewResult = spawnSync('git', ['checkout', '-b', branchName], {
          cwd: workingDir,
          shell: false,
          stdio: 'pipe',
        });

        if (checkoutNewResult.status === 0) {
          changesMade.push(`Created branch: ${branchName}`);
        } else {
          // Branch might already exist, try to checkout
          const checkoutResult = spawnSync('git', ['checkout', branchName], {
            cwd: workingDir,
            shell: false,
            stdio: 'pipe',
          });

          if (checkoutResult.status === 0) {
            changesMade.push(`Checked out existing branch: ${branchName}`);
          } else {
            // Not a git repo or other error, continue without branching
            changesMade.push('Failed to create or checkout branch, continuing without branching');
          }
        }

        // Update story with branch info
        await updateStoryField(story, 'branch', branchName);
      }
    } catch {
      // Not a git repo, continue without branching
      changesMade.push('No git repo detected, skipping branch creation');
    }

    // Update status to in-progress if not already there
    if (story.frontmatter.status !== 'in-progress') {
      story = await updateStoryStatus(story, 'in-progress');
      currentStoryPath = story.path;
      changesMade.push('Updated status to in-progress');
    }

    // Check if TDD is enabled for this story
    const config = loadConfig(workingDir);
    const tddEnabled = story.frontmatter.tdd_enabled ?? config.tdd?.enabled ?? false;

    // Check if orchestrator is enabled
    const injectedRunAgentQuery: typeof runAgentQuery | undefined = provider
      ? ((queryOptions) => runAgentQuery(queryOptions, provider))
      : undefined;

    if (config.useOrchestrator && !tddEnabled) {
      changesMade.push('Using sequential task orchestrator for implementation');

      const { runImplementationOrchestrator } = await import('../orchestrator.js');

      const orchestratorResult = await runImplementationOrchestrator(
        currentStoryPath,
        sdlcRoot,
        {
          maxRetriesPerTask: config.implementation.maxRetries,
          commitAfterEachTask: true,
          stopOnFirstFailure: true,
        },
        provider
      );

      if (!orchestratorResult.success) {
        // Orchestration failed
        const errorDetails = orchestratorResult.failedTasks
          .map((ft) => `  - ${ft.taskId}: ${ft.error} (${ft.attempts} attempts)`)
          .join('\n');

        return {
          success: false,
          story: parseStory(currentStoryPath),
          changesMade,
          error: `Implementation orchestration failed:\n${errorDetails}\n\nCompleted: ${orchestratorResult.tasksCompleted}, Failed: ${orchestratorResult.tasksFailed}, Remaining: ${orchestratorResult.tasksRemaining}`,
        };
      }

      // Orchestration succeeded - mark implementation complete
      await updateStoryField(story, 'implementation_complete', true);
      changesMade.push('Marked implementation_complete: true');
      changesMade.push(
        `Orchestration complete: ${orchestratorResult.tasksCompleted} tasks completed in ${orchestratorResult.totalAgentInvocations} agent invocations`
      );

      return {
        success: true,
        story: parseStory(currentStoryPath),
        changesMade,
      };
    }

    if (tddEnabled) {
      changesMade.push('TDD mode enabled - using Red-Green-Refactor implementation');

      // Run TDD implementation loop
      const tddResult = await runTDDImplementation(story, sdlcRoot, {
        onProgress: options.onProgress,
        runAgentQuery: injectedRunAgentQuery,
      });

      // Merge changes
      changesMade.push(...tddResult.changesMade);

      if (tddResult.success) {
        // TDD completed all cycles - now verify with retry support
        changesMade.push('Running final verification...');
        const verification = await verifyImplementation(tddResult.story, workingDir);

        await updateStoryField(tddResult.story, 'last_test_run', {
          passed: verification.passed,
          failures: verification.failures,
          timestamp: verification.timestamp,
        });

        if (!verification.passed) {
          // TDD final verification failed - this is unexpected since TDD should ensure all tests pass
          return {
            success: false,
            story: parseStory(currentStoryPath),
            changesMade,
            error: `TDD implementation blocked: ${verification.failures} test(s) failing after completing all cycles.\nThis is unexpected - TDD cycles should ensure all tests pass.\n\nTest output:\n${truncateTestOutput(verification.testsOutput, 1000)}`,
          };
        }

        // Success - retry count will be reset by review agent on APPROVED
        await updateStoryField(tddResult.story, 'implementation_complete', true);
        changesMade.push('Marked implementation_complete: true');

        return {
          success: true,
          story: parseStory(currentStoryPath),
          changesMade,
        };
      } else {
        return {
          success: false,
          story: tddResult.story,
          changesMade,
          error: tddResult.error,
        };
      }
    }

    // Standard implementation (non-TDD mode) with retry logic
    // Use per-story override if set, otherwise config default (capped at upper bound)
    const maxRetries = getEffectiveMaxImplementationRetries(story, config);

    // Use extracted retry function for better testability
    const retryResult = await attemptImplementationWithRetries(
      {
        story,
        storyPath: currentStoryPath,
        workingDir,
        maxRetries,
        reworkContext: options.reworkContext,
        onProgress: options.onProgress,
        runAgentQuery: injectedRunAgentQuery,
      },
      changesMade
    );

    // If retry loop failed, return the failure result
    if (!retryResult.success) {
      return retryResult;
    }

    // If we get here, verification passed
    const updatedStory = parseStory(currentStoryPath);

    // Commit changes after successful standard implementation
    try {
      const commitResult = await commitIfAllTestsPass(
        workingDir,
        `feat(${story.slug}): ${story.frontmatter.title}`,
        config.timeouts?.testTimeout || 300000
      );
      if (commitResult.committed) {
        changesMade.push(`Committed: ${story.frontmatter.title}`);
      } else {
        changesMade.push(`Skipped commit: ${commitResult.reason}`);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      changesMade.push(`Commit warning: ${errorMsg} (continuing implementation)`);
    }

    await updateStoryField(updatedStory, 'implementation_complete', true);
    changesMade.push('Marked implementation_complete: true');

    logger.info('implementation', 'Implementation phase complete', {
      storyId: story.frontmatter.id,
      durationMs: Date.now() - startTime,
      changesCount: changesMade.length,
    });

    return {
      success: true,
      story: parseStory(currentStoryPath),
      changesMade,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('implementation', 'Implementation phase failed', {
      storyId: story.frontmatter.id,
      durationMs: Date.now() - startTime,
      error: errorMessage,
    });

    return {
      success: false,
      story,
      changesMade,
      error: errorMessage,
    };
  }
}
