import chalk from 'chalk';
import ora from 'ora';
import { getSdlcRoot, loadConfig, isStageGateEnabled } from '../core/config.js';
import { assessState, kanbanExists } from '../core/kanban.js';
import { parseStory, resetRPIVCycle, markStoryComplete, moveStory, isAtMaxRetries } from '../core/story.js';
import { Action, StateAssessment, ReviewResult, ReviewDecision, ReworkContext } from '../types/index.js';
import { runRefinementAgent } from '../agents/refinement.js';
import { runResearchAgent } from '../agents/research.js';
import { runPlanningAgent } from '../agents/planning.js';
import { runImplementationAgent } from '../agents/implementation.js';
import { runReviewAgent, createPullRequest } from '../agents/review.js';
import { runReworkAgent, packageReworkContext } from '../agents/rework.js';
import { getThemedChalk } from '../core/theme.js';

export interface RunOptions {
  auto?: boolean;
  dryRun?: boolean;
  verbose?: boolean;
}

/**
 * Workflow Runner
 *
 * Orchestrates the execution of the SDLC workflow, processing actions
 * according to priority and respecting stage gates.
 */
export class WorkflowRunner {
  private sdlcRoot: string;
  private options: RunOptions;

  constructor(options: RunOptions = {}) {
    this.sdlcRoot = getSdlcRoot();
    this.options = options;
  }

  /**
   * Run the workflow
   */
  async run(): Promise<void> {
    const config = loadConfig();
    const c = getThemedChalk(config);

    if (!kanbanExists(this.sdlcRoot)) {
      console.log(c.warning('ai-sdlc not initialized. Run `ai-sdlc init` first.'));
      return;
    }

    const assessment = assessState(this.sdlcRoot);

    if (assessment.recommendedActions.length === 0) {
      console.log(c.success('No pending actions. Board is up to date!'));
      return;
    }

    if (this.options.dryRun) {
      this.showDryRun(assessment);
      return;
    }

    await this.processActions(assessment);
  }

  /**
   * Show what would be done in dry run mode
   */
  private showDryRun(assessment: StateAssessment): void {
    const config = loadConfig();
    const c = getThemedChalk(config);

    console.log(c.info('Dry run - would execute:'));

    const actionsToShow = this.options.auto
      ? assessment.recommendedActions
      : [assessment.recommendedActions[0]];

    for (const action of actionsToShow) {
      console.log(`  ${this.formatAction(action)}`);
    }
  }

  /**
   * Process actions according to mode
   */
  private async processActions(assessment: StateAssessment): Promise<void> {
    if (this.options.auto) {
      await this.runAutoMode(assessment);
    } else {
      await this.runSingleAction(assessment.recommendedActions[0]);
    }
  }

  /**
   * Run all actions until completion
   */
  private async runAutoMode(initialAssessment: StateAssessment): Promise<void> {
    const config = loadConfig();
    const c = getThemedChalk(config);

    let assessment = initialAssessment;
    let actionsProcessed = 0;
    const maxActions = 100; // Safety limit

    while (assessment.recommendedActions.length > 0 && actionsProcessed < maxActions) {
      const action = assessment.recommendedActions[0];

      // Check stage gates
      if (await this.checkStageGate(action)) {
        console.log(c.warning(`Stage gate requires approval for: ${this.formatAction(action)}`));
        console.log(c.dim('Run without --auto to process with approval prompts.'));
        break;
      }

      await this.runSingleAction(action);
      actionsProcessed++;

      // Re-assess after each action
      assessment = assessState(this.sdlcRoot);
    }

    if (actionsProcessed >= maxActions) {
      console.log(c.warning(`\nReached maximum actions limit (${maxActions}). Stopping.`));
    } else if (assessment.recommendedActions.length === 0) {
      console.log(c.success('\nAll actions completed!'));
    }

    console.log(c.dim(`\nProcessed ${actionsProcessed} action(s).`));
  }

  /**
   * Run a single action
   */
  private async runSingleAction(action: Action): Promise<void> {
    const config = loadConfig();
    const c = getThemedChalk(config);
    const spinner = ora(this.formatAction(action)).start();

    try {
      const result = await this.executeAction(action);

      if (result.success) {
        spinner.succeed(c.success(this.formatAction(action)));
        if (this.options.verbose && result.changesMade.length > 0) {
          for (const change of result.changesMade) {
            console.log(c.dim(`  → ${change}`));
          }
        }
      } else {
        spinner.fail(c.error(`Failed: ${this.formatAction(action)}`));
        if (result.error) {
          console.log(c.error(`  Error: ${result.error}`));
        }
      }
    } catch (error) {
      spinner.fail(c.error(`Failed: ${this.formatAction(action)}`));
      console.error(error);
    }
  }

  /**
   * Execute a specific action
   */
  private async executeAction(action: Action) {
    const config = loadConfig();

    switch (action.type) {
      case 'refine':
        return runRefinementAgent(action.storyPath, this.sdlcRoot);

      case 'research':
        return runResearchAgent(action.storyPath, this.sdlcRoot);

      case 'plan':
        return runPlanningAgent(action.storyPath, this.sdlcRoot);

      case 'implement':
        return runImplementationAgent(action.storyPath, this.sdlcRoot);

      case 'review': {
        const reviewResult = await runReviewAgent(action.storyPath, this.sdlcRoot);
        // Handle review decision (auto-complete or restart RPIV)
        if (reviewResult.success) {
          await this.handleReviewDecision(action.storyPath, reviewResult);
        }
        return reviewResult;
      }

      case 'rework': {
        // Get rework context from action
        const reworkContext = action.context as ReworkContext;
        if (!reworkContext || !reworkContext.targetPhase) {
          throw new Error('Rework action missing required context (targetPhase)');
        }

        // Run rework agent to prepare the story for refinement
        const reworkResult = await runReworkAgent(action.storyPath, this.sdlcRoot, reworkContext);

        // If rework setup succeeded, automatically trigger the target phase agent
        if (reworkResult.success) {
          const c = getThemedChalk(config);
          console.log(c.info(`\n  ↳ Triggering ${reworkContext.targetPhase} agent for refinement...`));

          // Package the review feedback as context for the agent
          const story = parseStory(action.storyPath);
          const agentReworkContext = packageReworkContext(story, reworkContext.reviewFeedback);

          // Execute the appropriate agent based on target phase, passing the rework context
          switch (reworkContext.targetPhase) {
            case 'research':
              return runResearchAgent(action.storyPath, this.sdlcRoot, { reworkContext: agentReworkContext });
            case 'plan':
              return runPlanningAgent(action.storyPath, this.sdlcRoot, { reworkContext: agentReworkContext });
            case 'implement':
              return runImplementationAgent(action.storyPath, this.sdlcRoot, { reworkContext: agentReworkContext });
            default:
              throw new Error(`Unknown target phase: ${reworkContext.targetPhase}`);
          }
        }

        return reworkResult;
      }

      case 'create_pr':
        return createPullRequest(action.storyPath, this.sdlcRoot);

      default:
        throw new Error(`Unknown action type: ${action.type}`);
    }
  }

  /**
   * Handle review decision - auto-complete on approval, restart RPIV on rejection
   */
  private async handleReviewDecision(storyPath: string, reviewResult: ReviewResult): Promise<void> {
    const config = loadConfig();
    const c = getThemedChalk(config);
    let story = parseStory(storyPath);

    if (reviewResult.decision === ReviewDecision.APPROVED) {
      // Auto-complete on approval
      if (config.reviewConfig.autoCompleteOnApproval) {
        console.log(c.success(`\n✅ Review approved! Auto-completing story "${story.frontmatter.title}"`));
        markStoryComplete(story);

        // Move to done if in in-progress
        if (story.frontmatter.status === 'in-progress') {
          story = moveStory(story, 'done', this.sdlcRoot);
          console.log(c.success(`Moved story to done/`));
        }
      }
    } else if (reviewResult.decision === ReviewDecision.REJECTED) {
      // Auto-restart RPIV cycle on rejection
      if (config.reviewConfig.autoRestartOnRejection) {
        // Reload story to get latest state
        story = parseStory(storyPath);

        // Check if at max retries
        if (isAtMaxRetries(story, config)) {
          const retryCount = story.frontmatter.retry_count || 0;
          console.log(c.error(`\n⚠️  Story "${story.frontmatter.title}" has reached max retries (${retryCount})`));
          console.log(c.warning('Manual intervention required. Use appropriate commands to reset or fix the story.'));
          return;
        }

        // Reset RPIV cycle
        const retryCount = (story.frontmatter.retry_count || 0) + 1;
        const maxRetries = story.frontmatter.max_retries ?? config.reviewConfig.maxRetries;
        const maxRetriesDisplay = Number.isFinite(maxRetries) ? maxRetries : '∞';
        console.log(c.warning(`\n🔄 Review rejected. Restarting RPIV cycle (attempt ${retryCount}/${maxRetriesDisplay})`));
        console.log(c.dim(`Reason: ${reviewResult.feedback.substring(0, 200)}...`));

        resetRPIVCycle(story, reviewResult.feedback);
        console.log(c.info('RPIV cycle reset. Planning phase will restart on next run.'));
      }
    } else if (reviewResult.decision === ReviewDecision.FAILED) {
      // Review agent failed - don't increment retry count
      console.log(c.error(`\n❌ Review process failed: ${reviewResult.error}`));
      console.log(c.warning('This does not count as a retry attempt. You can retry manually.'));
    }
  }

  /**
   * Check if a stage gate requires approval
   */
  private async checkStageGate(action: Action): Promise<boolean> {
    if (action.type === 'implement' && isStageGateEnabled('requireApprovalBeforeImplementation')) {
      return true;
    }

    if (action.type === 'create_pr' && isStageGateEnabled('requireApprovalBeforePR')) {
      return true;
    }

    return false;
  }

  /**
   * Format an action for display
   */
  private formatAction(action: Action): string {
    const actionVerbs: Record<Action['type'], string> = {
      refine: 'Refining',
      research: 'Researching',
      plan: 'Planning',
      implement: 'Implementing',
      review: 'Reviewing',
      rework: 'Reworking',
      create_pr: 'Creating PR for',
      move_to_done: 'Moving to done',
    };

    const storySlug = action.storyPath.split('/').pop()?.replace('.md', '') || action.storyId;
    return `${actionVerbs[action.type]} "${storySlug}"`;
  }
}

/**
 * Create and run the workflow
 */
export async function runWorkflow(options: RunOptions = {}): Promise<void> {
  const runner = new WorkflowRunner(options);
  await runner.run();
}
