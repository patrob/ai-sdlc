/**
 * Command Discovery Module
 *
 * Auto-detects test/build/lint commands from project configuration files.
 * Priority order:
 * 1. .ai-sdlc.json config (highest)
 * 2. Makefile targets
 * 3. package.json scripts
 * 4. Stack defaults (lowest)
 */

export {
  buildSingleTestCommand,
  buildSingleTestPatternForPackageManager,
  detectPackageManager,
  detectTechStack,
  getBuildCommand,
  getLintCommand,
  getStackDefaultCommands,
  getTestCommand,
  getVerifyCommand,
  parseCommand,
} from './commands.js';
export {
  clearCommandCache,
  discoverCommands,
  discoverFromMakefile,
  discoverFromPackageJson,
} from './discovery.js';
export type { CommandDiscoveryResult, DiscoveredCommands, ParsedCommand } from './types.js';
