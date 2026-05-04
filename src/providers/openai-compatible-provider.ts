import type {
  IAuthenticator,
  IProvider,
  ProviderCapabilities,
  ProviderQueryOptions,
  ProviderQueryResult,
  TokenUsage,
} from './types.js';

type RequestKind = 'chat-completions' | 'responses';

interface HttpProviderSettings {
  name: string;
  apiKeyEnvVars: string[];
  baseUrlEnvVar: string;
  defaultBaseUrl: string;
  endpointPath: string;
  defaultModel: string;
  modelEnvVars: string[];
  requestKind: RequestKind;
  capabilities: ProviderCapabilities;
  headers?: Record<string, string>;
}

class EnvironmentAuthenticator implements IAuthenticator {
  constructor(private readonly envVars: string[]) {}

  isConfigured(): boolean {
    return this.getApiKey() !== undefined;
  }

  getCredentialType(): 'api_key' | 'oauth' | 'none' {
    return this.isConfigured() ? 'api_key' : 'none';
  }

  async configure(): Promise<void> {
    if (!this.isConfigured()) {
      throw new Error(`Provider credentials not found. Set ${this.envVars.join(' or ')}.`);
    }
  }

  async validateCredentials(): Promise<boolean> {
    return this.isConfigured();
  }

  getApiKey(): string | undefined {
    return readFirstEnv(this.envVars);
  }
}

abstract class HttpJsonProvider implements IProvider {
  readonly name: string;
  readonly capabilities: ProviderCapabilities;

  private readonly authenticator: EnvironmentAuthenticator;
  private lastQueryResult: ProviderQueryResult | undefined;

  protected constructor(private readonly settings: HttpProviderSettings) {
    this.name = settings.name;
    this.capabilities = settings.capabilities;
    this.authenticator = new EnvironmentAuthenticator(settings.apiKeyEnvVars);
  }

  async query(options: ProviderQueryOptions): Promise<string> {
    const apiKey = this.authenticator.getApiKey();
    if (!apiKey) {
      throw new Error(
        `Provider "${this.name}" is not configured. Set ${this.settings.apiKeyEnvVars.join(' or ')}.`
      );
    }

    const model = this.resolveModel(options);
    const url = this.resolveUrl();
    const startedAt = Date.now();
    const controller = new AbortController();
    const timeoutId = this.createTimeout(controller, options.timeout);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          ...this.settings.headers,
        },
        body: JSON.stringify(this.buildBody(options, model)),
        signal: controller.signal,
      });

      if (!response.ok) {
        const message = await this.readErrorMessage(response);
        throw new Error(`${this.name} request failed (${response.status} ${response.statusText}): ${message}`);
      }

      const data = await response.json();
      const text = this.extractText(data);
      if (!text) {
        throw new Error(`${this.name} response did not contain assistant text`);
      }

      const sessionId = readStringProperty(data, 'id') ?? `${this.name}-session`;
      const responseModel = readStringProperty(data, 'model') ?? model;
      const usage = normalizeUsage(readObjectProperty(data, 'usage'));
      const durationMs = Date.now() - startedAt;

      this.lastQueryResult = {
        response: text,
        usage,
        durationMs,
        model: responseModel,
      };

      options.onProgress?.({ type: 'session_start', sessionId });
      options.onProgress?.({ type: 'assistant_message', content: text });
      if (usage) {
        options.onProgress?.({
          type: 'cost_update',
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          model: responseModel,
        });
      }
      options.onProgress?.({ type: 'completion' });

      return text;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      options.onProgress?.({ type: 'error', message });
      throw error;
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }

  async validateConfiguration(): Promise<boolean> {
    return this.authenticator.validateCredentials();
  }

  getAuthenticator(): IAuthenticator {
    return this.authenticator;
  }

  getLastQueryResult(): ProviderQueryResult | undefined {
    return this.lastQueryResult;
  }

  private resolveModel(options: ProviderQueryOptions): string {
    return options.model
      ?? readFirstEnv(this.settings.modelEnvVars)
      ?? process.env.AI_SDLC_MODEL
      ?? this.settings.defaultModel;
  }

  private resolveUrl(): string {
    const baseUrl = process.env[this.settings.baseUrlEnvVar] ?? this.settings.defaultBaseUrl;
    return `${baseUrl.replace(/\/+$/, '')}/${this.settings.endpointPath.replace(/^\/+/, '')}`;
  }

  private buildBody(options: ProviderQueryOptions, model: string): Record<string, unknown> {
    if (this.settings.requestKind === 'responses') {
      return {
        model,
        input: options.prompt,
        ...(options.systemPrompt ? { instructions: options.systemPrompt } : {}),
        stream: false,
      };
    }

    return {
      model,
      messages: [
        ...(options.systemPrompt ? [{ role: 'system', content: options.systemPrompt }] : []),
        { role: 'user', content: options.prompt },
      ],
      stream: false,
    };
  }

  private extractText(data: unknown): string {
    if (this.settings.requestKind === 'responses') {
      return extractResponsesText(data);
    }

    return extractChatCompletionText(data);
  }

  private async readErrorMessage(response: Response): Promise<string> {
    try {
      const data = await response.json();
      const error = readObjectProperty(data, 'error');
      return readStringProperty(error, 'message')
        ?? readStringProperty(data, 'message')
        ?? JSON.stringify(data);
    } catch {
      return response.text();
    }
  }

  private createTimeout(
    controller: AbortController,
    timeoutMs: number | undefined
  ): ReturnType<typeof setTimeout> | undefined {
    if (!timeoutMs || timeoutMs <= 0) {
      return undefined;
    }

    return setTimeout(() => controller.abort(), timeoutMs);
  }
}

export class OpenAIProvider extends HttpJsonProvider {
  constructor() {
    super({
      name: 'openai',
      apiKeyEnvVars: ['OPENAI_API_KEY'],
      baseUrlEnvVar: 'OPENAI_BASE_URL',
      defaultBaseUrl: 'https://api.openai.com/v1',
      endpointPath: '/chat/completions',
      defaultModel: 'gpt-5.2',
      modelEnvVars: ['AI_SDLC_OPENAI_MODEL'],
      requestKind: 'chat-completions',
      capabilities: makeCapabilities(400000, [
        'gpt-5.2',
        'gpt-5.1',
        'gpt-4.1',
        'gpt-4o',
        'gpt-4o-mini',
      ]),
    });
  }
}

export class CodexProvider extends HttpJsonProvider {
  constructor() {
    super({
      name: 'codex',
      apiKeyEnvVars: ['OPENAI_API_KEY'],
      baseUrlEnvVar: 'OPENAI_BASE_URL',
      defaultBaseUrl: 'https://api.openai.com/v1',
      endpointPath: '/responses',
      defaultModel: 'gpt-5.3-codex',
      modelEnvVars: ['AI_SDLC_CODEX_MODEL'],
      requestKind: 'responses',
      capabilities: makeCapabilities(400000, [
        'gpt-5.3-codex',
        'gpt-5.2-codex',
        'gpt-5.1-codex',
        'gpt-5-codex',
      ]),
    });
  }
}

export class OpenRouterProvider extends HttpJsonProvider {
  constructor() {
    super({
      name: 'openrouter',
      apiKeyEnvVars: ['OPENROUTER_API_KEY'],
      baseUrlEnvVar: 'OPENROUTER_BASE_URL',
      defaultBaseUrl: 'https://openrouter.ai/api/v1',
      endpointPath: '/chat/completions',
      defaultModel: 'openai/gpt-5.2',
      modelEnvVars: ['AI_SDLC_OPENROUTER_MODEL'],
      requestKind: 'chat-completions',
      capabilities: makeCapabilities(200000, [
        'openai/gpt-5.2',
        'openai/gpt-4.1',
        'anthropic/claude-sonnet-4.5',
        'google/gemini-2.5-pro',
      ]),
    });
  }
}

export class CopilotProvider extends HttpJsonProvider {
  constructor() {
    super({
      name: 'copilot',
      apiKeyEnvVars: ['COPILOT_API_KEY', 'GITHUB_TOKEN', 'GH_TOKEN'],
      baseUrlEnvVar: 'COPILOT_BASE_URL',
      defaultBaseUrl: 'https://models.github.ai',
      endpointPath: '/inference/chat/completions',
      defaultModel: 'openai/gpt-4.1',
      modelEnvVars: ['AI_SDLC_COPILOT_MODEL'],
      requestKind: 'chat-completions',
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2026-03-10',
      },
      capabilities: makeCapabilities(128000, [
        'openai/gpt-4.1',
        'openai/gpt-4o',
        'openai/gpt-4o-mini',
      ]),
    });
  }
}

function makeCapabilities(maxContextTokens: number, supportedModels: string[]): ProviderCapabilities {
  return {
    supportsStreaming: false,
    supportsTools: false,
    supportsSystemPrompt: true,
    supportsMultiTurn: false,
    maxContextTokens,
    supportedModels,
  };
}

function readFirstEnv(envVars: string[]): string | undefined {
  for (const envVar of envVars) {
    const value = process.env[envVar];
    if (value && value.trim()) {
      return value;
    }
  }
  return undefined;
}

function extractChatCompletionText(data: unknown): string {
  const choices = readArrayProperty(data, 'choices');
  const firstChoice = choices[0];
  const message = readObjectProperty(firstChoice, 'message');
  const content = readProperty(message, 'content')
    ?? readProperty(firstChoice, 'text')
    ?? readProperty(readObjectProperty(firstChoice, 'delta'), 'content');

  return extractTextContent(content);
}

function extractResponsesText(data: unknown): string {
  const outputText = readStringProperty(data, 'output_text');
  if (outputText) {
    return outputText;
  }

  const parts: string[] = [];
  for (const item of readArrayProperty(data, 'output')) {
    const contentItems = readArrayProperty(item, 'content');
    for (const contentItem of contentItems) {
      const text = readStringProperty(contentItem, 'text')
        ?? readStringProperty(contentItem, 'content');
      if (text) {
        parts.push(text);
      }
    }
  }

  return parts.join('\n');
}

function extractTextContent(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }

  if (!Array.isArray(content)) {
    return '';
  }

  return content
    .map(item => readStringProperty(item, 'text') ?? readStringProperty(item, 'content') ?? '')
    .filter(Boolean)
    .join('\n');
}

function normalizeUsage(usage: Record<string, unknown> | undefined): TokenUsage | undefined {
  if (!usage) {
    return undefined;
  }

  const inputTokens = readNumberProperty(usage, 'prompt_tokens')
    ?? readNumberProperty(usage, 'input_tokens')
    ?? 0;
  const outputTokens = readNumberProperty(usage, 'completion_tokens')
    ?? readNumberProperty(usage, 'output_tokens')
    ?? 0;
  const totalTokens = readNumberProperty(usage, 'total_tokens')
    ?? inputTokens + outputTokens;

  return {
    inputTokens,
    outputTokens,
    totalTokens,
  };
}

function readProperty(value: unknown, key: string): unknown {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }

  return (value as Record<string, unknown>)[key];
}

function readObjectProperty(value: unknown, key: string): Record<string, unknown> | undefined {
  const property = readProperty(value, key);
  return typeof property === 'object' && property !== null && !Array.isArray(property)
    ? property as Record<string, unknown>
    : undefined;
}

function readArrayProperty(value: unknown, key: string): unknown[] {
  const property = readProperty(value, key);
  return Array.isArray(property) ? property : [];
}

function readStringProperty(value: unknown, key: string): string | undefined {
  const property = readProperty(value, key);
  return typeof property === 'string' ? property : undefined;
}

function readNumberProperty(value: unknown, key: string): number | undefined {
  const property = readProperty(value, key);
  return typeof property === 'number' && Number.isFinite(property) ? property : undefined;
}
