import { query } from '@anthropic-ai/claude-agent-sdk';
import type { IProvider, ProviderCapabilities, ProviderQueryOptions } from '../types.js';
import { ClaudeAuthenticator } from './authenticator.js';

// Re-export authenticator for external use
export { ClaudeAuthenticator } from './authenticator.js';
import { DEFAULT_MODEL, SUPPORTED_MODELS, PERMISSION_MODE, DEFAULT_SETTING_SOURCES, MAX_CONTEXT_TOKENS } from './config.js';
import { loadConfig, DEFAULT_TIMEOUTS } from '../../core/config.js';
import { getLogger } from '../../core/logger.js';
import { platform, homedir } from 'os';
import path from 'path';
import {
  AgentTimeoutError,
  AuthenticationError,
  classifyApiError,
  shouldRetry,
  calculateBackoff,
} from '../../core/agent-errors.js';
/**
 * Message types from Claude SDK
 * Defined locally to avoid circular dependency with client.ts
 */
interface AgentMessage {
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
 * Sleep for a specified number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Get human-readable error type label for display
 */
function getErrorTypeLabel(error: Error): string {
  if ('status' in error && typeof (error as any).status === 'number') {
    const status = (error as any).status;
    if (status === 429) return 'rate limit';
    if (status === 503) return 'service unavailable';
    if (status >= 500) return 'server error';
  }

  if ('code' in error) {
    const code = (error as any).code;
    if (code === 'ETIMEDOUT') return 'network timeout';
    if (code === 'ECONNRESET') return 'connection reset';
    if (code === 'ENOTFOUND') return 'DNS lookup failed';
    if (code === 'ECONNREFUSED') return 'connection refused';
    if (code === 'EHOSTUNREACH') return 'host unreachable';
    if (code === 'EPIPE') return 'broken pipe';
  }

  return 'error';
}

/**
 * Validate that the working directory is within safe boundaries
 */
function isValidWorkingDirectory(workingDir: string): boolean {
  try {
    const normalized = path.resolve(workingDir);
    const projectRoot = path.resolve(process.cwd());
    // Allow working directory to be the project root or any subdirectory
    return normalized.startsWith(projectRoot) || normalized === projectRoot;
  } catch {
    return false;
  }
}

/**
 * Claude AI provider implementation
 *
 * Encapsulates all Claude SDK-specific logic including authentication,
 * query execution, streaming, retry logic, and error handling.
 */
export class ClaudeProvider implements IProvider {
  readonly name = 'claude';

  readonly capabilities: ProviderCapabilities = {
    supportsStreaming: true,
    supportsTools: true,
    supportsSystemPrompt: true,
    supportsMultiTurn: true,
    maxContextTokens: MAX_CONTEXT_TOKENS,
    supportedModels: [...SUPPORTED_MODELS],
  };

  private authenticator = new ClaudeAuthenticator();

  /**
   * Execute a query against Claude AI with automatic retry logic
   *
   * @param options Query options including prompt, system prompt, callbacks, etc.
   * @returns AI-generated response text
   * @throws AgentTimeoutError if query times out
   * @throws AuthenticationError if credentials are missing or expired
   * @throws Error for other failures
   */
  async query(options: ProviderQueryOptions): Promise<string> {
    const logger = getLogger();
    const config = loadConfig(options.workingDirectory || process.cwd());
    const retryConfig = config.retry || { maxRetries: 3, initialDelay: 2000, maxDelay: 32000, maxTotalDuration: 60000 };

    const overallStartTime = Date.now();
    let lastError: Error | undefined;

    // Retry loop: attempt 0 is the initial try, attempts 1+ are retries
    for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
      const queryStartTime = Date.now();

      try {
        // Execute the query
        const result = await this.executeQuery(options, queryStartTime);
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Check if we should retry
        if (!shouldRetry(lastError, attempt, retryConfig.maxRetries)) {
          // Check if this is a permanent error (not retryable) vs max retries exceeded
          const errorType = classifyApiError(lastError);
          if (errorType === 'permanent') {
            // Permanent error - fail immediately with original error
            throw lastError;
          }
          // Max retries exceeded for transient error - break to enhance the error message
          break;
        }

        // Check total duration cap
        const elapsedTime = Date.now() - overallStartTime;
        if (elapsedTime >= retryConfig.maxTotalDuration) {
          logger.warn('agent-sdk', 'Total retry duration exceeded', {
            elapsedMs: elapsedTime,
            maxDurationMs: retryConfig.maxTotalDuration,
            attempt,
          });
          throw lastError;
        }

        // Calculate backoff delay
        const delay = calculateBackoff(attempt, retryConfig.initialDelay, retryConfig.maxDelay);

        // Get error type label for logging/display
        const errorTypeLabel = getErrorTypeLabel(lastError);

        // Log retry attempt
        logger.info('agent-sdk', 'Retrying after transient error', {
          attempt: attempt + 1,
          maxRetries: retryConfig.maxRetries,
          delayMs: delay,
          errorType: errorTypeLabel,
          error: lastError.message,
        });

        // Notify progress callback
        options.onProgress?.({
          type: 'retry',
          attempt: attempt + 1,
          delay,
          error: lastError.message,
          errorType: errorTypeLabel,
        });

        // Show warning after 2nd retry (attempt 2+)
        if (attempt >= 2) {
          console.warn('⚠️  Experiencing temporary issues with API...');
        }

        // Wait before retry
        await sleep(delay);
      }
    }

    // If we get here, we've exhausted retries - enhance error message with context
    if (lastError) {
      const errorTypeLabel = getErrorTypeLabel(lastError);
      const isRateLimit = 'status' in lastError && (lastError as any).status === 429;

      if (isRateLimit) {
        throw new Error(
          `Rate limit exceeded after ${retryConfig.maxRetries} retry attempts. ` +
          `API may be rate limiting your requests. Try again in a few minutes or reduce concurrent requests.`
        );
      }

      throw new Error(
        `API request failed after ${retryConfig.maxRetries} retry attempts. ` +
        `Last error (${errorTypeLabel}): ${lastError.message}`
      );
    }
    throw new Error('Max retries exceeded');
  }

  /**
   * Execute the Claude SDK query (internal implementation, no retry logic)
   */
  private async executeQuery(options: ProviderQueryOptions, queryStartTime: number): Promise<string> {
    const logger = getLogger();

    // Configure authentication
    // Import the global function for backward compatibility with tests that mock it
    const { configureAgentSdkAuth } = await import('../../core/auth.js');
    const authResult = configureAgentSdkAuth();
    if (!authResult.configured) {
      const credentialPath = path.join(homedir(), '.claude', '.credentials.json');
      const isDarwin = platform() === 'darwin';

      let errorMessage = 'No API key or OAuth token found. ';
      errorMessage += 'Set ANTHROPIC_API_KEY environment variable, ';
      errorMessage += `or run "claude login" to create credentials at ${credentialPath}`;
      if (isDarwin) {
        errorMessage += ', or sign in to Claude Code (stored in macOS Keychain)';
      }
      errorMessage += '.';

      throw new Error(errorMessage);
    }

    // Check token expiration (only for OAuth tokens from credential file)
    if (authResult.type === 'oauth_token') {
      const tokenInfo = this.authenticator.getTokenExpirationInfo();

      // If token is expired, throw authentication error
      if (tokenInfo.isExpired) {
        const source = this.authenticator.getApiKeySource();
        const sourceLabel = source === 'credentials_file' ? 'Token from ~/.claude/.credentials.json' : 'OAuth token';
        throw new AuthenticationError(
          `${sourceLabel} has expired. Please run \`claude login\` to refresh your credentials.`
        );
      }

      // If token expires within 5 minutes, show warning but proceed
      if (tokenInfo.expiresInMs !== null && tokenInfo.expiresInMs < 5 * 60 * 1000) {
        console.warn('⚠️  OAuth token expires in less than 5 minutes. Consider running `claude login`.');
      }
    }

    // Validate and normalize working directory
    const workingDir = path.resolve(options.workingDirectory || process.cwd());
    if (!isValidWorkingDirectory(workingDir)) {
      throw new Error('Invalid working directory: path is outside project boundaries');
    }

    // Load configuration to get settingSources and timeout
    const config = loadConfig(workingDir);
    const settingSources = config.settingSources || [...DEFAULT_SETTING_SOURCES];
    const timeout = options.timeout ?? config.timeouts?.agentTimeout ?? DEFAULT_TIMEOUTS.agentTimeout;

    // Determine model to use
    const model = options.model || DEFAULT_MODEL;

    // Log query start
    logger.debug('agent-sdk', 'Starting agent query', {
      model,
      workingDirectory: workingDir,
      timeoutMs: timeout,
      authType: authResult.type,
      promptLength: options.prompt.length,
    });

    const results: string[] = [];

    const response = query({
      prompt: options.prompt,
      options: {
        model,
        systemPrompt: options.systemPrompt,
        cwd: workingDir,
        permissionMode: PERMISSION_MODE,
        settingSources: settingSources,
      },
    });

    // Create a timeout promise
    let timeoutId: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new AgentTimeoutError(timeout));
      }, timeout);
    });

    // Process the async generator with timeout
    const processMessages = async (): Promise<string> => {
      try {
        for await (const message of response as AsyncGenerator<AgentMessage>) {
          switch (message.type) {
            case 'system':
              if (message.subtype === 'init' && message.session_id) {
                options.onProgress?.({ type: 'session_start', sessionId: message.session_id });
              } else if (message.subtype === 'completion') {
                options.onProgress?.({ type: 'completion' });
              }
              break;

            case 'assistant':
              const content = message.content;
              if (typeof content === 'string') {
                results.push(content);
                options.onProgress?.({ type: 'assistant_message', content });
              } else if (Array.isArray(content)) {
                for (const block of content) {
                  if (block.type === 'text' && block.text) {
                    results.push(block.text);
                    options.onProgress?.({ type: 'assistant_message', content: block.text });
                  } else if (block.type === 'tool_use' && block.name) {
                    // Tool use request from assistant
                    options.onProgress?.({ type: 'tool_start', toolName: block.name });
                  }
                }
              }
              break;

            case 'tool_call':
              options.onProgress?.({
                type: 'tool_start',
                toolName: message.tool_name || 'unknown',
                input: message.input
              });
              break;

            case 'tool_result':
              options.onProgress?.({
                type: 'tool_end',
                toolName: message.tool_name || 'unknown',
                result: message.result
              });
              break;

            case 'result':
              if (message.subtype === 'success' && typeof message.result === 'string') {
                results.push(message.result);
              }
              break;

            case 'error':
              options.onProgress?.({ type: 'error', message: message.error?.message || 'Agent error' });
              const agentError = new Error(message.error?.message || 'Agent error');
              logger.error('agent-sdk', 'Agent query error', {
                durationMs: Date.now() - queryStartTime,
                error: agentError.message,
              });
              throw agentError;
          }
        }
        const queryDuration = Date.now() - queryStartTime;
        logger.info('agent-sdk', 'Agent query completed', {
          durationMs: queryDuration,
          resultLength: results.join('\n').length,
        });
        return results.join('\n');
      } finally {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      }
    };

    // Race between the agent query and the timeout
    try {
      return await Promise.race([processMessages(), timeoutPromise]);
    } catch (error) {
      if (error instanceof AgentTimeoutError) {
        logger.error('agent-sdk', 'Agent query timed out', {
          durationMs: Date.now() - queryStartTime,
          timeoutMs: timeout,
        });
      }
      throw error;
    }
  }

  /**
   * Validate that the provider is properly configured
   *
   * @returns true if credentials are configured, false otherwise
   */
  async validateConfiguration(): Promise<boolean> {
    return this.authenticator.validateCredentials();
  }

  /**
   * Get the authenticator for managing Claude credentials
   *
   * @returns ClaudeAuthenticator instance
   */
  getAuthenticator(): ClaudeAuthenticator {
    return this.authenticator;
  }
}
