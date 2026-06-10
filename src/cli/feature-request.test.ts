import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { parseStory } from '../core/story.js';
import type { IAuthenticator, IProvider, ProviderCapabilities, ProviderQueryOptions } from '../providers/types.js';
import { clarifyFeatureRequest, createStoryFromFeatureRequest } from './feature-request.js';

class TestProvider implements IProvider {
  readonly name = 'test';
  readonly capabilities: ProviderCapabilities = {
    supportsStreaming: false,
    supportsTools: false,
    supportsSystemPrompt: true,
    supportsMultiTurn: false,
    maxContextTokens: 100000,
    supportedModels: ['test-model'],
  };

  readonly calls: ProviderQueryOptions[] = [];

  constructor(private response: string) {}

  async query(options: ProviderQueryOptions): Promise<string> {
    this.calls.push(options);
    return this.response;
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

describe('feature request intake', () => {
  let tempDir: string;
  let sdlcRoot: string;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-04T12:00:00Z'));
    tempDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ai-sdlc-feature-request-')));
    sdlcRoot = path.join(tempDir, '.ai-sdlc');
    fs.mkdirSync(path.join(sdlcRoot, 'stories'), { recursive: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('clarifies a feature request with the configured provider contract', async () => {
    const provider = new TestProvider(`## Story Title
Better Search Filters

## Clarified Request
Users need composable filters for saved searches.

## Acceptance Criteria
- [ ] Users can filter by owner
- [ ] Users can filter by status

## Open Questions
- Should saved filters be shared?`);

    const result = await clarifyFeatureRequest('Make search better', sdlcRoot, provider);

    expect(provider.calls).toHaveLength(1);
    expect(provider.calls[0].systemPrompt).toContain('/grill-me');
    expect(provider.calls[0].prompt).toContain('Make search better');
    expect(provider.calls[0].workingDirectory).toBe(tempDir);
    expect(result.title).toBe('Better Search Filters');
    expect(result.content).toContain('Users need composable filters');
    expect(result.content).toContain('Users can filter by owner');
  });

  it('creates a story from a clarified /grill-me feature request', async () => {
    const provider = new TestProvider(`## Story Title
Usage Limits

## Clarified Request
Admins can configure per-team usage limits.

## Acceptance Criteria
- [ ] Admins can set monthly token limits
- [ ] Users see a warning before limits are exhausted`);

    const story = await createStoryFromFeatureRequest(
      'Let admins control AI spending',
      sdlcRoot,
      { grillMe: true, provider }
    );

    const reloaded = parseStory(story.path);
    expect(reloaded.frontmatter.title).toBe('Usage Limits');
    expect(reloaded.frontmatter.status).toBe('backlog');
    expect(reloaded.content).toContain('## Original Feature Request');
    expect(reloaded.content).toContain('Let admins control AI spending');
    expect(reloaded.content).toContain('## /grill-me Clarification');
    expect(reloaded.content).toContain('Admins can set monthly token limits');
  });

  it('creates a plain feature request story without calling the provider', async () => {
    const provider = new TestProvider('unused');

    const story = await createStoryFromFeatureRequest(
      'Add billing alerts',
      sdlcRoot,
      { grillMe: false, provider }
    );

    const reloaded = parseStory(story.path);
    expect(provider.calls).toHaveLength(0);
    expect(reloaded.frontmatter.title).toBe('Add billing alerts');
    expect(reloaded.content).toContain('## Feature Request');
    expect(reloaded.content).toContain('Add billing alerts');
  });
});
