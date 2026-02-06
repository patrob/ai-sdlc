import type { IProvider, IAuthenticator, ProviderCapabilities, ProviderQueryOptions } from './types.js';

export interface MockProviderOptions {
  /** Queue of responses to return in order. Cycles back to start when exhausted. */
  responses?: string[];
  /** Function to generate responses based on prompt */
  responseFactory?: (prompt: string, systemPrompt?: string) => string;
  /** Default response when no responses or factory provided */
  defaultResponse?: string;
  /** Simulate delay in ms before returning */
  simulateDelay?: number;
  /** Record all calls for later assertion */
  recordCalls?: boolean;
}

export interface RecordedCall {
  prompt: string;
  systemPrompt?: string;
  model?: string;
  timestamp: number;
}

export class MockAuthenticator implements IAuthenticator {
  isConfigured(): boolean {
    return true;
  }

  getCredentialType(): 'api_key' | 'oauth' | 'none' {
    return 'api_key';
  }

  async configure(): Promise<void> {}

  async validateCredentials(): Promise<boolean> {
    return true;
  }
}

export class MockProvider implements IProvider {
  readonly name = 'mock';

  readonly capabilities: ProviderCapabilities = {
    supportsStreaming: true,
    supportsTools: true,
    supportsSystemPrompt: true,
    supportsMultiTurn: true,
    maxContextTokens: 200000,
    supportedModels: ['mock-model'],
  };

  private options: MockProviderOptions;
  private responseIndex = 0;
  private calls: RecordedCall[] = [];
  private authenticator = new MockAuthenticator();

  constructor(options: MockProviderOptions = {}) {
    this.options = options;
  }

  async query(options: ProviderQueryOptions): Promise<string> {
    if (this.options.recordCalls !== false) {
      this.calls.push({
        prompt: options.prompt,
        systemPrompt: options.systemPrompt,
        model: options.model,
        timestamp: Date.now(),
      });
    }

    if (this.options.simulateDelay && this.options.simulateDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.options.simulateDelay));
    }

    options.onProgress?.({ type: 'session_start', sessionId: 'mock-session' });

    let response: string;
    if (this.options.responses && this.options.responses.length > 0) {
      response = this.options.responses[this.responseIndex % this.options.responses.length];
      this.responseIndex++;
    } else if (this.options.responseFactory) {
      response = this.options.responseFactory(options.prompt, options.systemPrompt);
    } else {
      response = this.options.defaultResponse ?? 'mock response';
    }

    options.onProgress?.({ type: 'assistant_message', content: response });
    options.onProgress?.({ type: 'completion' });

    return response;
  }

  getCalls(): RecordedCall[] {
    return [...this.calls];
  }

  reset(): void {
    this.responseIndex = 0;
    this.calls = [];
  }

  async validateConfiguration(): Promise<boolean> {
    return true;
  }

  getAuthenticator(): IAuthenticator {
    return this.authenticator;
  }
}
