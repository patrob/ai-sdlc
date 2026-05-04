import { ClaudeProvider } from './claude/index.js';
import { DryRunProvider } from './dry-run-provider.js';
import { MockProvider } from './mock-provider.js';
import {
  CodexProvider,
  CopilotProvider,
  OpenAIProvider,
  OpenRouterProvider,
} from './openai-compatible-provider.js';
import { ProviderRegistry } from './registry.js';

/**
 * Register every provider shipped with ai-sdlc.
 *
 * Keeping this list in one place prevents the CLI, tests, and future library
 * entrypoints from drifting as providers are added.
 */
export function registerBuiltInProviders(): void {
  ProviderRegistry.register('claude', () => new ClaudeProvider());
  ProviderRegistry.register('openai', () => new OpenAIProvider());
  ProviderRegistry.register('codex', () => new CodexProvider());
  ProviderRegistry.register('openrouter', () => new OpenRouterProvider());
  ProviderRegistry.register('copilot', () => new CopilotProvider());
  ProviderRegistry.register('mock', () => new MockProvider());
  ProviderRegistry.register('dry-run', () => new DryRunProvider());
}
