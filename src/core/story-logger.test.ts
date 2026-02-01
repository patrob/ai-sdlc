import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  StoryLogger,
  getLatestLogPath,
  readLastLines,
  generateCorrelationId,
  getOrCreateCorrelationId,
  setCorrelationIdEnv
} from './story-logger.js';

// Mock fs module with promises
vi.mock('fs', async (importOriginal) => {
  return {
    default: {
      existsSync: vi.fn(),
      mkdirSync: vi.fn(),
      readdirSync: vi.fn(),
      unlinkSync: vi.fn(),
      createWriteStream: vi.fn(),
      readFileSync: vi.fn(),
      writeFileSync: vi.fn(),
      watchFile: vi.fn(),
      unwatchFile: vi.fn(),
      promises: {
        readFile: vi.fn(),
      },
    },
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    readdirSync: vi.fn(),
    unlinkSync: vi.fn(),
    createWriteStream: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    watchFile: vi.fn(),
    unwatchFile: vi.fn(),
    promises: {
      readFile: vi.fn(),
    },
  };
});

describe('StoryLogger', () => {
  const mockSdlcRoot = '/test/.ai-sdlc';
  const mockStoryId = 'S-0001';
  const mockLogDir = '/test/.ai-sdlc/stories/S-0001/logs';

  beforeEach(() => {
    // Reset all mocks before each test
    vi.resetAllMocks();

    // Use fake timers for deterministic timestamps
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-15T10:30:00.000Z'));

    // Mock fs functions with default successful behavior
    vi.mocked(fs.existsSync).mockReturnValue(false); // Default: directory doesn't exist
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
    vi.mocked(fs.readdirSync).mockReturnValue([]);

    // Mock write stream
    const mockStream = {
      write: vi.fn(),
      end: vi.fn(),
      on: vi.fn().mockReturnThis(),
    };
    vi.mocked(fs.createWriteStream).mockReturnValue(mockStream as any);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should create log directory if it does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      new StoryLogger(mockStoryId, mockSdlcRoot);

      expect(fs.mkdirSync).toHaveBeenCalledWith(mockLogDir, { recursive: true });
    });

    it('should not create log directory if it already exists', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      new StoryLogger(mockStoryId, mockSdlcRoot);

      expect(fs.mkdirSync).not.toHaveBeenCalled();
    });

    it('should create log file with ISO 8601 timestamp', () => {
      new StoryLogger(mockStoryId, mockSdlcRoot);

      const expectedPath = '/test/.ai-sdlc/stories/S-0001/logs/2026-01-15T10-30-00.log';
      expect(fs.createWriteStream).toHaveBeenCalledWith(expectedPath, { flags: 'a' });
    });

    it('should sanitize story ID to prevent path traversal', () => {
      // This should throw an error due to path traversal
      expect(() => {
        new StoryLogger('../malicious', mockSdlcRoot);
      }).toThrow('Invalid story ID: contains path traversal sequence (..)');
    });

    it('should rotate old logs on initialization', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        '2026-01-15T09-00-00.log',
        '2026-01-15T08-00-00.log',
        '2026-01-15T07-00-00.log',
        '2026-01-15T06-00-00.log',
        '2026-01-15T05-00-00.log',
        '2026-01-15T04-00-00.log', // Should be deleted (7th oldest)
      ] as any);

      new StoryLogger(mockStoryId, mockSdlcRoot, 5);

      // Should delete the oldest log
      expect(fs.unlinkSync).toHaveBeenCalledWith(
        path.join(mockLogDir, '2026-01-15T04-00-00.log')
      );
    });

    it('should keep last N logs (maxLogs parameter)', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        '2026-01-15T10-00-00.log',
        '2026-01-15T09-00-00.log',
        '2026-01-15T08-00-00.log',
        '2026-01-15T07-00-00.log',
      ] as any);

      new StoryLogger(mockStoryId, mockSdlcRoot, 2);

      // Should delete the 2 oldest logs
      expect(fs.unlinkSync).toHaveBeenCalledTimes(2);
      expect(fs.unlinkSync).toHaveBeenCalledWith(
        path.join(mockLogDir, '2026-01-15T07-00-00.log')
      );
      expect(fs.unlinkSync).toHaveBeenCalledWith(
        path.join(mockLogDir, '2026-01-15T08-00-00.log')
      );
    });
  });

  describe('log()', () => {
    let logger: StoryLogger;
    let mockStream: any;
    let consoleLogSpy: any;
    let consoleErrorSpy: any;
    let consoleWarnSpy: any;

    beforeEach(() => {
      mockStream = {
        write: vi.fn(),
        end: vi.fn((cb?: () => void) => cb && cb()),
        on: vi.fn().mockReturnThis(),
      };
      vi.mocked(fs.createWriteStream).mockReturnValue(mockStream);

      // Spy on console methods
      consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      logger = new StoryLogger(mockStoryId, mockSdlcRoot);
    });

    afterEach(() => {
      consoleLogSpy.mockRestore();
      consoleErrorSpy.mockRestore();
      consoleWarnSpy.mockRestore();
    });

    it('should write to file with formatted timestamp, correlation ID, and level', () => {
      logger.log('INFO', 'Test message');

      const writtenContent = mockStream.write.mock.calls[0][0];
      // Format: [timestamp] [correlationId] [level] message
      expect(writtenContent).toMatch(/^\[2026-01-15T10:30:00\.000Z\] \[[a-z0-9]+-[a-f0-9]+\] \[INFO\] Test message\n$/);
    });

    it('should write to console for INFO level', () => {
      logger.log('INFO', 'Test message');

      expect(consoleLogSpy).toHaveBeenCalledWith('Test message');
    });

    it('should write to console.error for ERROR level', () => {
      logger.log('ERROR', 'Error message');

      expect(consoleErrorSpy).toHaveBeenCalledWith('Error message');
    });

    it('should write to console.warn for WARN level', () => {
      logger.log('WARN', 'Warning message');

      expect(consoleWarnSpy).toHaveBeenCalledWith('Warning message');
    });

    it('should write to console for AGENT level', () => {
      logger.log('AGENT', 'Agent output');

      expect(consoleLogSpy).toHaveBeenCalledWith('Agent output');
    });

    it('should not write DEBUG to console by default', () => {
      logger.log('DEBUG', 'Debug message');

      expect(consoleLogSpy).not.toHaveBeenCalled();
      expect(mockStream.write).toHaveBeenCalled(); // Still writes to file
    });

    it('should write DEBUG to console when DEBUG env var is set', () => {
      process.env.DEBUG = '1';

      logger.log('DEBUG', 'Debug message');

      expect(consoleLogSpy).toHaveBeenCalledWith('Debug message');

      delete process.env.DEBUG;
    });

    it('should truncate very long messages (>10KB)', () => {
      const longMessage = 'a'.repeat(11 * 1024); // 11KB

      logger.log('INFO', longMessage);

      const writtenContent = mockStream.write.mock.calls[0][0];
      expect(writtenContent).toContain('... [message truncated]');
      expect(writtenContent.length).toBeLessThan(longMessage.length + 200); // Allow for timestamp/formatting
    });

    it('should strip non-printable characters (except newlines/tabs)', () => {
      const messageWithNonPrintable = 'Test\x00\x01\x02\x1Fmessage';

      logger.log('INFO', messageWithNonPrintable);

      const writtenContent = mockStream.write.mock.calls[0][0];
      expect(writtenContent).toContain('[INFO] Testmessage'); // Non-printable chars removed
    });

    it('should preserve newlines in messages', () => {
      const messageWithNewline = 'Line 1\nLine 2';

      logger.log('INFO', messageWithNewline);

      const writtenContent = mockStream.write.mock.calls[0][0];
      expect(writtenContent).toContain('Line 1\nLine 2');
    });

    it('should handle empty messages', () => {
      logger.log('INFO', '');

      const writtenContent = mockStream.write.mock.calls[0][0];
      // Format: [timestamp] [correlationId] [level] <empty message>
      expect(writtenContent).toMatch(/^\[2026-01-15T10:30:00\.000Z\] \[[a-z0-9]+-[a-f0-9]+\] \[INFO\] \n$/);
    });

    it('should gracefully degrade to console-only if file write fails', () => {
      mockStream.write.mockImplementationOnce(() => {
        throw new Error('Disk full');
      });

      logger.log('INFO', 'Test message');

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to write to log file')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith('Test message'); // Console output still works
    });

    it('should warn if logging to closed logger', async () => {
      // Update mock to call the callback
      mockStream.end = vi.fn((cb?: () => void) => cb && cb());
      await logger.close();
      logger.log('INFO', 'Test message');

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Warning: Attempted to log to closed logger'
      );
    });
  });

  describe('close()', () => {
    it('should close the write stream', async () => {
      const mockStream = {
        write: vi.fn(),
        end: vi.fn((cb?: () => void) => cb && cb()),
        on: vi.fn().mockReturnThis(),
      };
      vi.mocked(fs.createWriteStream).mockReturnValue(mockStream as any);

      const logger = new StoryLogger(mockStoryId, mockSdlcRoot);
      await logger.close();

      expect(mockStream.end).toHaveBeenCalled();
    });

    it('should not close stream twice', async () => {
      const mockStream = {
        write: vi.fn(),
        end: vi.fn((cb?: () => void) => cb && cb()),
        on: vi.fn().mockReturnThis(),
      };
      vi.mocked(fs.createWriteStream).mockReturnValue(mockStream as any);

      const logger = new StoryLogger(mockStoryId, mockSdlcRoot);
      await logger.close();
      await logger.close();

      expect(mockStream.end).toHaveBeenCalledTimes(1);
    });
  });

  describe('getLogPath()', () => {
    it('should return the current log file path', () => {
      const logger = new StoryLogger(mockStoryId, mockSdlcRoot);
      const logPath = logger.getLogPath();

      expect(logPath).toBe('/test/.ai-sdlc/stories/S-0001/logs/2026-01-15T10-30-00.log');
    });
  });
});

describe('getLatestLogPath', () => {
  const mockSdlcRoot = '/test/.ai-sdlc';
  const mockStoryId = 'S-0001';
  const mockLogDir = '/test/.ai-sdlc/stories/S-0001/logs';

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should return null if log directory does not exist', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const result = getLatestLogPath(mockSdlcRoot, mockStoryId);

    expect(result).toBeNull();
  });

  it('should return null if log directory is empty', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockReturnValue([]);

    const result = getLatestLogPath(mockSdlcRoot, mockStoryId);

    expect(result).toBeNull();
  });

  it('should return the latest log file path', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockReturnValue([
      '2026-01-15T09-00-00.log',
      '2026-01-15T10-30-00.log', // Latest
      '2026-01-15T08-00-00.log',
    ] as any);

    const result = getLatestLogPath(mockSdlcRoot, mockStoryId);

    expect(result).toBe(path.join(mockLogDir, '2026-01-15T10-30-00.log'));
  });

  it('should sanitize story ID', () => {
    expect(() => {
      getLatestLogPath(mockSdlcRoot, '../malicious');
    }).toThrow('Invalid story ID: contains path traversal sequence (..)');
  });
});

describe('readLastLines', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should read last N lines from log file', async () => {
    const mockContent =
      '[2026-01-15T10:00:00.000Z] [INFO] Line 1\n' +
      '[2026-01-15T10:01:00.000Z] [INFO] Line 2\n' +
      '[2026-01-15T10:02:00.000Z] [INFO] Line 3\n' +
      '[2026-01-15T10:03:00.000Z] [INFO] Line 4\n' +
      '[2026-01-15T10:04:00.000Z] [INFO] Line 5\n';

    vi.mocked(fs.promises.readFile).mockResolvedValue(mockContent);

    const result = await readLastLines('/test/log.log', 3);

    expect(result).toBe(
      '[2026-01-15T10:02:00.000Z] [INFO] Line 3\n' +
      '[2026-01-15T10:03:00.000Z] [INFO] Line 4\n' +
      '[2026-01-15T10:04:00.000Z] [INFO] Line 5'
    );
  });

  it('should return all lines if file has fewer than N lines', async () => {
    const mockContent =
      '[2026-01-15T10:00:00.000Z] [INFO] Line 1\n' +
      '[2026-01-15T10:01:00.000Z] [INFO] Line 2\n';

    vi.mocked(fs.promises.readFile).mockResolvedValue(mockContent);

    const result = await readLastLines('/test/log.log', 10);

    expect(result).toBe(
      '[2026-01-15T10:00:00.000Z] [INFO] Line 1\n' +
      '[2026-01-15T10:01:00.000Z] [INFO] Line 2'
    );
  });

  it('should use default of 50 lines if not specified', async () => {
    const mockContent = Array.from({ length: 100 }, (_, i) =>
      `[2026-01-15T10:00:00.000Z] [INFO] Line ${i + 1}`
    ).join('\n');

    vi.mocked(fs.promises.readFile).mockResolvedValue(mockContent);

    const result = await readLastLines('/test/log.log');
    const lines = result.split('\n');

    expect(lines).toHaveLength(50);
    expect(lines[0]).toContain('Line 51'); // Last 50 lines start at line 51
  });

  it('should filter out empty lines', async () => {
    const mockContent =
      '[2026-01-15T10:00:00.000Z] [INFO] Line 1\n' +
      '\n' + // Empty line
      '[2026-01-15T10:01:00.000Z] [INFO] Line 2\n' +
      '\n' + // Empty line
      '[2026-01-15T10:02:00.000Z] [INFO] Line 3\n';

    vi.mocked(fs.promises.readFile).mockResolvedValue(mockContent);

    const result = await readLastLines('/test/log.log', 10);
    const lines = result.split('\n');

    expect(lines).toHaveLength(3); // Only non-empty lines
  });
});

describe('Correlation ID functions', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.AI_SDLC_CORRELATION_ID;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('generateCorrelationId', () => {
    it('should generate a unique ID in expected format', () => {
      const id = generateCorrelationId();

      // Format: <timestamp-base36>-<random-hex>
      expect(id).toMatch(/^[a-z0-9]+-[a-f0-9]{4}$/);
    });

    it('should generate different IDs on each call', () => {
      const id1 = generateCorrelationId();
      const id2 = generateCorrelationId();

      expect(id1).not.toBe(id2);
    });
  });

  describe('getOrCreateCorrelationId', () => {
    it('should return env variable if set', () => {
      process.env.AI_SDLC_CORRELATION_ID = 'existing-id-1234';

      const id = getOrCreateCorrelationId();

      expect(id).toBe('existing-id-1234');
    });

    it('should generate new ID if env variable not set', () => {
      const id = getOrCreateCorrelationId();

      expect(id).toMatch(/^[a-z0-9]+-[a-f0-9]{4}$/);
    });
  });

  describe('setCorrelationIdEnv', () => {
    it('should set the environment variable', () => {
      setCorrelationIdEnv('test-correlation-id');

      expect(process.env.AI_SDLC_CORRELATION_ID).toBe('test-correlation-id');
    });
  });

  describe('StoryLogger correlation ID', () => {
    let mockStream: any;

    beforeEach(() => {
      mockStream = {
        write: vi.fn(),
        end: vi.fn((cb: () => void) => cb()),
        on: vi.fn(),
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([]);
      vi.mocked(fs.createWriteStream).mockReturnValue(mockStream as any);
    });

    it('should use provided correlation ID', () => {
      const logger = new StoryLogger('S-001', '/test/.ai-sdlc', 5, 'custom-id-9999');

      expect(logger.getCorrelationId()).toBe('custom-id-9999');
    });

    it('should use env variable if no correlation ID provided', () => {
      process.env.AI_SDLC_CORRELATION_ID = 'env-id-5678';

      const logger = new StoryLogger('S-001', '/test/.ai-sdlc');

      expect(logger.getCorrelationId()).toBe('env-id-5678');
    });

    it('should generate correlation ID if neither param nor env provided', () => {
      const logger = new StoryLogger('S-001', '/test/.ai-sdlc');

      expect(logger.getCorrelationId()).toMatch(/^[a-z0-9]+-[a-f0-9]{4}$/);
    });

    it('should set correlation ID in environment', () => {
      const logger = new StoryLogger('S-001', '/test/.ai-sdlc', 5, 'my-id-1234');

      expect(process.env.AI_SDLC_CORRELATION_ID).toBe('my-id-1234');
    });

    it('should include correlation ID in log entries', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-15T10:30:00.000Z'));

      const logger = new StoryLogger('S-001', '/test/.ai-sdlc', 5, 'trace-id-abc');
      logger.log('INFO', 'Test message');

      const writtenContent = mockStream.write.mock.calls[0][0];
      expect(writtenContent).toContain('[trace-id-abc]');

      vi.useRealTimers();
    });
  });
});
