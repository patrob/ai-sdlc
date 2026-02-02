/**
 * Base agent implementation using Template Method pattern
 *
 * This abstract class provides:
 * - Dependency injection of IProvider
 * - Automatic capability validation
 * - Template method execution flow with lifecycle hooks
 * - Standardized error handling (no thrown exceptions from execute)
 * - Helper methods for common operations
 *
 * Subclasses must implement:
 * - name: Agent identifier
 * - requiredCapabilities: List of required provider features
 * - getSystemPrompt(): System prompt for AI provider
 * - buildPrompt(): User prompt construction
 * - parseResult(): Parse AI response into domain objects
 *
 * Subclasses may override:
 * - beforeExecute(): Pre-execution hook
 * - afterExecute(): Post-execution hook
 */

import path from 'path';
import { IAgent, AgentContext, AgentResult } from './types.js';
import { IProvider, ProviderCapabilities } from '../providers/types.js';
import { getLogger } from '../core/logger.js';
import { Story } from '../types/index.js';
import { parseStory } from '../core/story.js';

/**
 * Abstract base class for all agents.
 *
 * Implements the Template Method pattern to provide a consistent execution flow:
 * 1. Validate provider capabilities (constructor)
 * 2. beforeExecute() - Optional pre-execution hook
 * 3. buildPrompt() - Construct user prompt
 * 4. runQuery() - Execute AI provider query
 * 5. parseResult() - Parse AI response
 * 6. afterExecute() - Optional post-execution hook
 * 7. Return AgentResult (never throws)
 *
 * All errors are caught and returned as AgentResult with success: false.
 *
 * @example
 * ```typescript
 * class MyAgent extends BaseAgent {
 *   readonly name = 'my-agent';
 *   readonly requiredCapabilities = ['supportsTools'] as const;
 *
 *   getSystemPrompt(context: AgentContext): string {
 *     return 'You are a helpful agent...';
 *   }
 *
 *   protected async buildPrompt(context: AgentContext): Promise<string> {
 *     return `Process this story: ${context.storyPath}`;
 *   }
 *
 *   protected async parseResult(
 *     rawResult: string,
 *     context: AgentContext
 *   ): Promise<{ story: Story; changesMade: string[] }> {
 *     // Parse and return structured data
 *   }
 * }
 * ```
 */
export abstract class BaseAgent implements IAgent {
  /** Agent identifier (must be implemented by subclass) */
  abstract readonly name: string;

  /** Required provider capabilities (must be implemented by subclass) */
  abstract readonly requiredCapabilities: (keyof ProviderCapabilities)[];

  /** AI provider dependency (injected via constructor) */
  protected provider: IProvider;

  /** Logger for debugging and diagnostics */
  protected logger = getLogger();

  /**
   * Flag to track whether capabilities have been validated.
   * Needed because subclass fields aren't initialized until after super() returns.
   */
  private capabilitiesValidated = false;

  /**
   * Constructor with dependency injection.
   *
   * @param provider - AI provider that must support all required capabilities
   * @throws Error if provider lacks any required capability
   */
  constructor(provider: IProvider) {
    this.provider = provider;
    // Note: Cannot validate here because subclass fields aren't initialized yet
    // Validation happens on first execute() call or can be triggered manually
  }

  /**
   * Validate that provider supports all required capabilities.
   * Called automatically before first execution.
   *
   * @throws Error with descriptive message if capability is missing
   * @protected
   */
  protected validateCapabilities(): void {
    if (this.capabilitiesValidated) {
      return;
    }
    for (const cap of this.requiredCapabilities) {
      if (!this.provider.capabilities[cap]) {
        throw new Error(
          `Provider '${this.provider.name}' does not support required capability: ${cap}`
        );
      }
    }
    this.capabilitiesValidated = true;
  }

  /**
   * Execute the agent (Template Method).
   *
   * This method orchestrates the entire agent execution flow:
   * 1. Call beforeExecute() hook
   * 2. Build prompt with buildPrompt()
   * 3. Query provider with runQuery()
   * 4. Parse result with parseResult()
   * 5. Call afterExecute() hook
   * 6. Return success result
   *
   * Any errors at any stage are caught and returned as error AgentResult.
   * This method NEVER throws exceptions.
   *
   * @param context - Execution context
   * @returns Promise resolving to AgentResult (never rejects)
   */
  async execute(context: AgentContext): Promise<AgentResult> {
    try {
      // Validate capabilities on first execution
      this.validateCapabilities();

      // Lifecycle hook: before execution
      await this.beforeExecute(context);

      // Build the prompt
      const prompt = await this.buildPrompt(context);

      // Execute the AI query
      const rawResult = await this.runQuery(prompt, context);

      // Parse the result
      const { story, changesMade } = await this.parseResult(rawResult, context);

      // Lifecycle hook: after execution
      await this.afterExecute(context, story, changesMade);

      // Return success
      return this.buildSuccessResult(story, changesMade);
    } catch (error) {
      // Catch all errors and return as AgentResult
      return this.buildErrorResult(error, context);
    }
  }

  /**
   * Generate system prompt for AI provider (must be implemented by subclass).
   *
   * @param context - Execution context
   * @returns System prompt string
   */
  abstract getSystemPrompt(context: AgentContext): string;

  /**
   * Build the user prompt for this agent's task (must be implemented by subclass).
   *
   * This method constructs the prompt sent to the AI provider.
   * It typically reads the story file and formats it with instructions.
   *
   * @param context - Execution context with story path and options
   * @returns Promise resolving to user prompt string
   * @protected
   */
  protected abstract buildPrompt(context: AgentContext): Promise<string>;

  /**
   * Parse the AI provider's response (must be implemented by subclass).
   *
   * This method extracts structured data from the raw AI response.
   * It should return the updated story and list of changes made.
   *
   * @param rawResult - Raw string response from AI provider
   * @param context - Execution context
   * @returns Promise resolving to parsed story and changes list
   * @protected
   */
  protected abstract parseResult(
    rawResult: string,
    context: AgentContext
  ): Promise<{ story: Story; changesMade: string[] }>;

  /**
   * Execute a query against the AI provider.
   *
   * Helper method that wraps provider.query() with standard configuration:
   * - Includes system prompt from getSystemPrompt()
   * - Sets working directory to parent of sdlcRoot
   * - Forwards onProgress callback if provided
   *
   * @param prompt - User prompt string
   * @param context - Execution context
   * @returns Promise resolving to AI response string
   * @protected
   */
  protected async runQuery(prompt: string, context: AgentContext): Promise<string> {
    return this.provider.query({
      prompt,
      systemPrompt: this.getSystemPrompt(context),
      workingDirectory: path.dirname(context.sdlcRoot),
      onProgress: context.options?.onProgress,
    });
  }

  /**
   * Pre-execution lifecycle hook.
   *
   * Called before buildPrompt(). Subclasses can override to:
   * - Validate preconditions
   * - Initialize state
   * - Log execution start
   *
   * Default implementation is a no-op.
   *
   * @param context - Execution context
   * @protected
   */
  protected async beforeExecute(context: AgentContext): Promise<void> {
    // Default: no-op
    // Subclasses can override
  }

  /**
   * Post-execution lifecycle hook.
   *
   * Called after parseResult() succeeds. Subclasses can override to:
   * - Perform cleanup
   * - Log execution completion
   * - Trigger follow-up actions
   *
   * Default implementation is a no-op.
   *
   * @param context - Execution context
   * @param story - Updated story
   * @param changesMade - List of changes
   * @protected
   */
  protected async afterExecute(
    context: AgentContext,
    story: Story,
    changesMade: string[]
  ): Promise<void> {
    // Default: no-op
    // Subclasses can override
  }

  /**
   * Build a success AgentResult.
   *
   * Helper method for constructing standardized success results.
   *
   * @param story - Updated story
   * @param changesMade - List of changes
   * @returns AgentResult with success: true
   * @protected
   */
  protected buildSuccessResult(story: Story, changesMade: string[]): AgentResult {
    return {
      success: true,
      story,
      changesMade,
    };
  }

  /**
   * Build an error AgentResult.
   *
   * Helper method for constructing standardized error results.
   * Includes error message and stack trace for debugging.
   *
   * @param error - Error that occurred
   * @param context - Execution context (for reading current story state)
   * @returns AgentResult with success: false and error details
   * @protected
   */
  protected buildErrorResult(error: unknown, context: AgentContext): AgentResult {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;

    // Log the error
    this.logger.error(this.name, `Agent execution failed: ${errorMessage}`, {
      stack,
      context: {
        storyPath: context.storyPath,
        sdlcRoot: context.sdlcRoot,
      },
    });

    // Try to read the current story state (may fail if file doesn't exist)
    let story: Story;
    try {
      story = parseStory(context.storyPath);
    } catch {
      // If we can't read the story, create a minimal stub
      story = {
        path: context.storyPath,
        slug: path.basename(path.dirname(context.storyPath)),
        frontmatter: {
          id: 'unknown',
          title: 'Error loading story',
          slug: 'unknown',
          priority: 0,
          status: 'backlog',
          type: 'feature',
          created: new Date().toISOString(),
          labels: [],
          research_complete: false,
          plan_complete: false,
          implementation_complete: false,
          reviews_complete: false,
        },
        content: '',
      };
    }

    return {
      success: false,
      story,
      changesMade: [],
      error: stack ? `${errorMessage}\n\nStack trace:\n${stack}` : errorMessage,
    };
  }
}
