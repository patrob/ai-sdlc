import { Story } from '../types/index.js';
import { loadConfig } from '../core/config.js';
import { spawn } from 'child_process';

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
