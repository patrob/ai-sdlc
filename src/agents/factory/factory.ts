/**
 * Agent Factory - centralized agent instantiation
 */

import { ProviderRegistry } from '../../providers/registry.js';
import { type IProvider } from '../../providers/types.js';
import { type IAgent } from '../types.js';
import {
  ImplementationAgentAdapter,
  OrchestratorAgentAdapter,
  PlanningAgentAdapter,
  PlanReviewAgentAdapter,
  ProductOwnerReviewerAdapter,
  RefinementAgentAdapter,
  ResearchAgentAdapter,
  ReviewAgentAdapter,
  ReworkAgentAdapter,
  SecurityReviewerAdapter,
  SingleTaskAgentAdapter,
  StateAssessorAgentAdapter,
  TechLeadReviewerAdapter,
} from './adapters.js';

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
  | 'refinement'
  | 'tech-lead-reviewer'
  | 'security-reviewer'
  | 'product-owner-reviewer';

/**
 * Factory function signature for creating agent instances.
 * Takes a provider and returns an IAgent implementation.
 */
export type AgentFactoryFn = (provider: IProvider) => IAgent;

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
    'tech-lead-reviewer': TechLeadReviewerAdapter,
    'security-reviewer': SecurityReviewerAdapter,
    'product-owner-reviewer': ProductOwnerReviewerAdapter,
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
        const requiredCaps = (agent as any).requiredCapabilities;
        for (const cap of requiredCaps) {
          if (!(provider.capabilities as any)[cap]) {
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
