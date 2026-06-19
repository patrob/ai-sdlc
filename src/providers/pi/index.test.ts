import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  fauxAssistantMessage,
  fauxToolCall,
  registerFauxProvider,
} from '@earendil-works/pi-ai';
import { afterEach,beforeEach, describe, expect, it } from 'vitest';

import type { ProviderProgressEvent } from '../types.js';
import { createPiProvider, PI_PROVIDER_SETTINGS,PiAgenticProvider, PiAuthenticator } from './index.js';

/**
 * These tests exercise the real Pi agent loop offline via Pi's faux provider —
 * no network or API keys required.
 */
describe('PiAgenticProvider', () => {
  let workdir: string;
  let registrations: Array<{ unregister: () => void }> = [];
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    workdir = mkdtempSync(join(tmpdir(), 'pi-prov-'));
    registrations = [];
    for (const key of ['OPENAI_API_KEY', 'OPENROUTER_API_KEY', 'AI_SDLC_MODEL']) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const reg of registrations) reg.unregister();
    rmSync(workdir, { recursive: true, force: true });
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  function fauxModel(apiId: string, modelId = 'm1') {
    const reg = registerFauxProvider({
      api: apiId,
      provider: `prov-${apiId}`,
      models: [{ id: modelId }],
    });
    registrations.push(reg);
    return reg;
  }

  function providerWith(reg: ReturnType<typeof fauxModel>, name = 'openai') {
    return createPiProvider(name, { resolveModel: () => reg.getModel() });
  }

  it('advertises agentic capabilities (tools, streaming, multi-turn)', () => {
    const provider = createPiProvider('openai');
    expect(provider).toBeInstanceOf(PiAgenticProvider);
    expect(provider.capabilities.supportsTools).toBe(true);
    expect(provider.capabilities.supportsStreaming).toBe(true);
    expect(provider.capabilities.supportsMultiTurn).toBe(true);
    expect(provider.capabilities.supportsSystemPrompt).toBe(true);
  });

  it('runs a text query and emits progress events (happy path)', async () => {
    const reg = fauxModel('faux-text');
    reg.setResponses([fauxAssistantMessage('Hello from Pi')]);
    const provider = providerWith(reg);

    const events: ProviderProgressEvent[] = [];
    const response = await provider.query({
      prompt: 'hi',
      systemPrompt: 'you are helpful',
      workingDirectory: workdir,
      onProgress: (e) => events.push(e),
    });

    expect(response).toBe('Hello from Pi');
    const types = events.map((e) => e.type);
    expect(types).toContain('session_start');
    expect(types).toContain('assistant_message');
    expect(types).toContain('completion');

    const last = provider.getLastQueryResult();
    expect(last?.response).toBe('Hello from Pi');
    expect(last?.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('drives a tool-using, file-editing turn against a real working directory', async () => {
    const reg = fauxModel('faux-tool');
    reg.setResponses([
      fauxAssistantMessage(fauxToolCall('write_file', { path: 'out.txt', content: 'agentic data' })),
      fauxAssistantMessage('done writing'),
    ]);
    const provider = providerWith(reg);

    const events: ProviderProgressEvent[] = [];
    const response = await provider.query({
      prompt: 'create out.txt',
      workingDirectory: workdir,
      onProgress: (e) => events.push(e),
    });

    expect(existsSync(join(workdir, 'out.txt'))).toBe(true);
    expect(readFileSync(join(workdir, 'out.txt'), 'utf8')).toBe('agentic data');
    expect(response).toContain('done writing');

    const types = events.map((e) => e.type);
    expect(types).toContain('tool_start');
    expect(types).toContain('tool_end');
    const toolStart = events.find((e) => e.type === 'tool_start');
    expect(toolStart && 'toolName' in toolStart && toolStart.toolName).toBe('write_file');
  });

  it('rejects with the agent error message when the model errors (negative path)', async () => {
    const reg = fauxModel('faux-err');
    reg.setResponses([fauxAssistantMessage('', { stopReason: 'error', errorMessage: 'boom' })]);
    const provider = providerWith(reg);

    const events: ProviderProgressEvent[] = [];
    await expect(
      provider.query({ prompt: 'x', workingDirectory: workdir, onProgress: (e) => events.push(e) })
    ).rejects.toThrow('boom');
    expect(events.some((e) => e.type === 'error')).toBe(true);
  });

  it('honors model id precedence (options.model wins)', async () => {
    const reg = fauxModel('faux-model', 'chosen-model');
    reg.setResponses([fauxAssistantMessage('ok')]);
    // resolveModel ignores the id here, but resolveModelId still runs; assert lastQueryResult model
    const provider = createPiProvider('openai', { resolveModel: () => reg.getModel() });
    await provider.query({ prompt: 'hi', model: 'chosen-model', workingDirectory: workdir });
    expect(provider.getLastQueryResult()?.model).toBe('chosen-model');
  });
});

describe('PiAuthenticator', () => {
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => {
    for (const k of ['OPENAI_API_KEY', 'OPENROUTER_API_KEY']) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });
  afterEach(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it('reports api-key providers as unconfigured without credentials', async () => {
    const auth = createPiProvider('openai').getAuthenticator();
    expect(auth.isConfigured()).toBe(false);
    expect(auth.getCredentialType()).toBe('none');
    await expect(auth.configure()).rejects.toThrow(/OPENAI_API_KEY/);
  });

  it('reports api-key providers as configured with a key', () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    const auth = createPiProvider('openai').getAuthenticator();
    expect(auth.isConfigured()).toBe(true);
    expect(auth.getCredentialType()).toBe('api_key');
  });

  it('treats Ollama as keyless/configured', () => {
    const auth = createPiProvider('ollama').getAuthenticator();
    expect(auth.isConfigured()).toBe(true);
    expect(auth.getCredentialType()).toBe('none');
  });

  it('supplies a non-empty placeholder key for keyless providers (Pi rejects falsy apiKey)', () => {
    // Local Ollama needs no real key, but Pi's OpenAI-compatible client throws
    // on a falsy apiKey, so the authenticator must return a truthy placeholder.
    const auth = new PiAuthenticator(PI_PROVIDER_SETTINGS.ollama);
    expect(auth.getApiKey()).toBeTruthy();
  });

  it('advertises OAuth for Codex and Copilot (delegated credential resolution)', () => {
    expect(createPiProvider('codex').getAuthenticator().getCredentialType()).toBe('oauth');
    expect(createPiProvider('copilot').getAuthenticator().getCredentialType()).toBe('oauth');
  });
});

describe('createPiProvider', () => {
  it('exposes every Pi-routed provider, including claude (Anthropic)', () => {
    expect(Object.keys(PI_PROVIDER_SETTINGS).sort()).toEqual([
      'claude',
      'codex',
      'copilot',
      'ollama',
      'openai',
      'openrouter',
    ]);
  });

  it('routes the claude provider through Pi native anthropic-messages API', () => {
    expect(PI_PROVIDER_SETTINGS.claude).toMatchObject({
      name: 'claude',
      piProvider: 'anthropic',
      api: 'anthropic-messages',
    });
  });

  it('throws for an unknown provider name (negative path)', () => {
    expect(() => createPiProvider('nope')).toThrow(/Unknown Pi provider/);
  });
});
