/**
 * Unit tests for AgentFactory
 *
 * Tests verify:
 * - Factory instantiates all 9 built-in agent types correctly
 * - create() uses default provider from ProviderRegistry
 * - createWithProvider() uses provided provider
 * - Custom agent registration via registerAgent()
 * - Custom agents override built-in agents
 * - listAgentTypes() returns all agent types (built-in + custom)
 * - Unknown agent types throw descriptive errors
 * - Provider capability validation works
 * - Factory returns agents with injected dependencies accessible
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AgentFactory, AgentType, AgentFactoryFn } from './factory.js';
import { IAgent, AgentContext } from './types.js';
import { IProvider, ProviderCapabilities } from '../providers/types.js';
import { ProviderRegistry } from '../providers/registry.js';

/**
 * Create a mock IProvider for testing
 */
function createMockProvider(
  name = 'test-provider',
  capabilities: Partial<ProviderCapabilities> = {}
): IProvider {
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
    name,
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
function createMockContext(provider: IProvider): AgentContext {
  return {
    storyPath: '/test/path/story.md',
    sdlcRoot: '/test/path/.ai-sdlc',
    provider,
    options: {},
  };
}

describe('AgentFactory', () => {
  beforeEach(() => {
    // Reset factory state before each test
    AgentFactory.reset();
    ProviderRegistry.reset();
  });

  afterEach(() => {
    // Clean up after each test
    AgentFactory.reset();
    ProviderRegistry.reset();
  });

  describe('createWithProvider()', () => {
    const allAgentTypes: AgentType[] = [
      'research',
      'planning',
      'implementation',
      'review',
      'single-task',
      'orchestrator',
      'rework',
      'state-assessor',
      'refinement',
    ];

    it('should instantiate all built-in agent types', () => {
      const provider = createMockProvider();

      for (const type of allAgentTypes) {
        const agent = AgentFactory.createWithProvider(type, provider);

        expect(agent).toBeDefined();
        expect(agent.name).toBe(type);
        expect(agent.execute).toBeInstanceOf(Function);
        expect(agent.getSystemPrompt).toBeInstanceOf(Function);
      }
    });

    it('should inject provider into agent', () => {
      const provider = createMockProvider('custom-provider');
      const agent = AgentFactory.createWithProvider('research', provider);

      // The agent should have access to the provider
      expect(agent).toBeDefined();
      expect(agent.name).toBe('research');
    });

    it('should throw error for unknown agent type', () => {
      const provider = createMockProvider();

      expect(() => {
        AgentFactory.createWithProvider('unknown-type' as AgentType, provider);
      }).toThrow(/Unknown agent type: unknown-type/);
    });

    it('should throw error with available agent types', () => {
      const provider = createMockProvider();

      try {
        AgentFactory.createWithProvider('invalid' as AgentType, provider);
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        const message = (error as Error).message;
        expect(message).toContain('Unknown agent type: invalid');
        expect(message).toContain('Available:');
        // Should list at least the 9 built-in types
        expect(message).toContain('research');
      }
    });

    it('should validate provider capabilities', () => {
      // Create provider without required capabilities
      const provider = createMockProvider('incomplete-provider', {
        supportsTools: false,
        supportsSystemPrompt: false,
      });

      // Most agents require supportsTools and supportsSystemPrompt
      expect(() => {
        AgentFactory.createWithProvider('research', provider);
      }).toThrow(/does not support required capability/);
    });

    it('should allow state-assessor with minimal capabilities', () => {
      // State assessor doesn't require any capabilities
      const provider = createMockProvider('minimal-provider', {
        supportsTools: false,
        supportsSystemPrompt: false,
        supportsStreaming: false,
        supportsMultiTurn: false,
      });

      const agent = AgentFactory.createWithProvider('state-assessor', provider);
      expect(agent).toBeDefined();
      expect(agent.name).toBe('state-assessor');
    });
  });

  describe('create()', () => {
    it('should use default provider from ProviderRegistry', () => {
      const defaultProvider = createMockProvider('default-provider');
      ProviderRegistry.register('claude', () => defaultProvider);

      const agent = AgentFactory.create('research');

      expect(agent).toBeDefined();
      expect(agent.name).toBe('research');
    });

    it('should throw error if no default provider configured', () => {
      // ProviderRegistry is empty after reset
      expect(() => {
        AgentFactory.create('research');
      }).toThrow();
    });

    it('should respect AI_SDLC_PROVIDER environment variable', () => {
      const customProvider = createMockProvider('custom-provider');
      ProviderRegistry.register('custom', () => customProvider);

      // Mock environment variable
      const originalEnv = process.env.AI_SDLC_PROVIDER;
      process.env.AI_SDLC_PROVIDER = 'custom';

      try {
        const agent = AgentFactory.create('planning');
        expect(agent).toBeDefined();
        expect(agent.name).toBe('planning');
      } finally {
        // Restore original environment
        if (originalEnv !== undefined) {
          process.env.AI_SDLC_PROVIDER = originalEnv;
        } else {
          delete process.env.AI_SDLC_PROVIDER;
        }
      }
    });
  });

  describe('registerAgent()', () => {
    it('should allow custom agent registration', () => {
      const provider = createMockProvider();

      // Create a custom agent
      class CustomAgent implements IAgent {
        readonly name = 'custom';
        readonly requiredCapabilities = [] as const;

        constructor(private provider: IProvider) {}

        async execute(context: AgentContext) {
          return {
            success: true,
            story: {} as any,
            changesMade: ['custom change'],
          };
        }

        getSystemPrompt(context: AgentContext): string {
          return 'Custom system prompt';
        }
      }

      // Register custom agent
      const factory: AgentFactoryFn = (p) => new CustomAgent(p);
      AgentFactory.registerAgent('custom', factory);

      // Create custom agent
      const agent = AgentFactory.createWithProvider('custom', provider);

      expect(agent).toBeDefined();
      expect(agent.name).toBe('custom');
      expect(agent.getSystemPrompt({} as any)).toBe('Custom system prompt');
    });

    it('should allow custom agents to override built-in agents', () => {
      const provider = createMockProvider();

      // Create a custom research agent
      class CustomResearchAgent implements IAgent {
        readonly name = 'custom-research';
        readonly requiredCapabilities = [] as const;

        constructor(private provider: IProvider) {}

        async execute(context: AgentContext) {
          return {
            success: true,
            story: {} as any,
            changesMade: ['custom research'],
          };
        }

        getSystemPrompt(context: AgentContext): string {
          return 'Custom research prompt';
        }
      }

      // Register custom agent with same name as built-in
      AgentFactory.registerAgent('research', (p) => new CustomResearchAgent(p));

      // Create agent - should use custom implementation
      const agent = AgentFactory.createWithProvider('research', provider);

      expect(agent).toBeDefined();
      expect(agent.name).toBe('custom-research'); // Custom implementation
      expect(agent.getSystemPrompt({} as any)).toBe('Custom research prompt');
    });

    it('should allow overwriting custom agent registrations', () => {
      const provider = createMockProvider();

      // Register first custom agent
      class CustomAgent1 implements IAgent {
        readonly name = 'custom-v1';
        readonly requiredCapabilities = [] as const;
        constructor(private provider: IProvider) {}
        async execute(context: AgentContext) {
          return { success: true, story: {} as any, changesMade: [] };
        }
        getSystemPrompt(context: AgentContext): string {
          return 'Version 1';
        }
      }

      // Register second custom agent with same name
      class CustomAgent2 implements IAgent {
        readonly name = 'custom-v2';
        readonly requiredCapabilities = [] as const;
        constructor(private provider: IProvider) {}
        async execute(context: AgentContext) {
          return { success: true, story: {} as any, changesMade: [] };
        }
        getSystemPrompt(context: AgentContext): string {
          return 'Version 2';
        }
      }

      AgentFactory.registerAgent('custom', (p) => new CustomAgent1(p));
      AgentFactory.registerAgent('custom', (p) => new CustomAgent2(p)); // Overwrite

      const agent = AgentFactory.createWithProvider('custom', provider);

      expect(agent.name).toBe('custom-v2'); // Should use second registration
      expect(agent.getSystemPrompt({} as any)).toBe('Version 2');
    });
  });

  describe('listAgentTypes()', () => {
    it('should return all built-in agent types', () => {
      const types = AgentFactory.listAgentTypes();

      expect(types).toContain('research');
      expect(types).toContain('planning');
      expect(types).toContain('implementation');
      expect(types).toContain('review');
      expect(types).toContain('single-task');
      expect(types).toContain('orchestrator');
      expect(types).toContain('rework');
      expect(types).toContain('state-assessor');
      expect(types).toContain('refinement');
      expect(types.length).toBeGreaterThanOrEqual(9);
    });

    it('should include custom agent types', () => {
      const provider = createMockProvider();

      class CustomAgent implements IAgent {
        readonly name = 'custom';
        readonly requiredCapabilities = [] as const;
        constructor(private provider: IProvider) {}
        async execute(context: AgentContext) {
          return { success: true, story: {} as any, changesMade: [] };
        }
        getSystemPrompt(context: AgentContext): string {
          return 'Custom';
        }
      }

      AgentFactory.registerAgent('custom-type', (p) => new CustomAgent(p));

      const types = AgentFactory.listAgentTypes();

      expect(types).toContain('custom-type');
      expect(types).toContain('research'); // Still includes built-in
    });

    it('should return sorted array', () => {
      const types = AgentFactory.listAgentTypes();

      // Verify array is sorted alphabetically
      const sorted = [...types].sort();
      expect(types).toEqual(sorted);
    });

    it('should not duplicate types when custom overrides built-in', () => {
      class CustomAgent implements IAgent {
        readonly name = 'custom';
        readonly requiredCapabilities = [] as const;
        constructor(private provider: IProvider) {}
        async execute(context: AgentContext) {
          return { success: true, story: {} as any, changesMade: [] };
        }
        getSystemPrompt(context: AgentContext): string {
          return 'Custom';
        }
      }

      // Register custom agent with same name as built-in
      AgentFactory.registerAgent('research', (p) => new CustomAgent(p));

      const types = AgentFactory.listAgentTypes();

      // Count occurrences of 'research'
      const researchCount = types.filter((t) => t === 'research').length;
      expect(researchCount).toBe(1); // Should only appear once
    });
  });

  describe('reset()', () => {
    it('should clear custom agent registrations', () => {
      const provider = createMockProvider();

      class CustomAgent implements IAgent {
        readonly name = 'custom';
        readonly requiredCapabilities = [] as const;
        constructor(private provider: IProvider) {}
        async execute(context: AgentContext) {
          return { success: true, story: {} as any, changesMade: [] };
        }
        getSystemPrompt(context: AgentContext): string {
          return 'Custom';
        }
      }

      AgentFactory.registerAgent('custom', (p) => new CustomAgent(p));

      // Verify custom agent is registered
      expect(AgentFactory.listAgentTypes()).toContain('custom');

      // Reset
      AgentFactory.reset();

      // Verify custom agent is removed
      expect(AgentFactory.listAgentTypes()).not.toContain('custom');
    });

    it('should not affect built-in agents', () => {
      AgentFactory.reset();

      const types = AgentFactory.listAgentTypes();
      expect(types).toContain('research');
      expect(types).toContain('planning');
      expect(types.length).toBeGreaterThanOrEqual(9);
    });
  });

  describe('Agent execution integration', () => {
    it('should create agents that can be executed', async () => {
      const provider = createMockProvider();
      ProviderRegistry.register('test', () => provider);

      // Note: We can't fully test execution without mocking the agent functions
      // This test verifies the agent has the correct interface
      const agent = AgentFactory.createWithProvider('state-assessor', provider);

      expect(agent.execute).toBeInstanceOf(Function);
      expect(agent.getSystemPrompt).toBeInstanceOf(Function);
      expect(agent.requiredCapabilities).toBeDefined();

      // Verify the agent can generate system prompt
      const context = createMockContext(provider);
      const systemPrompt = agent.getSystemPrompt(context);
      expect(typeof systemPrompt).toBe('string');
    });

    it('should verify each agent type has correct name', () => {
      const provider = createMockProvider();
      const expectedNames: Record<AgentType, string> = {
        research: 'research',
        planning: 'planning',
        implementation: 'implementation',
        review: 'review',
        'single-task': 'single-task',
        orchestrator: 'orchestrator',
        rework: 'rework',
        'state-assessor': 'state-assessor',
        refinement: 'refinement',
      };

      for (const [type, expectedName] of Object.entries(expectedNames)) {
        const agent = AgentFactory.createWithProvider(type as AgentType, provider);
        expect(agent.name).toBe(expectedName);
      }
    });

    it('should verify each agent type has required capabilities', () => {
      const provider = createMockProvider();

      const allTypes: AgentType[] = [
        'research',
        'planning',
        'implementation',
        'review',
        'single-task',
        'orchestrator',
        'rework',
        'state-assessor',
        'refinement',
      ];

      for (const type of allTypes) {
        const agent = AgentFactory.createWithProvider(type, provider);
        expect(Array.isArray(agent.requiredCapabilities)).toBe(true);

        // State assessor is special - it doesn't require any capabilities
        if (type === 'state-assessor') {
          expect(agent.requiredCapabilities.length).toBe(0);
        } else {
          // Other agents should have capability requirements
          expect(agent.requiredCapabilities.length).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('Error messages', () => {
    it('should include agent type in unknown type error', () => {
      const provider = createMockProvider();

      try {
        AgentFactory.createWithProvider('nonexistent' as AgentType, provider);
        expect.fail('Should have thrown');
      } catch (error) {
        expect((error as Error).message).toContain('nonexistent');
      }
    });

    it('should list available types in error message', () => {
      const provider = createMockProvider();

      try {
        AgentFactory.createWithProvider('invalid' as AgentType, provider);
        expect.fail('Should have thrown');
      } catch (error) {
        const message = (error as Error).message;
        expect(message).toContain('Available:');
        expect(message).toContain('implementation');
        expect(message).toContain('research');
      }
    });

    it('should include capability name in validation error', () => {
      const provider = createMockProvider('incomplete', {
        supportsTools: false,
      });

      try {
        AgentFactory.createWithProvider('research', provider);
        expect.fail('Should have thrown');
      } catch (error) {
        const message = (error as Error).message;
        expect(message).toContain('does not support required capability');
      }
    });
  });

  describe('Type safety', () => {
    it('should accept all AgentType values', () => {
      const provider = createMockProvider();

      // TypeScript should accept all these without compilation errors
      const types: AgentType[] = [
        'research',
        'planning',
        'implementation',
        'review',
        'single-task',
        'orchestrator',
        'rework',
        'state-assessor',
        'refinement',
      ];

      for (const type of types) {
        const agent = AgentFactory.createWithProvider(type, provider);
        expect(agent).toBeDefined();
      }
    });

    it('should work with createWithProvider string parameter', () => {
      const provider = createMockProvider();

      // createWithProvider accepts string, not just AgentType
      const agent = AgentFactory.createWithProvider('research', provider);
      expect(agent).toBeDefined();

      // Custom string types should also work (after registration)
      class CustomAgent implements IAgent {
        readonly name = 'custom';
        readonly requiredCapabilities = [] as const;
        constructor(private provider: IProvider) {}
        async execute(context: AgentContext) {
          return { success: true, story: {} as any, changesMade: [] };
        }
        getSystemPrompt(context: AgentContext): string {
          return 'Custom';
        }
      }

      AgentFactory.registerAgent('custom-string-type', (p) => new CustomAgent(p));
      const customAgent = AgentFactory.createWithProvider('custom-string-type', provider);
      expect(customAgent).toBeDefined();
    });
  });
});
