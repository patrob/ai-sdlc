import ora from 'ora';
import { getSdlcRoot, loadConfig } from '../../core/config.js';
import { getStory, parseStory, autoCompleteStoryAfterReview, resetImplementationRetryCount, writeStory, updateStoryField } from '../../core/story.js';
import { loadWorkflowState, clearWorkflowState } from '../../core/workflow-state.js';
import { getThemedChalk } from '../../core/theme.js';
import { StoryLogger } from '../../core/story-logger.js';
import { getLogger } from '../../core/logger.js';
import { formatAction } from './format-utils.js';
import { getPhaseInfo, calculatePhaseProgress, renderPhaseChecklist } from './phase-display.js';
import { handleWorktreeCleanup } from './worktrees.js';
import type { Action, ReviewResult, ReworkContext } from '../../types/index.js';
import { ReviewDecision } from '../../types/index.js';

/**
 * Result from executing an action
 */
interface ActionExecutionResult {
  success: boolean;
  reviewResult?: ReviewResult;  // Present when action.type === 'review'
}

/**
 * Execute a specific action
 *
 * @returns ActionExecutionResult with success status and optional review result
 */
export async function executeAction(action: Action, sdlcRoot: string): Promise<ActionExecutionResult> {
  const config = loadConfig();
  const c = getThemedChalk(config);
  const globalLogger = getLogger();
  const actionStartTime = Date.now();

  // Log action start to global logger
  globalLogger.info('action', `Starting action: ${action.type}`, {
    storyId: action.storyId,
    actionType: action.type,
    storyPath: action.storyPath,
  });

  // Initialize per-story logger
  const maxLogs = config.logging?.maxFiles ?? 5;
  let storyLogger: StoryLogger | null = null;
  let spinner: ReturnType<typeof ora> | null = null;

  try {
    storyLogger = new StoryLogger(action.storyId, sdlcRoot, maxLogs);
    storyLogger.log('INFO', `Starting action: ${action.type} for story ${action.storyId}`);
  } catch (error) {
    // If logger initialization fails, continue without logging (console-only)
    console.warn(`Warning: Failed to initialize logger: ${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    // Resolve story by ID to get current path (handles moves between folders)
    let resolvedPath: string;
    try {
      const story = getStory(sdlcRoot, action.storyId);
      resolvedPath = story.path;
    } catch (error) {
      const errorMsg = `Error: Story not found for action "${action.type}"`;
      storyLogger?.log('ERROR', errorMsg);
      storyLogger?.log('ERROR', `  Story ID: ${action.storyId}`);
      storyLogger?.log('ERROR', `  Original path: ${action.storyPath}`);
      console.log(c.error(errorMsg));
      console.log(c.dim(`  Story ID: ${action.storyId}`));
      console.log(c.dim(`  Original path: ${action.storyPath}`));
      if (error instanceof Error) {
        storyLogger?.log('ERROR', `  ${error.message}`);
        console.log(c.dim(`  ${error.message}`));
      }
      return { success: false };
    }

    // Update action path if it was stale
    if (resolvedPath !== action.storyPath) {
      storyLogger?.log('WARN', `Note: Story path updated (file was moved)`);
      storyLogger?.log('WARN', `  From: ${action.storyPath}`);
      storyLogger?.log('WARN', `  To: ${resolvedPath}`);
      console.log(c.warning(`Note: Story path updated (file was moved)`));
      console.log(c.dim(`  From: ${action.storyPath}`));
      console.log(c.dim(`  To: ${resolvedPath}`));
      action.storyPath = resolvedPath;
    }

    // Store phase completion state BEFORE action execution (to detect transitions)
    const storyBeforeAction = parseStory(action.storyPath);
    const prevPhaseState = {
      research_complete: storyBeforeAction.frontmatter.research_complete,
      plan_complete: storyBeforeAction.frontmatter.plan_complete,
      plan_review_complete: storyBeforeAction.frontmatter.plan_review_complete ?? false,
      implementation_complete: storyBeforeAction.frontmatter.implementation_complete,
      reviews_complete: storyBeforeAction.frontmatter.reviews_complete,
      status: storyBeforeAction.frontmatter.status,
    };

    spinner = ora(formatAction(action, true, c)).start();
    const baseText = formatAction(action, true, c);

    // Create agent progress callback for real-time updates
    const onAgentProgress = (event: { type: string; toolName?: string; sessionId?: string }) => {
      if (!spinner) return; // Guard against null spinner
      switch (event.type) {
        case 'session_start':
          spinner.text = `${baseText} ${c.dim('(session started)')}`;
          break;
        case 'tool_start':
          // Show which tool is being executed
          const toolName = event.toolName || 'unknown';
          const shortName = toolName.replace(/^(mcp__|Mcp)/, '').substring(0, 30);
          spinner.text = `${baseText} ${c.dim(`→ ${shortName}`)}`;
          break;
        case 'tool_end':
          // Keep showing the action, tool completed
          spinner.text = baseText;
          break;
        case 'completion':
          spinner.text = `${baseText} ${c.dim('(completing...)')}`;
          break;
      }
    };

    // Import and run the appropriate agent
    let result;

    switch (action.type) {
      case 'refine':
        const { runRefinementAgent } = await import('../../agents/refinement.js');
        result = await runRefinementAgent(action.storyPath, sdlcRoot, { onProgress: onAgentProgress });
        break;

      case 'research':
        const { runResearchAgent } = await import('../../agents/research.js');
        result = await runResearchAgent(action.storyPath, sdlcRoot, { onProgress: onAgentProgress });
        break;

      case 'plan':
        const { runPlanningAgent } = await import('../../agents/planning.js');
        result = await runPlanningAgent(action.storyPath, sdlcRoot, { onProgress: onAgentProgress });
        break;

      case 'plan_review':
        const { runPlanReviewAgent } = await import('../../agents/plan-review.js');
        result = await runPlanReviewAgent(action.storyPath, sdlcRoot, { onProgress: onAgentProgress });
        break;

      case 'implement':
        const { runImplementationAgent } = await import('../../agents/implementation.js');
        result = await runImplementationAgent(action.storyPath, sdlcRoot, { onProgress: onAgentProgress });
        break;

      case 'review':
        const { runReviewAgent } = await import('../../agents/review.js');
        result = await runReviewAgent(action.storyPath, sdlcRoot, {
          onVerificationProgress: (phase, status, message) => {
            if (!spinner) return; // Guard against null spinner
            const phaseLabel = phase === 'build' ? 'Building' : 'Testing';
            switch (status) {
              case 'starting':
                spinner.text = c.dim(`${phaseLabel}: ${message || ''}`);
                break;
              case 'running':
                // Keep spinner spinning, optionally could show last line of output
                break;
              case 'passed':
                spinner.text = c.success(`${phaseLabel}: passed`);
                break;
              case 'failed':
                spinner.text = c.error(`${phaseLabel}: failed`);
                break;
            }
          },
        });

        // Auto-complete story if review was approved
        if (result && result.success) {
          const reviewResult = result as ReviewResult;
          let story = parseStory(action.storyPath);
          story = await autoCompleteStoryAfterReview(story, config, reviewResult);

          // Log auto-completion if it occurred
          if (reviewResult.decision === ReviewDecision.APPROVED && config.reviewConfig.autoCompleteOnApproval) {
            // Reset implementation retry count on successful review approval
            await resetImplementationRetryCount(story);
            storyLogger?.log('INFO', 'Implementation retry count reset after review approval');

            spinner.text = c.success('Review approved - auto-completing story');
            storyLogger?.log('INFO', `Story auto-completed after review approval: "${story.frontmatter.title}"`);

            // Auto-create PR in automated mode
            const workflowState = await loadWorkflowState(sdlcRoot, story.frontmatter.id);
            const isAutoMode = workflowState?.context.options.auto ?? false;

            if (isAutoMode || config.reviewConfig.autoCreatePROnApproval) {
              try {
                // Create PR (this will automatically commit any uncommitted changes)
                spinner.text = c.dim('Creating pull request...');
                const { createPullRequest } = await import('../../agents/review.js');
                const prResult = await createPullRequest(action.storyPath, sdlcRoot);

                if (prResult.success) {
                  spinner.text = c.success('Review approved - PR created');
                  storyLogger?.log('INFO', `PR created successfully for ${story.frontmatter.id}`);
                } else {
                  // PR creation failed - mark as blocked
                  const { updateStoryStatus } = await import('../../core/story.js');
                  const blockedStory = await updateStoryStatus(story, 'blocked');
                  await writeStory(blockedStory);
                  spinner.text = c.warning('Review approved but PR creation failed - story marked as blocked');
                  storyLogger?.log('WARN', `PR creation failed for ${story.frontmatter.id}: ${prResult.error || 'Unknown error'}`);
                }
              } catch (error) {
                // Error during PR creation - mark as blocked
                const { updateStoryStatus } = await import('../../core/story.js');
                const blockedStory = await updateStoryStatus(story, 'blocked');
                await writeStory(blockedStory);
                const errorMsg = error instanceof Error ? error.message : String(error);
                spinner.text = c.warning(`Review approved but auto-PR failed: ${errorMsg}`);
                storyLogger?.log('ERROR', `Auto-PR failed for ${story.frontmatter.id}: ${errorMsg}`);
              }
            }

            // Handle worktree cleanup if story has a worktree
            if (story.frontmatter.worktree_path) {
              await handleWorktreeCleanup(story, config, c);
            }
          }
        }
        break;

      case 'rework':
        const { runReworkAgent } = await import('../../agents/rework.js');
        if (!action.context) {
          throw new Error('Rework action requires context with review feedback');
        }
        result = await runReworkAgent(action.storyPath, sdlcRoot, action.context as ReworkContext);
        break;

      case 'create_pr':
        const { createPullRequest } = await import('../../agents/review.js');
        result = await createPullRequest(action.storyPath, sdlcRoot);
        break;

      case 'move_to_done':
        // Update story status to done (no file move in new architecture)
        const { updateStoryStatus, markStoryComplete } = await import('../../core/story.js');
        const storyToMove = parseStory(action.storyPath);
        // FIX: For manual move to done, ensure completion flags are set first
        // This is a user-initiated action so we trust they want to mark it complete
        const completedStory = await markStoryComplete(storyToMove);
        const updatedStory = await updateStoryStatus(completedStory, 'done');
        result = {
          success: true,
          story: updatedStory,
          changesMade: ['Marked story complete and updated status to done'],
        };

        // Worktree cleanup prompt (if story has a worktree)
        if (storyToMove.frontmatter.worktree_path) {
          await handleWorktreeCleanup(storyToMove, config, c);
        }
        break;

      default:
        throw new Error(`Unknown action type: ${action.type}`);
    }

    // Check if agent succeeded
    const actionDuration = Date.now() - actionStartTime;
    if (result && !result.success) {
      spinner.fail(c.error(`Failed: ${formatAction(action, true, c)}`));
      storyLogger?.log('ERROR', `Action failed: ${formatAction(action, false, c)}`);
      globalLogger.warn('action', `Action failed: ${action.type}`, {
        storyId: action.storyId,
        actionType: action.type,
        durationMs: actionDuration,
        error: result.error,
      });
      if (result.error) {
        storyLogger?.log('ERROR', `  Error: ${result.error}`);
        console.error(c.error(`  Error: ${result.error}`));
      }
      return { success: false };
    }

    spinner.succeed(c.success(formatAction(action, true, c)));
    storyLogger?.log('INFO', `Action completed successfully: ${formatAction(action, false, c)}`);
    globalLogger.info('action', `Action completed: ${action.type}`, {
      storyId: action.storyId,
      actionType: action.type,
      durationMs: actionDuration,
      changesCount: result?.changesMade?.length ?? 0,
    });

    // Show changes made
    if (result && result.changesMade.length > 0) {
      for (const change of result.changesMade) {
        storyLogger?.log('INFO', `  → ${change}`);
        console.log(c.dim(`  → ${change}`));
      }
    }

    // Display phase progress after successful action
    if (result && result.success) {
      // Use the story from result if available (handles moved files like refine)
      const story = result.story || parseStory(action.storyPath);
      const progress = calculatePhaseProgress(story);

      // Show phase checklist
      console.log(c.dim(`  Progress: ${renderPhaseChecklist(story, c)}`));

      // Check if a phase just completed (detect transition from false → true)
      const phaseInfo = getPhaseInfo(action.type, c);
      if (phaseInfo) {
        let phaseJustCompleted = false;
        switch (action.type) {
          case 'refine':
            // Refine completes when status changes from backlog to something else
            phaseJustCompleted = prevPhaseState.status === 'backlog' && story.frontmatter.status !== 'backlog';
            break;
          case 'research':
            // Research completes when research_complete transitions from false to true
            phaseJustCompleted = !prevPhaseState.research_complete && story.frontmatter.research_complete;
            break;
          case 'plan':
            // Plan completes when plan_complete transitions from false to true
            phaseJustCompleted = !prevPhaseState.plan_complete && story.frontmatter.plan_complete;
            break;
          case 'plan_review':
            // Plan review completes when plan_review_complete transitions from false to true
            phaseJustCompleted = !prevPhaseState.plan_review_complete && (story.frontmatter.plan_review_complete ?? false);
            break;
          case 'implement':
            // Implement completes when implementation_complete transitions from false to true
            phaseJustCompleted = !prevPhaseState.implementation_complete && story.frontmatter.implementation_complete;
            break;
          case 'review':
            // Review completes when reviews_complete transitions from false to true
            phaseJustCompleted = !prevPhaseState.reviews_complete && story.frontmatter.reviews_complete;
            break;
          case 'rework':
            // Rework doesn't have a specific completion flag
            phaseJustCompleted = false;
            break;
        }

        // Only show completion message if phase transitioned to complete
        if (phaseJustCompleted) {
          const useAscii = process.env.NO_COLOR !== undefined;
          const completionSymbol = useAscii ? '[X]' : '✓';
          console.log(c.phaseComplete(`  ${completionSymbol} ${phaseInfo.name} phase complete`));
        }
      }
    }

    // Return review result for review actions
    if (action.type === 'review' && result) {
      return { success: true, reviewResult: result as ReviewResult };
    }

    return { success: true };
  } catch (error) {
    const exceptionDuration = Date.now() - actionStartTime;
    if (spinner) {
      spinner.fail(c.error(`Failed: ${formatAction(action, true, c)}`));
    } else {
      console.error(c.error(`Failed: ${formatAction(action, true, c)}`));
    }
    const errorMessage = error instanceof Error ? error.message : String(error);
    storyLogger?.log('ERROR', `Exception during action execution: ${errorMessage}`);
    globalLogger.error('action', `Action exception: ${action.type}`, {
      storyId: action.storyId,
      actionType: action.type,
      durationMs: exceptionDuration,
      error: errorMessage,
    });
    console.error(error);

    // Show phase checklist with error indication (if file still exists)
    try {
      const story = parseStory(action.storyPath);
      console.log(c.dim(`  Progress: ${renderPhaseChecklist(story, c)}`));
      // Update story with error
      story.frontmatter.last_error = errorMessage;
    } catch {
      // File may have been moved - skip progress display
    }
    // Don't throw - let the workflow continue if in auto mode
    return { success: false };
  } finally {
    // Always close logger, even if action fails or throws
    storyLogger?.close();
  }
}
