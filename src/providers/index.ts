/**
 * Provider abstraction layer
 *
 * This module exports the core interfaces and types for AI provider integration.
 * Import all provider-related types from this barrel export:
 *
 * @example
 * ```typescript
 * import {
 *   IProvider,
 *   IAuthenticator,
 *   ProviderCapabilities,
 *   ProviderQueryOptions,
 *   ProviderProgressEvent,
 *   ProviderProgressCallback,
 *   ProviderRegistry
 * } from './providers/index.js';
 * ```
 */

// Re-export all types from types.ts
export * from './types.js';

// Export ProviderRegistry class
export { ProviderRegistry } from './registry.js';

// Export the Pi agentic engine — the single agentic engine that powers every
// provider, including `claude` (Anthropic) via Pi's native anthropic-messages API.
export { registerBuiltInProviders } from './built-ins.js';
export type { PiProviderDeps,PiProviderSettings } from './pi/index.js';
export {
  createPiProvider,
  PI_PROVIDER_SETTINGS,
  PiAgenticProvider,
  PiAuthenticator,
} from './pi/index.js';

// Export mock and dry-run providers
export { DryRunProvider } from './dry-run-provider.js';
export type { MockProviderOptions, RecordedCall } from './mock-provider.js';
export { MockAuthenticator,MockProvider } from './mock-provider.js';
