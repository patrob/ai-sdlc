import { spawnSync } from 'child_process';

const DEFAULT_PROTECTED_BRANCHES = ['main', 'master'];

export interface GitValidationOptions {
  skipCleanCheck?: boolean;
  skipBranchCheck?: boolean;
  skipRemoteCheck?: boolean;
  protectedBranches?: string[];
}

export interface GitValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  currentBranch?: string;
}

export function isCleanWorkingDirectory(workingDir: string): boolean {
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
  return output.trim() === '';
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

export function validateGitState(
  workingDir: string,
  options: GitValidationOptions = {}
): GitValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const protectedBranches = options.protectedBranches || DEFAULT_PROTECTED_BRANCHES;

  if (!options.skipCleanCheck && !isCleanWorkingDirectory(workingDir)) {
    errors.push('Working directory has uncommitted changes. Commit or stash your changes first.');
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
