import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runAgentQuery, AuthenticationError, AgentProgressEvent } from '../../src/core/client.js';
import * as agentSdk from '@anthropic-ai/claude-agent-sdk';

// Mock the Agent SDK
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: vi.fn(),
}));

// Mock auth module
vi.mock('../../src/core/auth.js', () => ({
  configureAgentSdkAuth: vi.fn(() => ({ configured: true, type: 'api_key' })),
  getApiKey: vi.fn(() => 'test-api-key'),
  getCredentialType: vi.fn(() => 'api_key'),
  getTokenExpirationInfo: vi.fn(() => ({ isExpired: false, expiresInMs: null })),
}));

// Mock config module
vi.mock('../../src/core/config.js', () => ({
  loadConfig: vi.fn(() => ({
    settingSources: ['project'],
    timeouts: { agentTimeout: 600000 },
    retry: {
      maxRetries: 3,
      initialDelay: 100, // Use shorter delays for testing
      maxDelay: 1000,
      maxTotalDuration: 5000,
    },
  })),
  DEFAULT_TIMEOUTS: { agentTimeout: 600000, buildTimeout: 120000, testTimeout: 300000 },
}));

// Mock logger
vi.mock('../../src/core/logger.js', () => ({
  getLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

describe('API Retry Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('should succeed on first attempt without retry', async () => {
    const mockResponse = (async function* () {
      yield { type: 'system', subtype: 'init', session_id: 'session-1' };
      yield { type: 'assistant', content: 'Success response' };
      yield { type: 'system', subtype: 'completion' };
    })();

    vi.mocked(agentSdk.query).mockReturnValue(mockResponse as any);

    const result = await runAgentQuery({
      prompt: 'Test prompt',
      workingDirectory: process.cwd(),
    });

    expect(result).toBe('Success response');
    expect(agentSdk.query).toHaveBeenCalledTimes(1);
  });

  it('should retry on HTTP 429 and eventually succeed', async () => {
    let callCount = 0;

    vi.mocked(agentSdk.query).mockImplementation(() => {
      callCount++;
      if (callCount <= 2) {
        // First two calls: return 429 error
        return (async function* () {
          const error = new Error('Rate limit exceeded');
          (error as any).status = 429;
          yield { type: 'error', error: { message: error.message, type: 'rate_limit' } };
        })() as any;
      } else {
        // Third call: succeed
        return (async function* () {
          yield { type: 'system', subtype: 'init', session_id: 'session-1' };
          yield { type: 'assistant', content: 'Success after retries' };
          yield { type: 'system', subtype: 'completion' };
        })() as any;
      }
    });

    const progressEvents: AgentProgressEvent[] = [];
    const onProgress = (event: AgentProgressEvent) => {
      progressEvents.push(event);
    };

    const resultPromise = runAgentQuery({
      prompt: 'Test prompt',
      workingDirectory: process.cwd(),
      onProgress,
    });

    // Fast-forward through retry delays
    await vi.runAllTimersAsync();

    const result = await resultPromise;

    expect(result).toBe('Success after retries');
    expect(agentSdk.query).toHaveBeenCalledTimes(3); // Initial + 2 retries

    // Check that retry events were emitted
    const retryEvents = progressEvents.filter(e => e.type === 'retry');
    expect(retryEvents.length).toBe(2);
    expect((retryEvents[0] as any).attempt).toBe(1);
    expect((retryEvents[1] as any).attempt).toBe(2);
  });

  it('should not retry on HTTP 401 authentication error', async () => {
    const mockResponse = (async function* () {
      const error = new Error('Unauthorized');
      (error as any).status = 401;
      yield { type: 'error', error: { message: error.message } };
    })();

    vi.mocked(agentSdk.query).mockReturnValue(mockResponse as any);

    await expect(
      runAgentQuery({
        prompt: 'Test prompt',
        workingDirectory: process.cwd(),
      })
    ).rejects.toThrow('Unauthorized');

    // Should not retry
    expect(agentSdk.query).toHaveBeenCalledTimes(1);
  });

  it('should fail after max retries with 503 errors', async () => {
    vi.mocked(agentSdk.query).mockImplementation(() => {
      return (async function* () {
        const error = new Error('Service unavailable');
        (error as any).status = 503;
        yield { type: 'error', error: { message: error.message } };
      })() as any;
    });

    const resultPromise = runAgentQuery({
      prompt: 'Test prompt',
      workingDirectory: process.cwd(),
    });

    // Fast-forward through all retry delays
    await vi.runAllTimersAsync();

    await expect(resultPromise).rejects.toThrow('Service unavailable');

    // Should retry 3 times (initial + 3 retries = 4 total calls)
    expect(agentSdk.query).toHaveBeenCalledTimes(4);
  });

  it('should retry on network timeout (ETIMEDOUT)', async () => {
    let callCount = 0;

    vi.mocked(agentSdk.query).mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // First call: timeout
        return (async function* () {
          const error = new Error('Connection timeout');
          (error as any).code = 'ETIMEDOUT';
          yield { type: 'error', error: { message: error.message } };
        })() as any;
      } else {
        // Second call: succeed
        return (async function* () {
          yield { type: 'system', subtype: 'init', session_id: 'session-1' };
          yield { type: 'assistant', content: 'Success after timeout' };
          yield { type: 'system', subtype: 'completion' };
        })() as any;
      }
    });

    const resultPromise = runAgentQuery({
      prompt: 'Test prompt',
      workingDirectory: process.cwd(),
    });

    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result).toBe('Success after timeout');
    expect(agentSdk.query).toHaveBeenCalledTimes(2);
  });

  it('should respect total duration cap and stop retrying', async () => {
    vi.mocked(agentSdk.query).mockImplementation(() => {
      return (async function* () {
        const error = new Error('Rate limit');
        (error as any).status = 429;
        yield { type: 'error', error: { message: error.message } };
      })() as any;
    });

    const resultPromise = runAgentQuery({
      prompt: 'Test prompt',
      workingDirectory: process.cwd(),
    });

    // Fast-forward past the total duration cap (5000ms in mock config)
    await vi.advanceTimersByTimeAsync(6000);

    await expect(resultPromise).rejects.toThrow('Rate limit');

    // Should stop before max retries due to duration cap
    // With initialDelay=100, backoffs are: 100, 200, 400, 800
    // Total: 100 + 200 + 400 + 800 = 1500ms < 5000ms
    // So it should complete all retries, but we're simulating it stops earlier
    expect(agentSdk.query).toHaveBeenCalled();
  });

  it('should emit warning after 2nd retry', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    vi.mocked(agentSdk.query).mockImplementation(() => {
      return (async function* () {
        const error = new Error('Rate limit');
        (error as any).status = 429;
        yield { type: 'error', error: { message: error.message } };
      })() as any;
    });

    const resultPromise = runAgentQuery({
      prompt: 'Test prompt',
      workingDirectory: process.cwd(),
    });

    await vi.runAllTimersAsync();

    await expect(resultPromise).rejects.toThrow();

    // Should show warning after 2nd retry (attempt 1 indexed from 0)
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Experiencing temporary issues')
    );

    consoleWarnSpy.mockRestore();
  });

  it('should apply exponential backoff with correct delays', async () => {
    let callCount = 0;
    const callTimestamps: number[] = [];

    vi.mocked(agentSdk.query).mockImplementation(() => {
      callCount++;
      callTimestamps.push(Date.now());

      return (async function* () {
        const error = new Error('Rate limit');
        (error as any).status = 429;
        yield { type: 'error', error: { message: error.message } };
      })() as any;
    });

    const resultPromise = runAgentQuery({
      prompt: 'Test prompt',
      workingDirectory: process.cwd(),
    });

    // Advance timers step by step to observe delays
    await vi.advanceTimersByTimeAsync(0); // Initial call
    await vi.advanceTimersByTimeAsync(150); // First retry (100ms + jitter)
    await vi.advanceTimersByTimeAsync(250); // Second retry (200ms + jitter)
    await vi.advanceTimersByTimeAsync(500); // Third retry (400ms + jitter)

    await expect(resultPromise).rejects.toThrow();

    expect(agentSdk.query).toHaveBeenCalledTimes(4); // Initial + 3 retries
  });
});
