import { describe, it, expect } from 'vitest';
import { classifyApiError, shouldRetry, calculateBackoff, AuthenticationError } from './agent-errors.js';

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
  it('should return true for transient error within retry limit', () => {
    const error = new Error('Rate limit exceeded');
    (error as any).status = 429;
    expect(shouldRetry(error, 0, 3)).toBe(true);
  });

  it('should return false for permanent error', () => {
    const error = new Error('Bad request');
    (error as any).status = 400;
    expect(shouldRetry(error, 0, 3)).toBe(false);
  });

  it('should return false when max retries exceeded', () => {
    const error = new Error('Rate limit exceeded');
    (error as any).status = 429;
    expect(shouldRetry(error, 3, 3)).toBe(false);
  });

  it('should return false when attempt number equals max retries', () => {
    const error = new Error('Service unavailable');
    (error as any).status = 503;
    expect(shouldRetry(error, 3, 3)).toBe(false);
  });
});

describe('calculateBackoff', () => {
  it('should calculate exponential backoff', () => {
    const delay = calculateBackoff(0, 1000, 32000);
    expect(delay).toBeGreaterThanOrEqual(750); // 1000 - 25%
    expect(delay).toBeLessThanOrEqual(1250); // 1000 + 25%
  });

  it('should increase delay with attempt number', () => {
    const delay0 = calculateBackoff(0, 1000, 32000);
    const delay1 = calculateBackoff(1, 1000, 32000);
    const delay2 = calculateBackoff(2, 1000, 32000);

    // Delays should generally increase (accounting for jitter)
    expect(delay1).toBeGreaterThan(delay0 * 0.5);
    expect(delay2).toBeGreaterThan(delay1 * 0.5);
  });

  it('should cap delay at maxDelay', () => {
    const delay = calculateBackoff(10, 1000, 5000);
    expect(delay).toBeLessThanOrEqual(6250); // 5000 + 25%
  });

  it('should never return negative delay', () => {
    const delay = calculateBackoff(0, 1000, 32000);
    expect(delay).toBeGreaterThanOrEqual(0);
  });
});
