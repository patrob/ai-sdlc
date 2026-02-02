import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ClaudeProvider } from './index.js';
import type { ProviderQueryOptions } from '../types.js';

// Mock the Claude SDK
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: vi.fn(),
}));

// Mock auth module
vi.mock('../../core/auth.js', () => ({
  configureAgentSdkAuth: vi.fn(() => ({ configured: true, type: 'api_key' })),
  getTokenExpirationInfo: vi.fn(() => ({ isExpired: false, expiresInMs: null, expiresAt: null, source: null })),
}));

// Mock config module
vi.mock('../../core/config.js', () => ({
  loadConfig: vi.fn(() => ({
    settingSources: ['project'],
    timeouts: { agentTimeout: 120000, buildTimeout: 120000, testTimeout: 300000 },
    retry: { maxRetries: 3, initialDelay: 2000, maxDelay: 32000, maxTotalDuration: 60000 },
  })),
  DEFAULT_TIMEOUTS: { agentTimeout: 600000, buildTimeout: 120000, testTimeout: 300000 },
}));

// Mock logger
vi.mock('../../core/logger.js', () => ({
  getLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

describe('ClaudeProvider', () => {
  let provider: ClaudeProvider;

  beforeEach(() => {
    provider = new ClaudeProvider();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('basic properties', () => {
    it('should have name "claude"', () => {
      expect(provider.name).toBe('claude');
    });

    it('should have correct capabilities', () => {
      expect(provider.capabilities).toEqual({
        supportsStreaming: true,
        supportsTools: true,
        supportsSystemPrompt: true,
        supportsMultiTurn: true,
        maxContextTokens: 200000,
        supportedModels: ['claude-sonnet-4-5-20250929', 'claude-opus-4-5-20251101'],
      });
    });
  });

  describe('getAuthenticator', () => {
    it('should return ClaudeAuthenticator instance', () => {
      const authenticator = provider.getAuthenticator();
      expect(authenticator).toBeDefined();
      expect(authenticator.isConfigured).toBeDefined();
      expect(authenticator.getCredentialType).toBeDefined();
    });
  });

  describe('validateConfiguration', () => {
    it('should return true when credentials are configured', async () => {
      const result = await provider.validateConfiguration();
      expect(result).toBe(true);
    });
  });

  describe('query', () => {
    it('should successfully execute a query', async () => {
      const { query: claudeQuery } = await import('@anthropic-ai/claude-agent-sdk');

      // Mock successful response
      const mockMessages = [
        { type: 'system', subtype: 'init', session_id: 'test-session' },
        { type: 'assistant', content: 'Hello, world!' },
        { type: 'system', subtype: 'completion' },
      ];

      vi.mocked(claudeQuery).mockReturnValue(
        (async function* () {
          for (const msg of mockMessages) {
            yield msg;
          }
        })() as any
      );

      const options: ProviderQueryOptions = {
        prompt: 'Test prompt',
        workingDirectory: process.cwd(),
      };

      const result = await provider.query(options);

      expect(result).toBe('Hello, world!');
      expect(claudeQuery).toHaveBeenCalledWith({
        prompt: 'Test prompt',
        options: expect.objectContaining({
          model: 'claude-sonnet-4-5-20250929',
          cwd: process.cwd(),
          permissionMode: 'acceptEdits',
          settingSources: ['project'],
        }),
      });
    });

    it('should use custom model when specified', async () => {
      const { query: claudeQuery } = await import('@anthropic-ai/claude-agent-sdk');

      const mockMessages = [
        { type: 'system', subtype: 'init', session_id: 'test-session' },
        { type: 'assistant', content: 'Response' },
        { type: 'system', subtype: 'completion' },
      ];

      vi.mocked(claudeQuery).mockReturnValue(
        (async function* () {
          for (const msg of mockMessages) {
            yield msg;
          }
        })() as any
      );

      const options: ProviderQueryOptions = {
        prompt: 'Test prompt',
        model: 'claude-opus-4-5-20251101',
        workingDirectory: process.cwd(),
      };

      await provider.query(options);

      expect(claudeQuery).toHaveBeenCalledWith({
        prompt: 'Test prompt',
        options: expect.objectContaining({
          model: 'claude-opus-4-5-20251101',
        }),
      });
    });

    it('should emit progress events', async () => {
      const { query: claudeQuery } = await import('@anthropic-ai/claude-agent-sdk');

      const mockMessages = [
        { type: 'system', subtype: 'init', session_id: 'test-session' },
        { type: 'tool_call', tool_name: 'test_tool', input: { arg: 'value' } },
        { type: 'tool_result', tool_name: 'test_tool', result: { output: 'result' } },
        { type: 'assistant', content: 'Response' },
        { type: 'system', subtype: 'completion' },
      ];

      vi.mocked(claudeQuery).mockReturnValue(
        (async function* () {
          for (const msg of mockMessages) {
            yield msg;
          }
        })() as any
      );

      const progressEvents: any[] = [];
      const options: ProviderQueryOptions = {
        prompt: 'Test prompt',
        workingDirectory: process.cwd(),
        onProgress: (event) => progressEvents.push(event),
      };

      await provider.query(options);

      expect(progressEvents).toEqual([
        { type: 'session_start', sessionId: 'test-session' },
        { type: 'tool_start', toolName: 'test_tool', input: { arg: 'value' } },
        { type: 'tool_end', toolName: 'test_tool', result: { output: 'result' } },
        { type: 'assistant_message', content: 'Response' },
        { type: 'completion' },
      ]);
    });

    it('should throw AuthenticationError when credentials missing', async () => {
      const { configureAgentSdkAuth } = await import('../../core/auth.js');
      vi.mocked(configureAgentSdkAuth).mockReturnValue({ configured: false, type: 'none' });

      const options: ProviderQueryOptions = {
        prompt: 'Test prompt',
        workingDirectory: process.cwd(),
      };

      await expect(provider.query(options)).rejects.toThrow('No API key or OAuth token found');
    });

    it('should handle array content from assistant', async () => {
      const { query: claudeQuery } = await import('@anthropic-ai/claude-agent-sdk');

      const mockMessages = [
        { type: 'system', subtype: 'init', session_id: 'test-session' },
        {
          type: 'assistant',
          content: [
            { type: 'text', text: 'First part' },
            { type: 'text', text: 'Second part' },
          ],
        },
        { type: 'system', subtype: 'completion' },
      ];

      vi.mocked(claudeQuery).mockReturnValue(
        (async function* () {
          for (const msg of mockMessages) {
            yield msg;
          }
        })() as any
      );

      const options: ProviderQueryOptions = {
        prompt: 'Test prompt',
        workingDirectory: process.cwd(),
      };

      const result = await provider.query(options);

      expect(result).toBe('First part\nSecond part');
    });

    it('should handle result messages', async () => {
      const { query: claudeQuery } = await import('@anthropic-ai/claude-agent-sdk');

      const mockMessages = [
        { type: 'system', subtype: 'init', session_id: 'test-session' },
        { type: 'result', subtype: 'success', result: 'Final result' },
        { type: 'system', subtype: 'completion' },
      ];

      vi.mocked(claudeQuery).mockReturnValue(
        (async function* () {
          for (const msg of mockMessages) {
            yield msg;
          }
        })() as any
      );

      const options: ProviderQueryOptions = {
        prompt: 'Test prompt',
        workingDirectory: process.cwd(),
      };

      const result = await provider.query(options);

      expect(result).toBe('Final result');
    });

    it('should throw error on agent error message', async () => {
      const { query: claudeQuery } = await import('@anthropic-ai/claude-agent-sdk');

      const mockMessages = [
        { type: 'system', subtype: 'init', session_id: 'test-session' },
        { type: 'error', error: { message: 'Test error message' } },
      ];

      vi.mocked(claudeQuery).mockReturnValue(
        (async function* () {
          for (const msg of mockMessages) {
            yield msg;
          }
        })() as any
      );

      const options: ProviderQueryOptions = {
        prompt: 'Test prompt',
        workingDirectory: process.cwd(),
      };

      await expect(provider.query(options)).rejects.toThrow('Test error message');
    });
  });
});
