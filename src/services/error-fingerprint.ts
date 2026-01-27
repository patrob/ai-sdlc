/**
 * Error Fingerprinting Service
 *
 * Detects when identical errors repeat during implementation retries.
 * Prevents wasted cycles by blocking early when the same error occurs N times.
 *
 * Key insight from S-0038: The system kept retrying with the same failing tests
 * (wrong mock module path) because each retry produced identical errors but
 * no mechanism detected "same error repeating".
 *
 * This service:
 * 1. Normalizes error output (removes timestamps, ANSI codes, line numbers)
 * 2. Generates SHA256 fingerprints of normalized errors
 * 3. Tracks consecutive identical errors
 * 4. Triggers early blocking when threshold is reached
 */

import { createHash } from 'crypto';
import { ErrorFingerprint } from '../types/index.js';

/**
 * Result of checking for identical errors
 */
export interface IdenticalErrorCheck {
  /** Whether the current error matches a recent error */
  isIdentical: boolean;
  /** Number of consecutive times this exact error has occurred */
  consecutiveCount: number;
  /** The fingerprint hash of the current error */
  currentHash: string;
  /** Preview of the error for diagnostics */
  errorPreview: string;
}

/**
 * Default threshold for identical errors before early blocking
 */
export const DEFAULT_IDENTICAL_ERROR_THRESHOLD = 3;

/**
 * Normalize error output for fingerprinting.
 *
 * Removes or normalizes:
 * - ANSI escape sequences (colors, cursor movement)
 * - Timestamps (ISO, Unix, various formats)
 * - Absolute file paths (normalize to relative)
 * - Line numbers in stack traces (they shift with code changes)
 * - Process IDs and memory addresses
 * - Random/generated identifiers
 *
 * @param errorOutput - Raw error output from tests or build
 * @returns Normalized string suitable for hashing
 */
export function normalizeErrorOutput(errorOutput: string): string {
  if (!errorOutput) return '';

  let normalized = errorOutput
    // Remove ANSI CSI sequences (colors, styles)
    .replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '')
    // Remove ANSI OSC sequences (hyperlinks, window titles)
    .replace(/\x1B\][^\x07\x1B]*(\x07|\x1B\\)/g, '')
    // Remove standalone escape characters
    .replace(/\x1B/g, '')
    // Normalize UUIDs FIRST (before epoch/date patterns that would partially match)
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<UUID>')
    // Normalize timestamps: ISO 8601 format
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?/g, '<TIMESTAMP>')
    // Normalize timestamps: Unix epoch (10+ digits)
    .replace(/\b\d{10,13}\b/g, '<EPOCH>')
    // Normalize timestamps: Common date formats (YYYY-MM-DD, MM/DD/YYYY, etc.)
    .replace(/\b\d{4}[-/]\d{2}[-/]\d{2}\b/g, '<DATE>')
    .replace(/\b\d{2}[-/]\d{2}[-/]\d{4}\b/g, '<DATE>')
    // Normalize time: HH:MM:SS with optional milliseconds
    .replace(/\b\d{2}:\d{2}:\d{2}(\.\d+)?\b/g, '<TIME>')
    // Normalize /tmp paths BEFORE more general absolute paths
    .replace(/\/tmp\/[^\s:)]+/g, '<TMP_PATH>')
    // Normalize absolute paths (Unix) - but not /tmp (already handled above)
    .replace(/\/(?:Users|home|var|private)\/[^\s:)]+/g, '<ABS_PATH>')
    // Normalize absolute paths (Windows)
    .replace(/[A-Z]:\\[^\s:)]+/gi, '<ABS_PATH>')
    // Normalize line:column numbers in error locations (file.ts:123:45)
    .replace(/:\d+:\d+/g, ':<LINE>:<COL>')
    // Normalize standalone line numbers at end of path (file.ts:123)
    .replace(/:\d+(?=\s|$|\)|\])/g, ':<LINE>')
    // Normalize stack trace line numbers
    .replace(/at line \d+/gi, 'at line <LINE>')
    // Normalize memory addresses (0x1234abcd)
    .replace(/0x[0-9a-fA-F]+/g, '<ADDR>')
    // Normalize process IDs (pid: 12345)
    .replace(/\bpid[:\s]+\d+/gi, 'pid: <PID>')
    // Normalize node_modules paths (keep package name, remove version specifics)
    .replace(/node_modules\/(?:@[^/]+\/)?[^/]+\/[^\s:)]+/g, '<NODE_MODULE>')
    // Collapse multiple whitespace to single space
    .replace(/\s+/g, ' ')
    // Trim
    .trim();

  return normalized;
}

/**
 * Generate a SHA256 fingerprint hash from normalized error output.
 *
 * @param errorOutput - Raw error output (will be normalized)
 * @returns SHA256 hex hash of normalized output
 */
export function generateErrorFingerprint(errorOutput: string): string {
  const normalized = normalizeErrorOutput(errorOutput);
  return createHash('sha256').update(normalized).digest('hex');
}

/**
 * Extract a human-readable preview of the error.
 * Takes the first meaningful line(s) up to 200 characters.
 *
 * @param errorOutput - Raw error output
 * @returns First 200 chars of meaningful error content
 */
export function extractErrorPreview(errorOutput: string): string {
  if (!errorOutput) return '';

  // Remove ANSI codes for readable preview
  let cleaned = errorOutput
    .replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '')
    .replace(/\x1B\][^\x07\x1B]*(\x07|\x1B\\)/g, '')
    .replace(/\x1B/g, '');

  // Find the first line that looks like an error message
  const lines = cleaned.split('\n');
  const errorPatterns = [
    /error/i,
    /fail/i,
    /cannot find/i,
    /not found/i,
    /unexpected/i,
    /exception/i,
    /assert/i,
  ];

  let relevantLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Check if this line contains error indicators
    const isErrorLine = errorPatterns.some((p) => p.test(trimmed));

    if (isErrorLine || relevantLines.length > 0) {
      relevantLines.push(trimmed);
      // Capture up to 3 lines of context
      if (relevantLines.length >= 3) break;
    }
  }

  // If no error lines found, use first non-empty lines
  if (relevantLines.length === 0) {
    relevantLines = lines
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .slice(0, 3);
  }

  const preview = relevantLines.join(' | ');
  return preview.length > 200 ? preview.substring(0, 197) + '...' : preview;
}

/**
 * Check if the current error matches recent errors and track consecutive count.
 *
 * @param currentError - Current error output to check
 * @param history - Array of previous error fingerprints
 * @param threshold - Number of consecutive identical errors to trigger early blocking (default: 3)
 * @returns Check result with isIdentical flag and consecutive count
 */
export function checkForIdenticalErrors(
  currentError: string,
  history: ErrorFingerprint[],
  threshold: number = DEFAULT_IDENTICAL_ERROR_THRESHOLD
): IdenticalErrorCheck {
  const currentHash = generateErrorFingerprint(currentError);
  const errorPreview = extractErrorPreview(currentError);

  if (!history || history.length === 0) {
    return {
      isIdentical: false,
      consecutiveCount: 1,
      currentHash,
      errorPreview,
    };
  }

  // Find the most recent fingerprint
  const lastFingerprint = history[history.length - 1];

  if (lastFingerprint.hash === currentHash) {
    // Same error as last time
    const newConsecutiveCount = lastFingerprint.consecutiveCount + 1;
    return {
      isIdentical: newConsecutiveCount >= threshold,
      consecutiveCount: newConsecutiveCount,
      currentHash,
      errorPreview,
    };
  }

  // Different error - reset consecutive count
  return {
    isIdentical: false,
    consecutiveCount: 1,
    currentHash,
    errorPreview,
  };
}

/**
 * Update error history with a new fingerprint.
 * Maintains a bounded history (last 10 entries) to prevent unbounded growth.
 *
 * @param history - Existing error history (will be modified)
 * @param check - Result from checkForIdenticalErrors
 * @returns Updated history array
 */
export function updateErrorHistory(
  history: ErrorFingerprint[],
  check: IdenticalErrorCheck
): ErrorFingerprint[] {
  const now = new Date().toISOString();
  const newHistory = [...(history || [])];

  // Check if we're updating an existing fingerprint or adding new
  if (newHistory.length > 0 && newHistory[newHistory.length - 1].hash === check.currentHash) {
    // Update existing - increment count and update lastSeen
    const last = newHistory[newHistory.length - 1];
    newHistory[newHistory.length - 1] = {
      ...last,
      lastSeen: now,
      consecutiveCount: check.consecutiveCount,
    };
  } else {
    // New error - add to history
    newHistory.push({
      hash: check.currentHash,
      firstSeen: now,
      lastSeen: now,
      consecutiveCount: 1,
      errorPreview: check.errorPreview,
    });
  }

  // Keep only last 10 entries
  if (newHistory.length > 10) {
    return newHistory.slice(-10);
  }

  return newHistory;
}

/**
 * Get the most common error from history.
 * Useful for generating diagnostics when blocking a story.
 *
 * @param history - Error fingerprint history
 * @returns The error preview with highest consecutive count, or empty string
 */
export function getMostCommonError(history: ErrorFingerprint[]): string {
  if (!history || history.length === 0) return '';

  // Find fingerprint with highest consecutive count
  let maxCount = 0;
  let mostCommon = '';

  for (const fp of history) {
    if (fp.consecutiveCount > maxCount) {
      maxCount = fp.consecutiveCount;
      mostCommon = fp.errorPreview;
    }
  }

  return mostCommon;
}

/**
 * Clear error history (e.g., after successful implementation).
 *
 * @returns Empty array
 */
export function clearErrorHistory(): ErrorFingerprint[] {
  return [];
}
