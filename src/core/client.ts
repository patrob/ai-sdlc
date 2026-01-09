import { query } from '@anthropic-ai/claude-agent-sdk';
import { configureAgentSdkAuth, getApiKey, getCredentialType, CredentialType } from './auth.js';

export interface AgentQueryOptions {
  prompt: string;
  systemPrompt?: string;
  workingDirectory?: string;
  model?: string;
}

export interface AgentMessage {
  type: string;
  subtype?: string;
  content?: string | Array<{ type: string; text?: string }>;
  tool_name?: string;
  input?: Record<string, unknown>;
  result?: unknown;
  error?: { message: string };
  session_id?: string;
}

/**
 * Run an agent query using the Claude Agent SDK.
 * Automatically configures authentication from environment or keychain.
 */
export async function runAgentQuery(options: AgentQueryOptions): Promise<string> {
  // Configure authentication
  const authResult = configureAgentSdkAuth();
  if (!authResult.configured) {
    throw new Error('No API key or OAuth token found. Set ANTHROPIC_API_KEY or sign in to Claude Code.');
  }

  const results: string[] = [];

  const response = query({
    prompt: options.prompt,
    options: {
      model: options.model || 'claude-sonnet-4-5-20250929',
      systemPrompt: options.systemPrompt,
      cwd: options.workingDirectory || process.cwd(),
      permissionMode: 'acceptEdits',
      settingSources: [], // Don't load external settings
    },
  });

  for await (const message of response as AsyncGenerator<AgentMessage>) {
    if (message.type === 'assistant') {
      const content = message.content;
      if (typeof content === 'string') {
        results.push(content);
      } else if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === 'text' && block.text) {
            results.push(block.text);
          }
        }
      }
    } else if (message.type === 'result' && message.subtype === 'success') {
      // Final result
      if (typeof message.result === 'string') {
        results.push(message.result);
      }
    } else if (message.type === 'error') {
      throw new Error(message.error?.message || 'Agent error');
    }
  }

  return results.join('\n');
}

/**
 * Get the current credential type being used
 */
export function getCurrentCredentialType(): CredentialType {
  return getCredentialType(getApiKey());
}
