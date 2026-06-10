/**
 * Command discovery from configuration sources
 * Priority: config > makefile > package.json > stack-defaults
 */

import * as fs from 'fs';
import * as path from 'path';

import { loadConfig } from '../config.js';
import {
  buildSingleTestPatternForPackageManager,
  detectPackageManager,
  detectTechStack,
  getStackDefaultCommands,
} from './commands.js';
import type { CommandDiscoveryResult, DiscoveredCommands } from './types.js';

// Cache for discovered commands (keyed by working directory)
const commandCache = new Map<string, CommandDiscoveryResult>();

/**
 * Clear the command discovery cache.
 * Useful for testing or when project configuration changes.
 */
export function clearCommandCache(): void {
  commandCache.clear();
}

/**
 * Discover project commands from configuration files.
 * Uses caching to avoid repeated filesystem access.
 *
 * @param workingDir - The project root directory
 * @returns Discovery result with commands and source
 */
export function discoverCommands(workingDir: string): CommandDiscoveryResult {
  const cacheKey = path.resolve(workingDir);

  // Return cached result if available
  const cached = commandCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  // Priority 1: Check .ai-sdlc.json config
  const configResult = discoverFromConfig(workingDir);
  if (configResult) {
    commandCache.set(cacheKey, configResult);
    return configResult;
  }

  // Priority 2: Check Makefile
  const makefileResult = discoverFromMakefile(workingDir);
  if (makefileResult) {
    commandCache.set(cacheKey, makefileResult);
    return makefileResult;
  }

  // Priority 3: Check package.json
  const packageResult = discoverFromPackageJson(workingDir);
  if (packageResult) {
    commandCache.set(cacheKey, packageResult);
    return packageResult;
  }

  // Priority 4: Stack defaults (detect from project files)
  const stackResult = discoverFromStackDefaults(workingDir);
  if (stackResult) {
    commandCache.set(cacheKey, stackResult);
    return stackResult;
  }

  // No commands discovered
  const emptyResult: CommandDiscoveryResult = {
    commands: {},
    source: 'none',
  };
  commandCache.set(cacheKey, emptyResult);
  return emptyResult;
}

/**
 * Discover commands from .ai-sdlc.json config
 */
function discoverFromConfig(workingDir: string): CommandDiscoveryResult | null {
  try {
    const config = loadConfig(workingDir);
    const commands: DiscoveredCommands = {};
    let hasCommands = false;

    if (config.testCommand) {
      commands.test = config.testCommand;
      commands.testSingle = buildSingleTestPattern(config.testCommand);
      hasCommands = true;
    }

    if (config.buildCommand) {
      commands.build = config.buildCommand;
      hasCommands = true;
    }

    if (config.installCommand) {
      commands.install = config.installCommand;
      hasCommands = true;
    }

    // Check for project-specific commands
    if (config.projects && config.projects.length > 0) {
      // Use root project if available
      const rootProject = config.projects.find((p) => p.path === '.' || p.path === './');
      if (rootProject?.commands) {
        if (rootProject.commands.test && !commands.test) {
          commands.test = rootProject.commands.test;
          commands.testSingle = buildSingleTestPattern(rootProject.commands.test);
          hasCommands = true;
        }
        if (rootProject.commands.build && !commands.build) {
          commands.build = rootProject.commands.build;
          hasCommands = true;
        }
        if (rootProject.commands.install && !commands.install) {
          commands.install = rootProject.commands.install;
          hasCommands = true;
        }
      }
    }

    if (!hasCommands) {
      return null;
    }

    return {
      commands,
      source: 'config',
    };
  } catch {
    return null;
  }
}

/**
 * Discover commands from Makefile
 */
export function discoverFromMakefile(workingDir: string): CommandDiscoveryResult | null {
  const makefilePath = path.join(workingDir, 'Makefile');

  if (!fs.existsSync(makefilePath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(makefilePath, 'utf-8');
    const commands: DiscoveredCommands = {};
    let hasCommands = false;

    // Parse Makefile targets - match lines starting with target name followed by colon
    // Targets can have prerequisites after the colon
    const targetPattern = /^([a-zA-Z_][a-zA-Z0-9_-]*)\s*:/gm;
    const targets = new Set<string>();

    let match;
    while ((match = targetPattern.exec(content)) !== null) {
      targets.add(match[1]);
    }

    // Map common targets to commands
    const targetMappings: Array<{ targets: string[]; command: keyof DiscoveredCommands }> = [
      { targets: ['test', 'tests', 'check-tests'], command: 'test' },
      { targets: ['build', 'compile', 'all'], command: 'build' },
      { targets: ['lint', 'check-lint', 'eslint'], command: 'lint' },
      { targets: ['verify', 'check', 'check-all'], command: 'verify' },
      { targets: ['install', 'deps', 'dependencies'], command: 'install' },
    ];

    for (const mapping of targetMappings) {
      for (const target of mapping.targets) {
        if (targets.has(target)) {
          commands[mapping.command] = `make ${target}`;
          hasCommands = true;
          break;
        }
      }
    }

    // Generate testSingle if test command was found
    if (commands.test) {
      // For make test, we can't easily pass file arguments
      // Check if there's a test-file or test-single target
      if (targets.has('test-file') || targets.has('test-single')) {
        commands.testSingle = targets.has('test-file')
          ? 'make test-file FILE={file}'
          : 'make test-single FILE={file}';
      }
    }

    if (!hasCommands) {
      return null;
    }

    return {
      commands,
      source: 'makefile',
    };
  } catch {
    return null;
  }
}

/**
 * Discover commands from package.json
 */
export function discoverFromPackageJson(workingDir: string): CommandDiscoveryResult | null {
  const packagePath = path.join(workingDir, 'package.json');

  if (!fs.existsSync(packagePath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(packagePath, 'utf-8');
    const pkg = JSON.parse(content);

    if (!pkg.scripts || typeof pkg.scripts !== 'object') {
      return null;
    }

    const scripts = pkg.scripts as Record<string, string>;
    const commands: DiscoveredCommands = {};
    let hasCommands = false;

    // Detect package manager from lockfile
    const packageManager = detectPackageManager(workingDir);

    // Map npm scripts to commands
    const scriptMappings: Array<{ scripts: string[]; command: keyof DiscoveredCommands }> = [
      { scripts: ['test', 'test:unit', 'test:all'], command: 'test' },
      { scripts: ['build', 'compile', 'tsc'], command: 'build' },
      { scripts: ['lint', 'eslint', 'check:lint'], command: 'lint' },
      { scripts: ['verify', 'check', 'check:all', 'validate'], command: 'verify' },
      { scripts: ['install', 'prepare', 'postinstall'], command: 'install' },
    ];

    for (const mapping of scriptMappings) {
      for (const script of mapping.scripts) {
        if (scripts[script]) {
          // For install, just use the package manager install
          if (mapping.command === 'install') {
            commands.install = `${packageManager} install`;
          } else {
            commands[mapping.command] = `${packageManager} run ${script}`;
          }
          hasCommands = true;
          break;
        }
      }
    }

    // Special handling for test - npm test is shorthand
    if (scripts.test && !commands.test) {
      commands.test = `${packageManager} test`;
      hasCommands = true;
    }

    // Generate testSingle pattern
    if (commands.test) {
      commands.testSingle = buildSingleTestPatternForPackageManager(
        packageManager,
        scripts.test || ''
      );
    }

    if (!hasCommands) {
      return null;
    }

    return {
      commands,
      source: 'package.json',
    };
  } catch {
    return null;
  }
}

/**
 * Discover commands based on detected tech stack
 */
function discoverFromStackDefaults(workingDir: string): CommandDiscoveryResult | null {
  const stack = detectTechStack(workingDir);

  if (stack === 'unknown') {
    return null;
  }

  const commands = getStackDefaultCommands(stack);

  return {
    commands,
    source: 'stack-defaults',
    stack,
  };
}

/**
 * Build single test pattern for storage (with {file} placeholder)
 */
function buildSingleTestPattern(baseCommand: string): string {
  const lowerCommand = baseCommand.toLowerCase();

  if (lowerCommand.includes('npm test') || lowerCommand.includes('npm run test')) {
    return `${baseCommand} -- {file}`;
  }

  if (
    lowerCommand.includes('yarn') ||
    lowerCommand.includes('pnpm') ||
    lowerCommand.includes('bun')
  ) {
    return `${baseCommand} {file}`;
  }

  if (lowerCommand.includes('pytest')) {
    return `${baseCommand} {file}`;
  }

  if (lowerCommand.includes('cargo test')) {
    return `${baseCommand} --test {file}`;
  }

  if (lowerCommand.includes('go test')) {
    return `${baseCommand} -run {file}`;
  }

  return `${baseCommand} {file}`;
}
