/**
 * Type definitions for command discovery
 */

/**
 * Commands discovered from project configuration
 */
export interface DiscoveredCommands {
  install?: string;
  build?: string;
  test?: string;
  testSingle?: string; // Pattern for single test file (e.g., 'npm test -- {file}')
  lint?: string;
  verify?: string;
}

/**
 * Result of command discovery with source information
 */
export interface CommandDiscoveryResult {
  commands: DiscoveredCommands;
  source: 'config' | 'makefile' | 'package.json' | 'stack-defaults' | 'none';
  stack?: any; // TechStack
}

/**
 * Parsed command with executable and arguments separated
 */
export interface ParsedCommand {
  executable: string;
  args: string[];
}
