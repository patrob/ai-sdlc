import { Story } from '../types/index.js';
import { loadConfig } from '../core/config.js';
import { spawn, spawnSync } from 'child_process';
import { existsSync, readdirSync } from 'fs';
import path from 'path';

export interface VerificationResult {
  passed: boolean;
  failures: number;
  timestamp: string;
  testsOutput: string;
  buildOutput: string;
}

export interface VerificationOptions {
  runTests?: (workingDir: string, timeout: number) => Promise<{ success: boolean; output: string }>;
  runBuild?: (workingDir: string, timeout: number) => Promise<{ success: boolean; output: string }>;
  requirePassingTests?: boolean;
  skipDependencyCheck?: boolean;
}

/**
 * Lock file to package manager mapping
 */
const LOCK_FILE_TO_PM: Record<string, string> = {
  'package-lock.json': 'npm',
  'yarn.lock': 'yarn',
  'pnpm-lock.yaml': 'pnpm',
};

/**
 * Ensures dependencies are installed before running tests/build.
 * Checks if node_modules exists and has packages. If not, runs the appropriate install command.
 * @param workingDir - The directory to check for dependencies
 * @returns Result indicating if install was needed and any error that occurred
 */
export function ensureDependenciesInstalled(workingDir: string): { installed: boolean; error?: string } {
  const packageJsonPath = path.join(workingDir, 'package.json');

  // Skip if not a Node.js project
  if (!existsSync(packageJsonPath)) {
    return { installed: false };
  }

  const nodeModulesPath = path.join(workingDir, 'node_modules');

  // Check if node_modules exists and has contents
  let hasNodeModules = false;
  if (existsSync(nodeModulesPath)) {
    try {
      const contents = readdirSync(nodeModulesPath);
      // node_modules should have more than just .bin to be considered populated
      hasNodeModules = contents.length > 1 || (contents.length === 1 && contents[0] !== '.bin');
    } catch {
      hasNodeModules = false;
    }
  }

  if (hasNodeModules) {
    return { installed: false };
  }

  // Detect package manager from lock file
  let packageManager = 'npm';
  for (const [lockFile, pm] of Object.entries(LOCK_FILE_TO_PM)) {
    if (existsSync(path.join(workingDir, lockFile))) {
      packageManager = pm;
      break;
    }
  }

  // Run install command
  const result = spawnSync(packageManager, ['install'], {
    cwd: workingDir,
    encoding: 'utf-8',
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 120000, // 2 minute timeout
  });

  if (result.status !== 0) {
    const stderr = result.stderr?.toString() || '';
    return { installed: false, error: `Failed to install dependencies: ${stderr}` };
  }

  return { installed: true };
}

async function runCommandAsync(
  command: string,
  workingDir: string,
  timeout: number
): Promise<{ success: boolean; output: string }> {
  return new Promise((resolve) => {
    const outputChunks: string[] = [];
    let killed = false;

    const parts = command.match(/(?:[^\s"]+|"[^"]*")+/g) || [command];
    const executable = parts[0];
    const args = parts.slice(1).map(arg => arg.replace(/^"|"$/g, ''));

    const child = spawn(executable, args, {
      cwd: workingDir,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const timeoutId = setTimeout(() => {
      killed = true;
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 5000);
    }, timeout);

    child.stdout?.on('data', (data: Buffer) => {
      outputChunks.push(data.toString());
    });

    child.stderr?.on('data', (data: Buffer) => {
      outputChunks.push(data.toString());
    });

    child.on('close', (code) => {
      clearTimeout(timeoutId);
      const output = outputChunks.join('');
      if (killed) {
        resolve({
          success: false,
          output: output + `\n[Command timed out after ${Math.round(timeout / 1000)} seconds]`,
        });
      } else {
        resolve({
          success: code === 0,
          output,
        });
      }
    });

    child.on('error', (error) => {
      clearTimeout(timeoutId);
      resolve({
        success: false,
        output: outputChunks.join('') + `\n[Command error: ${error.message}]`,
      });
    });
  });
}

function extractFailureCount(output: string): number {
  const patterns = [
    /(\d+)\s+failed/i,
    /failures?:\s*(\d+)/i,
    /\s(\d+)\s+failing/i,
  ];

  for (const pattern of patterns) {
    const match = output.match(pattern);
    if (match) {
      return parseInt(match[1], 10);
    }
  }

  return 0;
}

export async function verifyImplementation(
  story: Story,
  workingDir: string,
  options: VerificationOptions = {}
): Promise<VerificationResult> {
  const config = loadConfig(workingDir);
  const testTimeout = config.timeouts?.testTimeout || 300000;
  const buildTimeout = config.timeouts?.buildTimeout || 120000;
  const requirePassingTests = options.requirePassingTests ?? config.tdd?.requirePassingTestsForComplete ?? true;

  const timestamp = new Date().toISOString();
  let testsPassed = true;
  let testsOutput = '';
  let buildPassed = true;
  let buildOutput = '';
  let testsRan = false;
  let buildRan = false;

  // Ensure dependencies are installed before running tests/build
  if (!options.skipDependencyCheck) {
    const depResult = ensureDependenciesInstalled(workingDir);
    if (depResult.error) {
      return {
        passed: false,
        failures: 0,
        timestamp,
        testsOutput: '',
        buildOutput: depResult.error,
      };
    }
  }

  // Run build first - tests require successful compilation
  if (options.runBuild) {
    buildRan = true;
    const buildResult = await options.runBuild(workingDir, buildTimeout);
    buildPassed = buildResult.success;
    buildOutput = buildResult.output;
  } else if (config.buildCommand) {
    buildRan = true;
    const buildResult = await runCommandAsync(config.buildCommand, workingDir, buildTimeout);
    buildPassed = buildResult.success;
    buildOutput = buildResult.output;
  }

  // Short-circuit: Don't run tests if build failed
  if (buildRan && !buildPassed) {
    return {
      passed: false,
      failures: 0,
      timestamp,
      testsOutput: 'Build failed - skipping tests. Fix TypeScript errors first.',
      buildOutput,
    };
  }

  // Run tests only after successful build (or when no build command exists)
  if (options.runTests) {
    testsRan = true;
    const testResult = await options.runTests(workingDir, testTimeout);
    testsPassed = testResult.success;
    testsOutput = testResult.output;
  } else if (config.testCommand) {
    testsRan = true;
    const testResult = await runCommandAsync(config.testCommand, workingDir, testTimeout);
    testsPassed = testResult.success;
    testsOutput = testResult.output;
  }

  const failures = testsPassed ? 0 : extractFailureCount(testsOutput);

  let passed: boolean;
  if (requirePassingTests) {
    passed = (!testsRan || testsPassed) && (!buildRan || buildPassed);
  } else {
    passed = !buildRan || buildPassed;
  }

  return {
    passed,
    failures,
    timestamp,
    testsOutput,
    buildOutput,
  };
}
