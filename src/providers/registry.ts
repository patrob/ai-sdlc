import type { IProvider } from './types.js';

/**
 * Centralized registry for AI provider management.
 *
 * Manages provider lifecycle with lazy instantiation and caching.
 * Providers are registered with factory functions and instantiated on first use.
 *
 * @example
 * ```typescript
 * // Register providers
 * ProviderRegistry.register('claude', () => new ClaudeProvider());
 * ProviderRegistry.register('openai', () => new OpenAIProvider());
 *
 * // Get provider by name
 * const claude = ProviderRegistry.get('claude');
 *
 * // Get default provider (from AI_SDLC_PROVIDER env var)
 * const defaultProvider = ProviderRegistry.getDefault();
 *
 * // List all registered providers
 * const providers = ProviderRegistry.listProviders(); // ['claude', 'openai']
 *
 * // Check if provider exists
 * const hasProvider = ProviderRegistry.hasProvider('claude'); // true
 *
 * // Clear cached instances (for testing)
 * ProviderRegistry.clearInstances();
 * ```
 */
export class ProviderRegistry {
  /** Map of provider names to factory functions */
  private static factories = new Map<string, () => IProvider>();

  /** Map of provider names to cached instances */
  private static instances = new Map<string, IProvider>();

  /**
   * Private constructor to prevent instantiation.
   * This is a static-only class.
   */
  private constructor() {}

  /**
   * Register a provider factory function.
   *
   * If a provider with the same name already exists, it will be replaced.
   * The factory function will be called lazily on first use.
   *
   * @param name - Unique provider identifier (case-sensitive)
   * @param factory - Function that creates and returns a provider instance
   *
   * @example
   * ```typescript
   * ProviderRegistry.register('claude', () => new ClaudeProvider());
   * ```
   */
  static register(name: string, factory: () => IProvider): void {
    this.factories.set(name, factory);
  }

  /**
   * Get a provider instance by name.
   *
   * The provider factory is called only once (lazy instantiation).
   * Subsequent calls return the cached instance.
   *
   * @param name - Provider name to retrieve
   * @returns Provider instance
   * @throws Error if provider is not registered
   *
   * @example
   * ```typescript
   * const provider = ProviderRegistry.get('claude');
   * ```
   */
  static get(name: string): IProvider {
    // Check if instance is already cached
    const cachedInstance = this.instances.get(name);
    if (cachedInstance) {
      return cachedInstance;
    }

    // Get factory function
    const factory = this.factories.get(name);
    if (!factory) {
      const available = this.listProviders();
      const availableList = available.length > 0 ? available.join(', ') : 'none';
      throw new Error(
        `Provider '${name}' is not registered. Available: ${availableList}`
      );
    }

    // Instantiate provider and cache it
    const instance = factory();
    this.instances.set(name, instance);
    return instance;
  }

  /**
   * Get the default provider based on environment configuration.
   *
   * Reads the `AI_SDLC_PROVIDER` environment variable.
   * Falls back to 'claude' if not set.
   *
   * @returns Default provider instance
   * @throws Error if the default provider is not registered
   *
   * @example
   * ```typescript
   * // With AI_SDLC_PROVIDER=openai
   * const provider = ProviderRegistry.getDefault(); // Returns OpenAI provider
   *
   * // Without AI_SDLC_PROVIDER set
   * const provider = ProviderRegistry.getDefault(); // Returns Claude provider
   * ```
   */
  static getDefault(): IProvider {
    const providerName = process.env.AI_SDLC_PROVIDER ?? 'claude';
    return this.get(providerName);
  }

  /**
   * Get a list of all registered provider names.
   *
   * @returns Array of provider names
   *
   * @example
   * ```typescript
   * const providers = ProviderRegistry.listProviders();
   * console.log(providers); // ['claude', 'openai', 'copilot']
   * ```
   */
  static listProviders(): string[] {
    return Array.from(this.factories.keys());
  }

  /**
   * Check if a provider is registered.
   *
   * @param name - Provider name to check
   * @returns true if provider is registered, false otherwise
   *
   * @example
   * ```typescript
   * if (ProviderRegistry.hasProvider('claude')) {
   *   const claude = ProviderRegistry.get('claude');
   * }
   * ```
   */
  static hasProvider(name: string): boolean {
    return this.factories.has(name);
  }

  /**
   * Clear all cached provider instances.
   *
   * Preserves provider registrations but clears the instance cache.
   * Useful for test isolation and forcing re-instantiation.
   *
   * @example
   * ```typescript
   * // In test setup
   * beforeEach(() => {
   *   ProviderRegistry.clearInstances();
   * });
   * ```
   */
  static clearInstances(): void {
    this.instances.clear();
  }

  /**
   * Reset the registry to initial state.
   *
   * Clears both factories and instances. Use for complete test isolation.
   *
   * @example
   * ```typescript
   * // In test teardown
   * afterEach(() => {
   *   ProviderRegistry.reset();
   * });
   * ```
   */
  static reset(): void {
    this.factories.clear();
    this.instances.clear();
  }
}
