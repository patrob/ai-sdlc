import { Config } from '../../types/index.js';
import { NullTicketProvider } from './null-provider.js';
import { GitHubTicketProvider } from './github-provider.js';
import { TicketProvider } from './types.js';

// Re-export types
export * from './types.js';
export { NullTicketProvider } from './null-provider.js';
export { GitHubTicketProvider } from './github-provider.js';

/**
 * Create a ticket provider based on configuration.
 *
 * Factory function that instantiates the appropriate TicketProvider
 * implementation based on the `ticketing.provider` configuration value.
 *
 * Defaults to NullTicketProvider when:
 * - No ticketing configuration exists
 * - ticketing.provider is 'none'
 * - ticketing.provider is an unknown value
 *
 * @param config Application configuration
 * @returns Configured ticket provider instance
 * @throws Error if requesting an unimplemented provider (github, jira)
 */
export function createTicketProvider(config: Config): TicketProvider {
  const provider = config.ticketing?.provider ?? 'none';

  switch (provider) {
    case 'none':
      return new NullTicketProvider();

    case 'github':
      return new GitHubTicketProvider(config.ticketing?.github);

    case 'jira':
      // Placeholder for future Jira provider implementation
      throw new Error('Jira provider not yet implemented');

    default:
      // Unknown provider - fall back to safe default
      console.warn(`Unknown ticket provider "${provider}", falling back to 'none'`);
      return new NullTicketProvider();
  }
}
