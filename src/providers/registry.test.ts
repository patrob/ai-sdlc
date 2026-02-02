import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ProviderRegistry } from './registry.js';
import type { IProvider, IAuthenticator, ProviderCapabilities } from './types.js';

describe('ProviderRegistry', () => {
  // Helper to create mock providers
  const createMockProvider = (name: string): IProvider => {
    const mockAuthenticator: IAuthenticator = {
      isConfigured: () => true,
      getCredentialType: () => 'api_key',
      configure: async () => {},
      validateCredentials: async () => true,
    };

    const capabilities: ProviderCapabilities = {
      supportsStreaming: true,
      supportsTools: true,
      supportsSystemPrompt: true,
      supportsMultiTurn: true,
      maxContextTokens: 100000,
      supportedModels: ['model-1'],
    };

    return {
      name,
      capabilities,
      query: async () => `response from ${name}`,
      validateConfiguration: async () => true,
      getAuthenticator: () => mockAuthenticator,
    };
  };

  // Store original env var
  let originalEnvVar: string | undefined;

  beforeEach(() => {
    // Reset registry completely for test isolation
    ProviderRegistry.reset();
    // Save original env var
    originalEnvVar = process.env.AI_SDLC_PROVIDER;
  });

  afterEach(() => {
    // Restore original env var
    if (originalEnvVar !== undefined) {
      process.env.AI_SDLC_PROVIDER = originalEnvVar;
    } else {
      delete process.env.AI_SDLC_PROVIDER;
    }
  });

  describe('register and get', () => {
    it('should register and retrieve provider', () => {
      const mockProvider = createMockProvider('test-provider');
      const factory = vi.fn(() => mockProvider);

      ProviderRegistry.register('test-provider', factory);
      const result = ProviderRegistry.get('test-provider');

      expect(result).toBe(mockProvider);
      expect(factory).toHaveBeenCalledOnce();
    });

    it('should support multiple provider registrations', () => {
      const claude = createMockProvider('claude');
      const openai = createMockProvider('openai');

      ProviderRegistry.register('claude', () => claude);
      ProviderRegistry.register('openai', () => openai);

      const claudeResult = ProviderRegistry.get('claude');
      const openaiResult = ProviderRegistry.get('openai');

      expect(claudeResult).toBe(claude);
      expect(openaiResult).toBe(openai);
    });

    it('should replace existing provider on duplicate registration', () => {
      const provider1 = createMockProvider('test-1');
      const provider2 = createMockProvider('test-2');

      ProviderRegistry.register('test', () => provider1);
      ProviderRegistry.register('test', () => provider2);

      const result = ProviderRegistry.get('test');
      expect(result).toBe(provider2);
    });
  });

  describe('lazy instantiation', () => {
    it('should call factory exactly once on first get', () => {
      const mockProvider = createMockProvider('lazy-test');
      const factory = vi.fn(() => mockProvider);

      ProviderRegistry.register('lazy-test', factory);

      // Factory should not be called yet
      expect(factory).not.toHaveBeenCalled();

      // First call should invoke factory
      const result1 = ProviderRegistry.get('lazy-test');
      expect(factory).toHaveBeenCalledOnce();
      expect(result1).toBe(mockProvider);

      // Second call should return cached instance without calling factory
      const result2 = ProviderRegistry.get('lazy-test');
      expect(factory).toHaveBeenCalledOnce(); // Still once
      expect(result2).toBe(mockProvider);
    });

    it('should return same instance on multiple get calls (referential equality)', () => {
      const mockProvider = createMockProvider('singleton-test');
      ProviderRegistry.register('singleton-test', () => mockProvider);

      const instance1 = ProviderRegistry.get('singleton-test');
      const instance2 = ProviderRegistry.get('singleton-test');
      const instance3 = ProviderRegistry.get('singleton-test');

      expect(instance1).toBe(instance2);
      expect(instance2).toBe(instance3);
    });

    it('should call different factories for different providers', () => {
      const provider1 = createMockProvider('provider-1');
      const provider2 = createMockProvider('provider-2');
      const factory1 = vi.fn(() => provider1);
      const factory2 = vi.fn(() => provider2);

      ProviderRegistry.register('provider-1', factory1);
      ProviderRegistry.register('provider-2', factory2);

      ProviderRegistry.get('provider-1');
      expect(factory1).toHaveBeenCalledOnce();
      expect(factory2).not.toHaveBeenCalled();

      ProviderRegistry.get('provider-2');
      expect(factory1).toHaveBeenCalledOnce();
      expect(factory2).toHaveBeenCalledOnce();
    });
  });

  describe('getDefault', () => {
    it('should use AI_SDLC_PROVIDER env var when set', () => {
      const customProvider = createMockProvider('custom');
      ProviderRegistry.register('custom', () => customProvider);

      process.env.AI_SDLC_PROVIDER = 'custom';
      const result = ProviderRegistry.getDefault();

      expect(result).toBe(customProvider);
    });

    it('should fallback to claude when AI_SDLC_PROVIDER is not set', () => {
      const claudeProvider = createMockProvider('claude');
      ProviderRegistry.register('claude', () => claudeProvider);

      delete process.env.AI_SDLC_PROVIDER;
      const result = ProviderRegistry.getDefault();

      expect(result).toBe(claudeProvider);
    });

    it('should throw error if default provider not registered', () => {
      process.env.AI_SDLC_PROVIDER = 'nonexistent';

      expect(() => ProviderRegistry.getDefault()).toThrow(
        "Provider 'nonexistent' is not registered"
      );
    });

    it('should reflect runtime env var changes', () => {
      const provider1 = createMockProvider('provider-1');
      const provider2 = createMockProvider('provider-2');

      ProviderRegistry.register('provider-1', () => provider1);
      ProviderRegistry.register('provider-2', () => provider2);

      process.env.AI_SDLC_PROVIDER = 'provider-1';
      const result1 = ProviderRegistry.getDefault();
      expect(result1).toBe(provider1);

      // Change env var
      process.env.AI_SDLC_PROVIDER = 'provider-2';
      const result2 = ProviderRegistry.getDefault();
      expect(result2).toBe(provider2);
    });
  });

  describe('error handling', () => {
    it('should throw error for unregistered provider with available list', () => {
      ProviderRegistry.register('claude', () => createMockProvider('claude'));
      ProviderRegistry.register('openai', () => createMockProvider('openai'));

      expect(() => ProviderRegistry.get('nonexistent')).toThrow(
        "Provider 'nonexistent' is not registered. Available: claude, openai"
      );
    });

    it('should handle empty registry gracefully', () => {
      // Don't register any providers
      expect(() => ProviderRegistry.get('anything')).toThrow(
        "Provider 'anything' is not registered. Available: none"
      );
    });

    it('should propagate factory errors on first get call', () => {
      const errorFactory = vi.fn(() => {
        throw new Error('Factory initialization failed');
      });

      ProviderRegistry.register('error-provider', errorFactory);

      expect(() => ProviderRegistry.get('error-provider')).toThrow(
        'Factory initialization failed'
      );
      expect(errorFactory).toHaveBeenCalledOnce();
    });

    it('should include provider name in error message', () => {
      expect(() => ProviderRegistry.get('specific-name')).toThrow(
        "Provider 'specific-name' is not registered"
      );
    });
  });

  describe('listProviders', () => {
    it('should return empty array when no providers registered', () => {
      const providers = ProviderRegistry.listProviders();
      expect(providers).toEqual([]);
    });

    it('should return all registered provider names', () => {
      ProviderRegistry.register('claude', () => createMockProvider('claude'));
      ProviderRegistry.register('openai', () => createMockProvider('openai'));
      ProviderRegistry.register('copilot', () => createMockProvider('copilot'));

      const providers = ProviderRegistry.listProviders();

      expect(providers).toHaveLength(3);
      expect(providers.sort()).toEqual(['claude', 'copilot', 'openai']);
    });

    it('should not include instance state in list', () => {
      ProviderRegistry.register('provider-1', () => createMockProvider('provider-1'));
      ProviderRegistry.register('provider-2', () => createMockProvider('provider-2'));

      // Get one provider (instantiates it)
      ProviderRegistry.get('provider-1');

      // List should include both regardless of instantiation state
      const providers = ProviderRegistry.listProviders();
      expect(providers.sort()).toEqual(['provider-1', 'provider-2']);
    });
  });

  describe('hasProvider', () => {
    it('should return true for registered provider', () => {
      ProviderRegistry.register('claude', () => createMockProvider('claude'));

      expect(ProviderRegistry.hasProvider('claude')).toBe(true);
    });

    it('should return false for unregistered provider', () => {
      expect(ProviderRegistry.hasProvider('nonexistent')).toBe(false);
    });

    it('should be case-sensitive', () => {
      ProviderRegistry.register('claude', () => createMockProvider('claude'));

      expect(ProviderRegistry.hasProvider('claude')).toBe(true);
      expect(ProviderRegistry.hasProvider('Claude')).toBe(false);
      expect(ProviderRegistry.hasProvider('CLAUDE')).toBe(false);
    });

    it('should work before and after instantiation', () => {
      ProviderRegistry.register('test', () => createMockProvider('test'));

      // Before instantiation
      expect(ProviderRegistry.hasProvider('test')).toBe(true);

      // After instantiation
      ProviderRegistry.get('test');
      expect(ProviderRegistry.hasProvider('test')).toBe(true);
    });
  });

  describe('clearInstances', () => {
    it('should clear cached instances but preserve registrations', () => {
      const provider = createMockProvider('test');
      const factory = vi.fn(() => provider);

      ProviderRegistry.register('test', factory);

      // Get instance (calls factory once)
      const instance1 = ProviderRegistry.get('test');
      expect(factory).toHaveBeenCalledOnce();

      // Clear instances
      ProviderRegistry.clearInstances();

      // Provider should still be registered
      expect(ProviderRegistry.hasProvider('test')).toBe(true);

      // Getting again should call factory again (new instantiation)
      const instance2 = ProviderRegistry.get('test');
      expect(factory).toHaveBeenCalledTimes(2);

      // Both instances should be the same object (same factory)
      expect(instance1).toBe(instance2);
    });

    it('should allow re-instantiation with new factory after clear', () => {
      const provider1 = createMockProvider('provider-1');
      const provider2 = createMockProvider('provider-2');

      ProviderRegistry.register('test', () => provider1);
      const instance1 = ProviderRegistry.get('test');
      expect(instance1).toBe(provider1);

      // Clear and re-register with different factory
      ProviderRegistry.clearInstances();
      ProviderRegistry.register('test', () => provider2);

      const instance2 = ProviderRegistry.get('test');
      expect(instance2).toBe(provider2);
      expect(instance2).not.toBe(instance1);
    });

    it('should clear all instances when multiple providers cached', () => {
      const factory1 = vi.fn(() => createMockProvider('provider-1'));
      const factory2 = vi.fn(() => createMockProvider('provider-2'));

      ProviderRegistry.register('provider-1', factory1);
      ProviderRegistry.register('provider-2', factory2);

      // Instantiate both
      ProviderRegistry.get('provider-1');
      ProviderRegistry.get('provider-2');

      expect(factory1).toHaveBeenCalledOnce();
      expect(factory2).toHaveBeenCalledOnce();

      // Clear all instances
      ProviderRegistry.clearInstances();

      // Both should be re-instantiated on next get
      ProviderRegistry.get('provider-1');
      ProviderRegistry.get('provider-2');

      expect(factory1).toHaveBeenCalledTimes(2);
      expect(factory2).toHaveBeenCalledTimes(2);
    });
  });

  describe('integration scenarios', () => {
    it('should support typical usage workflow', () => {
      // Setup: Register multiple providers
      const claude = createMockProvider('claude');
      const openai = createMockProvider('openai');

      ProviderRegistry.register('claude', () => claude);
      ProviderRegistry.register('openai', () => openai);

      // Check what's available
      expect(ProviderRegistry.listProviders().sort()).toEqual(['claude', 'openai']);

      // Check if specific provider exists
      expect(ProviderRegistry.hasProvider('claude')).toBe(true);
      expect(ProviderRegistry.hasProvider('gemini')).toBe(false);

      // Get providers
      const claudeInstance = ProviderRegistry.get('claude');
      expect(claudeInstance.name).toBe('claude');

      // Get default
      delete process.env.AI_SDLC_PROVIDER;
      const defaultProvider = ProviderRegistry.getDefault();
      expect(defaultProvider.name).toBe('claude');

      // Use custom provider via env var
      process.env.AI_SDLC_PROVIDER = 'openai';
      const customDefault = ProviderRegistry.getDefault();
      expect(customDefault.name).toBe('openai');
    });

    it('should support test isolation pattern', () => {
      const factory = vi.fn(() => createMockProvider('test'));

      // Test 1
      ProviderRegistry.register('test', factory);
      ProviderRegistry.get('test');
      expect(factory).toHaveBeenCalledOnce();

      // Clear for isolation
      ProviderRegistry.clearInstances();

      // Test 2
      ProviderRegistry.get('test');
      expect(factory).toHaveBeenCalledTimes(2);
    });
  });

  describe('edge cases', () => {
    it('should handle provider names with special characters', () => {
      const provider = createMockProvider('provider-with-dashes');
      ProviderRegistry.register('provider-with-dashes', () => provider);

      expect(ProviderRegistry.hasProvider('provider-with-dashes')).toBe(true);
      expect(ProviderRegistry.get('provider-with-dashes')).toBe(provider);
    });

    it('should handle empty string as provider name', () => {
      const provider = createMockProvider('');
      ProviderRegistry.register('', () => provider);

      expect(ProviderRegistry.hasProvider('')).toBe(true);
      expect(ProviderRegistry.get('')).toBe(provider);
    });

    it('should fallback to claude when env var is deleted', () => {
      const claudeProvider = createMockProvider('claude');
      ProviderRegistry.register('claude', () => claudeProvider);

      delete process.env.AI_SDLC_PROVIDER;
      const result = ProviderRegistry.getDefault();

      expect(result).toBe(claudeProvider);
    });
  });
});
