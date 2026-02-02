/**
 * Agent types module
 *
 * This module defines the core abstractions for the agent subsystem:
 * - IAgent: Interface contract for all agents
 * - AgentContext: Execution context passed to agents
 * - AgentResult: Standardized result type (re-exported from types/index.ts)
 * - AgentOptions: Configuration options for agent execution
 *
 * These types enable dependency injection, consistent execution patterns,
 * and improved testability across the agent subsystem.
 */

import { IProvider, ProviderCapabilities } from '../providers/types.js';
import { AgentResult } from '../types/index.js';
import type { AgentOptions } from './research.js';

// Re-export AgentResult and AgentOptions for convenience
export { AgentResult } from '../types/index.js';
export type { AgentOptions } from './research.js';

/**
 * Execution context for agent operations.
 *
 * Contains all the information an agent needs to execute:
 * - Story location and SDLC root for file operations
 * - Provider for AI query execution
 * - Optional configuration for advanced features
 *
 * @example
 * ```typescript
 * const context: AgentContext = {
 *   storyPath: '/path/to/.ai-sdlc/stories/S-0001/story.md',
 *   sdlcRoot: '/path/to/.ai-sdlc',
 *   provider: new ClaudeProvider(),
 *   options: {
 *     reworkContext: 'Fix linting errors in implementation',
 *     onProgress: (event) => console.log(event)
 *   }
 * };
 * ```
 */
export interface AgentContext {
  /** Absolute path to the story markdown file */
  storyPath: string;
  /** Absolute path to the .ai-sdlc directory */
  sdlcRoot: string;
  /** AI provider for query execution */
  provider: IProvider;
  /** Optional configuration for agent execution */
  options?: AgentOptions;
}


/**
 * Core interface for all agents in the system.
 *
 * Defines the contract that all agent implementations must fulfill:
 * - Identity (name)
 * - Capability requirements (what the provider must support)
 * - Execution method (main entry point)
 * - System prompt generation (provider context)
 *
 * This interface enables:
 * - Dependency injection of providers
 * - Runtime capability validation
 * - Consistent execution patterns
 * - Type-safe agent composition
 *
 * @example
 * ```typescript
 * class ResearchAgent implements IAgent {
 *   readonly name = 'research';
 *   readonly requiredCapabilities = ['supportsTools', 'supportsSystemPrompt'];
 *
 *   constructor(private provider: IProvider) {
 *     // Capability validation happens in BaseAgent
 *   }
 *
 *   async execute(context: AgentContext): Promise<AgentResult> {
 *     // Implementation...
 *   }
 *
 *   getSystemPrompt(context: AgentContext): string {
 *     return 'You are a technical research specialist...';
 *   }
 * }
 * ```
 */
export interface IAgent {
  /**
   * Agent identifier for logging and debugging.
   * Should be lowercase, kebab-case (e.g., 'research', 'code-review').
   */
  readonly name: string;

  /**
   * List of provider capabilities required by this agent.
   * Constructor must validate that the provider supports all required capabilities.
   * Throws error if provider lacks any required capability.
   *
   * @example ['supportsTools', 'supportsSystemPrompt', 'supportsStreaming']
   */
  readonly requiredCapabilities: (keyof ProviderCapabilities)[];

  /**
   * Execute the agent with the given context.
   *
   * This is the main entry point for agent execution. Implementations must:
   * - Read story content from context.storyPath
   * - Use context.provider for AI queries
   * - Apply context.options for configuration
   * - Return AgentResult with success status and changes made
   * - NEVER throw errors - catch all exceptions and return error in AgentResult
   *
   * @param context - Execution context with story, provider, and options
   * @returns Promise resolving to AgentResult with success/failure and changes
   */
  execute(context: AgentContext): Promise<AgentResult>;

  /**
   * Generate the system prompt for AI provider.
   *
   * System prompts set the behavior and context for the AI provider.
   * They should be specific to the agent's task and may vary based on context.
   *
   * @param context - Execution context for generating contextual prompts
   * @returns System prompt string to send to provider
   */
  getSystemPrompt(context: AgentContext): string;
}
