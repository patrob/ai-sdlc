import { query } from '@anthropic-ai/claude-agent-sdk';
import { configureAgentSdkAuth, getApiKey, getCredentialType, CredentialType, getTokenExpirationInfo } from './auth.js';
import { loadConfig, DEFAULT_TIMEOUTS } from './config.js';
import { getLogger } from './logger.js';
import { platform, homedir } from 'os';
import path from 'path';

/**
 * Error thrown when an agent query times out
 */
export class AgentTimeoutError extends Error {
  constructor(timeoutMs: number) {
    const timeoutSec = Math.round(timeoutMs / 1000);
    super(`Agent query timed out after ${timeoutSec} seconds. Consider increasing 'timeouts.agentTimeout' in .ai-sdlc.json`);
    this.name = 'AgentTimeoutError';
  }
}

/**
 * Error thrown when authentication fails (e.g., expired token)
 */
export class AuthenticationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

/**
 * Progress event types from the Agent SDK
 */
export type AgentProgressEvent =
  | { type: 'session_start'; sessionId: string }
  | { type: 'tool_start'; toolName: string; input?: Record<string, unknown> }
  | { type: 'tool_end'; toolName: string; result?: unknown }
  | { type: 'assistant_message'; content: string }
  | { type: 'completion' }
  | { type: 'error'; message: string };

/**
 * Callback for receiving real-time progress from agent execution
 */
export type AgentProgressCallback = (event: AgentProgressEvent) => void;

export interface AgentQueryOptions {
  prompt: string;
  systemPrompt?: string;
  workingDirectory?: string;
  model?: string;
  /** Timeout in milliseconds. Defaults to config value or 10 minutes. */
  timeout?: number;
  /** Callback for real-time progress updates */
  onProgress?: AgentProgressCallback;
}

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
 * Run an agent query using the Claude Agent SDK.
 * Automatically configures authentication from environment or keychain.
 * CLAUDE.md discovery is handled automatically by the SDK when settingSources includes 'project'.
 */
export async function runAgentQuery(options: AgentQueryOptions): Promise<string> {
  const logger = getLogger();
  const queryStartTime = Date.now();

  // Configure authentication
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
    const tokenInfo = getTokenExpirationInfo();

    // If token is expired, throw authentication error
    if (tokenInfo.isExpired) {
      const source = tokenInfo.source ? `Token from ${tokenInfo.source}` : 'OAuth token';
      throw new AuthenticationError(
        `${source} has expired. Please run \`claude login\` to refresh your credentials.`
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
  const settingSources = config.settingSources || [];
  const timeout = options.timeout ?? config.timeouts?.agentTimeout ?? DEFAULT_TIMEOUTS.agentTimeout;

  // Log query start
  logger.debug('agent-sdk', 'Starting agent query', {
    model: options.model || 'claude-sonnet-4-5-20250929',
    workingDirectory: workingDir,
    timeoutMs: timeout,
    authType: authResult.type,
    promptLength: options.prompt.length,
  });

  const results: string[] = [];

  const response = query({
    prompt: options.prompt,
    options: {
      model: options.model || 'claude-sonnet-4-5-20250929',
      systemPrompt: options.systemPrompt,
      cwd: workingDir,
      permissionMode: 'acceptEdits',
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
 * Get the current credential type being used
 */
export function getCurrentCredentialType(): CredentialType {
  return getCredentialType(getApiKey());
}
