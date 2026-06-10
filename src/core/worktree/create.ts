import { spawnSync } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';

import { type WorktreeOptions } from './types.js';

/**
 * Lock file to package manager mapping
 */
const LOCK_FILE_TO_PM: Record<string, string> = {
  'package-lock.json': 'npm',
  'yarn.lock': 'yarn',
  'pnpm-lock.yaml': 'pnpm',
};

/**
 * Error messages
 */
const ERROR_MESSAGES = {
  INSTALL_FAILED: 'Failed to install dependencies',
  BUILD_FAILED: 'Failed to build project',
  PATH_EXISTS: 'Worktree path already exists',
  CREATE_FAILED: 'Failed to create worktree',
  BRANCH_EXISTS: 'A branch with this name already exists',
  NOT_GIT_REPO: 'Not a git repository',
} as const;

/**
 * Install npm dependencies in a worktree
 * Detects the package manager (npm/yarn/pnpm) and runs the appropriate install command
 * @param worktreePath - Path to the worktree
 * @throws Error if installation fails
 */
export function installDependencies(worktreePath: string): void {
  const packageJsonPath = path.join(worktreePath, 'package.json');

  // Skip if not a Node.js project
  if (!existsSync(packageJsonPath)) {
    return;
  }

  // Detect package manager from lock file
  let packageManager = 'npm'; // default
  for (const [lockFile, pm] of Object.entries(LOCK_FILE_TO_PM)) {
    if (existsSync(path.join(worktreePath, lockFile))) {
      packageManager = pm;
      break;
    }
  }

  // Run install command
  const result = spawnSync(packageManager, ['install'], {
    cwd: worktreePath,
    encoding: 'utf-8',
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 120000, // 2 minute timeout
  });

  if (result.status !== 0) {
    const stderr = result.stderr?.toString() || '';
    throw new Error(`${ERROR_MESSAGES.INSTALL_FAILED}: ${stderr}`);
  }
}

/**
 * Build the project in a worktree
 * Runs 'npm run build' if a build script exists in package.json
 * @param worktreePath - Path to the worktree
 * @throws Error if build fails
 */
export function buildProject(worktreePath: string): void {
  const packageJsonPath = path.join(worktreePath, 'package.json');

  // Skip if not a Node.js project
  if (!existsSync(packageJsonPath)) {
    return;
  }

  // Check if build script exists
  try {
    const packageJson = JSON.parse(
      require('fs').readFileSync(packageJsonPath, 'utf-8')
    );
    if (!packageJson.scripts?.build) {
      return; // No build script, skip
    }
  } catch {
    return; // Can't read package.json, skip
  }

  // Detect package manager from lock file
  let packageManager = 'npm'; // default
  for (const [lockFile, pm] of Object.entries(LOCK_FILE_TO_PM)) {
    if (existsSync(path.join(worktreePath, lockFile))) {
      packageManager = pm;
      break;
    }
  }

  // Run build command
  const result = spawnSync(packageManager, ['run', 'build'], {
    cwd: worktreePath,
    encoding: 'utf-8',
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 120000, // 2 minute timeout
  });

  if (result.status !== 0) {
    const stderr = result.stderr?.toString() || '';
    throw new Error(`${ERROR_MESSAGES.BUILD_FAILED}: ${stderr}`);
  }
}

/**
 * Create a new git worktree for isolated story execution
 * @param options - Worktree creation options
 * @param projectRoot - Path to project root
 * @param worktreePath - Path where worktree will be created
 * @param branchName - Branch name for worktree
 * @param baseBranch - Base branch to create worktree from
 * @param validateResume - Function to validate resume capability
 * @param existsCheck - Function to check if path exists
 * @returns The path to the created worktree
 * @throws Error if worktree creation fails
 */
export function createWorktree(
  options: WorktreeOptions,
  projectRoot: string,
  worktreePath: string,
  branchName: string,
  baseBranch: string,
  validateResume: (path: string, branch: string) => { canResume: boolean; issues: string[] },
  existsCheck: (path: string) => boolean
): string {
  // Check if worktree path already exists
  if (existsCheck(worktreePath)) {
    // If resumeIfExists is enabled, validate and return existing worktree
    if (options.resumeIfExists) {
      const validation = validateResume(worktreePath, branchName);
      if (validation.canResume) {
        // Worktree exists and is valid - return existing path
        return worktreePath;
      }
      // Worktree exists but cannot be resumed - throw with details
      throw new Error(`${ERROR_MESSAGES.PATH_EXISTS}: ${worktreePath} (cannot resume: ${validation.issues.join(', ')})`);
    }
    throw new Error(`${ERROR_MESSAGES.PATH_EXISTS}: ${worktreePath}`);
  }

  // Execute git worktree add command
  const result = spawnSync(
    'git',
    ['worktree', 'add', '-b', branchName, worktreePath, baseBranch],
    {
      cwd: projectRoot,
      encoding: 'utf-8',
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );

  // Handle errors
  if (result.status !== 0) {
    const stderr = result.stderr?.toString() || '';

    // Provide specific error messages for common failures
    if (stderr.includes('not a git repository')) {
      throw new Error(ERROR_MESSAGES.NOT_GIT_REPO);
    }
    if (stderr.includes('already exists')) {
      throw new Error(`${ERROR_MESSAGES.BRANCH_EXISTS}: ${branchName}`);
    }

    // Generic error with stderr details
    throw new Error(`${ERROR_MESSAGES.CREATE_FAILED}: ${stderr}`);
  }

  // Install dependencies in the new worktree
  installDependencies(worktreePath);

  return worktreePath;
}
