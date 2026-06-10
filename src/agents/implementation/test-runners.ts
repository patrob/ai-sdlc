/**
 * Test execution and commit utilities
 */

import { spawn, spawnSync } from 'child_process';
import path from 'path';
import { ProcessManager } from '../../core/process-manager.js';
import { parseCommand, getTestCommand, buildSingleTestCommand } from '../../core/command-discovery.js';

/**
 * Run a single test file and return pass/fail result
 */
export async function runSingleTest(
  testFile: string,
  workingDir: string,
  testTimeout: number
): Promise<{ passed: boolean; output: string }> {
  return new Promise((resolve) => {
    const outputChunks: string[] = [];
    let killed = false;

    // Discover test command from project configuration
    const baseTestCommand = getTestCommand(workingDir);
    const singleTestCommand = buildSingleTestCommand(baseTestCommand, testFile);
    const { executable, args } = parseCommand(singleTestCommand);

    const child = spawn(executable, args, {
      cwd: workingDir,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    ProcessManager.getInstance().registerChild(child);

    const timeoutId = setTimeout(() => {
      killed = true;
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 5000);
    }, testTimeout);

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
          passed: false,
          output: output + `\n[Command timed out after ${Math.round(testTimeout / 1000)} seconds]`,
        });
      } else {
        resolve({
          passed: code === 0,
          output,
        });
      }
    });

    child.on('error', (error) => {
      clearTimeout(timeoutId);
      resolve({
        passed: false,
        output: outputChunks.join('') + `\n[Command error: ${error.message}]`,
      });
    });
  });
}

/**
 * Run all tests and return pass/fail result
 */
export async function runAllTests(
  workingDir: string,
  testTimeout: number
): Promise<{ passed: boolean; output: string }> {
  return new Promise((resolve) => {
    const outputChunks: string[] = [];
    let killed = false;

    // Discover test command from project configuration
    const testCommand = getTestCommand(workingDir);
    const { executable, args } = parseCommand(testCommand);

    const child = spawn(executable, args, {
      cwd: workingDir,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    ProcessManager.getInstance().registerChild(child);

    const timeoutId = setTimeout(() => {
      killed = true;
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 5000);
    }, testTimeout);

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
          passed: false,
          output: output + `\n[Command timed out after ${Math.round(testTimeout / 1000)} seconds]`,
        });
      } else {
        resolve({
          passed: code === 0,
          output,
        });
      }
    });

    child.on('error', (error) => {
      clearTimeout(timeoutId);
      resolve({
        passed: false,
        output: outputChunks.join('') + `\n[Command error: ${error.message}]`,
      });
    });
  });
}

/**
 * Security: Escape shell arguments for safe use in commands
 * For use with execSync when shell execution is required
 */
function escapeShellArg(arg: string): string {
  // Replace single quotes with '\'' and wrap in single quotes
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

/**
 * Validate working directory path for safety
 * @param workingDir The working directory path to validate
 * @throws Error if path contains shell metacharacters or traversal attempts
 */
export function validateWorkingDir(workingDir: string): void {
  // Check for shell metacharacters that could be used in command injection
  if (/[;&|`$()<>]/.test(workingDir)) {
    throw new Error('Invalid working directory: contains shell metacharacters');
  }

  // Prevent path traversal attempts
  const normalizedPath = path.normalize(workingDir);
  if (normalizedPath.includes('..')) {
    throw new Error('Invalid working directory: path traversal attempt detected');
  }
}

/**
 * Validate branch name for safety
 * @param branchName The branch name to validate
 * @throws Error if branch name contains invalid characters
 */
export function validateBranchName(branchName: string): void {
  // Git branch names must match safe pattern (alphanumeric, dash, slash, underscore)
  if (!/^[a-zA-Z0-9_/-]+$/.test(branchName)) {
    throw new Error('Invalid branch name: contains unsafe characters');
  }
}

/**
 * Commit changes if all tests pass
 *
 * @param workingDir - The working directory for git operations
 * @param message - The commit message
 * @param testTimeout - Timeout for running tests
 * @param testRunner - Optional test runner for dependency injection (defaults to runAllTests)
 * @returns Object indicating whether commit was made and reason if not
 */
export async function commitIfAllTestsPass(
  workingDir: string,
  message: string,
  testTimeout: number,
  testRunner: typeof runAllTests = runAllTests
): Promise<{ committed: boolean; reason?: string }> {
  try {
    // Security: Validate working directory before use
    validateWorkingDir(workingDir);

    // Check for uncommitted changes using spawn with shell: false
    const statusResult = spawnSync('git', ['status', '--porcelain'], {
      cwd: workingDir,
      encoding: 'utf-8',
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    if (statusResult.status !== 0 || !statusResult.stdout || !(statusResult.stdout as string).trim()) {
      return { committed: false, reason: 'nothing to commit' };
    }

    // Run FULL test suite
    const testResult = await testRunner(workingDir, testTimeout);
    if (!testResult.passed) {
      return { committed: false, reason: 'tests failed' };
    }

    // Commit changes using spawn with shell: false
    const addResult = spawnSync('git', ['add', '-A'], {
      cwd: workingDir,
      shell: false,
      stdio: 'pipe',
    });

    if (addResult.status !== 0) {
      throw new Error(`git add failed: ${addResult.stderr}`);
    }

    const commitResult = spawnSync('git', ['commit', '-m', message], {
      cwd: workingDir,
      shell: false,
      stdio: 'pipe',
    });

    if (commitResult.status !== 0) {
      throw new Error(`git commit failed: ${commitResult.stderr}`);
    }

    return { committed: true };
  } catch (error) {
    // Re-throw git errors for caller to handle
    throw error;
  }
}
