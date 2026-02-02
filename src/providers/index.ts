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

// Export Claude provider
export { ClaudeProvider } from './claude/index.js';
export { ClaudeAuthenticator } from './claude/authenticator.js';
