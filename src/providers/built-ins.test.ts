import { afterEach,beforeEach, describe, expect, it } from 'vitest';

import { registerBuiltInProviders } from './built-ins.js';
import { ProviderRegistry } from './registry.js';

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
      'ollama',
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
