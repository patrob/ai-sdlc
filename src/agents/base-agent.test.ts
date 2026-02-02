/**
 * Unit tests for BaseAgent abstract class
 *
 * Tests verify:
 * - Constructor capability validation
 * - Template method execution flow
 * - Lifecycle hooks (beforeExecute, afterExecute)
 * - Error handling (returns AgentResult, never throws)
 * - Helper methods (runQuery, buildSuccessResult, buildErrorResult)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BaseAgent } from './base-agent.js';
import { AgentContext, AgentResult } from './types.js';
import { IProvider, ProviderCapabilities } from '../providers/types.js';
import { Story } from '../types/index.js';

/**
 * Create a mock IProvider for testing
 */
function createMockProvider(capabilities: Partial<ProviderCapabilities> = {}): IProvider {
  const defaultCapabilities: ProviderCapabilities = {
    supportsStreaming: true,
    supportsTools: true,
    supportsSystemPrompt: true,
    supportsMultiTurn: true,
    maxContextTokens: 100000,
    supportedModels: ['test-model'],
    ...capabilities,
  };

  return {
    name: 'test-provider',
    capabilities: defaultCapabilities,
    query: vi.fn().mockResolvedValue('Mock response'),
    validateConfiguration: vi.fn().mockResolvedValue(true),
    getAuthenticator: vi.fn().mockReturnValue({
      isConfigured: () => true,
      getCredentialType: () => 'api_key',
      configure: async () => {},
      validateCredentials: async () => true,
    }),
  };
}

/**
 * Create a mock AgentContext for testing
 */
function createMockContext(provider: IProvider, options = {}): AgentContext {
  return {
    storyPath: '/test/path/story.md',
    sdlcRoot: '/test/path/.ai-sdlc',
    provider,
    options,
  };
}

/**
 * Create a mock Story for testing
 */
function createMockStory(): Story {
  return {
    path: '/test/path/story.md',
    slug: 'test-story',
    frontmatter: {
      id: 'S-0001',
      title: 'Test Story',
      slug: 'test-story',
      priority: 10,
      status: 'in-progress',
      type: 'feature',
      created: '2024-01-01T00:00:00.000Z',
      labels: ['test'],
      research_complete: false,
      plan_complete: false,
      implementation_complete: false,
      reviews_complete: false,
    },
    content: 'Test story content',
  };
}

/**
 * Concrete test implementation of BaseAgent
 *
 * This implementation allows mocking of all abstract/hook methods via spies.
 * If a spy has a mock implementation set, it will be used.
 * Otherwise, default implementations are used.
 */
class TestAgent extends BaseAgent {
  readonly name = 'test-agent';
  readonly requiredCapabilities: (keyof ProviderCapabilities)[] = ['supportsTools', 'supportsSystemPrompt'];

  // Mock functions that can be configured to return specific values or throw errors
  buildPromptMock = vi.fn<[AgentContext], Promise<string>>();
  parseResultMock = vi.fn<[string, AgentContext], Promise<{ story: Story; changesMade: string[] }>>();
  beforeExecuteMock = vi.fn<[AgentContext], Promise<void>>();
  afterExecuteMock = vi.fn<[AgentContext, Story, string[]], Promise<void>>();
  getSystemPromptMock = vi.fn<[AgentContext], string>();

  getSystemPrompt(context: AgentContext): string {
    this.getSystemPromptMock(context);
    return 'Test system prompt';
  }

  protected async buildPrompt(context: AgentContext): Promise<string> {
    if (this.buildPromptMock.getMockImplementation()) {
      return this.buildPromptMock(context);
    }
    this.buildPromptMock(context);
    return 'Test user prompt';
  }

  protected async parseResult(
    rawResult: string,
    context: AgentContext
  ): Promise<{ story: Story; changesMade: string[] }> {
    if (this.parseResultMock.getMockImplementation()) {
      return this.parseResultMock(rawResult, context);
    }
    this.parseResultMock(rawResult, context);
    return {
      story: createMockStory(),
      changesMade: ['Test change'],
    };
  }

  protected async beforeExecute(context: AgentContext): Promise<void> {
    if (this.beforeExecuteMock.getMockImplementation()) {
      return this.beforeExecuteMock(context);
    }
    this.beforeExecuteMock(context);
    await super.beforeExecute(context);
  }

  protected async afterExecute(
    context: AgentContext,
    story: Story,
    changesMade: string[]
  ): Promise<void> {
    if (this.afterExecuteMock.getMockImplementation()) {
      return this.afterExecuteMock(context, story, changesMade);
    }
    this.afterExecuteMock(context, story, changesMade);
    await super.afterExecute(context, story, changesMade);
  }
}

describe('BaseAgent', () => {
  describe('Constructor and Capability Validation', () => {
    it('should accept provider with all required capabilities', async () => {
      const provider = createMockProvider({
        supportsTools: true,
        supportsSystemPrompt: true,
      });

      const agent = new TestAgent(provider);
      const context = createMockContext(provider);
      const result = await agent.execute(context);

      expect(result.success).toBe(true);
    });

    it('should return error when provider lacks a required capability', async () => {
      const provider = createMockProvider({
        supportsTools: false, // Missing required capability
        supportsSystemPrompt: true,
      });

      const agent = new TestAgent(provider);
      const context = createMockContext(provider);
      const result = await agent.execute(context);

      expect(result.success).toBe(false);
      expect(result.error).toContain(
        "Provider 'test-provider' does not support required capability: supportsTools"
      );
    });

    it('should return error when provider lacks multiple required capabilities', async () => {
      const provider = createMockProvider({
        supportsTools: false,
        supportsSystemPrompt: false,
      });

      const agent = new TestAgent(provider);
      const context = createMockContext(provider);
      const result = await agent.execute(context);

      // Should fail on the first missing capability
      expect(result.success).toBe(false);
      expect(result.error).toContain(
        "Provider 'test-provider' does not support required capability: supportsTools"
      );
    });

    it('should validate all capabilities in requiredCapabilities array', async () => {
      class MultiCapAgent extends BaseAgent {
        readonly name = 'multi-cap-agent';
        readonly requiredCapabilities: (keyof ProviderCapabilities)[] = [
          'supportsTools',
          'supportsSystemPrompt',
          'supportsStreaming',
        ];

        getSystemPrompt() { return ''; }
        protected async buildPrompt() { return ''; }
        protected async parseResult() {
          return { story: createMockStory(), changesMade: [] };
        }
      }

      const providerWithAll = createMockProvider({
        supportsTools: true,
        supportsSystemPrompt: true,
        supportsStreaming: true,
      });

      const agentWithAll = new MultiCapAgent(providerWithAll);
      const contextWithAll = createMockContext(providerWithAll);
      const resultWithAll = await agentWithAll.execute(contextWithAll);
      expect(resultWithAll.success).toBe(true);

      const providerMissingOne = createMockProvider({
        supportsTools: true,
        supportsSystemPrompt: true,
        supportsStreaming: false,
      });

      const agentMissingOne = new MultiCapAgent(providerMissingOne);
      const contextMissingOne = createMockContext(providerMissingOne);
      const resultMissingOne = await agentMissingOne.execute(contextMissingOne);

      expect(resultMissingOne.success).toBe(false);
      expect(resultMissingOne.error).toContain(
        "Provider 'test-provider' does not support required capability: supportsStreaming"
      );
    });
  });

  describe('Template Method Execution Flow', () => {
    it('should call methods in correct order: beforeExecute → buildPrompt → runQuery → parseResult → afterExecute', async () => {
      const provider = createMockProvider();
      const agent = new TestAgent(provider);
      const context = createMockContext(provider);

      const callOrder: string[] = [];

      agent.beforeExecuteMock.mockImplementation(async () => {
        callOrder.push('beforeExecute');
      });
      agent.buildPromptMock.mockImplementation(async () => {
        callOrder.push('buildPrompt');
        return 'Test prompt';
      });
      vi.spyOn(provider, 'query').mockImplementation(async () => {
        callOrder.push('runQuery');
        return 'Mock response';
      });
      agent.parseResultMock.mockImplementation(async () => {
        callOrder.push('parseResult');
        return { story: createMockStory(), changesMade: ['test'] };
      });
      agent.afterExecuteMock.mockImplementation(async () => {
        callOrder.push('afterExecute');
      });

      await agent.execute(context);

      expect(callOrder).toEqual([
        'beforeExecute',
        'buildPrompt',
        'runQuery',
        'parseResult',
        'afterExecute',
      ]);
    });

    it('should pass context to all lifecycle methods', async () => {
      const provider = createMockProvider();
      const agent = new TestAgent(provider);
      const context = createMockContext(provider, { reworkContext: 'Fix bugs' });

      await agent.execute(context);

      expect(agent.beforeExecuteMock).toHaveBeenCalledWith(context);
      expect(agent.buildPromptMock).toHaveBeenCalledWith(context);
      expect(agent.parseResultMock).toHaveBeenCalledWith('Mock response', context);
      expect(agent.afterExecuteMock).toHaveBeenCalledWith(
        context,
        expect.any(Object),
        expect.any(Array)
      );
    });

    it('should pass parsed story and changes to afterExecute', async () => {
      const provider = createMockProvider();
      const agent = new TestAgent(provider);
      const context = createMockContext(provider);

      const mockStory = createMockStory();
      const mockChanges = ['Change 1', 'Change 2'];

      agent.parseResultMock.mockResolvedValue({
        story: mockStory,
        changesMade: mockChanges,
      });

      await agent.execute(context);

      expect(agent.afterExecuteMock).toHaveBeenCalledWith(
        context,
        mockStory,
        mockChanges
      );
    });
  });

  describe('runQuery Method', () => {
    it('should call provider.query with correct arguments', async () => {
      const provider = createMockProvider();
      const agent = new TestAgent(provider);
      const context = createMockContext(provider);

      await agent.execute(context);

      expect(provider.query).toHaveBeenCalledWith({
        prompt: 'Test user prompt',
        systemPrompt: 'Test system prompt',
        workingDirectory: '/test/path',
        onProgress: undefined,
      });
    });

    it('should forward onProgress callback from options', async () => {
      const provider = createMockProvider();
      const agent = new TestAgent(provider);
      const onProgressCallback = vi.fn();
      const context = createMockContext(provider, { onProgress: onProgressCallback });

      await agent.execute(context);

      expect(provider.query).toHaveBeenCalledWith({
        prompt: 'Test user prompt',
        systemPrompt: 'Test system prompt',
        workingDirectory: '/test/path',
        onProgress: onProgressCallback,
      });
    });

    it('should use correct working directory (parent of sdlcRoot)', async () => {
      const provider = createMockProvider();
      const agent = new TestAgent(provider);
      const context = createMockContext(provider);
      context.sdlcRoot = '/projects/myapp/.ai-sdlc';

      await agent.execute(context);

      expect(provider.query).toHaveBeenCalledWith(
        expect.objectContaining({
          workingDirectory: '/projects/myapp',
        })
      );
    });
  });

  describe('Error Handling', () => {
    it('should catch error in beforeExecute and return error AgentResult', async () => {
      const provider = createMockProvider();
      const agent = new TestAgent(provider);
      const context = createMockContext(provider);

      agent.beforeExecuteMock.mockRejectedValue(new Error('beforeExecute failed'));

      const result = await agent.execute(context);

      expect(result.success).toBe(false);
      expect(result.error).toContain('beforeExecute failed');
      expect(result.changesMade).toEqual([]);
    });

    it('should catch error in buildPrompt and return error AgentResult', async () => {
      const provider = createMockProvider();
      const agent = new TestAgent(provider);
      const context = createMockContext(provider);

      agent.buildPromptMock.mockRejectedValue(new Error('buildPrompt failed'));

      const result = await agent.execute(context);

      expect(result.success).toBe(false);
      expect(result.error).toContain('buildPrompt failed');
    });

    it('should catch error in runQuery and return error AgentResult', async () => {
      const provider = createMockProvider();
      vi.spyOn(provider, 'query').mockRejectedValue(new Error('Query failed'));

      const agent = new TestAgent(provider);
      const context = createMockContext(provider);

      const result = await agent.execute(context);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Query failed');
    });

    it('should catch error in parseResult and return error AgentResult', async () => {
      const provider = createMockProvider();
      const agent = new TestAgent(provider);
      const context = createMockContext(provider);

      agent.parseResultMock.mockRejectedValue(new Error('Parse failed'));

      const result = await agent.execute(context);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Parse failed');
    });

    it('should catch error in afterExecute and return error AgentResult', async () => {
      const provider = createMockProvider();
      const agent = new TestAgent(provider);
      const context = createMockContext(provider);

      agent.afterExecuteMock.mockRejectedValue(new Error('afterExecute failed'));

      const result = await agent.execute(context);

      expect(result.success).toBe(false);
      expect(result.error).toContain('afterExecute failed');
    });

    it('should include stack trace in error result', async () => {
      const provider = createMockProvider();
      const agent = new TestAgent(provider);
      const context = createMockContext(provider);

      const errorWithStack = new Error('Test error with stack');
      agent.buildPromptMock.mockRejectedValue(errorWithStack);

      const result = await agent.execute(context);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Test error with stack');
      expect(result.error).toContain('Stack trace:');
    });

    it('should handle non-Error thrown values', async () => {
      const provider = createMockProvider();
      const agent = new TestAgent(provider);
      const context = createMockContext(provider);

      agent.buildPromptMock.mockRejectedValue('String error');

      const result = await agent.execute(context);

      expect(result.success).toBe(false);
      expect(result.error).toBe('String error');
    });

    it('should never throw exceptions from execute()', async () => {
      const provider = createMockProvider();
      const agent = new TestAgent(provider);
      const context = createMockContext(provider);

      agent.buildPromptMock.mockRejectedValue(new Error('Catastrophic failure'));

      // Should not throw
      await expect(agent.execute(context)).resolves.toBeDefined();
    });
  });

  describe('Success Path', () => {
    it('should return success AgentResult on successful execution', async () => {
      const provider = createMockProvider();
      const agent = new TestAgent(provider);
      const context = createMockContext(provider);

      const mockStory = createMockStory();
      const mockChanges = ['Added research', 'Updated frontmatter'];

      agent.parseResultMock.mockResolvedValue({
        story: mockStory,
        changesMade: mockChanges,
      });

      const result = await agent.execute(context);

      expect(result.success).toBe(true);
      expect(result.story).toEqual(mockStory);
      expect(result.changesMade).toEqual(mockChanges);
      expect(result.error).toBeUndefined();
    });

    it('should call all lifecycle methods on success', async () => {
      const provider = createMockProvider();
      const agent = new TestAgent(provider);
      const context = createMockContext(provider);

      await agent.execute(context);

      expect(agent.beforeExecuteMock).toHaveBeenCalled();
      expect(agent.buildPromptMock).toHaveBeenCalled();
      expect(agent.parseResultMock).toHaveBeenCalled();
      expect(agent.afterExecuteMock).toHaveBeenCalled();
    });
  });

  describe('Helper Methods', () => {
    describe('buildSuccessResult', () => {
      it('should create properly formatted success result', () => {
        const provider = createMockProvider();
        const agent = new TestAgent(provider);

        const mockStory = createMockStory();
        const mockChanges = ['Change 1', 'Change 2'];

        // Access protected method via type casting
        const result = (agent as any).buildSuccessResult(mockStory, mockChanges);

        expect(result).toEqual({
          success: true,
          story: mockStory,
          changesMade: mockChanges,
        });
        expect(result.error).toBeUndefined();
      });
    });

    describe('buildErrorResult', () => {
      it('should create properly formatted error result with Error object', () => {
        const provider = createMockProvider();
        const agent = new TestAgent(provider);
        const context = createMockContext(provider);

        const error = new Error('Test error message');

        // Access protected method via type casting
        const result = (agent as any).buildErrorResult(error, context);

        expect(result.success).toBe(false);
        expect(result.error).toContain('Test error message');
        expect(result.changesMade).toEqual([]);
        expect(result.story).toBeDefined();
      });

      it('should handle string errors', () => {
        const provider = createMockProvider();
        const agent = new TestAgent(provider);
        const context = createMockContext(provider);

        // Access protected method via type casting
        const result = (agent as any).buildErrorResult('Plain string error', context);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Plain string error');
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty requiredCapabilities array', () => {
      class NoCapAgent extends BaseAgent {
        readonly name = 'no-cap-agent';
        readonly requiredCapabilities: (keyof ProviderCapabilities)[] = [];

        getSystemPrompt() { return ''; }
        protected async buildPrompt() { return ''; }
        protected async parseResult() {
          return { story: createMockStory(), changesMade: [] };
        }
      }

      const provider = createMockProvider();
      expect(() => new NoCapAgent(provider)).not.toThrow();
    });

    it('should handle context with missing optional fields', async () => {
      const provider = createMockProvider();
      const agent = new TestAgent(provider);
      const context: AgentContext = {
        storyPath: '/test/story.md',
        sdlcRoot: '/test/.ai-sdlc',
        provider,
        // options intentionally omitted
      };

      const result = await agent.execute(context);

      expect(result.success).toBe(true);
    });

    it('should handle empty changesMade array', async () => {
      const provider = createMockProvider();
      const agent = new TestAgent(provider);
      const context = createMockContext(provider);

      agent.parseResultMock.mockResolvedValue({
        story: createMockStory(),
        changesMade: [],
      });

      const result = await agent.execute(context);

      expect(result.success).toBe(true);
      expect(result.changesMade).toEqual([]);
    });
  });
});
