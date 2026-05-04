import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { runAgentQuery } from './client.js';
import { ProviderRegistry } from '../providers/registry.js';
import type { IAuthenticator, IProvider, ProviderCapabilities, ProviderQueryOptions } from '../providers/types.js';

class RecordingProvider implements IProvider {
  readonly name = 'recording';
  readonly calls: ProviderQueryOptions[] = [];
  readonly capabilities: ProviderCapabilities = {
    supportsStreaming: false,
    supportsTools: false,
    supportsSystemPrompt: true,
    supportsMultiTurn: false,
    maxContextTokens: 100000,
    supportedModels: ['configured-model', 'explicit-model'],
  };

  async query(options: ProviderQueryOptions): Promise<string> {
    this.calls.push(options);
    return 'ok';
  }

  async validateConfiguration(): Promise<boolean> {
    return true;
  }

  getAuthenticator(): IAuthenticator {
    return {
      isConfigured: () => true,
      getCredentialType: () => 'none',
      configure: async () => {},
      validateCredentials: async () => true,
    };
  }
}

describe('runAgentQuery provider configuration', () => {
  let tempDir: string;
  let originalProviderEnv: string | undefined;

  beforeEach(() => {
    ProviderRegistry.reset();
    originalProviderEnv = process.env.AI_SDLC_PROVIDER;
    delete process.env.AI_SDLC_PROVIDER;
    tempDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ai-sdlc-client-provider-')));
  });

  afterEach(() => {
    ProviderRegistry.reset();
    if (originalProviderEnv === undefined) {
      delete process.env.AI_SDLC_PROVIDER;
    } else {
      process.env.AI_SDLC_PROVIDER = originalProviderEnv;
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('uses ai.provider and ai.model from project config', async () => {
    const provider = new RecordingProvider();
    ProviderRegistry.register('recording', () => provider);
    fs.writeFileSync(path.join(tempDir, '.ai-sdlc.json'), JSON.stringify({
      ai: {
        provider: 'recording',
        model: 'configured-model',
      },
    }));

    await runAgentQuery({ prompt: 'hello', workingDirectory: tempDir });

    expect(provider.calls).toHaveLength(1);
    expect(provider.calls[0].model).toBe('configured-model');
  });

  it('does not override an explicit query model', async () => {
    const provider = new RecordingProvider();
    ProviderRegistry.register('recording', () => provider);
    fs.writeFileSync(path.join(tempDir, '.ai-sdlc.json'), JSON.stringify({
      ai: {
        provider: 'recording',
        model: 'configured-model',
      },
    }));

    await runAgentQuery({
      prompt: 'hello',
      workingDirectory: tempDir,
      model: 'explicit-model',
    });

    expect(provider.calls[0].model).toBe('explicit-model');
  });
});
