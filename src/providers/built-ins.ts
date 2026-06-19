import { getApiKey } from '../core/auth.js';
import { DryRunProvider } from './dry-run-provider.js';
import { MockProvider } from './mock-provider.js';
import { createPiProvider } from './pi/index.js';
import { ProviderRegistry } from './registry.js';

/**
 * Register every provider shipped with ai-sdlc.
 *
 * Keeping this list in one place prevents the CLI, tests, and future library
 * entrypoints from drifting as providers are added.
 *
 * Every LLM provider — including `claude` (Anthropic) — is powered by the Pi
 * agentic engine (`PiAgenticProvider`), giving them a true tool-using,
 * file-editing agent loop rather than text-only completions. Pi is the single
 * agentic engine for ai-sdlc; no provider is locked to a vendor-specific SDK.
 *
 * The `claude` provider routes through Pi's native `anthropic-messages` API and
 * sources credentials from the environment or ai-sdlc's keychain/credential-file
 * bridge (see {@link ../core/auth.js}).
 */
export function registerBuiltInProviders(): void {
  ProviderRegistry.register('claude', () =>
    createPiProvider('claude', { getApiKey: () => getApiKey() ?? undefined })
  );
  ProviderRegistry.register('openai', () => createPiProvider('openai'));
  ProviderRegistry.register('codex', () => createPiProvider('codex'));
  ProviderRegistry.register('openrouter', () => createPiProvider('openrouter'));
  ProviderRegistry.register('copilot', () => createPiProvider('copilot'));
  ProviderRegistry.register('ollama', () => createPiProvider('ollama'));
  ProviderRegistry.register('mock', () => new MockProvider());
  ProviderRegistry.register('dry-run', () => new DryRunProvider());
}
