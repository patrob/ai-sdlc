import { spawnSync } from 'child_process';

const DEFAULT_PROTECTED_BRANCHES = ['main', 'master'];

export interface GitValidationOptions {
  skipCleanCheck?: boolean;
  skipBranchCheck?: boolean;
  skipRemoteCheck?: boolean;
  protectedBranches?: string[];
  /** Glob patterns to exclude from the clean working directory check */
  excludePatterns?: string[];
}

export interface GitValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  currentBranch?: string;
}

/**
 * Options for checking working directory cleanliness
 */
export interface CleanWorkingDirectoryOptions {
  /** Glob patterns to exclude from the check (e.g., '.ai-sdlc/**') */
  excludePatterns?: string[];
}

export function isCleanWorkingDirectory(
  workingDir: string,
  options: CleanWorkingDirectoryOptions = {}
): boolean {
  const result = spawnSync('git', ['status', '--porcelain'], {
    cwd: workingDir,
    encoding: 'utf-8',
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.status !== 0) {
    return false;
  }

  const output = result.stdout?.toString() || '';
  // Only trim trailing whitespace - leading spaces are significant in git status format
  const trimmedOutput = output.trimEnd();
  if (trimmedOutput === '') {
    return true;
  }

  // If no exclude patterns, any output means not clean
  if (!options.excludePatterns || options.excludePatterns.length === 0) {
    return false;
  }

  // Filter out excluded paths
  // Note: Don't trim entire output as leading spaces are part of git status format
  const lines = trimmedOutput.split('\n').filter((line) => line.length >= 3);
  const nonExcludedChanges = lines.filter((line) => {
    // Git status format: XY filename or XY "filename" for quoted paths
    // The status is the first 2 characters, then a space, then the path
    const filePath = line.substring(3).replace(/^"(.*)"$/, '$1');

    // Skip empty file paths (malformed lines)
    if (!filePath) {
      return false;
    }

    // Check if this path matches any exclude pattern
    for (const pattern of options.excludePatterns!) {
      if (matchesGlobPattern(filePath, pattern)) {
        return false; // Exclude this change
      }
    }
    return true; // Keep this change
  });

  return nonExcludedChanges.length === 0;
}

/**
 * Simple glob pattern matching for git paths
 * Supports ** for any depth and * for single directory segment
 */
function matchesGlobPattern(filePath: string, pattern: string): boolean {
  // Normalize path separators
  const normalizedPath = filePath.replace(/\\/g, '/');
  const normalizedPattern = pattern.replace(/\\/g, '/');

  // Convert glob pattern to regex
  // .ai-sdlc/** should match .ai-sdlc/anything
  const regexPattern = normalizedPattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&') // Escape special regex chars (except * and ?)
    .replace(/\*\*/g, '<<<DOUBLESTAR>>>') // Temporarily mark **
    .replace(/\*/g, '[^/]*') // * matches anything except /
    .replace(/<<<DOUBLESTAR>>>/g, '.*'); // ** matches anything including /

  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(normalizedPath);
}

export function hasUntrackedFiles(workingDir: string): boolean {
  const result = spawnSync('git', ['ls-files', '--others', '--exclude-standard'], {
    cwd: workingDir,
    encoding: 'utf-8',
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.status !== 0) {
    return false;
  }

  const output = result.stdout?.toString() || '';
  return output.trim() !== '';
}

export function getCurrentBranch(workingDir: string): string | null {
  const result = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
    cwd: workingDir,
    encoding: 'utf-8',
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.status !== 0) {
    return null;
  }

  return result.stdout?.toString().trim() || null;
}

export function isOnProtectedBranch(
  workingDir: string,
  protectedBranches: string[] = DEFAULT_PROTECTED_BRANCHES
): boolean {
  const branch = getCurrentBranch(workingDir);
  if (!branch) {
    return false;
  }

  return protectedBranches.includes(branch);
}

export function isLocalBehindRemote(workingDir: string): boolean {
  const fetchResult = spawnSync('git', ['fetch', '--dry-run'], {
    cwd: workingDir,
    encoding: 'utf-8',
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (fetchResult.status !== 0) {
    return false;
  }

  const revListResult = spawnSync(
    'git',
    ['rev-list', '--left-right', '--count', '@{upstream}...HEAD'],
    {
      cwd: workingDir,
      encoding: 'utf-8',
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );

  if (revListResult.status !== 0) {
    return false;
  }

  const output = revListResult.stdout?.toString().trim() || '';
  const [behind] = output.split('\t').map(Number);

  return behind > 0;
}

/**
 * Detect the base branch for the repository (main or master)
 *
 * @param workingDir - Working directory to check
 * @returns 'main' or 'master' depending on which exists
 * @throws Error if neither main nor master branch exists
 */
export function getBaseBranch(workingDir: string): string {
  // Check for 'main' first
  const mainResult = spawnSync('git', ['rev-parse', '--verify', 'main'], {
    cwd: workingDir,
    encoding: 'utf-8',
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (mainResult.status === 0) {
    return 'main';
  }

  // Check for 'master' as fallback
  const masterResult = spawnSync('git', ['rev-parse', '--verify', 'master'], {
    cwd: workingDir,
    encoding: 'utf-8',
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (masterResult.status === 0) {
    return 'master';
  }

  throw new Error('No base branch found. Expected "main" or "master" branch to exist.');
}

/**
 * Get the merge-base (common ancestor) between a base branch and HEAD
 *
 * This is useful for comparing all changes on a feature branch against the base branch,
 * rather than just comparing to the immediate parent commit (HEAD~1).
 *
 * @param workingDir - Working directory to check
 * @param baseBranch - Base branch name (e.g., 'main' or 'master')
 * @returns Commit SHA of the merge-base, or null if it cannot be determined
 */
export function getMergeBase(workingDir: string, baseBranch: string): string | null {
  try {
    const result = spawnSync('git', ['merge-base', baseBranch, 'HEAD'], {
      cwd: workingDir,
      encoding: 'utf-8',
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    if (result.status !== 0) {
      return null;
    }

    const output = result.stdout?.toString().trim() || '';
    return output || null;
  } catch {
    return null;
  }
}

export function validateGitState(
  workingDir: string,
  options: GitValidationOptions = {}
): GitValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const protectedBranches = options.protectedBranches || DEFAULT_PROTECTED_BRANCHES;

  if (!options.skipCleanCheck) {
    const cleanOptions: CleanWorkingDirectoryOptions = options.excludePatterns
      ? { excludePatterns: options.excludePatterns }
      : {};
    if (!isCleanWorkingDirectory(workingDir, cleanOptions)) {
      errors.push('Working directory has uncommitted changes. Commit or stash your changes first.');
    }
  }

  if (hasUntrackedFiles(workingDir)) {
    warnings.push('There are untracked files that may conflict with implementation.');
  }

  const currentBranch = getCurrentBranch(workingDir);

  if (!options.skipBranchCheck && currentBranch && protectedBranches.includes(currentBranch)) {
    errors.push(`Cannot run on protected branch "${currentBranch}". Create a feature branch first.`);
  }

  if (!options.skipRemoteCheck && isLocalBehindRemote(workingDir)) {
    errors.push('Local branch is behind remote. Pull latest changes first: git pull');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    currentBranch: currentBranch || undefined,
  };
}
