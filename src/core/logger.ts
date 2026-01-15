import fs from 'fs';
import path from 'path';
import { LogConfig } from '../types/index.js';

/**
 * Log entry structure for JSON Lines format
 */
export interface LogEntry {
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  category: string;
  message: string;
  data?: unknown;
}

/**
 * Log level priority for filtering
 */
const LOG_LEVEL_PRIORITY: Record<string, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * Rolling file logger for ai-sdlc operations
 *
 * Features:
 * - JSON Lines format (one JSON object per line)
 * - Rolling by size (configurable, default 10MB)
 * - Retains last N files (configurable, default 5)
 * - Location: .ai-sdlc/logs/ai-sdlc-YYYY-MM-DD.log
 */
export class Logger {
  private projectRoot: string;
  private config: LogConfig;
  private logDir: string;
  private currentLogFile: string | null = null;

  constructor(projectRoot: string, config: LogConfig) {
    this.projectRoot = projectRoot;
    this.config = config;
    this.logDir = path.join(projectRoot, '.ai-sdlc', 'logs');

    if (this.config.enabled) {
      this.ensureLogDirectory();
    }
  }

  /**
   * Ensure the log directory exists
   */
  private ensureLogDirectory(): void {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  /**
   * Get the current log file path based on today's date
   */
  private getCurrentLogFile(): string {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    return path.join(this.logDir, `ai-sdlc-${today}.log`);
  }

  /**
   * Check if the current log file needs rotation based on size
   */
  private needsRotation(logFile: string): boolean {
    if (!fs.existsSync(logFile)) {
      return false;
    }

    const stats = fs.statSync(logFile);
    const maxSizeBytes = this.config.maxFileSizeMb * 1024 * 1024;
    return stats.size >= maxSizeBytes;
  }

  /**
   * Rotate the log file by renaming it with a sequence number
   */
  private rotateLogFile(logFile: string): void {
    const baseName = path.basename(logFile, '.log');
    const dir = path.dirname(logFile);

    // Find the next available sequence number
    let seq = 1;
    while (fs.existsSync(path.join(dir, `${baseName}.${seq}.log`))) {
      seq++;
    }

    // Rename current file
    fs.renameSync(logFile, path.join(dir, `${baseName}.${seq}.log`));

    // Clean up old files
    this.cleanupOldFiles();
  }

  /**
   * Remove old log files beyond the retention limit
   */
  private cleanupOldFiles(): void {
    if (!fs.existsSync(this.logDir)) {
      return;
    }

    const files = fs.readdirSync(this.logDir)
      .filter(f => f.startsWith('ai-sdlc-') && f.endsWith('.log'))
      .map(f => ({
        name: f,
        path: path.join(this.logDir, f),
        mtime: fs.statSync(path.join(this.logDir, f)).mtime.getTime(),
      }))
      .sort((a, b) => b.mtime - a.mtime); // Newest first

    // Keep only the configured number of files
    const filesToDelete = files.slice(this.config.maxFiles);
    for (const file of filesToDelete) {
      try {
        fs.unlinkSync(file.path);
      } catch {
        // Ignore deletion errors
      }
    }
  }

  /**
   * Check if the given level should be logged based on config
   */
  private shouldLog(level: string): boolean {
    if (!this.config.enabled) {
      return false;
    }
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[this.config.level];
  }

  /**
   * Write a log entry to the current log file
   */
  private write(entry: LogEntry): void {
    if (!this.config.enabled) {
      return;
    }

    const logFile = this.getCurrentLogFile();

    // Check for rotation
    if (this.needsRotation(logFile)) {
      this.rotateLogFile(logFile);
    }

    // Append log entry as JSON line
    const line = JSON.stringify(entry) + '\n';
    fs.appendFileSync(logFile, line, 'utf-8');
  }

  /**
   * Create a log entry with common fields
   */
  private createEntry(
    level: 'debug' | 'info' | 'warn' | 'error',
    category: string,
    message: string,
    data?: unknown
  ): LogEntry {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      category,
      message,
    };

    if (data !== undefined) {
      entry.data = data;
    }

    return entry;
  }

  /**
   * Log a debug message
   */
  debug(category: string, message: string, data?: unknown): void {
    if (this.shouldLog('debug')) {
      this.write(this.createEntry('debug', category, message, data));
    }
  }

  /**
   * Log an info message
   */
  info(category: string, message: string, data?: unknown): void {
    if (this.shouldLog('info')) {
      this.write(this.createEntry('info', category, message, data));
    }
  }

  /**
   * Log a warning message
   */
  warn(category: string, message: string, data?: unknown): void {
    if (this.shouldLog('warn')) {
      this.write(this.createEntry('warn', category, message, data));
    }
  }

  /**
   * Log an error message
   */
  error(category: string, message: string, data?: unknown): void {
    if (this.shouldLog('error')) {
      this.write(this.createEntry('error', category, message, data));
    }
  }

  /**
   * Get the path to the current log file
   */
  getLogFilePath(): string {
    return this.getCurrentLogFile();
  }

  /**
   * Get all log file paths
   */
  getLogFiles(): string[] {
    if (!fs.existsSync(this.logDir)) {
      return [];
    }

    return fs.readdirSync(this.logDir)
      .filter(f => f.startsWith('ai-sdlc-') && f.endsWith('.log'))
      .map(f => path.join(this.logDir, f))
      .sort((a, b) => {
        const statA = fs.statSync(a);
        const statB = fs.statSync(b);
        return statB.mtime.getTime() - statA.mtime.getTime();
      });
  }
}

// Singleton logger instance
let globalLogger: Logger | null = null;

/**
 * Initialize the global logger instance
 */
export function initLogger(projectRoot: string, config: LogConfig): Logger {
  globalLogger = new Logger(projectRoot, config);
  return globalLogger;
}

/**
 * Get the global logger instance (or create a disabled one if not initialized)
 */
export function getLogger(): Logger {
  if (!globalLogger) {
    // Return a disabled logger if not initialized
    globalLogger = new Logger(process.cwd(), {
      enabled: false,
      level: 'info',
      maxFileSizeMb: 10,
      maxFiles: 5,
    });
  }
  return globalLogger;
}
