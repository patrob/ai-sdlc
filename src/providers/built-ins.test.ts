import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ProviderRegistry } from './registry.js';
import { registerBuiltInProviders } from './built-ins.js';

describe('registerBuiltInProviders', () => {
  beforeEach(() => {
    ProviderRegistry.reset();
  });

  afterEach(() => {
    ProviderRegistry.reset();
  });

  it('registers every built-in provider needed for provider-agnostic workflows', () => {
    registerBuiltInProviders();

    expect(ProviderRegistry.listProviders().sort()).toEqual([
      'claude',
      'codex',
      'copilot',
      'dry-run',
      'mock',
      'openai',
      'openrouter',
    ]);
  });

  it('can instantiate each built-in without live credentials', () => {
    registerBuiltInProviders();

    for (const providerName of ProviderRegistry.listProviders()) {
      expect(ProviderRegistry.get(providerName).name).toBe(providerName);
    }
  });
});
