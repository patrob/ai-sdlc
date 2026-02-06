import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MockProvider, MockAuthenticator } from './mock-provider.js';
import type { ProviderProgressEvent } from './types.js';

describe('MockProvider', () => {
  describe('query', () => {
    it('should return default response when no options provided', async () => {
      const provider = new MockProvider();
      const result = await provider.query({ prompt: 'hello' });
      expect(result).toBe('mock response');
    });

    it('should return custom default response', async () => {
      const provider = new MockProvider({ defaultResponse: 'custom' });
      const result = await provider.query({ prompt: 'hello' });
      expect(result).toBe('custom');
    });

    it('should return responses from queue in order', async () => {
      const provider = new MockProvider({ responses: ['first', 'second', 'third'] });

      expect(await provider.query({ prompt: 'a' })).toBe('first');
      expect(await provider.query({ prompt: 'b' })).toBe('second');
      expect(await provider.query({ prompt: 'c' })).toBe('third');
    });

    it('should cycle back to start when response queue is exhausted', async () => {
      const provider = new MockProvider({ responses: ['one', 'two'] });

      expect(await provider.query({ prompt: 'a' })).toBe('one');
      expect(await provider.query({ prompt: 'b' })).toBe('two');
      expect(await provider.query({ prompt: 'c' })).toBe('one');
      expect(await provider.query({ prompt: 'd' })).toBe('two');
    });

    it('should use response factory when provided', async () => {
      const factory = (prompt: string, systemPrompt?: string) =>
        `echo: ${prompt}${systemPrompt ? ` (system: ${systemPrompt})` : ''}`;
      const provider = new MockProvider({ responseFactory: factory });

      const result = await provider.query({ prompt: 'test', systemPrompt: 'be helpful' });
      expect(result).toBe('echo: test (system: be helpful)');
    });

    it('should prefer response queue over factory', async () => {
      const provider = new MockProvider({
        responses: ['from-queue'],
        responseFactory: () => 'from-factory',
      });

      expect(await provider.query({ prompt: 'a' })).toBe('from-queue');
    });

    it('should record calls by default', async () => {
      const provider = new MockProvider();
      await provider.query({ prompt: 'hello', systemPrompt: 'system', model: 'test-model' });
      await provider.query({ prompt: 'world' });

      const calls = provider.getCalls();
      expect(calls).toHaveLength(2);
      expect(calls[0].prompt).toBe('hello');
      expect(calls[0].systemPrompt).toBe('system');
      expect(calls[0].model).toBe('test-model');
      expect(calls[0].timestamp).toBeGreaterThan(0);
      expect(calls[1].prompt).toBe('world');
      expect(calls[1].systemPrompt).toBeUndefined();
    });

    it('should not record calls when recordCalls is false', async () => {
      const provider = new MockProvider({ recordCalls: false });
      await provider.query({ prompt: 'hello' });

      expect(provider.getCalls()).toHaveLength(0);
    });

    it('should simulate delay when configured', async () => {
      const provider = new MockProvider({ simulateDelay: 50 });
      const start = Date.now();
      await provider.query({ prompt: 'hello' });
      const elapsed = Date.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(40); // allow small timing variance
    });

    it('should emit progress events', async () => {
      const provider = new MockProvider({ defaultResponse: 'test-reply' });
      const events: ProviderProgressEvent[] = [];
      const onProgress = (event: ProviderProgressEvent) => events.push(event);

      await provider.query({ prompt: 'hello', onProgress });

      expect(events).toHaveLength(3);
      expect(events[0]).toEqual({ type: 'session_start', sessionId: 'mock-session' });
      expect(events[1]).toEqual({ type: 'assistant_message', content: 'test-reply' });
      expect(events[2]).toEqual({ type: 'completion' });
    });
  });

  describe('reset', () => {
    it('should clear call history and reset response index', async () => {
      const provider = new MockProvider({ responses: ['a', 'b'] });

      await provider.query({ prompt: '1' });
      await provider.query({ prompt: '2' });
      expect(provider.getCalls()).toHaveLength(2);

      provider.reset();

      expect(provider.getCalls()).toHaveLength(0);
      expect(await provider.query({ prompt: '3' })).toBe('a');
    });
  });

  describe('getCalls', () => {
    it('should return a copy of the calls array', async () => {
      const provider = new MockProvider();
      await provider.query({ prompt: 'hello' });

      const calls1 = provider.getCalls();
      const calls2 = provider.getCalls();
      expect(calls1).toEqual(calls2);
      expect(calls1).not.toBe(calls2);
    });
  });

  describe('metadata', () => {
    it('should have name "mock"', () => {
      const provider = new MockProvider();
      expect(provider.name).toBe('mock');
    });

    it('should report capabilities', () => {
      const provider = new MockProvider();
      expect(provider.capabilities.supportsStreaming).toBe(true);
      expect(provider.capabilities.supportedModels).toContain('mock-model');
    });

    it('should always validate configuration', async () => {
      const provider = new MockProvider();
      expect(await provider.validateConfiguration()).toBe(true);
    });

    it('should return authenticator', () => {
      const provider = new MockProvider();
      const auth = provider.getAuthenticator();
      expect(auth).toBeInstanceOf(MockAuthenticator);
    });
  });
});

describe('MockAuthenticator', () => {
  it('should always be configured', () => {
    const auth = new MockAuthenticator();
    expect(auth.isConfigured()).toBe(true);
  });

  it('should return api_key credential type', () => {
    const auth = new MockAuthenticator();
    expect(auth.getCredentialType()).toBe('api_key');
  });

  it('should validate credentials', async () => {
    const auth = new MockAuthenticator();
    expect(await auth.validateCredentials()).toBe(true);
  });

  it('should configure without error', async () => {
    const auth = new MockAuthenticator();
    await expect(auth.configure()).resolves.toBeUndefined();
  });
});
