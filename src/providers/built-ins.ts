import { ClaudeProvider } from './claude/index.js';
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
 * The non-Claude LLM providers (openai, codex, openrouter, ollama, copilot) are
 * powered by the Pi agentic engine (`PiAgenticProvider`), giving them a true
 * tool-using, file-editing agent loop rather than text-only completions.
 */
export function registerBuiltInProviders(): void {
  ProviderRegistry.register('claude', () => new ClaudeProvider());
  ProviderRegistry.register('openai', () => createPiProvider('openai'));
  ProviderRegistry.register('codex', () => createPiProvider('codex'));
  ProviderRegistry.register('openrouter', () => createPiProvider('openrouter'));
  ProviderRegistry.register('copilot', () => createPiProvider('copilot'));
  ProviderRegistry.register('ollama', () => createPiProvider('ollama'));
  ProviderRegistry.register('mock', () => new MockProvider());
  ProviderRegistry.register('dry-run', () => new DryRunProvider());
}
