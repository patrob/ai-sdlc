/**
 * Agent adapter classes for wrapping function-based agents
 */

import { type IProvider, type ProviderCapabilities } from '../../providers/types.js';
import { type AgentContext, type AgentResult, type IAgent } from '../types.js';

/**
 * Base adapter class for wrapping function-based agents.
 * Provides IAgent interface implementation for legacy function-based agents.
 */
export abstract class FunctionAgentAdapter implements IAgent {
  abstract readonly name: string;
  abstract readonly requiredCapabilities: (keyof ProviderCapabilities)[];

  constructor(protected provider: IProvider) {
    // Capability validation deferred to avoid abstract property access in constructor
  }

  abstract execute(context: AgentContext): Promise<AgentResult>;
  abstract getSystemPrompt(context: AgentContext): string;

  /**
   * Validate that provider supports all required capabilities.
   * Subclasses can call this at start of execute() if validation needed.
   */
  protected validateCapabilities(): void {
    for (const cap of this.requiredCapabilities) {
      if (!this.provider.capabilities[cap]) {
        throw new Error(
          `Provider '${this.provider.name}' does not support required capability: ${cap}`
        );
      }
    }
  }
}

/**
 * Adapter for research agent
 */
export class ResearchAgentAdapter extends FunctionAgentAdapter {
  readonly name = 'research';
  readonly requiredCapabilities: (keyof ProviderCapabilities)[] = [
    'supportsTools',
    'supportsSystemPrompt',
  ];

  async execute(context: AgentContext): Promise<AgentResult> {
    const { runResearchAgent } = await import('../research.js');
    return runResearchAgent(context.storyPath, context.sdlcRoot, context.options, this.provider);
  }

  getSystemPrompt(_context: AgentContext): string {
    return 'Research agent system prompt';
  }
}

/**
 * Adapter for planning agent
 */
export class PlanningAgentAdapter extends FunctionAgentAdapter {
  readonly name = 'planning';
  readonly requiredCapabilities: (keyof ProviderCapabilities)[] = [
    'supportsTools',
    'supportsSystemPrompt',
  ];

  async execute(context: AgentContext): Promise<AgentResult> {
    const { runPlanningAgent } = await import('../planning.js');
    return runPlanningAgent(context.storyPath, context.sdlcRoot, context.options, this.provider);
  }

  getSystemPrompt(_context: AgentContext): string {
    return 'Planning agent system prompt';
  }
}

/**
 * Adapter for plan-review agent
 */
export class PlanReviewAgentAdapter extends FunctionAgentAdapter {
  readonly name = 'plan-review';
  readonly requiredCapabilities: (keyof ProviderCapabilities)[] = [
    'supportsTools',
    'supportsSystemPrompt',
  ];

  async execute(context: AgentContext): Promise<AgentResult> {
    const { runPlanReviewAgent } = await import('../plan-review.js');
    return runPlanReviewAgent(context.storyPath, context.sdlcRoot, context.options, this.provider);
  }

  getSystemPrompt(_context: AgentContext): string {
    return 'Plan review agent system prompt';
  }
}

/**
 * Adapter for implementation agent
 */
export class ImplementationAgentAdapter extends FunctionAgentAdapter {
  readonly name = 'implementation';
  readonly requiredCapabilities: (keyof ProviderCapabilities)[] = [
    'supportsTools',
    'supportsSystemPrompt',
  ];

  async execute(context: AgentContext): Promise<AgentResult> {
    const { runImplementationAgent } = await import('../implementation.js');
    return runImplementationAgent(context.storyPath, context.sdlcRoot, context.options, this.provider);
  }

  getSystemPrompt(_context: AgentContext): string {
    return 'Implementation agent system prompt';
  }
}

/**
 * Adapter for review agent
 */
export class ReviewAgentAdapter extends FunctionAgentAdapter {
  readonly name = 'review';
  readonly requiredCapabilities: (keyof ProviderCapabilities)[] = [
    'supportsTools',
    'supportsSystemPrompt',
  ];

  async execute(context: AgentContext): Promise<AgentResult> {
    const { runReviewAgent } = await import('../review.js');
    // Review agent has ReviewAgentOptions, cast options as any to avoid type mismatch
    return runReviewAgent(context.storyPath, context.sdlcRoot, context.options as any, this.provider);
  }

  getSystemPrompt(_context: AgentContext): string {
    return 'Review agent system prompt';
  }
}

/**
 * Adapter for single-task agent
 */
export class SingleTaskAgentAdapter extends FunctionAgentAdapter {
  readonly name = 'single-task';
  readonly requiredCapabilities: (keyof ProviderCapabilities)[] = [
    'supportsTools',
    'supportsSystemPrompt',
  ];

  async execute(context: AgentContext): Promise<AgentResult> {
    const { runSingleTaskAgent } = await import('../single-task.js');
    // Single-task agent takes TaskContext and returns AgentTaskResult
    // We adapt the interfaces here
    const taskContext = {
      storyPath: context.storyPath,
      sdlcRoot: context.sdlcRoot,
    };
    const taskResult = await runSingleTaskAgent(taskContext as any, context.options as any, this.provider);

    // Convert AgentTaskResult to AgentResult
    const { parseStory } = await import('../../core/story.js');
    let story;
    try {
      story = context.storyPath ? parseStory(context.storyPath) : undefined;
    } catch {
      story = undefined;
    }

    return {
      success: taskResult.success,
      story: story as any,
      changesMade: taskResult.filesChanged,
      error: taskResult.error,
    };
  }

  getSystemPrompt(_context: AgentContext): string {
    return 'Single-task agent system prompt';
  }
}

/**
 * Adapter for orchestrator agent
 */
export class OrchestratorAgentAdapter extends FunctionAgentAdapter {
  readonly name = 'orchestrator';
  readonly requiredCapabilities: (keyof ProviderCapabilities)[] = [
    'supportsTools',
    'supportsSystemPrompt',
  ];

  async execute(context: AgentContext): Promise<AgentResult> {
    const { runImplementationOrchestrator } = await import('../orchestrator.js');
    // Orchestrator has OrchestratorOptions, cast to avoid type mismatch
    const result = await runImplementationOrchestrator(
      context.storyPath,
      context.sdlcRoot,
      context.options as any,
      this.provider
    );

    // OrchestratorResult may differ from AgentResult, cast for compatibility
    return result as any;
  }

  getSystemPrompt(_context: AgentContext): string {
    return 'Orchestrator agent system prompt';
  }
}

/**
 * Adapter for rework agent
 */
export class ReworkAgentAdapter extends FunctionAgentAdapter {
  readonly name = 'rework';
  readonly requiredCapabilities: (keyof ProviderCapabilities)[] = [
    'supportsTools',
    'supportsSystemPrompt',
  ];

  async execute(context: AgentContext): Promise<AgentResult> {
    const { runReworkAgent } = await import('../rework.js');
    // Rework agent takes ReworkContext as 3rd parameter
    // We extract it from options.reworkContext or provide default
    const reworkContext = (context.options as any)?.reworkContext || {
      previousAttempts: [],
      errorOutput: '',
      guidance: '',
    };
    return runReworkAgent(context.storyPath, context.sdlcRoot, reworkContext);
  }

  getSystemPrompt(_context: AgentContext): string {
    return 'Rework agent system prompt';
  }
}

/**
 * Adapter for state-assessor agent
 *
 * Note: State assessor is different - it doesn't follow the standard AgentContext pattern.
 * This adapter provides a compatible interface but the execute method uses a simplified implementation.
 */
export class StateAssessorAgentAdapter extends FunctionAgentAdapter {
  readonly name = 'state-assessor';
  readonly requiredCapabilities: (keyof ProviderCapabilities)[] = []; // Doesn't use provider

  async execute(context: AgentContext): Promise<AgentResult> {
    const { runStateAssessor } = await import('../state-assessor.js');
    // State assessor uses sdlcRoot only
    const assessment = await runStateAssessor(context.sdlcRoot);

    // Convert StateAssessment to AgentResult format
    const { parseStory } = await import('../../core/story.js');
    let story;
    try {
      story = context.storyPath ? parseStory(context.storyPath) : undefined;
    } catch {
      story = undefined;
    }

    return {
      success: true,
      story: story as any,
      changesMade: [
        `State assessment completed: ${assessment.recommendedActions.length} actions found`,
      ],
    };
  }

  getSystemPrompt(_context: AgentContext): string {
    return 'State assessor agent system prompt';
  }
}

/**
 * Adapter for refinement agent
 */
export class RefinementAgentAdapter extends FunctionAgentAdapter {
  readonly name = 'refinement';
  readonly requiredCapabilities: (keyof ProviderCapabilities)[] = [
    'supportsTools',
    'supportsSystemPrompt',
  ];

  async execute(context: AgentContext): Promise<AgentResult> {
    const { runRefinementAgent } = await import('../refinement.js');
    return runRefinementAgent(context.storyPath, context.sdlcRoot, context.options, this.provider);
  }

  getSystemPrompt(_context: AgentContext): string {
    return 'Refinement agent system prompt';
  }
}

/**
 * Adapter for tech-lead-reviewer agent
 */
export class TechLeadReviewerAdapter extends FunctionAgentAdapter {
  readonly name = 'tech-lead-reviewer';
  readonly requiredCapabilities: (keyof ProviderCapabilities)[] = [
    'supportsTools',
    'supportsSystemPrompt',
  ];

  async execute(context: AgentContext): Promise<AgentResult> {
    const { runTechLeadReviewer } = await import('../perspectives/index.js');
    const result = await runTechLeadReviewer(
      context.storyPath,
      context.sdlcRoot,
      context.options,
      this.provider
    );

    // Convert TechLeadReviewResult to AgentResult
    const { parseStory } = await import('../../core/story.js');
    const story = parseStory(context.storyPath);

    return {
      success: result.output.approved,
      story,
      changesMade: [`Tech Lead Review: ${result.output.content}`],
      error: result.output.approved ? undefined : 'Tech Lead review did not approve',
    };
  }

  getSystemPrompt(_context: AgentContext): string {
    return 'Tech Lead reviewer agent system prompt';
  }
}

/**
 * Adapter for security-reviewer agent
 */
export class SecurityReviewerAdapter extends FunctionAgentAdapter {
  readonly name = 'security-reviewer';
  readonly requiredCapabilities: (keyof ProviderCapabilities)[] = [
    'supportsTools',
    'supportsSystemPrompt',
  ];

  async execute(context: AgentContext): Promise<AgentResult> {
    const { runSecurityReviewer } = await import('../perspectives/index.js');
    const result = await runSecurityReviewer(
      context.storyPath,
      context.sdlcRoot,
      context.options,
      this.provider
    );

    // Convert SecurityReviewResult to AgentResult
    const { parseStory } = await import('../../core/story.js');
    const story = parseStory(context.storyPath);

    return {
      success: result.output.approved,
      story,
      changesMade: [`Security Review: ${result.output.content}`],
      error: result.output.approved ? undefined : 'Security review did not approve',
    };
  }

  getSystemPrompt(_context: AgentContext): string {
    return 'Security reviewer agent system prompt';
  }
}

/**
 * Adapter for product-owner-reviewer agent
 */
export class ProductOwnerReviewerAdapter extends FunctionAgentAdapter {
  readonly name = 'product-owner-reviewer';
  readonly requiredCapabilities: (keyof ProviderCapabilities)[] = [
    'supportsTools',
    'supportsSystemPrompt',
  ];

  async execute(context: AgentContext): Promise<AgentResult> {
    const { runProductOwnerReviewer } = await import('../perspectives/index.js');
    const result = await runProductOwnerReviewer(
      context.storyPath,
      context.sdlcRoot,
      context.options,
      this.provider
    );

    // Convert ProductOwnerReviewResult to AgentResult
    const { parseStory } = await import('../../core/story.js');
    const story = parseStory(context.storyPath);

    return {
      success: result.output.approved,
      story,
      changesMade: [`Product Owner Review: ${result.output.content}`],
      error: result.output.approved ? undefined : 'Product Owner review did not approve',
    };
  }

  getSystemPrompt(_context: AgentContext): string {
    return 'Product Owner reviewer agent system prompt';
  }
}
