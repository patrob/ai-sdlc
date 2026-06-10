import fs from 'fs';
import path from 'path';

/**
 * Security: Validate Git branch name to prevent command injection
 * Only allows alphanumeric characters, hyphens, underscores, and forward slashes
 */
export function validateGitBranchName(branchName: string): boolean {
  return /^[a-zA-Z0-9/_-]+$/.test(branchName);
}

/**
 * Security: Escape shell arguments for safe use in commands
 * For use with execSync when shell execution is required
 */
export function escapeShellArg(arg: string): string {
  // Replace single quotes with '\'' and wrap in single quotes
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

/**
 * Security: Validate and normalize working directory path
 * Prevents path traversal attacks
 */
export function validateWorkingDirectory(workingDir: string): void {
  // Normalize the path
  const normalized = path.resolve(workingDir);

  // Check if it's an absolute path
  if (!path.isAbsolute(normalized)) {
    throw new Error(`Invalid working directory: must be absolute path (got: ${workingDir})`);
  }

  // Check for path traversal patterns
  if (workingDir.includes('../') || workingDir.includes('..\\')) {
    throw new Error(`Invalid working directory: path traversal detected (${workingDir})`);
  }

  // Verify directory exists
  if (!fs.existsSync(normalized)) {
    throw new Error(`Invalid working directory: does not exist (${normalized})`);
  }

  // Verify it's actually a directory
  if (!fs.statSync(normalized).isDirectory()) {
    throw new Error(`Invalid working directory: not a directory (${normalized})`);
  }
}

/**
 * Security: Sanitize error messages to prevent information leakage
 * Removes absolute paths, environment details, and stack traces
 */
export function sanitizeErrorMessage(message: string, workingDir: string): string {
  let sanitized = message;

  // Replace absolute paths with [PROJECT_ROOT]
  const normalizedWorkingDir = path.resolve(workingDir);
  sanitized = sanitized.replace(new RegExp(normalizedWorkingDir, 'g'), '[PROJECT_ROOT]');

  // Remove home directory paths
  if (process.env.HOME) {
    sanitized = sanitized.replace(new RegExp(process.env.HOME, 'g'), '~');
  }

  // Strip stack traces (keep only first line of error)
  const lines = sanitized.split('\n');
  if (lines.length > 3) {
    sanitized = lines.slice(0, 3).join('\n') + '\n... (stack trace removed)';
  }

  return sanitized;
}

/**
 * Security: Sanitize command output before display
 * Strips ANSI codes, control characters, and potential secrets
 */
export function sanitizeCommandOutput(output: string): string {
  let sanitized = output;

  // Strip ANSI escape codes
  sanitized = sanitized.replace(/\x1b\[[0-9;]*m/g, '');

  // Strip other control characters except newlines and tabs
  sanitized = sanitized.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '');

  // Redact potential secrets (basic patterns)
  // API keys: long alphanumeric strings after key= or token=
  sanitized = sanitized.replace(/(api[_-]?key|token|password|secret)[\s=:]+[a-zA-Z0-9_-]{20,}/gi, '$1=[REDACTED]');

  return sanitized;
}
