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

import * as fs from 'fs';
import * as path from 'path';
import { loadConfig } from './config.js';
import type { TechStack } from '../types/index.js';

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
  stack?: TechStack;
}

/**
 * Parsed command with executable and arguments separated
 */
export interface ParsedCommand {
  executable: string;
  args: string[];
}

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
 * Detect the package manager from lockfiles
 */
export function detectPackageManager(workingDir: string): 'npm' | 'yarn' | 'pnpm' | 'bun' {
  if (fs.existsSync(path.join(workingDir, 'bun.lockb'))) {
    return 'bun';
  }
  if (fs.existsSync(path.join(workingDir, 'pnpm-lock.yaml'))) {
    return 'pnpm';
  }
  if (fs.existsSync(path.join(workingDir, 'yarn.lock'))) {
    return 'yarn';
  }
  return 'npm';
}

/**
 * Detect the technology stack from project files
 */
export function detectTechStack(workingDir: string): TechStack {
  // Check for Node.js
  if (fs.existsSync(path.join(workingDir, 'package.json'))) {
    const pm = detectPackageManager(workingDir);
    switch (pm) {
      case 'yarn':
        return 'node-yarn';
      case 'pnpm':
        return 'node-pnpm';
      case 'bun':
        return 'node-bun';
      default:
        return 'node-npm';
    }
  }

  // Check for Python
  if (
    fs.existsSync(path.join(workingDir, 'pyproject.toml')) ||
    fs.existsSync(path.join(workingDir, 'setup.py')) ||
    fs.existsSync(path.join(workingDir, 'requirements.txt'))
  ) {
    if (fs.existsSync(path.join(workingDir, 'poetry.lock'))) {
      return 'python-poetry';
    }
    if (fs.existsSync(path.join(workingDir, 'uv.lock'))) {
      return 'python-uv';
    }
    return 'python-pip';
  }

  // Check for Rust
  if (fs.existsSync(path.join(workingDir, 'Cargo.toml'))) {
    return 'rust-cargo';
  }

  // Check for Go
  if (fs.existsSync(path.join(workingDir, 'go.mod'))) {
    return 'go-mod';
  }

  // Check for Ruby
  if (fs.existsSync(path.join(workingDir, 'Gemfile'))) {
    return 'ruby-bundler';
  }

  // Check for Java
  if (fs.existsSync(path.join(workingDir, 'pom.xml'))) {
    return 'java-maven';
  }
  if (
    fs.existsSync(path.join(workingDir, 'build.gradle')) ||
    fs.existsSync(path.join(workingDir, 'build.gradle.kts'))
  ) {
    return 'java-gradle';
  }

  // Check for .NET
  if (
    fs.existsSync(path.join(workingDir, '*.csproj')) ||
    fs.existsSync(path.join(workingDir, '*.sln'))
  ) {
    return 'dotnet';
  }

  return 'unknown';
}

/**
 * Get default commands for a technology stack
 */
export function getStackDefaultCommands(stack: TechStack): DiscoveredCommands {
  switch (stack) {
    case 'node-npm':
      return {
        install: 'npm install',
        build: 'npm run build',
        test: 'npm test',
        testSingle: 'npm test -- {file}',
        lint: 'npm run lint',
      };

    case 'node-yarn':
      return {
        install: 'yarn install',
        build: 'yarn build',
        test: 'yarn test',
        testSingle: 'yarn test {file}',
        lint: 'yarn lint',
      };

    case 'node-pnpm':
      return {
        install: 'pnpm install',
        build: 'pnpm run build',
        test: 'pnpm test',
        testSingle: 'pnpm test {file}',
        lint: 'pnpm run lint',
      };

    case 'node-bun':
      return {
        install: 'bun install',
        build: 'bun run build',
        test: 'bun test',
        testSingle: 'bun test {file}',
        lint: 'bun run lint',
      };

    case 'python-pip':
      return {
        install: 'pip install -r requirements.txt',
        test: 'pytest',
        testSingle: 'pytest {file}',
        lint: 'ruff check .',
      };

    case 'python-poetry':
      return {
        install: 'poetry install',
        test: 'poetry run pytest',
        testSingle: 'poetry run pytest {file}',
        lint: 'poetry run ruff check .',
      };

    case 'python-uv':
      return {
        install: 'uv sync',
        test: 'uv run pytest',
        testSingle: 'uv run pytest {file}',
        lint: 'uv run ruff check .',
      };

    case 'rust-cargo':
      return {
        build: 'cargo build',
        test: 'cargo test',
        testSingle: 'cargo test --test {file}',
        lint: 'cargo clippy',
      };

    case 'go-mod':
      return {
        build: 'go build ./...',
        test: 'go test ./...',
        testSingle: 'go test -run {file}',
        lint: 'go vet ./...',
      };

    case 'ruby-bundler':
      return {
        install: 'bundle install',
        test: 'bundle exec rspec',
        testSingle: 'bundle exec rspec {file}',
        lint: 'bundle exec rubocop',
      };

    case 'java-maven':
      return {
        build: 'mvn compile',
        test: 'mvn test',
        testSingle: 'mvn test -Dtest={file}',
        lint: 'mvn checkstyle:check',
      };

    case 'java-gradle':
      return {
        build: './gradlew build',
        test: './gradlew test',
        testSingle: './gradlew test --tests {file}',
        lint: './gradlew check',
      };

    case 'dotnet':
      return {
        build: 'dotnet build',
        test: 'dotnet test',
        testSingle: 'dotnet test --filter {file}',
        lint: 'dotnet format --verify-no-changes',
      };

    default:
      return {};
  }
}

/**
 * Build a single test file command from a base test command
 *
 * @param baseCommand - The base test command (e.g., 'npm test')
 * @param testFile - The test file to run
 * @returns Complete command to run single test file
 */
export function buildSingleTestCommand(baseCommand: string, testFile: string): string {
  // Check if command has a pattern placeholder
  if (baseCommand.includes('{file}')) {
    return baseCommand.replace('{file}', testFile);
  }

  // Detect test runner and build appropriate command
  const lowerCommand = baseCommand.toLowerCase();

  // npm/npx patterns
  if (lowerCommand.includes('npm test') || lowerCommand.includes('npm run test')) {
    return `${baseCommand} -- ${testFile}`;
  }

  // yarn patterns
  if (lowerCommand.includes('yarn test') || lowerCommand.includes('yarn run test')) {
    return `${baseCommand} ${testFile}`;
  }

  // pnpm patterns
  if (lowerCommand.includes('pnpm test') || lowerCommand.includes('pnpm run test')) {
    return `${baseCommand} ${testFile}`;
  }

  // bun patterns
  if (lowerCommand.includes('bun test') || lowerCommand.includes('bun run test')) {
    return `${baseCommand} ${testFile}`;
  }

  // vitest patterns
  if (lowerCommand.includes('vitest')) {
    return `${baseCommand} ${testFile}`;
  }

  // jest patterns
  if (lowerCommand.includes('jest')) {
    return `${baseCommand} ${testFile}`;
  }

  // pytest patterns
  if (lowerCommand.includes('pytest')) {
    return `${baseCommand} ${testFile}`;
  }

  // cargo patterns
  if (lowerCommand.includes('cargo test')) {
    return `${baseCommand} --test ${testFile}`;
  }

  // go test patterns
  if (lowerCommand.includes('go test')) {
    return `${baseCommand} -run ${testFile}`;
  }

  // make patterns - usually need FILE= or similar
  if (lowerCommand.startsWith('make')) {
    return `${baseCommand} FILE=${testFile}`;
  }

  // Default: append file as argument
  return `${baseCommand} ${testFile}`;
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

/**
 * Build single test pattern based on package manager and test script content
 */
function buildSingleTestPatternForPackageManager(
  packageManager: 'npm' | 'yarn' | 'pnpm' | 'bun',
  testScript: string
): string {
  const lowerScript = testScript.toLowerCase();

  // Check if using vitest or jest (direct file argument works)
  if (lowerScript.includes('vitest') || lowerScript.includes('jest')) {
    switch (packageManager) {
      case 'npm':
        return 'npm test -- {file}';
      case 'yarn':
        return 'yarn test {file}';
      case 'pnpm':
        return 'pnpm test {file}';
      case 'bun':
        return 'bun test {file}';
    }
  }

  // Default patterns by package manager
  switch (packageManager) {
    case 'npm':
      return 'npm test -- {file}';
    case 'yarn':
      return 'yarn test {file}';
    case 'pnpm':
      return 'pnpm test {file}';
    case 'bun':
      return 'bun test {file}';
  }
}

/**
 * Parse a command string into executable and arguments
 *
 * @param command - The full command string
 * @returns Parsed command with executable and args array
 */
export function parseCommand(command: string): ParsedCommand {
  // Handle empty or whitespace-only commands
  const trimmed = command.trim();
  if (!trimmed) {
    return { executable: '', args: [] };
  }

  // Simple split by whitespace (doesn't handle quoted arguments)
  // For more complex parsing, a proper shell parser would be needed
  const parts = trimmed.split(/\s+/);

  return {
    executable: parts[0],
    args: parts.slice(1),
  };
}

/**
 * Get the test command for a working directory
 * Convenience function that returns just the test command string
 */
export function getTestCommand(workingDir: string): string {
  const result = discoverCommands(workingDir);
  return result.commands.test || 'npm test';
}

/**
 * Get the build command for a working directory
 * Convenience function that returns just the build command string
 */
export function getBuildCommand(workingDir: string): string {
  const result = discoverCommands(workingDir);
  return result.commands.build || 'npm run build';
}

/**
 * Get the lint command for a working directory
 * Convenience function that returns just the lint command string
 */
export function getLintCommand(workingDir: string): string | undefined {
  const result = discoverCommands(workingDir);
  return result.commands.lint;
}

/**
 * Get the verify command for a working directory
 * Convenience function that returns the verify command or falls back to test + build + lint
 */
export function getVerifyCommand(workingDir: string): string | undefined {
  const result = discoverCommands(workingDir);
  return result.commands.verify;
}
