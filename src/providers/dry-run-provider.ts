import type { IProvider, IAuthenticator, ProviderCapabilities, ProviderQueryOptions } from './types.js';
import { MockAuthenticator } from './mock-provider.js';

export class DryRunProvider implements IProvider {
  readonly name = 'dry-run';

  readonly capabilities: ProviderCapabilities = {
    supportsStreaming: false,
    supportsTools: false,
    supportsSystemPrompt: true,
    supportsMultiTurn: false,
    maxContextTokens: 200000,
    supportedModels: ['dry-run'],
  };

  private authenticator = new MockAuthenticator();

  async query(options: ProviderQueryOptions): Promise<string> {
    const summary = [
      `[DRY RUN] Would send query to AI provider:`,
      `  Model: ${options.model || 'default'}`,
      `  Prompt length: ${options.prompt.length} chars`,
      options.systemPrompt ? `  System prompt length: ${options.systemPrompt.length} chars` : null,
      options.workingDirectory ? `  Working directory: ${options.workingDirectory}` : null,
    ].filter(Boolean).join('\n');

    options.onProgress?.({ type: 'session_start', sessionId: 'dry-run-session' });
    options.onProgress?.({ type: 'assistant_message', content: summary });
    options.onProgress?.({ type: 'completion' });

    return `[DRY RUN] No actual AI query performed. Prompt: ${options.prompt.substring(0, 100)}...`;
  }

  async validateConfiguration(): Promise<boolean> {
    return true;
  }

  getAuthenticator(): IAuthenticator {
    return this.authenticator;
  }
}
