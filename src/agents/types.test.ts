/**
 * Type definition tests for agent types
 *
 * These tests validate:
 * - Interface structure and compatibility
 * - Required fields are present
 * - Type safety and inference
 */

import { describe, it, expect } from 'vitest';
import {
  IAgent,
  AgentContext,
  AgentResult,
} from './types.js';
import { AgentOptions } from './research.js';
import { IProvider, ProviderCapabilities } from '../providers/types.js';

describe('Agent Types', () => {
  describe('AgentContext', () => {
    it('should require all mandatory fields', () => {
      const mockProvider: IProvider = {
        name: 'test-provider',
        capabilities: {
          supportsStreaming: true,
          supportsTools: true,
          supportsSystemPrompt: true,
          supportsMultiTurn: true,
          maxContextTokens: 100000,
          supportedModels: ['test-model'],
        },
        query: async () => '',
        validateConfiguration: async () => true,
        getAuthenticator: () => ({
          isConfigured: () => true,
          getCredentialType: () => 'api_key',
          configure: async () => {},
          validateCredentials: async () => true,
        }),
      };

      const context: AgentContext = {
        storyPath: '/path/to/story.md',
        sdlcRoot: '/path/to/.ai-sdlc',
        provider: mockProvider,
      };

      // Type-level assertion: this compiles successfully
      expect(context.storyPath).toBe('/path/to/story.md');
      expect(context.sdlcRoot).toBe('/path/to/.ai-sdlc');
      expect(context.provider).toBe(mockProvider);
      expect(context.options).toBeUndefined();
    });

    it('should allow optional options field', () => {
      const mockProvider: IProvider = {
        name: 'test-provider',
        capabilities: {
          supportsStreaming: true,
          supportsTools: true,
          supportsSystemPrompt: true,
          supportsMultiTurn: true,
          maxContextTokens: 100000,
          supportedModels: ['test-model'],
        },
        query: async () => '',
        validateConfiguration: async () => true,
        getAuthenticator: () => ({
          isConfigured: () => true,
          getCredentialType: () => 'api_key',
          configure: async () => {},
          validateCredentials: async () => true,
        }),
      };

      const context: AgentContext = {
        storyPath: '/path/to/story.md',
        sdlcRoot: '/path/to/.ai-sdlc',
        provider: mockProvider,
        options: {
          reworkContext: 'Fix linting errors',
        },
      };

      expect(context.options?.reworkContext).toBe('Fix linting errors');
    });
  });

  describe('AgentOptions', () => {
    it('should allow empty options object', () => {
      const options: AgentOptions = {};
      expect(options).toEqual({});
    });

    it('should support reworkContext field', () => {
      const options: AgentOptions = {
        reworkContext: 'Address security issues',
      };
      expect(options.reworkContext).toBe('Address security issues');
    });

    it('should support onProgress callback', () => {
      const mockCallback = (event: any) => {
        console.log(event);
      };

      const options: AgentOptions = {
        onProgress: mockCallback,
      };

      expect(options.onProgress).toBe(mockCallback);
    });

    it('should support both fields together', () => {
      const mockCallback = (event: any) => {
        console.log(event);
      };

      const options: AgentOptions = {
        reworkContext: 'Fix tests',
        onProgress: mockCallback,
      };

      expect(options.reworkContext).toBe('Fix tests');
      expect(options.onProgress).toBe(mockCallback);
    });
  });

  describe('AgentResult', () => {
    it('should require success and story fields', () => {
      const result: AgentResult = {
        success: true,
        story: {
          path: '/path/to/story.md',
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
          content: 'Test content',
        },
        changesMade: ['Added research findings'],
      };

      expect(result.success).toBe(true);
      expect(result.story.slug).toBe('test-story');
      expect(result.changesMade).toHaveLength(1);
    });

    it('should support error field for failures', () => {
      const result: AgentResult = {
        success: false,
        story: {
          path: '/path/to/story.md',
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
          content: 'Test content',
        },
        changesMade: [],
        error: 'Provider query failed',
      };

      expect(result.success).toBe(false);
      expect(result.error).toBe('Provider query failed');
    });
  });

  describe('IAgent Interface', () => {
    it('should define the required contract', () => {
      // This is a compile-time test
      // If this compiles, the interface contract is correctly defined
      class TestAgent implements IAgent {
        readonly name = 'test-agent';
        readonly requiredCapabilities: (keyof ProviderCapabilities)[] = ['supportsTools'];

        async execute(context: AgentContext): Promise<AgentResult> {
          return {
            success: true,
            story: {
              path: context.storyPath,
              slug: 'test',
              frontmatter: {
                id: 'S-0001',
                title: 'Test',
                slug: 'test',
                priority: 10,
                status: 'in-progress',
                type: 'feature',
                created: '2024-01-01T00:00:00.000Z',
                labels: [],
                research_complete: false,
                plan_complete: false,
                implementation_complete: false,
                reviews_complete: false,
              },
              content: '',
            },
            changesMade: [],
          };
        }

        getSystemPrompt(context: AgentContext): string {
          return 'You are a test agent';
        }
      }

      const agent = new TestAgent();
      expect(agent.name).toBe('test-agent');
      expect(agent.requiredCapabilities).toEqual(['supportsTools']);
    });
  });
});
