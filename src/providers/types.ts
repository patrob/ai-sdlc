/**
 * Provider module types
 *
 * This module defines the core abstraction layer for AI provider backends.
 * It enables ai-sdlc to support multiple AI providers (Claude, OpenAI, GitHub Copilot, etc.)
 * without modifying existing agent logic.
 */

/**
 * Capabilities supported by an AI provider.
 *
 * Allows runtime detection of provider features so agent code can adapt behavior
 * based on what the current provider supports.
 *
 * @example
 * ```typescript
 * const capabilities: ProviderCapabilities = {
 *   supportsStreaming: true,
 *   supportsTools: true,
 *   supportsSystemPrompt: true,
 *   supportsMultiTurn: true,
 *   maxContextTokens: 200000,
 *   supportedModels: ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022']
 * };
 * ```
 */
export interface ProviderCapabilities {
  /** Whether the provider supports streaming responses */
  readonly supportsStreaming: boolean;
  /** Whether the provider supports tool/function calling */
  readonly supportsTools: boolean;
  /** Whether the provider supports system prompts */
  readonly supportsSystemPrompt: boolean;
  /** Whether the provider supports multi-turn conversations */
  readonly supportsMultiTurn: boolean;
  /** Maximum context window size in tokens */
  readonly maxContextTokens: number;
  /** List of model identifiers supported by this provider */
  readonly supportedModels: string[];
}

/**
 * Progress events emitted during AI provider query execution.
 *
 * Uses discriminated union pattern with `type` field for type-safe event handling.
 * Not all providers can emit all event types - consumers must handle missing events gracefully.
 *
 * Note: The 'assistant_message' event type is Claude-specific. Generic providers should use
 * this for any text content from the AI. The 'retry' event includes errorType for
 * categorization of transient failures.
 *
 * @example
 * ```typescript
 * function handleProgress(event: ProviderProgressEvent): void {
 *   switch (event.type) {
 *     case 'session_start':
 *       console.log(`Session started: ${event.sessionId}`);
 *       break;
 *     case 'tool_start':
 *       console.log(`Tool starting: ${event.toolName}`, event.input);
 *       break;
 *     case 'tool_end':
 *       console.log(`Tool completed: ${event.toolName}`, event.result);
 *       break;
 *     case 'assistant_message':
 *       console.log(`Assistant: ${event.content}`);
 *       break;
 *     case 'completion':
 *       console.log('Query completed');
 *       break;
 *     case 'error':
 *       console.error(`Error: ${event.message}`);
 *       break;
 *     case 'retry':
 *       console.log(`Retrying (attempt ${event.attempt}, delay ${event.delay}ms, type: ${event.errorType}): ${event.error}`);
 *       break;
 *   }
 * }
 * ```
 */
export type ProviderProgressEvent =
  | { type: 'session_start'; sessionId: string }
  | { type: 'tool_start'; toolName: string; input?: Record<string, unknown> }
  | { type: 'tool_end'; toolName: string; result?: unknown }
  | { type: 'assistant_message'; content: string }
  | { type: 'completion' }
  | { type: 'error'; message: string }
  | { type: 'retry'; attempt: number; delay: number; error: string; errorType: string };

/**
 * Callback function for receiving real-time progress updates from provider query execution.
 *
 * @param event Progress event with type-specific payload
 *
 * @example
 * ```typescript
 * const onProgress: ProviderProgressCallback = (event) => {
 *   if (event.type === 'tool_start') {
 *     console.log(`Starting tool: ${event.toolName}`);
 *   }
 * };
 * ```
 */
export type ProviderProgressCallback = (event: ProviderProgressEvent) => void;

/**
 * Options for executing an AI provider query.
 *
 * @example
 * ```typescript
 * const options: ProviderQueryOptions = {
 *   prompt: 'Analyze this code for bugs',
 *   systemPrompt: 'You are a senior code reviewer',
 *   workingDirectory: '/path/to/project',
 *   model: 'claude-3-5-sonnet-20241022',
 *   timeout: 300000, // 5 minutes
 *   onProgress: (event) => console.log(event)
 * };
 * ```
 */
export interface ProviderQueryOptions {
  /** The user's prompt/query to send to the AI provider */
  prompt: string;
  /** Optional system prompt to set provider behavior and context */
  systemPrompt?: string;
  /** Optional working directory for file operations and context */
  workingDirectory?: string;
  /** Optional model identifier (must be in provider's supportedModels list) */
  model?: string;
  /** Timeout in milliseconds. Provider-specific default used if not specified. */
  timeout?: number;
  /** Optional callback for real-time progress updates */
  onProgress?: ProviderProgressCallback;
}

/**
 * Authentication and credential management interface for AI providers.
 *
 * Abstracts credential storage, validation, and configuration across different
 * authentication mechanisms (API keys, OAuth tokens, etc.).
 *
 * @example
 * ```typescript
 * class ClaudeAuthenticator implements IAuthenticator {
 *   isConfigured(): boolean {
 *     return process.env.ANTHROPIC_API_KEY !== undefined;
 *   }
 *
 *   getCredentialType(): 'api_key' | 'oauth' | 'none' {
 *     return process.env.ANTHROPIC_API_KEY ? 'api_key' : 'none';
 *   }
 *
 *   async configure(): Promise<void> {
 *     // Interactive credential setup
 *     const apiKey = await promptForApiKey();
 *     await saveToKeychain(apiKey);
 *   }
 *
 *   async validateCredentials(): Promise<boolean> {
 *     try {
 *       await testApiConnection();
 *       return true;
 *     } catch {
 *       return false;
 *     }
 *   }
 * }
 * ```
 */
export interface IAuthenticator {
  /**
   * Check if credentials are configured (present in environment, file, keychain, etc.).
   * Does not validate that credentials are valid, only that they exist.
   *
   * @returns true if credentials are present, false otherwise
   */
  isConfigured(): boolean;

  /**
   * Get the type of credential mechanism used by this provider.
   *
   * @returns Credential type: 'api_key', 'oauth', or 'none'
   */
  getCredentialType(): 'api_key' | 'oauth' | 'none';

  /**
   * Interactively configure credentials for this provider.
   * May prompt user for input, launch OAuth flow, etc.
   *
   * @throws Error if configuration fails
   */
  configure(): Promise<void>;

  /**
   * Validate that configured credentials are valid and working.
   * Makes test API call to verify credentials.
   *
   * @returns true if credentials are valid, false otherwise
   */
  validateCredentials(): Promise<boolean>;

  /**
   * Optional: Get token expiration information for OAuth-based providers.
   * Only applicable when getCredentialType() returns 'oauth'.
   *
   * @returns Expiration info or undefined if not applicable
   */
  getTokenExpirationInfo?(): {
    /** Whether the token is currently expired (with clock skew buffer) */
    isExpired: boolean;
    /** Milliseconds until expiration (null if not available or invalid) */
    expiresInMs: number | null;
  };
}

/**
 * Core interface for AI provider backends.
 *
 * Defines the contract that all AI provider implementations must fulfill.
 * Enables ai-sdlc to work with multiple AI providers without changing agent code.
 *
 * @example
 * ```typescript
 * class ClaudeProvider implements IProvider {
 *   readonly name = 'claude';
 *   readonly capabilities: ProviderCapabilities = {
 *     supportsStreaming: true,
 *     supportsTools: true,
 *     supportsSystemPrompt: true,
 *     supportsMultiTurn: true,
 *     maxContextTokens: 200000,
 *     supportedModels: ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022']
 *   };
 *
 *   async query(options: ProviderQueryOptions): Promise<string> {
 *     // Execute query against Claude API
 *     return await claudeSdk.query(options);
 *   }
 *
 *   async validateConfiguration(): Promise<boolean> {
 *     return await this.getAuthenticator().validateCredentials();
 *   }
 *
 *   getAuthenticator(): IAuthenticator {
 *     return new ClaudeAuthenticator();
 *   }
 * }
 * ```
 */
export interface IProvider {
  /** Provider name (e.g., 'claude', 'openai', 'copilot') */
  readonly name: string;

  /** Capabilities supported by this provider */
  readonly capabilities: ProviderCapabilities;

  /**
   * Execute an AI query against this provider.
   *
   * @param options Query configuration including prompt, system prompt, callbacks, etc.
   * @returns AI-generated response text
   * @throws Error if query fails or provider not configured
   */
  query(options: ProviderQueryOptions): Promise<string>;

  /**
   * Validate that the provider is properly configured and ready to use.
   * Checks credentials, network connectivity, etc.
   *
   * @returns true if provider is ready, false otherwise
   */
  validateConfiguration(): Promise<boolean>;

  /**
   * Get the authenticator for managing this provider's credentials.
   *
   * @returns Authenticator instance for this provider
   */
  getAuthenticator(): IAuthenticator;
}
