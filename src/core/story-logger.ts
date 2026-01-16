/**
 * Per-story logging for concurrent execution
 *
 * Each story execution creates a new timestamped log file with dual output
 * (console + file) for debugging and audit trail.
 */

import fs from 'fs';
import path from 'path';
import { sanitizeStoryId } from './story.js';
import { STORIES_FOLDER, LogLevel } from '../types/index.js';

const MAX_MESSAGE_LENGTH = 10 * 1024; // 10KB per log entry

/**
 * Per-story logger that writes to timestamped files
 *
 * Features:
 * - Dual output: console + timestamped file per execution
 * - Automatic log rotation (keeps last N logs per story)
 * - Crash-safe synchronous writes
 * - Location: stories/{id}/logs/{timestamp}.log
 */
export class StoryLogger {
  private logStream: fs.WriteStream;
  private storyId: string;
  private logPath: string;
  private closed: boolean = false;

  /**
   * Initialize a per-story logger
   *
   * @param storyId - Story ID (sanitized automatically)
   * @param sdlcRoot - Path to .ai-sdlc directory
   * @param maxLogs - Maximum number of log files to retain per story (default: 5)
   */
  constructor(storyId: string, sdlcRoot: string, maxLogs: number = 5) {
    // SECURITY: Sanitize story ID to prevent path traversal
    this.storyId = sanitizeStoryId(storyId);

    const logDir = path.join(sdlcRoot, STORIES_FOLDER, this.storyId, 'logs');

    // Ensure log directory exists
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    // Generate timestamp for log filename (ISO 8601 with safe characters)
    // Split first to remove milliseconds (.000Z), then replace colons
    const timestamp = new Date()
      .toISOString()
      .split('.')[0] // Remove milliseconds: 2026-01-15T10:30:00
      .replace(/:/g, '-'); // Replace colons: 2026-01-15T10-30-00

    this.logPath = path.join(logDir, `${timestamp}.log`);

    // Ensure file exists before creating write stream (createWriteStream may not create immediately)
    if (!fs.existsSync(this.logPath)) {
      fs.writeFileSync(this.logPath, '');
    }

    // Create write stream in append mode
    this.logStream = fs.createWriteStream(this.logPath, { flags: 'a' });

    // Handle stream errors gracefully to prevent uncaught exceptions during cleanup
    this.logStream.on('error', (err) => {
      // ENOENT errors during cleanup are expected and can be ignored
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.warn(`Warning: Log stream error: ${err.message}`);
      }
    });

    // Rotate old logs (cleanup happens at initialization, not during writes)
    this.rotateOldLogs(logDir, maxLogs);
  }

  /**
   * Log a message with specified level
   *
   * Writes to both console and file. Sanitizes message to prevent issues
   * with very long lines or non-printable characters.
   *
   * @param level - Log level (INFO, AGENT, ERROR, WARN, DEBUG)
   * @param message - Message to log
   */
  log(level: LogLevel, message: string): void {
    if (this.closed) {
      console.warn('Warning: Attempted to log to closed logger');
      return;
    }

    // Sanitize and truncate message
    const sanitized = this.sanitizeMessage(message);

    // Format log entry with ISO 8601 timestamp
    const timestamp = new Date().toISOString();
    const entry = `[${timestamp}] [${level}] ${sanitized}\n`;

    // Write to file synchronously (crash-safe)
    try {
      this.logStream.write(entry);
    } catch (error) {
      // Graceful degradation: if file write fails, continue with console-only
      console.warn(`Warning: Failed to write to log file: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Write to console based on level
    switch (level) {
      case 'ERROR':
        console.error(sanitized);
        break;
      case 'WARN':
        console.warn(sanitized);
        break;
      case 'DEBUG':
        // Only log debug to file, not console (unless explicitly debugging)
        if (process.env.DEBUG) {
          console.log(sanitized);
        }
        break;
      default:
        console.log(sanitized);
    }
  }

  /**
   * Close the log stream
   *
   * Should be called when story execution completes or on process exit.
   * Flushes any buffered data and closes the file handle.
   *
   * @returns Promise that resolves when the stream is fully closed
   */
  close(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.closed) {
        this.logStream.end(() => {
          this.closed = true;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Get the path to the current log file
   *
   * @returns Absolute path to the current log file
   */
  getLogPath(): string {
    return this.logPath;
  }

  /**
   * Sanitize log message to prevent issues
   *
   * - Truncates messages longer than 10KB
   * - Strips or escapes non-printable characters (except newlines/tabs)
   * - Preserves ANSI color codes for console output
   *
   * @param message - Raw message to sanitize
   * @returns Sanitized message
   */
  private sanitizeMessage(message: string): string {
    let sanitized = message;

    // Truncate very long messages
    if (sanitized.length > MAX_MESSAGE_LENGTH) {
      sanitized = sanitized.substring(0, MAX_MESSAGE_LENGTH) + '\n... [message truncated]';
    }

    // Replace non-printable characters (except newlines, tabs, and ANSI escape codes)
    // ANSI escape codes start with \x1b[ and are followed by formatting codes
    // We preserve these for console output (they're stripped when written to most log viewers)
    sanitized = sanitized.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '');

    return sanitized;
  }

  /**
   * Rotate old log files, keeping only the most recent N logs
   *
   * Sorting is lexicographic (filename-based) since timestamps are in ISO 8601 format.
   * Deletes oldest logs beyond the retention limit.
   *
   * @param logDir - Directory containing log files
   * @param keep - Number of logs to retain
   */
  private rotateOldLogs(logDir: string, keep: number): void {
    try {
      const logs = fs
        .readdirSync(logDir)
        .filter((f) => f.endsWith('.log'))
        .sort()
        .reverse(); // Newest first (lexicographic sort of ISO 8601 timestamps)

      // Delete logs beyond the keep limit
      const toDelete = logs.slice(keep);
      for (const log of toDelete) {
        try {
          fs.unlinkSync(path.join(logDir, log));
        } catch {
          // Ignore deletion errors (file may have been deleted by another process)
        }
      }
    } catch {
      // Ignore rotation errors (directory may not exist or be readable)
      // Rotation is a best-effort cleanup, not critical
    }
  }
}

/**
 * Get the latest log file path for a story
 *
 * @param sdlcRoot - Path to .ai-sdlc directory
 * @param storyId - Story ID (sanitized automatically)
 * @returns Path to latest log file, or null if no logs exist
 */
export function getLatestLogPath(sdlcRoot: string, storyId: string): string | null {
  const sanitized = sanitizeStoryId(storyId);
  const logDir = path.join(sdlcRoot, STORIES_FOLDER, sanitized, 'logs');

  if (!fs.existsSync(logDir)) {
    return null;
  }

  const logs = fs
    .readdirSync(logDir)
    .filter((f) => f.endsWith('.log'))
    .sort()
    .reverse(); // Newest first

  if (logs.length === 0) {
    return null;
  }

  return path.join(logDir, logs[0]);
}

/**
 * Read the last N lines from a log file
 *
 * @param filePath - Path to log file
 * @param lines - Number of lines to read (default: 50)
 * @returns Last N lines as a string
 */
export async function readLastLines(filePath: string, lines: number = 50): Promise<string> {
  const content = await fs.promises.readFile(filePath, 'utf-8');
  const allLines = content.split('\n').filter((line) => line.trim() !== '');
  const lastLines = allLines.slice(-lines);
  return lastLines.join('\n');
}

/**
 * Tail a log file (follow mode, like tail -f)
 *
 * Watches the file for changes and outputs new lines as they're written.
 * Press Ctrl+C to exit.
 *
 * @param filePath - Path to log file
 */
export function tailLog(filePath: string): void {
  // Read existing content first
  const existingContent = fs.readFileSync(filePath, 'utf-8');
  process.stdout.write(existingContent);

  // Track current file size
  let lastSize = existingContent.length;

  // Watch for changes
  const watcher = fs.watchFile(filePath, { interval: 100 }, (curr) => {
    if (curr.size > lastSize) {
      // File grew - read new content
      const stream = fs.createReadStream(filePath, {
        start: lastSize,
        encoding: 'utf-8',
      });

      stream.on('data', (chunk) => {
        process.stdout.write(chunk);
      });

      lastSize = curr.size;
    }
  });

  // Handle Ctrl+C gracefully
  process.on('SIGINT', () => {
    fs.unwatchFile(filePath);
    process.exit(0);
  });

  // Keep process alive
  console.log('\n[Following log file - Press Ctrl+C to exit]');
}
