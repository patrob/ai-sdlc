import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { StoryLogger, getLatestLogPath, readLastLines } from '../../src/core/story-logger.js';
import { STORIES_FOLDER } from '../../src/types/index.js';
import os from 'os';

describe('Story Logging Integration', () => {
  let tempDir: string;
  let sdlcRoot: string;
  const testStoryId = 'S-TEST-001';

  beforeEach(() => {
    // Only fake Date for consistent timestamps (not all timers, as they interfere with file streams)
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-01-15T10:30:00.000Z'));

    // Create temporary directory for test logs
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-sdlc-test-'));
    sdlcRoot = path.join(tempDir, '.ai-sdlc');
    fs.mkdirSync(sdlcRoot, { recursive: true });
  });

  afterEach(() => {
    vi.useRealTimers();

    // Clean up temporary directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('Logger initialization and file creation', () => {
    it('should create log directory and file on initialization', async () => {
      const logger = new StoryLogger(testStoryId, sdlcRoot);
      const logPath = logger.getLogPath();

      expect(fs.existsSync(logPath)).toBe(true);
      expect(logPath).toContain('2026-01-15T10-30-00.log');

      await logger.close();
    });

    it('should create logs under correct story directory', async () => {
      const logger = new StoryLogger(testStoryId, sdlcRoot);
      const logPath = logger.getLogPath();

      const expectedDir = path.join(sdlcRoot, STORIES_FOLDER, testStoryId, 'logs');
      expect(logPath).toContain(expectedDir);

      await logger.close();
    });
  });

  describe('Dual output (console + file)', () => {
    it('should write to both console and file', async () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const logger = new StoryLogger(testStoryId, sdlcRoot);

      logger.log('INFO', 'Test message');

      // Check console output
      expect(consoleLogSpy).toHaveBeenCalledWith('Test message');

      // Close logger to flush all writes before reading file
      const logPath = logger.getLogPath();
      await logger.close();

      // Check file output (after close to ensure data is flushed)
      const fileContent = fs.readFileSync(logPath, 'utf-8');
      expect(fileContent).toContain('[INFO] Test message');

      consoleLogSpy.mockRestore();
    });

    it('should write errors to console.error', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const logger = new StoryLogger(testStoryId, sdlcRoot);

      logger.log('ERROR', 'Error message');

      // Check console output
      expect(consoleErrorSpy).toHaveBeenCalledWith('Error message');

      // Close logger to flush all writes before reading file
      const logPath = logger.getLogPath();
      await logger.close();

      // Check file output (after close to ensure data is flushed)
      const fileContent = fs.readFileSync(logPath, 'utf-8');
      expect(fileContent).toContain('[ERROR] Error message');

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Log rotation', () => {
    it('should keep only last N logs', async () => {
      const logDir = path.join(sdlcRoot, STORIES_FOLDER, testStoryId, 'logs');
      fs.mkdirSync(logDir, { recursive: true });

      // Create 5 old log files
      const oldLogs = [
        '2026-01-15T08-00-00.log',
        '2026-01-15T07-00-00.log',
        '2026-01-15T06-00-00.log',
        '2026-01-15T05-00-00.log',
        '2026-01-15T04-00-00.log',
      ];

      for (const log of oldLogs) {
        fs.writeFileSync(path.join(logDir, log), 'old log content');
      }

      // Create new logger with maxLogs=3
      const logger = new StoryLogger(testStoryId, sdlcRoot, 3);

      // Current log + 3 old logs should remain (total 4 including new one)
      // But maxLogs=3 means keep 3 logs total, so oldest should be deleted
      const remainingLogs = fs.readdirSync(logDir).filter((f) => f.endsWith('.log'));

      // Should have 3 logs: new one + 2 newest old ones
      expect(remainingLogs.length).toBe(3);
      expect(remainingLogs).toContain('2026-01-15T10-30-00.log'); // New log
      expect(remainingLogs).toContain('2026-01-15T08-00-00.log'); // Newest old log
      expect(remainingLogs).toContain('2026-01-15T07-00-00.log'); // Second newest

      // Oldest logs should be deleted
      expect(remainingLogs).not.toContain('2026-01-15T04-00-00.log');
      expect(remainingLogs).not.toContain('2026-01-15T05-00-00.log');
      expect(remainingLogs).not.toContain('2026-01-15T06-00-00.log');

      await logger.close();
    });
  });

  describe('getLatestLogPath', () => {
    it('should return the most recent log file', () => {
      const logDir = path.join(sdlcRoot, STORIES_FOLDER, testStoryId, 'logs');
      fs.mkdirSync(logDir, { recursive: true });

      // Create multiple log files
      fs.writeFileSync(path.join(logDir, '2026-01-15T08-00-00.log'), 'old');
      fs.writeFileSync(path.join(logDir, '2026-01-15T10-00-00.log'), 'newer');
      fs.writeFileSync(path.join(logDir, '2026-01-15T09-00-00.log'), 'middle');

      const latestPath = getLatestLogPath(sdlcRoot, testStoryId);

      expect(latestPath).toContain('2026-01-15T10-00-00.log');
    });

    it('should return null if no logs exist', () => {
      const latestPath = getLatestLogPath(sdlcRoot, testStoryId);
      expect(latestPath).toBeNull();
    });
  });

  describe('readLastLines', () => {
    it('should read last N lines from log file', async () => {
      const logger = new StoryLogger(testStoryId, sdlcRoot);

      // Write multiple log entries
      logger.log('INFO', 'Line 1');
      logger.log('INFO', 'Line 2');
      logger.log('INFO', 'Line 3');
      logger.log('INFO', 'Line 4');
      logger.log('INFO', 'Line 5');

      await logger.close();

      const logPath = logger.getLogPath();
      const lastLines = await readLastLines(logPath, 3);

      const lines = lastLines.split('\n');
      expect(lines.length).toBe(3);
      expect(lastLines).toContain('Line 3');
      expect(lastLines).toContain('Line 4');
      expect(lastLines).toContain('Line 5');
    });
  });

  describe('Logger close', () => {
    it('should close stream and flush data', async () => {
      const logger = new StoryLogger(testStoryId, sdlcRoot);

      logger.log('INFO', 'Test message before close');
      await logger.close();

      // Verify file was written
      const logPath = logger.getLogPath();
      const content = fs.readFileSync(logPath, 'utf-8');
      expect(content).toContain('Test message before close');

      // Logging after close should warn but not throw
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      logger.log('INFO', 'Test message after close');
      expect(consoleWarnSpy).toHaveBeenCalledWith('Warning: Attempted to log to closed logger');

      consoleWarnSpy.mockRestore();
    });
  });

  describe('Concurrent execution (multiple stories)', () => {
    it('should create separate log files for different stories', async () => {
      const logger1 = new StoryLogger('S-0001', sdlcRoot);
      const logger2 = new StoryLogger('S-0002', sdlcRoot);

      logger1.log('INFO', 'Story 1 log');
      logger2.log('INFO', 'Story 2 log');

      const log1Path = logger1.getLogPath();
      const log2Path = logger2.getLogPath();

      expect(log1Path).toContain('S-0001');
      expect(log2Path).toContain('S-0002');
      expect(log1Path).not.toBe(log2Path);

      // Close loggers to flush all writes before reading files
      await logger1.close();
      await logger2.close();

      const content1 = fs.readFileSync(log1Path, 'utf-8');
      const content2 = fs.readFileSync(log2Path, 'utf-8');

      expect(content1).toContain('Story 1 log');
      expect(content1).not.toContain('Story 2 log');
      expect(content2).toContain('Story 2 log');
      expect(content2).not.toContain('Story 1 log');
    });

    it('should create unique timestamped logs for same story run multiple times', async () => {
      // First run at 10:30
      const logger1 = new StoryLogger(testStoryId, sdlcRoot);
      logger1.log('INFO', 'First run');
      const path1 = logger1.getLogPath();
      await logger1.close();

      // Second run at 10:35 (advance time)
      vi.setSystemTime(new Date('2026-01-15T10:35:00.000Z'));
      const logger2 = new StoryLogger(testStoryId, sdlcRoot);
      logger2.log('INFO', 'Second run');
      const path2 = logger2.getLogPath();
      await logger2.close();

      expect(path1).toContain('2026-01-15T10-30-00.log');
      expect(path2).toContain('2026-01-15T10-35-00.log');
      expect(path1).not.toBe(path2);

      // Verify both logs exist
      expect(fs.existsSync(path1)).toBe(true);
      expect(fs.existsSync(path2)).toBe(true);
    });
  });
});
