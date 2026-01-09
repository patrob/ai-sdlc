import chalk from 'chalk';
import ora from 'ora';
import { getSdlcRoot, loadConfig, isStageGateEnabled } from '../core/config.js';
import { assessState, kanbanExists } from '../core/kanban.js';
import { parseStory } from '../core/story.js';
import { Action, StateAssessment } from '../types/index.js';
import { runRefinementAgent } from '../agents/refinement.js';
import { runResearchAgent } from '../agents/research.js';
import { runPlanningAgent } from '../agents/planning.js';
import { runImplementationAgent } from '../agents/implementation.js';
import { runReviewAgent, createPullRequest } from '../agents/review.js';
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
      console.log(c.warning('agentic-sdlc not initialized. Run `agentic-sdlc init` first.'));
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
    switch (action.type) {
      case 'refine':
        return runRefinementAgent(action.storyPath, this.sdlcRoot);

      case 'research':
        return runResearchAgent(action.storyPath, this.sdlcRoot);

      case 'plan':
        return runPlanningAgent(action.storyPath, this.sdlcRoot);

      case 'implement':
        return runImplementationAgent(action.storyPath, this.sdlcRoot);

      case 'review':
        return runReviewAgent(action.storyPath, this.sdlcRoot);

      case 'create_pr':
        return createPullRequest(action.storyPath, this.sdlcRoot);

      default:
        throw new Error(`Unknown action type: ${action.type}`);
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
