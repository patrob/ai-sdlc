import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  CodexProvider,
  CopilotProvider,
  OpenAIProvider,
  OpenRouterProvider,
} from './openai-compatible-provider.js';
import type { ProviderProgressEvent } from './types.js';

function jsonResponse(body: unknown, status = 200, statusText = 'OK'): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    json: vi.fn(async () => body),
    text: vi.fn(async () => JSON.stringify(body)),
  } as unknown as Response;
}

function parseFetchBody(fetchMock: ReturnType<typeof vi.fn>): any {
  const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
  return JSON.parse(String(init.body));
}

describe('OpenAI-compatible providers', () => {
  const originalEnv = { ...process.env };
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_BASE_URL;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_BASE_URL;
    delete process.env.GITHUB_TOKEN;
    delete process.env.GH_TOKEN;
    delete process.env.COPILOT_API_KEY;
    delete process.env.COPILOT_BASE_URL;
    delete process.env.AI_SDLC_MODEL;
    delete process.env.AI_SDLC_OPENAI_MODEL;
    delete process.env.AI_SDLC_CODEX_MODEL;
    delete process.env.AI_SDLC_OPENROUTER_MODEL;
    delete process.env.AI_SDLC_COPILOT_MODEL;

    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('sends OpenAI chat-completion requests with configured prompt, model, auth, and progress metadata', async () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    fetchMock.mockResolvedValue(jsonResponse({
      id: 'chatcmpl-test',
      model: 'gpt-test',
      choices: [
        {
          message: {
            role: 'assistant',
            content: 'clarified story',
          },
        },
      ],
      usage: {
        prompt_tokens: 3,
        completion_tokens: 4,
        total_tokens: 7,
      },
    }));

    const provider = new OpenAIProvider();
    const events: ProviderProgressEvent[] = [];

    const result = await provider.query({
      prompt: 'Clarify feature',
      systemPrompt: 'Ask hard questions',
      model: 'gpt-test',
      timeout: 1000,
      onProgress: event => events.push(event),
    });

    expect(result).toBe('clarified story');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.openai.com/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer sk-test',
          'Content-Type': 'application/json',
        }),
      })
    );
    expect(parseFetchBody(fetchMock)).toEqual({
      model: 'gpt-test',
      messages: [
        { role: 'system', content: 'Ask hard questions' },
        { role: 'user', content: 'Clarify feature' },
      ],
      stream: false,
    });
    expect(events).toEqual([
      { type: 'session_start', sessionId: 'chatcmpl-test' },
      { type: 'assistant_message', content: 'clarified story' },
      { type: 'cost_update', inputTokens: 3, outputTokens: 4, model: 'gpt-test' },
      { type: 'completion' },
    ]);
    expect(provider.getLastQueryResult()).toEqual(expect.objectContaining({
      response: 'clarified story',
      usage: {
        inputTokens: 3,
        outputTokens: 4,
        totalTokens: 7,
      },
      model: 'gpt-test',
    }));
  });

  it('does not make a network call when OpenAI credentials are missing', async () => {
    const provider = new OpenAIProvider();

    expect(provider.getAuthenticator().isConfigured()).toBe(false);
    await expect(provider.validateConfiguration()).resolves.toBe(false);
    await expect(provider.query({ prompt: 'hello' })).rejects.toThrow('OPENAI_API_KEY');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('surfaces provider HTTP errors with the upstream message', async () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    fetchMock.mockResolvedValue(jsonResponse({
      error: {
        message: 'model not found',
      },
    }, 404, 'Not Found'));

    const provider = new OpenAIProvider();
    const events: ProviderProgressEvent[] = [];

    await expect(provider.query({
      prompt: 'hello',
      onProgress: event => events.push(event),
    })).rejects.toThrow('openai request failed (404 Not Found): model not found');

    expect(events).toEqual([
      { type: 'error', message: 'openai request failed (404 Not Found): model not found' },
    ]);
  });

  it('uses the Responses API for Codex models', async () => {
    process.env.OPENAI_API_KEY = 'sk-codex';
    process.env.AI_SDLC_CODEX_MODEL = 'gpt-5.3-codex';
    fetchMock.mockResolvedValue(jsonResponse({
      id: 'resp-test',
      model: 'gpt-5.3-codex',
      output_text: 'implementation plan',
      usage: {
        input_tokens: 5,
        output_tokens: 6,
        total_tokens: 11,
      },
    }));

    const provider = new CodexProvider();
    const result = await provider.query({
      prompt: 'Implement the story',
      systemPrompt: 'Use TDD',
    });

    expect(result).toBe('implementation plan');
    expect(provider.name).toBe('codex');
    expect(provider.capabilities.supportedModels).toContain('gpt-5.3-codex');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.openai.com/v1/responses',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer sk-codex',
        }),
      })
    );
    expect(parseFetchBody(fetchMock)).toEqual({
      model: 'gpt-5.3-codex',
      input: 'Implement the story',
      instructions: 'Use TDD',
      stream: false,
    });
  });

  it('uses OpenRouter chat completions with OpenRouter credentials and model overrides', async () => {
    process.env.OPENROUTER_API_KEY = 'or-test';
    process.env.OPENROUTER_BASE_URL = 'https://openrouter.example/api/v1';
    process.env.AI_SDLC_OPENROUTER_MODEL = 'anthropic/claude-sonnet-4.5';
    fetchMock.mockResolvedValue(jsonResponse({
      id: 'or-test',
      choices: [{ message: { content: 'routed response' } }],
    }));

    const provider = new OpenRouterProvider();
    const result = await provider.query({ prompt: 'Research options' });

    expect(result).toBe('routed response');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://openrouter.example/api/v1/chat/completions',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer or-test',
        }),
      })
    );
    expect(parseFetchBody(fetchMock).model).toBe('anthropic/claude-sonnet-4.5');
  });

  it('uses GitHub Models inference for the Copilot provider', async () => {
    process.env.GITHUB_TOKEN = 'gh-test';
    fetchMock.mockResolvedValue(jsonResponse({
      id: 'gh-models-test',
      choices: [{ message: { content: 'copilot response' } }],
    }));

    const provider = new CopilotProvider();
    const result = await provider.query({ prompt: 'Review code' });

    expect(result).toBe('copilot response');
    expect(provider.name).toBe('copilot');
    expect(provider.getAuthenticator().isConfigured()).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://models.github.ai/inference/chat/completions',
      expect.objectContaining({
        headers: expect.objectContaining({
          Accept: 'application/vnd.github+json',
          Authorization: 'Bearer gh-test',
          'X-GitHub-Api-Version': '2026-03-10',
        }),
      })
    );
    expect(parseFetchBody(fetchMock).model).toBe('openai/gpt-4.1');
  });
});
