import { describe, it, expect } from 'vitest';
import type {
  IProvider,
  IAuthenticator,
  ProviderCapabilities,
  ProviderQueryOptions,
  ProviderProgressEvent,
  ProviderProgressCallback,
} from '../index.js';

describe('Provider Type Definitions', () => {
  describe('ProviderCapabilities interface', () => {
    it('should define all required properties', () => {
      const capabilities: ProviderCapabilities = {
        supportsStreaming: true,
        supportsTools: true,
        supportsSystemPrompt: true,
        supportsMultiTurn: true,
        maxContextTokens: 200000,
        supportedModels: ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022'],
      };

      expect(capabilities.supportsStreaming).toBeDefined();
      expect(capabilities.supportsTools).toBeDefined();
      expect(capabilities.supportsSystemPrompt).toBeDefined();
      expect(capabilities.supportsMultiTurn).toBeDefined();
      expect(capabilities.maxContextTokens).toBeDefined();
      expect(capabilities.supportedModels).toBeDefined();
    });

    it('should allow different capability combinations', () => {
      const limitedCapabilities: ProviderCapabilities = {
        supportsStreaming: false,
        supportsTools: false,
        supportsSystemPrompt: true,
        supportsMultiTurn: false,
        maxContextTokens: 4096,
        supportedModels: ['gpt-3.5-turbo'],
      };

      expect(limitedCapabilities.supportsStreaming).toBe(false);
      expect(limitedCapabilities.maxContextTokens).toBe(4096);
    });
  });

  describe('ProviderProgressEvent discriminated union', () => {
    it('should support session_start event', () => {
      const event: ProviderProgressEvent = {
        type: 'session_start',
        sessionId: 'test-session-123',
      };

      expect(event.type).toBe('session_start');
      if (event.type === 'session_start') {
        expect(event.sessionId).toBe('test-session-123');
      }
    });

    it('should support tool_start event with optional input', () => {
      const eventWithInput: ProviderProgressEvent = {
        type: 'tool_start',
        toolName: 'read_file',
        input: { path: '/test/file.ts' },
      };

      expect(eventWithInput.type).toBe('tool_start');
      if (eventWithInput.type === 'tool_start') {
        expect(eventWithInput.toolName).toBe('read_file');
        expect(eventWithInput.input).toEqual({ path: '/test/file.ts' });
      }

      const eventWithoutInput: ProviderProgressEvent = {
        type: 'tool_start',
        toolName: 'list_files',
      };

      expect(eventWithoutInput.type).toBe('tool_start');
      if (eventWithoutInput.type === 'tool_start') {
        expect(eventWithoutInput.toolName).toBe('list_files');
        expect(eventWithoutInput.input).toBeUndefined();
      }
    });

    it('should support tool_end event with optional result', () => {
      const eventWithResult: ProviderProgressEvent = {
        type: 'tool_end',
        toolName: 'read_file',
        result: { content: 'file contents', size: 1024 },
      };

      expect(eventWithResult.type).toBe('tool_end');
      if (eventWithResult.type === 'tool_end') {
        expect(eventWithResult.toolName).toBe('read_file');
        expect(eventWithResult.result).toBeDefined();
      }

      const eventWithoutResult: ProviderProgressEvent = {
        type: 'tool_end',
        toolName: 'write_file',
      };

      expect(eventWithoutResult.type).toBe('tool_end');
    });

    it('should support assistant_message event', () => {
      const event: ProviderProgressEvent = {
        type: 'assistant_message',
        content: 'Here is the analysis of your code...',
      };

      expect(event.type).toBe('assistant_message');
      if (event.type === 'assistant_message') {
        expect(event.content).toBe('Here is the analysis of your code...');
      }
    });

    it('should support completion event', () => {
      const event: ProviderProgressEvent = {
        type: 'completion',
      };

      expect(event.type).toBe('completion');
    });

    it('should support error event', () => {
      const event: ProviderProgressEvent = {
        type: 'error',
        message: 'API rate limit exceeded',
      };

      expect(event.type).toBe('error');
      if (event.type === 'error') {
        expect(event.message).toBe('API rate limit exceeded');
      }
    });

    it('should support retry event with all fields', () => {
      const event: ProviderProgressEvent = {
        type: 'retry',
        attempt: 2,
        delay: 4000,
        error: 'Connection timeout',
        errorType: 'network_error',
      };

      expect(event.type).toBe('retry');
      if (event.type === 'retry') {
        expect(event.attempt).toBe(2);
        expect(event.delay).toBe(4000);
        expect(event.error).toBe('Connection timeout');
        expect(event.errorType).toBe('network_error');
      }
    });

    it('should enable type narrowing via discriminant', () => {
      const event: ProviderProgressEvent = {
        type: 'tool_start',
        toolName: 'grep',
        input: { pattern: 'test' },
      };

      // TypeScript should narrow the type based on discriminant
      if (event.type === 'tool_start') {
        // This should compile - toolName exists on tool_start events
        expect(event.toolName).toBe('grep');
      }

      // This should NOT compile if uncommented (testing type safety)
      // if (event.type === 'completion') {
      //   expect(event.toolName).toBe('grep'); // Error: toolName doesn't exist on completion
      // }
    });
  });

  describe('ProviderProgressCallback type', () => {
    it('should accept event parameter and return void', () => {
      const callback: ProviderProgressCallback = (event) => {
        expect(event).toBeDefined();
        expect(event.type).toBeDefined();
      };

      callback({ type: 'completion' });
    });

    it('should allow type narrowing in callback implementation', () => {
      const callback: ProviderProgressCallback = (event) => {
        switch (event.type) {
          case 'session_start':
            expect(event.sessionId).toBeDefined();
            break;
          case 'tool_start':
            expect(event.toolName).toBeDefined();
            break;
          case 'error':
            expect(event.message).toBeDefined();
            break;
        }
      };

      callback({ type: 'session_start', sessionId: 'test' });
      callback({ type: 'tool_start', toolName: 'read' });
      callback({ type: 'error', message: 'failed' });
    });
  });

  describe('ProviderQueryOptions interface', () => {
    it('should require prompt field', () => {
      const minimalOptions: ProviderQueryOptions = {
        prompt: 'Analyze this code',
      };

      expect(minimalOptions.prompt).toBe('Analyze this code');
    });

    it('should support all optional fields', () => {
      const onProgress: ProviderProgressCallback = (event) => {
        console.log(event);
      };

      const fullOptions: ProviderQueryOptions = {
        prompt: 'Analyze this code',
        systemPrompt: 'You are a senior code reviewer',
        workingDirectory: '/path/to/project',
        model: 'claude-3-5-sonnet-20241022',
        timeout: 300000,
        onProgress,
      };

      expect(fullOptions.systemPrompt).toBeDefined();
      expect(fullOptions.workingDirectory).toBeDefined();
      expect(fullOptions.model).toBeDefined();
      expect(fullOptions.timeout).toBe(300000);
      expect(fullOptions.onProgress).toBe(onProgress);
    });
  });

  describe('IAuthenticator interface', () => {
    it('should define all required methods', () => {
      const mockAuth: IAuthenticator = {
        isConfigured: () => true,
        getCredentialType: () => 'api_key',
        configure: async () => {},
        validateCredentials: async () => true,
      };

      expect(mockAuth.isConfigured()).toBe(true);
      expect(mockAuth.getCredentialType()).toBe('api_key');
      expect(mockAuth.configure).toBeDefined();
      expect(mockAuth.validateCredentials).toBeDefined();
    });

    it('should support all credential types', () => {
      const apiKeyAuth: IAuthenticator = {
        isConfigured: () => true,
        getCredentialType: () => 'api_key',
        configure: async () => {},
        validateCredentials: async () => true,
      };

      const oauthAuth: IAuthenticator = {
        isConfigured: () => true,
        getCredentialType: () => 'oauth',
        configure: async () => {},
        validateCredentials: async () => true,
      };

      const noAuth: IAuthenticator = {
        isConfigured: () => false,
        getCredentialType: () => 'none',
        configure: async () => {},
        validateCredentials: async () => false,
      };

      expect(apiKeyAuth.getCredentialType()).toBe('api_key');
      expect(oauthAuth.getCredentialType()).toBe('oauth');
      expect(noAuth.getCredentialType()).toBe('none');
    });

    it('should support optional getTokenExpirationInfo', () => {
      const authWithExpiration: IAuthenticator = {
        isConfigured: () => true,
        getCredentialType: () => 'oauth',
        configure: async () => {},
        validateCredentials: async () => true,
        getTokenExpirationInfo: () => ({
          isExpired: false,
          expiresInMs: 3600000,
        }),
      };

      const expirationInfo = authWithExpiration.getTokenExpirationInfo?.();
      expect(expirationInfo).toBeDefined();
      expect(expirationInfo?.isExpired).toBe(false);
      expect(expirationInfo?.expiresInMs).toBe(3600000);
    });

    it('should work without optional getTokenExpirationInfo', () => {
      const authWithoutExpiration: IAuthenticator = {
        isConfigured: () => true,
        getCredentialType: () => 'api_key',
        configure: async () => {},
        validateCredentials: async () => true,
      };

      expect(authWithoutExpiration.getTokenExpirationInfo).toBeUndefined();
    });
  });

  describe('IProvider interface', () => {
    it('should define all required properties and methods', () => {
      const mockAuthenticator: IAuthenticator = {
        isConfigured: () => true,
        getCredentialType: () => 'api_key',
        configure: async () => {},
        validateCredentials: async () => true,
      };

      const mockProvider: IProvider = {
        name: 'test-provider',
        capabilities: {
          supportsStreaming: true,
          supportsTools: true,
          supportsSystemPrompt: true,
          supportsMultiTurn: true,
          maxContextTokens: 100000,
          supportedModels: ['model-1', 'model-2'],
        },
        query: async () => 'response text',
        validateConfiguration: async () => true,
        getAuthenticator: () => mockAuthenticator,
      };

      expect(mockProvider.name).toBe('test-provider');
      expect(mockProvider.capabilities).toBeDefined();
      expect(mockProvider.query).toBeDefined();
      expect(mockProvider.validateConfiguration).toBeDefined();
      expect(mockProvider.getAuthenticator).toBeDefined();
    });

    it('should implement query method correctly', async () => {
      const mockProvider: IProvider = {
        name: 'test',
        capabilities: {
          supportsStreaming: false,
          supportsTools: false,
          supportsSystemPrompt: true,
          supportsMultiTurn: false,
          maxContextTokens: 8192,
          supportedModels: ['test-model'],
        },
        query: async (options: ProviderQueryOptions) => {
          expect(options.prompt).toBeDefined();
          return `Response to: ${options.prompt}`;
        },
        validateConfiguration: async () => true,
        getAuthenticator: () => ({
          isConfigured: () => true,
          getCredentialType: () => 'api_key',
          configure: async () => {},
          validateCredentials: async () => true,
        }),
      };

      const result = await mockProvider.query({ prompt: 'test query' });
      expect(result).toBe('Response to: test query');
    });

    it('should implement validateConfiguration method', async () => {
      const validProvider: IProvider = {
        name: 'valid',
        capabilities: {
          supportsStreaming: true,
          supportsTools: true,
          supportsSystemPrompt: true,
          supportsMultiTurn: true,
          maxContextTokens: 100000,
          supportedModels: ['model'],
        },
        query: async () => 'response',
        validateConfiguration: async () => true,
        getAuthenticator: () => ({
          isConfigured: () => true,
          getCredentialType: () => 'api_key',
          configure: async () => {},
          validateCredentials: async () => true,
        }),
      };

      const invalidProvider: IProvider = {
        name: 'invalid',
        capabilities: {
          supportsStreaming: false,
          supportsTools: false,
          supportsSystemPrompt: false,
          supportsMultiTurn: false,
          maxContextTokens: 0,
          supportedModels: [],
        },
        query: async () => 'response',
        validateConfiguration: async () => false,
        getAuthenticator: () => ({
          isConfigured: () => false,
          getCredentialType: () => 'none',
          configure: async () => {},
          validateCredentials: async () => false,
        }),
      };

      expect(await validProvider.validateConfiguration()).toBe(true);
      expect(await invalidProvider.validateConfiguration()).toBe(false);
    });

    it('should provide access to authenticator', () => {
      const mockAuth: IAuthenticator = {
        isConfigured: () => true,
        getCredentialType: () => 'oauth',
        configure: async () => {},
        validateCredentials: async () => true,
      };

      const provider: IProvider = {
        name: 'test',
        capabilities: {
          supportsStreaming: true,
          supportsTools: true,
          supportsSystemPrompt: true,
          supportsMultiTurn: true,
          maxContextTokens: 200000,
          supportedModels: ['model'],
        },
        query: async () => 'response',
        validateConfiguration: async () => true,
        getAuthenticator: () => mockAuth,
      };

      const auth = provider.getAuthenticator();
      expect(auth).toBe(mockAuth);
      expect(auth.getCredentialType()).toBe('oauth');
    });
  });

  describe('Backward compatibility', () => {
    it('should export all types from barrel export', async () => {
      const exports = await import('../index.js');

      // Verify all expected types are exported
      expect(exports).toBeDefined();
      // Note: We can't directly test type exports in runtime, but importing them validates they exist
    });
  });
});
