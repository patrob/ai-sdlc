import { describe, it, expect } from 'vitest';
import {
  normalizeErrorOutput,
  generateErrorFingerprint,
  extractErrorPreview,
  checkForIdenticalErrors,
  updateErrorHistory,
  getMostCommonError,
  clearErrorHistory,
  DEFAULT_IDENTICAL_ERROR_THRESHOLD,
} from './error-fingerprint.js';
import { ErrorFingerprint } from '../types/index.js';

describe('normalizeErrorOutput', () => {
  it('should return empty string for empty input', () => {
    expect(normalizeErrorOutput('')).toBe('');
    expect(normalizeErrorOutput(null as any)).toBe('');
    expect(normalizeErrorOutput(undefined as any)).toBe('');
  });

  it('should remove ANSI color codes', () => {
    const input = '\x1B[31mError: Test failed\x1B[0m';
    const normalized = normalizeErrorOutput(input);
    expect(normalized).not.toContain('\x1B');
    expect(normalized).toContain('Error: Test failed');
  });

  it('should remove ANSI OSC sequences (hyperlinks)', () => {
    const input = '\x1B]8;;http://example.com\x07link\x1B]8;;\x07';
    const normalized = normalizeErrorOutput(input);
    expect(normalized).not.toContain('\x1B');
    expect(normalized).toContain('link');
  });

  it('should normalize ISO timestamps', () => {
    const input = 'Error at 2024-01-15T10:30:45.123Z';
    const normalized = normalizeErrorOutput(input);
    expect(normalized).toContain('<TIMESTAMP>');
    expect(normalized).not.toContain('2024-01-15');
  });

  it('should normalize Unix epoch timestamps', () => {
    const input = 'Error at 1705312245123';
    const normalized = normalizeErrorOutput(input);
    expect(normalized).toContain('<EPOCH>');
    expect(normalized).not.toContain('1705312245123');
  });

  it('should normalize date formats', () => {
    const input1 = 'Error on 2024-01-15';
    const input2 = 'Error on 01/15/2024';
    expect(normalizeErrorOutput(input1)).toContain('<DATE>');
    expect(normalizeErrorOutput(input2)).toContain('<DATE>');
  });

  it('should normalize time formats', () => {
    const input = 'Error at 10:30:45.123';
    const normalized = normalizeErrorOutput(input);
    expect(normalized).toContain('<TIME>');
    expect(normalized).not.toContain('10:30:45');
  });

  it('should normalize Unix absolute paths', () => {
    const input = 'Error in /Users/dev/project/src/app.ts';
    const normalized = normalizeErrorOutput(input);
    expect(normalized).toContain('<ABS_PATH>');
    expect(normalized).not.toContain('/Users/dev');
  });

  it('should normalize Windows absolute paths', () => {
    const input = 'Error in C:\\Users\\dev\\project\\src\\app.ts';
    const normalized = normalizeErrorOutput(input);
    expect(normalized).toContain('<ABS_PATH>');
    expect(normalized).not.toContain('C:\\Users');
  });

  it('should normalize line:column numbers', () => {
    const input = 'src/app.ts:123:45 - error';
    const normalized = normalizeErrorOutput(input);
    expect(normalized).toContain('<LINE>:<COL>');
    expect(normalized).not.toContain(':123:45');
  });

  it('should normalize standalone line numbers', () => {
    const input = 'src/app.ts:123 error';
    const normalized = normalizeErrorOutput(input);
    expect(normalized).toContain('<LINE>');
    expect(normalized).not.toMatch(/:123\s/);
  });

  it('should normalize memory addresses', () => {
    const input = 'Error at 0x1234abcd';
    const normalized = normalizeErrorOutput(input);
    expect(normalized).toContain('<ADDR>');
    expect(normalized).not.toContain('0x1234abcd');
  });

  it('should normalize process IDs', () => {
    const input = 'pid: 12345 crashed';
    const normalized = normalizeErrorOutput(input);
    expect(normalized).toContain('pid: <PID>');
    expect(normalized).not.toContain('12345');
  });

  it('should normalize UUIDs', () => {
    const input = 'Request 550e8400-e29b-41d4-a716-446655440000 failed';
    const normalized = normalizeErrorOutput(input);
    expect(normalized).toContain('<UUID>');
    expect(normalized).not.toContain('550e8400');
  });

  it('should normalize /tmp paths', () => {
    const input = 'Error in /tmp/test-12345/file.ts';
    const normalized = normalizeErrorOutput(input);
    expect(normalized).toContain('<TMP_PATH>');
    expect(normalized).not.toContain('/tmp/test-12345');
  });

  it('should normalize node_modules paths', () => {
    const input = 'Error in node_modules/@types/node/index.d.ts';
    const normalized = normalizeErrorOutput(input);
    expect(normalized).toContain('<NODE_MODULE>');
    expect(normalized).not.toContain('node_modules/@types/node/index.d.ts');
  });

  it('should collapse multiple whitespace', () => {
    const input = 'Error    with   multiple    spaces';
    const normalized = normalizeErrorOutput(input);
    expect(normalized).toBe('Error with multiple spaces');
  });

  it('should trim leading and trailing whitespace', () => {
    const input = '  Error message  ';
    const normalized = normalizeErrorOutput(input);
    expect(normalized).toBe('Error message');
  });

  it('should preserve error-relevant content', () => {
    const input = "Cannot find module './missing-module'";
    const normalized = normalizeErrorOutput(input);
    expect(normalized).toContain("Cannot find module './missing-module'");
  });

  it('should produce identical output for same logical error with different timestamps', () => {
    const error1 = 'Error at 2024-01-15T10:30:45.123Z in /Users/dev/src/app.ts:123 - Test failed';
    const error2 = 'Error at 2025-06-20T15:45:00.000Z in /Users/other/src/app.ts:456 - Test failed';

    // Both should normalize to the same logical error (ignoring timestamp, path, line)
    const norm1 = normalizeErrorOutput(error1);
    const norm2 = normalizeErrorOutput(error2);

    expect(norm1).toBe(norm2);
  });
});

describe('generateErrorFingerprint', () => {
  it('should return SHA256 hash', () => {
    const fingerprint = generateErrorFingerprint('Test error');
    expect(fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it('should return same hash for identical normalized errors', () => {
    const error1 = 'Error at 2024-01-15T10:00:00Z';
    const error2 = 'Error at 2025-06-20T15:00:00Z';

    const fp1 = generateErrorFingerprint(error1);
    const fp2 = generateErrorFingerprint(error2);

    expect(fp1).toBe(fp2);
  });

  it('should return different hash for different errors', () => {
    const error1 = 'Cannot find module A';
    const error2 = 'Cannot find module B';

    const fp1 = generateErrorFingerprint(error1);
    const fp2 = generateErrorFingerprint(error2);

    expect(fp1).not.toBe(fp2);
  });

  it('should handle empty input', () => {
    const fingerprint = generateErrorFingerprint('');
    expect(fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe('extractErrorPreview', () => {
  it('should return empty string for empty input', () => {
    expect(extractErrorPreview('')).toBe('');
    expect(extractErrorPreview(null as any)).toBe('');
  });

  it('should extract error lines from output', () => {
    const input = `
Running tests...
PASS src/utils.test.ts
FAIL src/app.test.ts
  Error: Expected 1 but got 2
    at Object.<anonymous> (src/app.test.ts:10)
`;
    const preview = extractErrorPreview(input);
    expect(preview).toContain('FAIL');
  });

  it('should remove ANSI codes from preview', () => {
    const input = '\x1B[31mError: Test failed\x1B[0m';
    const preview = extractErrorPreview(input);
    expect(preview).not.toContain('\x1B');
    expect(preview).toContain('Error: Test failed');
  });

  it('should truncate to 200 characters', () => {
    const longError = 'Error: ' + 'x'.repeat(300);
    const preview = extractErrorPreview(longError);
    expect(preview.length).toBeLessThanOrEqual(200);
    expect(preview).toContain('...');
  });

  it('should capture multiple relevant lines separated by |', () => {
    const input = `
Error: Module not found
  Cannot find module './missing'
  at require (internal/modules)
`;
    const preview = extractErrorPreview(input);
    expect(preview).toContain(' | ');
  });

  it('should find error-related lines in verbose output', () => {
    const input = `
> npm test
> vitest run

 DEV  v1.0.0

 ✓ src/utils.test.ts (5 tests)
 ✗ src/app.test.ts (1 test)
   × should work correctly
     AssertionError: expected 1 to equal 2
`;
    const preview = extractErrorPreview(input);
    expect(preview).toContain('AssertionError');
  });
});

describe('checkForIdenticalErrors', () => {
  it('should return isIdentical: false for empty history', () => {
    const result = checkForIdenticalErrors('Error message', []);
    expect(result.isIdentical).toBe(false);
    expect(result.consecutiveCount).toBe(1);
    expect(result.currentHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('should return isIdentical: false for first occurrence', () => {
    const result = checkForIdenticalErrors('New error', [], 3);
    expect(result.isIdentical).toBe(false);
    expect(result.consecutiveCount).toBe(1);
  });

  it('should increment consecutive count for identical errors', () => {
    const errorMsg = 'Cannot find module X';
    const hash = generateErrorFingerprint(errorMsg);

    const history: ErrorFingerprint[] = [
      {
        hash,
        firstSeen: '2024-01-01T00:00:00Z',
        lastSeen: '2024-01-01T00:00:00Z',
        consecutiveCount: 1,
        errorPreview: 'Cannot find module X',
      },
    ];

    const result = checkForIdenticalErrors(errorMsg, history, 3);
    expect(result.consecutiveCount).toBe(2);
    expect(result.isIdentical).toBe(false); // Not yet at threshold
  });

  it('should return isIdentical: true when threshold is reached', () => {
    const errorMsg = 'Cannot find module X';
    const hash = generateErrorFingerprint(errorMsg);

    const history: ErrorFingerprint[] = [
      {
        hash,
        firstSeen: '2024-01-01T00:00:00Z',
        lastSeen: '2024-01-01T00:01:00Z',
        consecutiveCount: 2, // Already seen twice
        errorPreview: 'Cannot find module X',
      },
    ];

    const result = checkForIdenticalErrors(errorMsg, history, 3);
    expect(result.consecutiveCount).toBe(3);
    expect(result.isIdentical).toBe(true);
  });

  it('should reset consecutive count for different error', () => {
    const history: ErrorFingerprint[] = [
      {
        hash: generateErrorFingerprint('Error A'),
        firstSeen: '2024-01-01T00:00:00Z',
        lastSeen: '2024-01-01T00:01:00Z',
        consecutiveCount: 5,
        errorPreview: 'Error A',
      },
    ];

    const result = checkForIdenticalErrors('Error B', history, 3);
    expect(result.consecutiveCount).toBe(1);
    expect(result.isIdentical).toBe(false);
  });

  it('should use default threshold of 3', () => {
    expect(DEFAULT_IDENTICAL_ERROR_THRESHOLD).toBe(3);

    const errorMsg = 'Test error';
    const hash = generateErrorFingerprint(errorMsg);

    const history: ErrorFingerprint[] = [
      {
        hash,
        firstSeen: '2024-01-01T00:00:00Z',
        lastSeen: '2024-01-01T00:01:00Z',
        consecutiveCount: 2,
        errorPreview: 'Test error',
      },
    ];

    const result = checkForIdenticalErrors(errorMsg, history);
    expect(result.isIdentical).toBe(true); // 2 + 1 = 3, equals threshold
  });

  it('should handle timestamps and paths in identical error detection', () => {
    // These errors differ only in timestamp and path - should be detected as identical
    const error1 = 'Error at 2024-01-15T10:00:00Z in /Users/dev/src/app.ts:123';
    const error2 = 'Error at 2025-06-20T15:00:00Z in /Users/other/src/app.ts:456';

    const hash1 = generateErrorFingerprint(error1);
    const hash2 = generateErrorFingerprint(error2);

    expect(hash1).toBe(hash2);
  });
});

describe('updateErrorHistory', () => {
  it('should add new entry for first error', () => {
    const check = {
      isIdentical: false,
      consecutiveCount: 1,
      currentHash: 'abc123',
      errorPreview: 'Test error',
    };

    const history = updateErrorHistory([], check);

    expect(history).toHaveLength(1);
    expect(history[0].hash).toBe('abc123');
    expect(history[0].consecutiveCount).toBe(1);
    expect(history[0].errorPreview).toBe('Test error');
  });

  it('should update existing entry for identical error', () => {
    const existingHistory: ErrorFingerprint[] = [
      {
        hash: 'abc123',
        firstSeen: '2024-01-01T00:00:00Z',
        lastSeen: '2024-01-01T00:00:00Z',
        consecutiveCount: 1,
        errorPreview: 'Test error',
      },
    ];

    const check = {
      isIdentical: false,
      consecutiveCount: 2,
      currentHash: 'abc123',
      errorPreview: 'Test error',
    };

    const history = updateErrorHistory(existingHistory, check);

    expect(history).toHaveLength(1);
    expect(history[0].consecutiveCount).toBe(2);
    expect(history[0].firstSeen).toBe('2024-01-01T00:00:00Z'); // Unchanged
    expect(history[0].lastSeen).not.toBe('2024-01-01T00:00:00Z'); // Updated
  });

  it('should add new entry for different error', () => {
    const existingHistory: ErrorFingerprint[] = [
      {
        hash: 'abc123',
        firstSeen: '2024-01-01T00:00:00Z',
        lastSeen: '2024-01-01T00:00:00Z',
        consecutiveCount: 2,
        errorPreview: 'Error A',
      },
    ];

    const check = {
      isIdentical: false,
      consecutiveCount: 1,
      currentHash: 'def456',
      errorPreview: 'Error B',
    };

    const history = updateErrorHistory(existingHistory, check);

    expect(history).toHaveLength(2);
    expect(history[1].hash).toBe('def456');
    expect(history[1].consecutiveCount).toBe(1);
  });

  it('should limit history to 10 entries', () => {
    const existingHistory: ErrorFingerprint[] = Array.from({ length: 10 }, (_, i) => ({
      hash: `hash${i}`,
      firstSeen: '2024-01-01T00:00:00Z',
      lastSeen: '2024-01-01T00:00:00Z',
      consecutiveCount: 1,
      errorPreview: `Error ${i}`,
    }));

    const check = {
      isIdentical: false,
      consecutiveCount: 1,
      currentHash: 'newHash',
      errorPreview: 'New error',
    };

    const history = updateErrorHistory(existingHistory, check);

    expect(history).toHaveLength(10);
    expect(history[9].hash).toBe('newHash');
    expect(history[0].hash).toBe('hash1'); // hash0 was removed
  });

  it('should handle null/undefined history', () => {
    const check = {
      isIdentical: false,
      consecutiveCount: 1,
      currentHash: 'abc123',
      errorPreview: 'Test error',
    };

    const history = updateErrorHistory(null as any, check);
    expect(history).toHaveLength(1);
  });
});

describe('getMostCommonError', () => {
  it('should return empty string for empty history', () => {
    expect(getMostCommonError([])).toBe('');
    expect(getMostCommonError(null as any)).toBe('');
  });

  it('should return error with highest consecutive count', () => {
    const history: ErrorFingerprint[] = [
      {
        hash: 'abc',
        firstSeen: '2024-01-01T00:00:00Z',
        lastSeen: '2024-01-01T00:00:00Z',
        consecutiveCount: 2,
        errorPreview: 'Error A',
      },
      {
        hash: 'def',
        firstSeen: '2024-01-01T00:00:00Z',
        lastSeen: '2024-01-01T00:00:00Z',
        consecutiveCount: 5,
        errorPreview: 'Error B',
      },
      {
        hash: 'ghi',
        firstSeen: '2024-01-01T00:00:00Z',
        lastSeen: '2024-01-01T00:00:00Z',
        consecutiveCount: 1,
        errorPreview: 'Error C',
      },
    ];

    expect(getMostCommonError(history)).toBe('Error B');
  });

  it('should return first error if counts are equal', () => {
    const history: ErrorFingerprint[] = [
      {
        hash: 'abc',
        firstSeen: '2024-01-01T00:00:00Z',
        lastSeen: '2024-01-01T00:00:00Z',
        consecutiveCount: 3,
        errorPreview: 'Error A',
      },
      {
        hash: 'def',
        firstSeen: '2024-01-01T00:00:00Z',
        lastSeen: '2024-01-01T00:00:00Z',
        consecutiveCount: 3,
        errorPreview: 'Error B',
      },
    ];

    // First one with max count wins
    expect(getMostCommonError(history)).toBe('Error A');
  });
});

describe('clearErrorHistory', () => {
  it('should return empty array', () => {
    expect(clearErrorHistory()).toEqual([]);
  });
});

describe('integration: realistic error scenarios', () => {
  it('should detect S-0038 pattern: same mock error repeating', () => {
    // Simulating the S-0038 bug: wrong mock module path causing repeated identical failures
    const error1 = `
      FAIL src/agents/implementation.test.ts
      Error: Cannot find module '../services/mock-file'
        at Object.<anonymous> (src/agents/implementation.test.ts:5:1)
    `;
    const error2 = `
      FAIL src/agents/implementation.test.ts
      Error: Cannot find module '../services/mock-file'
        at Object.<anonymous> (src/agents/implementation.test.ts:5:1)
    `;
    const error3 = `
      FAIL src/agents/implementation.test.ts
      Error: Cannot find module '../services/mock-file'
        at Object.<anonymous> (src/agents/implementation.test.ts:5:1)
    `;

    // First error
    let history: ErrorFingerprint[] = [];
    let check = checkForIdenticalErrors(error1, history, 3);
    expect(check.isIdentical).toBe(false);
    history = updateErrorHistory(history, check);

    // Second error (identical)
    check = checkForIdenticalErrors(error2, history, 3);
    expect(check.isIdentical).toBe(false);
    expect(check.consecutiveCount).toBe(2);
    history = updateErrorHistory(history, check);

    // Third error (identical) - should trigger threshold
    check = checkForIdenticalErrors(error3, history, 3);
    expect(check.isIdentical).toBe(true);
    expect(check.consecutiveCount).toBe(3);
  });

  it('should not trigger on different errors each time', () => {
    const errors = [
      'Error: Cannot find module A',
      'Error: Type mismatch in function B',
      'Error: Property C does not exist',
    ];

    let history: ErrorFingerprint[] = [];

    for (const error of errors) {
      const check = checkForIdenticalErrors(error, history, 3);
      expect(check.isIdentical).toBe(false);
      expect(check.consecutiveCount).toBe(1);
      history = updateErrorHistory(history, check);
    }

    expect(history).toHaveLength(3);
  });

  it('should handle mix of identical and different errors', () => {
    const errorA = 'Error A';
    const errorB = 'Error B';

    let history: ErrorFingerprint[] = [];

    // Two A's
    let check = checkForIdenticalErrors(errorA, history, 3);
    history = updateErrorHistory(history, check);
    check = checkForIdenticalErrors(errorA, history, 3);
    expect(check.consecutiveCount).toBe(2);
    history = updateErrorHistory(history, check);

    // One B (resets)
    check = checkForIdenticalErrors(errorB, history, 3);
    expect(check.consecutiveCount).toBe(1);
    history = updateErrorHistory(history, check);

    // Back to A (new sequence)
    check = checkForIdenticalErrors(errorA, history, 3);
    expect(check.consecutiveCount).toBe(1);
    expect(check.isIdentical).toBe(false);
  });
});
