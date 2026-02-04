/**
 * Agent Factory for centralized agent instantiation
 *
 * This module provides a type-safe factory for creating agent instances with
 * proper dependency injection. The factory pattern enables:
 * - Consistent agent initialization with provider injection
 * - Simplified testing through provider override
 * - Runtime extensibility via custom agent registration
 * - Type-safe agent resolution by AgentType
 *
 * The factory uses adapter classes to wrap existing function-based agents,
 * providing a consistent IAgent interface while maintaining backward compatibility.
 *
 * @example
 * ```typescript
 * // Create agent with default provider
 * const researchAgent = AgentFactory.create('research');
 *
 * // Create agent with custom provider (for testing)
 * const mockProvider = new MockProvider();
 * const planningAgent = AgentFactory.createWithProvider('planning', mockProvider);
 *
 * // Register custom agent
 * AgentFactory.registerAgent('custom', (provider) => new CustomAgent(provider));
 *
 * // List all available agent types
 * const types = AgentFactory.listAgentTypes();
 * ```
 */

import { IAgent, AgentContext, AgentResult } from './types.js';
import { IProvider, ProviderCapabilities } from '../providers/types.js';
import { ProviderRegistry } from '../providers/registry.js';
import { runResearchAgent } from './research.js';
import { runPlanningAgent } from './planning.js';
import { runImplementationAgent } from './implementation.js';
import { runReviewAgent } from './review.js';
import { runSingleTaskAgent } from './single-task.js';
import { runReworkAgent } from './rework.js';
import { runRefinementAgent } from './refinement.js';
import { runImplementationOrchestrator } from './orchestrator.js';
import { runStateAssessor } from './state-assessor.js';
import { runPlanReviewAgent } from './plan-review.js';

/**
 * Union type of all built-in agent types.
 * Used for type-safe agent creation and validation.
 */
export type AgentType =
  | 'research'
  | 'planning'
  | 'plan-review'
  | 'implementation'
  | 'review'
  | 'single-task'
  | 'orchestrator'
  | 'rework'
  | 'state-assessor'
  | 'refinement';

/**
 * Factory function signature for creating agent instances.
 * Takes a provider and returns an IAgent implementation.
 */
export type AgentFactoryFn = (provider: IProvider) => IAgent;

/**
 * Base adapter class for wrapping function-based agents.
 * Provides IAgent interface implementation for legacy function-based agents.
 */
abstract class FunctionAgentAdapter implements IAgent {
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
class ResearchAgentAdapter extends FunctionAgentAdapter {
  readonly name = 'research';
  readonly requiredCapabilities: (keyof ProviderCapabilities)[] = [
    'supportsTools',
    'supportsSystemPrompt',
  ];

  async execute(context: AgentContext): Promise<AgentResult> {
    return runResearchAgent(context.storyPath, context.sdlcRoot, context.options, this.provider);
  }

  getSystemPrompt(context: AgentContext): string {
    return 'Research agent system prompt';
  }
}

/**
 * Adapter for planning agent
 */
class PlanningAgentAdapter extends FunctionAgentAdapter {
  readonly name = 'planning';
  readonly requiredCapabilities: (keyof ProviderCapabilities)[] = [
    'supportsTools',
    'supportsSystemPrompt',
  ];

  async execute(context: AgentContext): Promise<AgentResult> {
    return runPlanningAgent(context.storyPath, context.sdlcRoot, context.options, this.provider);
  }

  getSystemPrompt(context: AgentContext): string {
    return 'Planning agent system prompt';
  }
}

/**
 * Adapter for plan-review agent
 */
class PlanReviewAgentAdapter extends FunctionAgentAdapter {
  readonly name = 'plan-review';
  readonly requiredCapabilities: (keyof ProviderCapabilities)[] = [
    'supportsTools',
    'supportsSystemPrompt',
  ];

  async execute(context: AgentContext): Promise<AgentResult> {
    return runPlanReviewAgent(context.storyPath, context.sdlcRoot, context.options, this.provider);
  }

  getSystemPrompt(context: AgentContext): string {
    return 'Plan review agent system prompt';
  }
}

/**
 * Adapter for implementation agent
 */
class ImplementationAgentAdapter extends FunctionAgentAdapter {
  readonly name = 'implementation';
  readonly requiredCapabilities: (keyof ProviderCapabilities)[] = [
    'supportsTools',
    'supportsSystemPrompt',
  ];

  async execute(context: AgentContext): Promise<AgentResult> {
    return runImplementationAgent(context.storyPath, context.sdlcRoot, context.options, this.provider);
  }

  getSystemPrompt(context: AgentContext): string {
    return 'Implementation agent system prompt';
  }
}

/**
 * Adapter for review agent
 */
class ReviewAgentAdapter extends FunctionAgentAdapter {
  readonly name = 'review';
  readonly requiredCapabilities: (keyof ProviderCapabilities)[] = [
    'supportsTools',
    'supportsSystemPrompt',
  ];

  async execute(context: AgentContext): Promise<AgentResult> {
    // Review agent has ReviewAgentOptions, cast options as any to avoid type mismatch
    return runReviewAgent(context.storyPath, context.sdlcRoot, context.options as any, this.provider);
  }

  getSystemPrompt(context: AgentContext): string {
    return 'Review agent system prompt';
  }
}

/**
 * Adapter for single-task agent
 */
class SingleTaskAgentAdapter extends FunctionAgentAdapter {
  readonly name = 'single-task';
  readonly requiredCapabilities: (keyof ProviderCapabilities)[] = [
    'supportsTools',
    'supportsSystemPrompt',
  ];

  async execute(context: AgentContext): Promise<AgentResult> {
    // Single-task agent takes TaskContext and returns AgentTaskResult
    // We adapt the interfaces here
    const taskContext = {
      storyPath: context.storyPath,
      sdlcRoot: context.sdlcRoot,
    };
    const taskResult = await runSingleTaskAgent(taskContext as any, context.options as any, this.provider);

    // Convert AgentTaskResult to AgentResult
    const { parseStory } = await import('../core/story.js');
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

  getSystemPrompt(context: AgentContext): string {
    return 'Single-task agent system prompt';
  }
}

/**
 * Adapter for orchestrator agent
 */
class OrchestratorAgentAdapter extends FunctionAgentAdapter {
  readonly name = 'orchestrator';
  readonly requiredCapabilities: (keyof ProviderCapabilities)[] = [
    'supportsTools',
    'supportsSystemPrompt',
  ];

  async execute(context: AgentContext): Promise<AgentResult> {
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

  getSystemPrompt(context: AgentContext): string {
    return 'Orchestrator agent system prompt';
  }
}

/**
 * Adapter for rework agent
 */
class ReworkAgentAdapter extends FunctionAgentAdapter {
  readonly name = 'rework';
  readonly requiredCapabilities: (keyof ProviderCapabilities)[] = [
    'supportsTools',
    'supportsSystemPrompt',
  ];

  async execute(context: AgentContext): Promise<AgentResult> {
    // Rework agent takes ReworkContext as 3rd parameter
    // We extract it from options.reworkContext or provide default
    const reworkContext = (context.options as any)?.reworkContext || {
      previousAttempts: [],
      errorOutput: '',
      guidance: '',
    };
    return runReworkAgent(context.storyPath, context.sdlcRoot, reworkContext);
  }

  getSystemPrompt(context: AgentContext): string {
    return 'Rework agent system prompt';
  }
}

/**
 * Adapter for state-assessor agent
 *
 * Note: State assessor is different - it doesn't follow the standard AgentContext pattern.
 * This adapter provides a compatible interface but the execute method uses a simplified implementation.
 */
class StateAssessorAgentAdapter extends FunctionAgentAdapter {
  readonly name = 'state-assessor';
  readonly requiredCapabilities: (keyof ProviderCapabilities)[] = []; // Doesn't use provider

  async execute(context: AgentContext): Promise<AgentResult> {
    // State assessor uses sdlcRoot only
    const assessment = await runStateAssessor(context.sdlcRoot);

    // Convert StateAssessment to AgentResult format
    const { parseStory } = await import('../core/story.js');
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

  getSystemPrompt(context: AgentContext): string {
    return 'State assessor agent system prompt';
  }
}

/**
 * Adapter for refinement agent
 */
class RefinementAgentAdapter extends FunctionAgentAdapter {
  readonly name = 'refinement';
  readonly requiredCapabilities: (keyof ProviderCapabilities)[] = [
    'supportsTools',
    'supportsSystemPrompt',
  ];

  async execute(context: AgentContext): Promise<AgentResult> {
    return runRefinementAgent(context.storyPath, context.sdlcRoot, context.options, this.provider);
  }

  getSystemPrompt(context: AgentContext): string {
    return 'Refinement agent system prompt';
  }
}

/**
 * Centralized factory for creating agent instances.
 *
 * Provides type-safe agent instantiation with dependency injection.
 * Supports custom agent registration for extensibility.
 *
 * This is a static-only class (no instantiation required).
 */
export class AgentFactory {
  /** Map of custom agent types to factory functions */
  private static customAgents = new Map<string, AgentFactoryFn>();

  /** Map of built-in agent types to their adapter classes */
  private static builtInAgents: Record<AgentType, new (provider: IProvider) => IAgent> = {
    research: ResearchAgentAdapter,
    planning: PlanningAgentAdapter,
    'plan-review': PlanReviewAgentAdapter,
    implementation: ImplementationAgentAdapter,
    review: ReviewAgentAdapter,
    'single-task': SingleTaskAgentAdapter,
    orchestrator: OrchestratorAgentAdapter,
    rework: ReworkAgentAdapter,
    'state-assessor': StateAssessorAgentAdapter,
    refinement: RefinementAgentAdapter,
  };

  /**
   * Private constructor to prevent instantiation.
   * This is a static-only class.
   */
  private constructor() {}

  /**
   * Create an agent instance using the default provider.
   *
   * Gets the default provider from ProviderRegistry and delegates to createWithProvider.
   *
   * @param type - Agent type to create
   * @returns Agent instance with default provider injected
   * @throws Error if no default provider is configured
   * @throws Error if agent type is unknown
   *
   * @example
   * ```typescript
   * const agent = AgentFactory.create('research');
   * const result = await agent.execute(context);
   * ```
   */
  static create(type: AgentType): IAgent {
    const provider = ProviderRegistry.getDefault();
    if (!provider) {
      throw new Error(
        'No default provider configured. Set AI_SDLC_PROVIDER environment variable or register a default provider.'
      );
    }
    return this.createWithProvider(type, provider);
  }

  /**
   * Create an agent instance with a specific provider.
   *
   * This method enables dependency injection for testing and custom provider usage.
   * Custom agents registered via registerAgent() take precedence over built-in agents.
   *
   * @param type - Agent type to create
   * @param provider - Provider instance to inject
   * @returns Agent instance with provider injected
   * @throws Error if agent type is unknown
   *
   * @example
   * ```typescript
   * const mockProvider = new MockProvider();
   * const agent = AgentFactory.createWithProvider('planning', mockProvider);
   * ```
   */
  static createWithProvider(type: AgentType | string, provider: IProvider): IAgent {
    // Check custom agents first (allows overriding built-in agents)
    const customFactory = this.customAgents.get(type);
    if (customFactory) {
      return customFactory(provider);
    }

    // Check built-in agents
    const AdapterClass = this.builtInAgents[type as AgentType];
    if (AdapterClass) {
      const agent = new AdapterClass(provider);

      // Validate provider capabilities for built-in agents
      if ('requiredCapabilities' in agent) {
        const requiredCaps = (agent as FunctionAgentAdapter).requiredCapabilities;
        for (const cap of requiredCaps) {
          if (!provider.capabilities[cap]) {
            throw new Error(
              `Provider '${provider.name}' does not support required capability: ${cap}`
            );
          }
        }
      }

      return agent;
    }

    // Unknown agent type
    const available = this.listAgentTypes();
    const availableList = available.length > 0 ? available.join(', ') : 'none';
    throw new Error(`Unknown agent type: ${type}. Available: ${availableList}`);
  }

  /**
   * Register a custom agent factory function.
   *
   * Enables runtime extension of the factory with custom agent implementations.
   * If an agent with the same name already exists (built-in or custom), it will be overridden.
   *
   * @param type - Unique agent type identifier
   * @param factory - Factory function that creates the agent
   *
   * @example
   * ```typescript
   * AgentFactory.registerAgent('custom', (provider) => new CustomAgent(provider));
   * const agent = AgentFactory.create('custom');
   * ```
   */
  static registerAgent(type: string, factory: AgentFactoryFn): void {
    this.customAgents.set(type, factory);
  }

  /**
   * Get a list of all available agent types.
   *
   * Returns both built-in and custom agent types, sorted alphabetically.
   *
   * @returns Array of agent type strings
   *
   * @example
   * ```typescript
   * const types = AgentFactory.listAgentTypes();
   * console.log(types); // ['implementation', 'orchestrator', 'planning', ...]
   * ```
   */
  static listAgentTypes(): string[] {
    const builtInTypes = Object.keys(this.builtInAgents);
    const customTypes = Array.from(this.customAgents.keys());

    // Combine and deduplicate (custom agents may override built-in)
    const allTypes = new Set([...builtInTypes, ...customTypes]);

    // Return sorted array
    return Array.from(allTypes).sort();
  }

  /**
   * Reset the factory to initial state.
   *
   * Clears all custom agent registrations. Useful for test isolation.
   * Built-in agents are not affected.
   *
   * @example
   * ```typescript
   * // In test teardown
   * afterEach(() => {
   *   AgentFactory.reset();
   * });
   * ```
   */
  static reset(): void {
    this.customAgents.clear();
  }
}
