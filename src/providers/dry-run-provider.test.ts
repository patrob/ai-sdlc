import { describe, it, expect } from 'vitest';
import { DryRunProvider } from './dry-run-provider.js';
import { MockAuthenticator } from './mock-provider.js';
import type { ProviderProgressEvent } from './types.js';

describe('DryRunProvider', () => {
  describe('query', () => {
    it('should return dry run message with prompt preview', async () => {
      const provider = new DryRunProvider();
      const result = await provider.query({ prompt: 'analyze this code' });

      expect(result).toContain('[DRY RUN]');
      expect(result).toContain('No actual AI query performed');
      expect(result).toContain('analyze this code');
    });

    it('should truncate long prompts in response', async () => {
      const provider = new DryRunProvider();
      const longPrompt = 'x'.repeat(200);
      const result = await provider.query({ prompt: longPrompt });

      expect(result).toContain('x'.repeat(100));
      expect(result.endsWith('...')).toBe(true);
    });

    it('should emit progress events', async () => {
      const provider = new DryRunProvider();
      const events: ProviderProgressEvent[] = [];
      const onProgress = (event: ProviderProgressEvent) => events.push(event);

      await provider.query({ prompt: 'test', onProgress });

      expect(events).toHaveLength(3);
      expect(events[0]).toEqual({ type: 'session_start', sessionId: 'dry-run-session' });
      expect(events[1].type).toBe('assistant_message');
      expect(events[2]).toEqual({ type: 'completion' });
    });

    it('should include model info in progress summary', async () => {
      const provider = new DryRunProvider();
      const events: ProviderProgressEvent[] = [];
      const onProgress = (event: ProviderProgressEvent) => events.push(event);

      await provider.query({ prompt: 'test', model: 'gpt-4', onProgress });

      const assistantEvent = events.find(e => e.type === 'assistant_message');
      expect(assistantEvent).toBeDefined();
      if (assistantEvent && assistantEvent.type === 'assistant_message') {
        expect(assistantEvent.content).toContain('Model: gpt-4');
      }
    });

    it('should include system prompt length when provided', async () => {
      const provider = new DryRunProvider();
      const events: ProviderProgressEvent[] = [];
      const onProgress = (event: ProviderProgressEvent) => events.push(event);

      await provider.query({
        prompt: 'test',
        systemPrompt: 'be helpful',
        onProgress,
      });

      const assistantEvent = events.find(e => e.type === 'assistant_message');
      if (assistantEvent && assistantEvent.type === 'assistant_message') {
        expect(assistantEvent.content).toContain('System prompt length: 10 chars');
      }
    });

    it('should include working directory when provided', async () => {
      const provider = new DryRunProvider();
      const events: ProviderProgressEvent[] = [];
      const onProgress = (event: ProviderProgressEvent) => events.push(event);

      await provider.query({
        prompt: 'test',
        workingDirectory: '/tmp/project',
        onProgress,
      });

      const assistantEvent = events.find(e => e.type === 'assistant_message');
      if (assistantEvent && assistantEvent.type === 'assistant_message') {
        expect(assistantEvent.content).toContain('Working directory: /tmp/project');
      }
    });

    it('should use "default" when no model specified', async () => {
      const provider = new DryRunProvider();
      const events: ProviderProgressEvent[] = [];
      const onProgress = (event: ProviderProgressEvent) => events.push(event);

      await provider.query({ prompt: 'test', onProgress });

      const assistantEvent = events.find(e => e.type === 'assistant_message');
      if (assistantEvent && assistantEvent.type === 'assistant_message') {
        expect(assistantEvent.content).toContain('Model: default');
      }
    });
  });

  describe('metadata', () => {
    it('should have name "dry-run"', () => {
      const provider = new DryRunProvider();
      expect(provider.name).toBe('dry-run');
    });

    it('should report limited capabilities', () => {
      const provider = new DryRunProvider();
      expect(provider.capabilities.supportsStreaming).toBe(false);
      expect(provider.capabilities.supportsTools).toBe(false);
      expect(provider.capabilities.supportsSystemPrompt).toBe(true);
    });

    it('should always validate configuration', async () => {
      const provider = new DryRunProvider();
      expect(await provider.validateConfiguration()).toBe(true);
    });

    it('should return MockAuthenticator', () => {
      const provider = new DryRunProvider();
      const auth = provider.getAuthenticator();
      expect(auth).toBeInstanceOf(MockAuthenticator);
    });
  });
});
