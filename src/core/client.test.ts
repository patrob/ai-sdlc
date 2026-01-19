import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { classifyApiError, shouldRetry, calculateBackoff, AuthenticationError } from './client.js';

describe('classifyApiError', () => {
  it('should classify HTTP 429 as transient', () => {
    const error = new Error('Rate limit exceeded');
    (error as any).status = 429;
    expect(classifyApiError(error)).toBe('transient');
  });

  it('should classify HTTP 503 as transient', () => {
    const error = new Error('Service unavailable');
    (error as any).status = 503;
    expect(classifyApiError(error)).toBe('transient');
  });

  it('should classify HTTP 500 as transient', () => {
    const error = new Error('Internal server error');
    (error as any).status = 500;
    expect(classifyApiError(error)).toBe('transient');
  });

  it('should classify HTTP 502 as transient', () => {
    const error = new Error('Bad gateway');
    (error as any).status = 502;
    expect(classifyApiError(error)).toBe('transient');
  });

  it('should classify HTTP 400 as permanent', () => {
    const error = new Error('Bad request');
    (error as any).status = 400;
    expect(classifyApiError(error)).toBe('permanent');
  });

  it('should classify HTTP 401 as permanent', () => {
    const error = new Error('Unauthorized');
    (error as any).status = 401;
    expect(classifyApiError(error)).toBe('permanent');
  });

  it('should classify HTTP 403 as permanent', () => {
    const error = new Error('Forbidden');
    (error as any).status = 403;
    expect(classifyApiError(error)).toBe('permanent');
  });

  it('should classify HTTP 404 as permanent', () => {
    const error = new Error('Not found');
    (error as any).status = 404;
    expect(classifyApiError(error)).toBe('permanent');
  });

  it('should classify ETIMEDOUT as transient', () => {
    const error = new Error('Connection timed out');
    (error as any).code = 'ETIMEDOUT';
    expect(classifyApiError(error)).toBe('transient');
  });

  it('should classify ECONNRESET as transient', () => {
    const error = new Error('Connection reset');
    (error as any).code = 'ECONNRESET';
    expect(classifyApiError(error)).toBe('transient');
  });

  it('should classify ENOTFOUND as transient', () => {
    const error = new Error('DNS lookup failed');
    (error as any).code = 'ENOTFOUND';
    expect(classifyApiError(error)).toBe('transient');
  });

  it('should classify ECONNREFUSED as transient', () => {
    const error = new Error('Connection refused');
    (error as any).code = 'ECONNREFUSED';
    expect(classifyApiError(error)).toBe('transient');
  });

  it('should classify EHOSTUNREACH as transient', () => {
    const error = new Error('Host unreachable');
    (error as any).code = 'EHOSTUNREACH';
    expect(classifyApiError(error)).toBe('transient');
  });

  it('should classify EPIPE as transient', () => {
    const error = new Error('Broken pipe');
    (error as any).code = 'EPIPE';
    expect(classifyApiError(error)).toBe('transient');
  });

  it('should classify AuthenticationError as permanent', () => {
    const error = new AuthenticationError('Token expired');
    expect(classifyApiError(error)).toBe('permanent');
  });

  it('should default to permanent for unknown errors', () => {
    const error = new Error('Unknown error');
    expect(classifyApiError(error)).toBe('permanent');
  });
});

describe('shouldRetry', () => {
  it('should return true for transient errors under max retries', () => {
    const error = new Error('Rate limit');
    (error as any).status = 429;
    expect(shouldRetry(error, 0, 3)).toBe(true);
    expect(shouldRetry(error, 1, 3)).toBe(true);
    expect(shouldRetry(error, 2, 3)).toBe(true);
  });

  it('should return false for transient errors at max retries', () => {
    const error = new Error('Rate limit');
    (error as any).status = 429;
    expect(shouldRetry(error, 3, 3)).toBe(false);
  });

  it('should return false for transient errors over max retries', () => {
    const error = new Error('Rate limit');
    (error as any).status = 429;
    expect(shouldRetry(error, 4, 3)).toBe(false);
  });

  it('should return false for permanent errors regardless of attempt count', () => {
    const error = new Error('Unauthorized');
    (error as any).status = 401;
    expect(shouldRetry(error, 0, 3)).toBe(false);
    expect(shouldRetry(error, 1, 3)).toBe(false);
    expect(shouldRetry(error, 2, 3)).toBe(false);
  });

  it('should return false when maxRetries is 0', () => {
    const error = new Error('Rate limit');
    (error as any).status = 429;
    expect(shouldRetry(error, 0, 0)).toBe(false);
  });
});

describe('calculateBackoff', () => {
  beforeEach(() => {
    // Mock Math.random for predictable jitter
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should produce exponential sequence: 2s, 4s, 8s, 16s, 32s', () => {
    const initialDelay = 2000;
    const maxDelay = 32000;

    // With Math.random = 0.5, jitterFactor = 0.8 + 0.5 * 0.4 = 1.0 (no jitter effect)
    expect(calculateBackoff(0, initialDelay, maxDelay)).toBe(2000); // 2000 * 2^0 = 2000
    expect(calculateBackoff(1, initialDelay, maxDelay)).toBe(4000); // 2000 * 2^1 = 4000
    expect(calculateBackoff(2, initialDelay, maxDelay)).toBe(8000); // 2000 * 2^2 = 8000
    expect(calculateBackoff(3, initialDelay, maxDelay)).toBe(16000); // 2000 * 2^3 = 16000
    expect(calculateBackoff(4, initialDelay, maxDelay)).toBe(32000); // 2000 * 2^4 = 32000 (capped)
  });

  it('should respect maxDelay cap', () => {
    const initialDelay = 2000;
    const maxDelay = 10000;

    // Should cap at 10000 regardless of exponential growth
    expect(calculateBackoff(5, initialDelay, maxDelay)).toBe(10000);
    expect(calculateBackoff(10, initialDelay, maxDelay)).toBe(10000);
  });

  it('should return initialDelay for attempt 0', () => {
    const initialDelay = 2000;
    const maxDelay = 32000;

    expect(calculateBackoff(0, initialDelay, maxDelay)).toBe(2000);
  });

  it('should apply jitter (output varies within ±20% range)', () => {
    vi.restoreAllMocks(); // Use real Math.random

    const initialDelay = 2000;
    const maxDelay = 32000;
    const attempt = 1;

    // Run multiple times to check jitter variance
    const results = new Set<number>();
    for (let i = 0; i < 20; i++) {
      results.add(calculateBackoff(attempt, initialDelay, maxDelay));
    }

    // Should have variance (not all the same value)
    expect(results.size).toBeGreaterThan(1);

    // All values should be within expected range for attempt 1
    // Base: 2000 * 2^1 = 4000
    // With jitter: 4000 * [0.8, 1.2] = [3200, 4800]
    for (const result of results) {
      expect(result).toBeGreaterThanOrEqual(3200);
      expect(result).toBeLessThanOrEqual(4800);
    }
  });
});
