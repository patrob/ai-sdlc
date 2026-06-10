import { spawn } from 'child_process';
import { ProcessManager } from '../../core/process-manager.js';
import type { Config } from '../../types/index.js';
import { DEFAULT_TIMEOUTS, loadConfig } from '../../core/config.js';
import { sanitizeErrorMessage } from './security.js';

/**
 * Result of running build/test commands
 */
export interface VerificationResult {
  buildPassed: boolean;
  buildOutput: string;
  testsPassed: boolean;
  testsOutput: string;
}

/**
 * Maximum size for test output before truncation (10KB)
 */
export const MAX_TEST_OUTPUT_SIZE = 10000;

/**
 * Progress callback for verification steps
 */
export type VerificationProgressCallback = (phase: 'build' | 'test', status: 'starting' | 'running' | 'passed' | 'failed', message?: string) => void;

/**
 * Run a command asynchronously with timeout and progress updates
 */
export async function runCommandAsync(
  command: string,
  workingDir: string,
  timeout: number,
  onProgress?: (output: string) => void
): Promise<{ success: boolean; output: string }> {
  return new Promise((resolve) => {
    const outputChunks: string[] = [];
    let killed = false;

    // Parse command into executable and args (simple split, handles most cases)
    const parts = command.match(/(?:[^\s"]+|"[^"]*")+/g) || [command];
    const executable = parts[0];
    const args = parts.slice(1).map(arg => arg.replace(/^"|"$/g, ''));

    // Security: Use spawn without shell to prevent command injection
    // Commands must be parseable as: executable + space-separated args
    const child = spawn(executable, args, {
      cwd: workingDir,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    ProcessManager.getInstance().registerChild(child);

    const timeoutId = setTimeout(() => {
      killed = true;
      child.kill('SIGTERM');
      // Force kill after 5 seconds if SIGTERM didn't work
      setTimeout(() => child.kill('SIGKILL'), 5000);
    }, timeout);

    child.stdout?.on('data', (data: Buffer) => {
      const text = data.toString();
      outputChunks.push(text);
      onProgress?.(text);
    });

    child.stderr?.on('data', (data: Buffer) => {
      const text = data.toString();
      outputChunks.push(text);
      onProgress?.(text);
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
      const sanitizedError = sanitizeErrorMessage(error.message, workingDir);
      resolve({
        success: false,
        output: outputChunks.join('') + `\n[Command error: ${sanitizedError}]`,
      });
    });
  });
}

/**
 * Run build and test commands before review (async version with progress)
 * Returns structured results that can be included in review context
 */
export async function runVerificationAsync(
  workingDir: string,
  config: Config,
  onProgress?: VerificationProgressCallback
): Promise<VerificationResult> {
  const result: VerificationResult = {
    buildPassed: true,
    buildOutput: '',
    testsPassed: true,
    testsOutput: '',
  };

  const buildTimeout = config.timeouts?.buildTimeout ?? DEFAULT_TIMEOUTS.buildTimeout;
  const testTimeout = config.timeouts?.testTimeout ?? DEFAULT_TIMEOUTS.testTimeout;

  // Run build command if configured
  if (config.buildCommand) {
    onProgress?.('build', 'starting', config.buildCommand);

    const buildResult = await runCommandAsync(
      config.buildCommand,
      workingDir,
      buildTimeout,
      (output) => onProgress?.('build', 'running', output)
    );

    result.buildPassed = buildResult.success;
    result.buildOutput = buildResult.output;
    onProgress?.('build', buildResult.success ? 'passed' : 'failed');
  }

  // Run test command if configured
  if (config.testCommand) {
    onProgress?.('test', 'starting', config.testCommand);

    const testResult = await runCommandAsync(
      config.testCommand,
      workingDir,
      testTimeout,
      (output) => onProgress?.('test', 'running', output)
    );

    result.testsPassed = testResult.success;
    result.testsOutput = testResult.output;
    onProgress?.('test', testResult.success ? 'passed' : 'failed');
  }

  return result;
}
