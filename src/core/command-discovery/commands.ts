/**
 * Command utilities and technology stack detection
 */

import * as fs from 'fs';
import * as path from 'path';

import type { TechStack } from '../../types/index.js';
import { discoverCommands } from './discovery.js';
import type { DiscoveredCommands, ParsedCommand } from './types.js';

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
 * Build single test pattern based on package manager and test script content
 */
export function buildSingleTestPatternForPackageManager(
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
