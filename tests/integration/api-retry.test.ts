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
      initialDelay: 100,
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

function createApiError(message: string, status: number): Error {
  const error = new Error(message);
  (error as any).status = status;
  return error;
}

function createNetworkError(message: string, code: string): Error {
  const error = new Error(message);
  (error as any).code = code;
  return error;
}

function createThrowingGenerator(error: Error) {
  let thrown = false;
  const generator = {
    [Symbol.asyncIterator]() { return this; },
    async next() {
      if (thrown) {
        return { done: true, value: undefined };
      }
      thrown = true;
      throw error;
    },
    async return() {
      return { done: true, value: undefined };
    },
    async throw() {
      return { done: true, value: undefined };
    },
  };
  return generator;
}

function createSuccessGenerator(content: string) {
  return (async function* () {
    yield { type: 'system', subtype: 'init', session_id: 'session-1' };
    yield { type: 'assistant', content };
    yield { type: 'system', subtype: 'completion' };
  })();
}

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
    vi.mocked(agentSdk.query).mockReturnValue(createSuccessGenerator('Success response') as any);

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
        return createThrowingGenerator(createApiError('Rate limit exceeded', 429)) as any;
      } else {
        return createSuccessGenerator('Success after retries') as any;
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

    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result).toBe('Success after retries');
    expect(agentSdk.query).toHaveBeenCalledTimes(3);

    const retryEvents = progressEvents.filter(e => e.type === 'retry');
    expect(retryEvents.length).toBe(2);
    expect((retryEvents[0] as any).attempt).toBe(1);
    expect((retryEvents[1] as any).attempt).toBe(2);
  });

  it('should not retry on HTTP 401 authentication error', async () => {
    vi.mocked(agentSdk.query).mockReturnValue(
      createThrowingGenerator(createApiError('Unauthorized', 401)) as any
    );

    await expect(
      runAgentQuery({
        prompt: 'Test prompt',
        workingDirectory: process.cwd(),
      })
    ).rejects.toThrow('Unauthorized');

    expect(agentSdk.query).toHaveBeenCalledTimes(1);
  });

  it('should fail after max retries with 503 errors', async () => {
    vi.mocked(agentSdk.query).mockImplementation(() => {
      return createThrowingGenerator(createApiError('Service unavailable', 503)) as any;
    });

    const resultPromise = runAgentQuery({
      prompt: 'Test prompt',
      workingDirectory: process.cwd(),
    });

    let caughtError: Error | undefined;
    resultPromise.catch(e => { caughtError = e; });

    await vi.runAllTimersAsync();

    expect(caughtError).toBeDefined();
    expect(caughtError?.message).toMatch(/API request failed after 3 retry attempts/);
    expect(agentSdk.query).toHaveBeenCalledTimes(4);
  });

  it('should retry on network timeout (ETIMEDOUT)', async () => {
    let callCount = 0;

    vi.mocked(agentSdk.query).mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return createThrowingGenerator(createNetworkError('Connection timeout', 'ETIMEDOUT')) as any;
      } else {
        return createSuccessGenerator('Success after timeout') as any;
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
    let callCount = 0;
    vi.mocked(agentSdk.query).mockImplementation(() => {
      callCount++;
      return createThrowingGenerator(createApiError('Rate limit', 429)) as any;
    });

    const resultPromise = runAgentQuery({
      prompt: 'Test prompt',
      workingDirectory: process.cwd(),
    });

    let caughtError: Error | undefined;
    resultPromise.catch(e => { caughtError = e; });

    await vi.advanceTimersByTimeAsync(6000);

    expect(caughtError).toBeDefined();
    expect(agentSdk.query).toHaveBeenCalled();
  });

  it('should emit warning after 2nd retry', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    vi.mocked(agentSdk.query).mockImplementation(() => {
      return createThrowingGenerator(createApiError('Rate limit', 429)) as any;
    });

    const resultPromise = runAgentQuery({
      prompt: 'Test prompt',
      workingDirectory: process.cwd(),
    });

    let caughtError: Error | undefined;
    resultPromise.catch(e => { caughtError = e; });

    await vi.runAllTimersAsync();

    expect(caughtError).toBeDefined();
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Experiencing temporary issues')
    );

    consoleWarnSpy.mockRestore();
  });

  it('should apply exponential backoff with correct delays', async () => {
    vi.mocked(agentSdk.query).mockImplementation(() => {
      return createThrowingGenerator(createApiError('Rate limit', 429)) as any;
    });

    const resultPromise = runAgentQuery({
      prompt: 'Test prompt',
      workingDirectory: process.cwd(),
    });

    let caughtError: Error | undefined;
    resultPromise.catch(e => { caughtError = e; });

    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(150);
    await vi.advanceTimersByTimeAsync(250);
    await vi.advanceTimersByTimeAsync(500);

    expect(caughtError).toBeDefined();
    expect(agentSdk.query).toHaveBeenCalledTimes(4);
  });
});
