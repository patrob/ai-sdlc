import { spawnSync } from 'child_process';

import { validateWorkingDirectory } from './security.js';

/**
 * Status of a single CI check
 */
export interface CheckStatus {
  name: string;
  state: 'PENDING' | 'SUCCESS' | 'FAILURE' | 'ERROR' | 'SKIPPED' | null;
}

/**
 * Result of waiting for CI checks
 */
export interface WaitForChecksResult {
  allPassed: boolean;
  checks: CheckStatus[];
  timedOut: boolean;
  error?: string;
}

/**
 * Options for waiting for CI checks
 */
export interface WaitForChecksOptions {
  timeout?: number; // ms, default 600000 (10 min)
  pollingInterval?: number; // ms, default 10000 (10 sec)
  requireAllChecksPassing?: boolean; // default true
}

/**
 * Wait for CI checks to complete on a pull request
 *
 * @param prUrl - URL or number of the pull request
 * @param workingDir - Working directory for git commands
 * @param options - Timeout and polling options
 * @returns Result indicating whether all checks passed
 */
export async function waitForChecks(
  prUrl: string,
  workingDir: string,
  options?: WaitForChecksOptions
): Promise<WaitForChecksResult> {
  const timeout = options?.timeout ?? 600000; // 10 minutes
  const pollingInterval = options?.pollingInterval ?? 10000; // 10 seconds
  const requireAllChecksPassing = options?.requireAllChecksPassing ?? true;

  // Security: Validate working directory
  validateWorkingDirectory(workingDir);

  // Extract PR number from URL if needed
  const prMatch = prUrl.match(/\/pull\/(\d+)/);
  const prIdentifier = prMatch ? prMatch[1] : prUrl;

  // Security: Validate PR identifier (should be numeric or a valid URL)
  if (!/^\d+$/.test(prIdentifier) && !prUrl.startsWith('https://')) {
    return {
      allPassed: false,
      checks: [],
      timedOut: false,
      error: `Invalid PR identifier: ${prUrl}`,
    };
  }

  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    try {
      // Use gh pr checks to get check status (state contains SUCCESS/FAILURE/PENDING/SKIPPED)
      const result = spawnSync('gh', ['pr', 'checks', prIdentifier, '--json', 'name,state'], {
        cwd: workingDir,
        encoding: 'utf-8',
        timeout: 30000, // 30 second timeout for the command
      });

      if (result.error) {
        // gh CLI might not be available or authenticated
        return {
          allPassed: false,
          checks: [],
          timedOut: false,
          error: `gh CLI error: ${result.error.message}`,
        };
      }

      if (result.status !== 0) {
        const stderr = result.stderr?.trim() || '';
        // If no checks exist, that's OK
        if (stderr.includes('no checks') || stderr.includes('No checks')) {
          return {
            allPassed: true,
            checks: [],
            timedOut: false,
          };
        }
        return {
          allPassed: false,
          checks: [],
          timedOut: false,
          error: `gh pr checks failed: ${stderr}`,
        };
      }

      const checksOutput = result.stdout?.trim() || '[]';
      let checks: CheckStatus[] = [];

      try {
        checks = JSON.parse(checksOutput);
      } catch {
        return {
          allPassed: false,
          checks: [],
          timedOut: false,
          error: `Failed to parse checks output: ${checksOutput.slice(0, 200)}`,
        };
      }

      // If no checks, consider it passed
      if (checks.length === 0) {
        return {
          allPassed: true,
          checks: [],
          timedOut: false,
        };
      }

      // Check if all checks are complete
      const pendingChecks = checks.filter(c => c.state === 'PENDING' || c.state === null);

      if (pendingChecks.length === 0) {
        // All checks are complete
        const failedChecks = checks.filter(c =>
          c.state === 'FAILURE' || c.state === 'ERROR'
        );

        if (requireAllChecksPassing && failedChecks.length > 0) {
          return {
            allPassed: false,
            checks,
            timedOut: false,
            error: `${failedChecks.length} check(s) failed: ${failedChecks.map(c => c.name).join(', ')}`,
          };
        }

        return {
          allPassed: true,
          checks,
          timedOut: false,
        };
      }

      // Still pending, wait and poll again
      await new Promise(resolve => setTimeout(resolve, pollingInterval));
    } catch (error) {
      return {
        allPassed: false,
        checks: [],
        timedOut: false,
        error: `Error checking PR status: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  // Timed out waiting for checks
  return {
    allPassed: false,
    checks: [],
    timedOut: true,
    error: `Timed out after ${timeout}ms waiting for CI checks to complete`,
  };
}

/**
 * Result of merging a pull request
 */
export interface MergePullRequestResult {
  success: boolean;
  merged: boolean;
  mergeSha?: string;
  error?: string;
}

/**
 * Options for merging a pull request
 */
export interface MergePullRequestOptions {
  strategy?: 'squash' | 'merge' | 'rebase'; // default 'squash'
  deleteBranchAfterMerge?: boolean; // default true
}

/**
 * Merge a pull request using the GitHub CLI
 *
 * @param prUrl - URL or number of the pull request
 * @param workingDir - Working directory for git commands
 * @param options - Merge strategy and cleanup options
 * @returns Result indicating success/failure and merge SHA
 */
export async function mergePullRequest(
  prUrl: string,
  workingDir: string,
  options?: MergePullRequestOptions
): Promise<MergePullRequestResult> {
  const strategy = options?.strategy ?? 'squash';
  const deleteBranchAfterMerge = options?.deleteBranchAfterMerge ?? true;

  // Security: Validate working directory
  validateWorkingDirectory(workingDir);

  // Extract PR number from URL if needed
  const prMatch = prUrl.match(/\/pull\/(\d+)/);
  const prIdentifier = prMatch ? prMatch[1] : prUrl;

  // Security: Validate PR identifier (should be numeric or a valid URL)
  if (!/^\d+$/.test(prIdentifier) && !prUrl.startsWith('https://')) {
    return {
      success: false,
      merged: false,
      error: `Invalid PR identifier: ${prUrl}`,
    };
  }

  // Security: Validate strategy
  const validStrategies = ['squash', 'merge', 'rebase'];
  if (!validStrategies.includes(strategy)) {
    return {
      success: false,
      merged: false,
      error: `Invalid merge strategy: ${strategy}`,
    };
  }

  try {
    // Build merge command arguments
    const args = ['pr', 'merge', prIdentifier, `--${strategy}`];

    if (deleteBranchAfterMerge) {
      args.push('--delete-branch');
    }

    // Add auto flag to avoid interactive prompts
    args.push('--auto');

    const result = spawnSync('gh', args, {
      cwd: workingDir,
      encoding: 'utf-8',
      timeout: 60000, // 60 second timeout
    });

    if (result.error) {
      return {
        success: false,
        merged: false,
        error: `gh CLI error: ${result.error.message}`,
      };
    }

    if (result.status !== 0) {
      const stderr = result.stderr?.trim() || '';

      // Check for common error conditions
      if (stderr.includes('already merged') || stderr.includes('Pull request #')) {
        // Already merged is not an error
        return {
          success: true,
          merged: true,
        };
      }

      if (stderr.includes('conflict')) {
        return {
          success: false,
          merged: false,
          error: `Merge conflict detected. Manual intervention required.`,
        };
      }

      if (stderr.includes('review') || stderr.includes('approved')) {
        return {
          success: false,
          merged: false,
          error: `PR requires review approval before merging.`,
        };
      }

      if (stderr.includes('check') || stderr.includes('status')) {
        return {
          success: false,
          merged: false,
          error: `CI checks must pass before merging.`,
        };
      }

      return {
        success: false,
        merged: false,
        error: `Merge failed: ${stderr}`,
      };
    }

    // Try to extract merge SHA from output
    const output = result.stdout?.trim() || '';
    const shaMatch = output.match(/merged\s+(?:via|to|into)\s+(\w+)/i) || output.match(/([a-f0-9]{40})/);
    const mergeSha = shaMatch ? shaMatch[1] : undefined;

    // If merge was successful, try to get the actual merge SHA from the PR
    let actualMergeSha = mergeSha;
    if (!actualMergeSha) {
      try {
        const prInfoResult = spawnSync('gh', ['pr', 'view', prIdentifier, '--json', 'mergeCommit'], {
          cwd: workingDir,
          encoding: 'utf-8',
          timeout: 10000,
        });
        if (prInfoResult.status === 0 && prInfoResult.stdout) {
          const prInfo = JSON.parse(prInfoResult.stdout);
          if (prInfo.mergeCommit?.oid) {
            actualMergeSha = prInfo.mergeCommit.oid;
          }
        }
      } catch {
        // Ignore errors getting merge SHA - merge still succeeded
      }
    }

    return {
      success: true,
      merged: true,
      mergeSha: actualMergeSha,
    };
  } catch (error) {
    return {
      success: false,
      merged: false,
      error: `Error merging PR: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
