/**
 * Error thrown when an agent query times out
 */
export class AgentTimeoutError extends Error {
  constructor(timeoutMs: number) {
    const timeoutSec = Math.round(timeoutMs / 1000);
    super(`Agent query timed out after ${timeoutSec} seconds. Consider increasing 'timeouts.agentTimeout' in .ai-sdlc.json`);
    this.name = 'AgentTimeoutError';
  }
}

/**
 * Error thrown when authentication fails (e.g., expired token)
 */
export class AuthenticationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

/**
 * Classify API errors as either transient (retryable) or permanent (not retryable)
 */
export function classifyApiError(error: Error): 'transient' | 'permanent' {
  // Check for AuthenticationError specifically (permanent)
  if (error instanceof AuthenticationError) {
    return 'permanent';
  }

  // Check for HTTP status codes (if present on error object)
  if ('status' in error && typeof (error as any).status === 'number') {
    const status = (error as any).status;

    // Rate limiting and server errors are transient
    if (status === 429 || status === 503 || status >= 500) {
      return 'transient';
    }

    // Client errors (4xx) are permanent
    if (status >= 400 && status < 500) {
      return 'permanent';
    }
  }

  // Check for network error codes (transient)
  if ('code' in error) {
    const code = (error as any).code;
    const transientCodes = [
      'ETIMEDOUT',
      'ECONNRESET',
      'ENOTFOUND',
      'ECONNREFUSED',
      'EHOSTUNREACH',
      'EPIPE',
    ];

    if (transientCodes.includes(code)) {
      return 'transient';
    }
  }

  // Default to permanent for unknown errors
  return 'permanent';
}

/**
 * Determine if an error should be retried based on error type and attempt number
 */
export function shouldRetry(error: Error, attemptNumber: number, maxRetries: number): boolean {
  // If we've exceeded max retries, don't retry
  if (attemptNumber >= maxRetries) {
    return false;
  }

  // Only retry transient errors
  return classifyApiError(error) === 'transient';
}

/**
 * Calculate exponential backoff delay with jitter
 */
export function calculateBackoff(attemptNumber: number, initialDelay: number, maxDelay: number): number {
  // Exponential backoff: delay = initialDelay * (2 ^ attemptNumber)
  const exponentialDelay = initialDelay * Math.pow(2, attemptNumber);

  // Cap at maxDelay
  const cappedDelay = Math.min(exponentialDelay, maxDelay);

  // Add jitter (±25% random variation)
  const jitterRange = cappedDelay * 0.25;
  const jitter = (Math.random() * jitterRange * 2) - jitterRange;

  return Math.max(0, Math.round(cappedDelay + jitter));
}
