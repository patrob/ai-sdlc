import { getApiKey, getCredentialType, CredentialType } from './auth.js';
import type {
  ProviderProgressEvent as NewProviderProgressEvent,
  ProviderProgressCallback as NewProviderProgressCallback,
  ProviderQueryOptions as NewProviderQueryOptions,
  IProvider,
} from '../providers/index.js';
import { ProviderRegistry } from '../providers/index.js';

// Re-export error classes and utilities from agent-errors module
export {
  AgentTimeoutError,
  AuthenticationError,
  classifyApiError,
  shouldRetry,
  calculateBackoff,
} from './agent-errors.js';

/**
 * Progress event types from the Agent SDK
 * @deprecated Use ProviderProgressEvent from providers module instead
 */
export type AgentProgressEvent = NewProviderProgressEvent;

/**
 * Callback for receiving real-time progress from agent execution
 * @deprecated Use ProviderProgressCallback from providers module instead
 */
export type AgentProgressCallback = NewProviderProgressCallback;

/**
 * @deprecated Use ProviderQueryOptions from providers module instead
 */
export type AgentQueryOptions = NewProviderQueryOptions;

export interface AgentMessage {
  type: string;
  subtype?: string;
  content?: string | Array<{ type: string; text?: string; name?: string }>;
  tool_name?: string;
  input?: Record<string, unknown>;
  result?: unknown;
  error?: { message: string; type?: string; tool?: string };
  session_id?: string;
}



/**
 * Run an agent query using the configured AI provider with automatic retry logic.
 * Automatically configures authentication from environment or keychain.
 * CLAUDE.md discovery is handled automatically by the SDK when settingSources includes 'project'.
 */
export async function runAgentQuery(options: AgentQueryOptions, provider?: IProvider): Promise<string> {
  // Get the default provider (Claude) from the registry when not injected
  const resolvedProvider = provider ?? ProviderRegistry.getDefault();

  // Delegate to the provider's query method
  // The provider handles all retry logic, authentication, streaming, etc.
  return resolvedProvider.query(options);
}

/**
 * Get the current credential type being used
 */
export function getCurrentCredentialType(): CredentialType {
  return getCredentialType(getApiKey());
}
