/**
 * Pi agentic provider — the provider-agnostic engine for ai-sdlc.
 *
 * Backed by Pi (`@earendil-works/pi-ai` + `pi-agent-core`), this single provider
 * implementation drives a true *agentic* loop (tool use + real file editing via
 * `NodeExecutionEnv`) for every non-Claude target: OpenAI, Codex (OAuth),
 * OpenRouter, Ollama (local, no key), and GitHub Copilot (OAuth). It implements
 * the same {@link IProvider} contract as the Claude provider, so agents and the
 * orchestrator are unchanged — only the engine behind the HTTP providers swaps
 * from text-only completions to Pi's tool-calling harness.
 *
 * See `docs/spikes/pi-evaluation.md` for the spike that motivated this.
 */

import type { AgentEvent, AgentMessage, ExecutionEnv } from '@earendil-works/pi-agent-core';
import { Agent } from '@earendil-works/pi-agent-core';
import { NodeExecutionEnv } from '@earendil-works/pi-agent-core/node';
import type { Api, AssistantMessage, Model, Usage } from '@earendil-works/pi-ai';

import { AgentTimeoutError } from '../../core/agent-errors.js';
import { DEFAULT_TIMEOUTS } from '../../core/config.js';
import type {
  IAuthenticator,
  IProvider,
  ProviderCapabilities,
  ProviderQueryOptions,
  ProviderQueryResult,
  TokenUsage,
} from '../types.js';
import { createFileTools } from './tools.js';

/** Configuration for one Pi-routed provider registered in ai-sdlc. */
export interface PiProviderSettings {
  /** ai-sdlc registry name (e.g. 'openai', 'ollama'). */
  name: string;
  /** Underlying Pi provider id used on requests. */
  piProvider: string;
  /** Pi API family used to talk to the provider. */
  api: Api;
  /** Default API base URL. */
  defaultBaseUrl: string;
  /** Env var that overrides the base URL. */
  baseUrlEnvVar: string;
  /** Default model id. */
  defaultModel: string;
  /** Env vars (in priority order) that override the model id. */
  modelEnvVars: string[];
  /** Env vars (in priority order) that supply an API key. */
  apiKeyEnvVars: string[];
  /** Credential mechanism advertised by the authenticator. */
  credentialType: 'api_key' | 'oauth' | 'none';
  /** Whether a credential must be present for the provider to be considered configured. */
  requiresCredential: boolean;
  /** Maximum context window advertised in capabilities. */
  maxContextTokens: number;
  /** Curated list of supported models advertised in capabilities. */
  supportedModels: string[];
  /** Extra request headers (e.g. for Copilot). */
  headers?: Record<string, string>;
}

/** Optional dependency seams for testing (offline via Pi's faux provider). */
export interface PiProviderDeps {
  /** Override model resolution (tests inject a faux `Model`). */
  resolveModel?: (settings: PiProviderSettings, modelId: string, baseUrl: string) => Model<Api>;
  /** Override execution-environment creation. */
  createEnv?: (cwd: string) => ExecutionEnv;
  /**
   * Override credential resolution. When provided, this takes precedence over the
   * provider's env-var lookup. Used to bridge ai-sdlc's keychain/credential-file
   * auth (see {@link ../../core/auth.js}) into Pi's `getApiKey` callback.
   */
  getApiKey?: () => string | undefined;
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

/**
 * Authenticator for Pi-routed providers.
 *
 * - API-key providers (openai, openrouter) are configured when their key env var is set.
 * - OAuth providers (codex, copilot) advertise `'oauth'`; credential resolution is delegated
 *   to Pi (env token or `pi login` store), so they are not blocked on a raw key.
 * - Keyless providers (ollama) are always configured.
 */
export class PiAuthenticator implements IAuthenticator {
  constructor(private readonly settings: PiProviderSettings) {}

  isConfigured(): boolean {
    return !this.settings.requiresCredential || this.getApiKey() !== undefined;
  }

  getCredentialType(): 'api_key' | 'oauth' | 'none' {
    return this.isConfigured() ? this.settings.credentialType : 'none';
  }

  async configure(): Promise<void> {
    if (this.isConfigured()) {
      return;
    }
    const hint =
      this.settings.credentialType === 'oauth'
        ? ` or sign in (e.g. via the provider's OAuth login)`
        : '';
    throw new Error(
      `Provider "${this.settings.name}" is not configured. Set ${this.settings.apiKeyEnvVars.join(
        ' or '
      )}${hint}.`
    );
  }

  async validateCredentials(): Promise<boolean> {
    return this.isConfigured();
  }

  getApiKey(): string | undefined {
    const fromEnv = readFirstEnv(this.settings.apiKeyEnvVars);
    if (fromEnv) {
      return fromEnv;
    }
    // Keyless providers (e.g. a local Ollama server) still need a non-empty
    // placeholder: Pi's OpenAI-compatible client rejects a falsy apiKey even
    // when the backend ignores it. The value is never sent anywhere meaningful.
    if (this.settings.credentialType === 'none') {
      return 'sk-no-key-required';
    }
    return undefined;
  }
}

function buildCustomModel(settings: PiProviderSettings, modelId: string, baseUrl: string): Model<Api> {
  return {
    id: modelId,
    name: modelId,
    api: settings.api,
    provider: settings.piProvider,
    baseUrl,
    reasoning: false,
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: settings.maxContextTokens,
    maxTokens: 8192,
    ...(settings.headers ? { headers: settings.headers } : {}),
  } as Model<Api>;
}

function toTokenUsage(usage: Usage): TokenUsage {
  return {
    inputTokens: usage.input,
    outputTokens: usage.output,
    totalTokens: usage.totalTokens,
  };
}

/** Assistant messages from a Pi transcript. */
function assistantMessages(messages: AgentMessage[]): AssistantMessage[] {
  return messages.filter(
    (m): m is AssistantMessage => (m as { role?: string }).role === 'assistant'
  );
}

function extractAssistantText(messages: AgentMessage[]): string {
  const parts: string[] = [];
  for (const message of assistantMessages(messages)) {
    for (const block of message.content) {
      if (block.type === 'text' && block.text) {
        parts.push(block.text);
      }
    }
  }
  return parts.join('');
}

/**
 * Provider-agnostic agentic provider backed by Pi.
 */
export class PiAgenticProvider implements IProvider {
  readonly name: string;
  readonly capabilities: ProviderCapabilities;

  private readonly authenticator: PiAuthenticator;
  private lastQueryResult: ProviderQueryResult | undefined;

  constructor(
    private readonly settings: PiProviderSettings,
    private readonly deps: PiProviderDeps = {}
  ) {
    this.name = settings.name;
    this.authenticator = new PiAuthenticator(settings);
    this.capabilities = {
      supportsStreaming: true,
      supportsTools: true,
      supportsSystemPrompt: true,
      supportsMultiTurn: true,
      maxContextTokens: settings.maxContextTokens,
      supportedModels: [...settings.supportedModels],
    };
  }

  async query(options: ProviderQueryOptions): Promise<string> {
    const startedAt = Date.now();
    const modelId = this.resolveModelId(options);
    const baseUrl = process.env[this.settings.baseUrlEnvVar] ?? this.settings.defaultBaseUrl;
    const model = this.deps.resolveModel
      ? this.deps.resolveModel(this.settings, modelId, baseUrl)
      : buildCustomModel(this.settings, modelId, baseUrl);

    const cwd = options.workingDirectory ?? process.cwd();
    const env = this.deps.createEnv ? this.deps.createEnv(cwd) : new NodeExecutionEnv({ cwd });
    const tools = createFileTools(env);

    const texts: string[] = [];
    let usage: Usage | undefined;
    let usedModel = model.id;

    const agent = new Agent({
      initialState: { systemPrompt: options.systemPrompt ?? '', model, tools },
      getApiKey: async () => this.deps.getApiKey?.() ?? this.authenticator.getApiKey(),
    });

    const unsubscribe = agent.subscribe((event: AgentEvent) => {
      this.handleEvent(event, options, texts, (u, m) => {
        usage = u;
        usedModel = m;
      });
    });

    options.onProgress?.({ type: 'session_start', sessionId: `pi-${this.name}-${startedAt}` });

    const timeoutMs = options.timeout ?? DEFAULT_TIMEOUTS.agentTimeout;
    try {
      await this.withTimeout(agent.prompt(options.prompt), timeoutMs, () => agent.abort());
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      options.onProgress?.({ type: 'error', message });
      throw error instanceof Error ? error : new Error(message);
    } finally {
      unsubscribe();
      await env.cleanup();
    }

    const response = texts.join('') || extractAssistantText(agent.state.messages);
    if (!response && agent.state.errorMessage) {
      options.onProgress?.({ type: 'error', message: agent.state.errorMessage });
      throw new Error(agent.state.errorMessage);
    }

    this.lastQueryResult = {
      response,
      usage: usage ? toTokenUsage(usage) : undefined,
      durationMs: Date.now() - startedAt,
      model: usedModel,
    };

    options.onProgress?.({ type: 'completion' });
    return response;
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

  private resolveModelId(options: ProviderQueryOptions): string {
    return (
      options.model ??
      readFirstEnv(this.settings.modelEnvVars) ??
      process.env.AI_SDLC_MODEL ??
      this.settings.defaultModel
    );
  }

  private handleEvent(
    event: AgentEvent,
    options: ProviderQueryOptions,
    texts: string[],
    setUsage: (usage: Usage, model: string) => void
  ): void {
    switch (event.type) {
      case 'message_update': {
        const inner = event.assistantMessageEvent;
        if (inner.type === 'text_delta' && inner.delta) {
          texts.push(inner.delta);
          options.onProgress?.({ type: 'assistant_message', content: inner.delta });
        }
        break;
      }
      case 'tool_execution_start':
        options.onProgress?.({ type: 'tool_start', toolName: event.toolName, input: event.args });
        break;
      case 'tool_execution_end':
        options.onProgress?.({ type: 'tool_end', toolName: event.toolName, result: event.result });
        break;
      case 'agent_end': {
        const assistants = assistantMessages(event.messages);
        const last = assistants[assistants.length - 1];
        if (last?.usage) {
          setUsage(last.usage, last.model);
          options.onProgress?.({
            type: 'cost_update',
            inputTokens: last.usage.input,
            outputTokens: last.usage.output,
            model: last.model,
          });
        }
        break;
      }
      default:
        break;
    }
  }

  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number | undefined,
    onTimeout: () => void
  ): Promise<T> {
    if (!timeoutMs || timeoutMs <= 0) {
      return promise;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        onTimeout();
        reject(new AgentTimeoutError(timeoutMs));
      }, timeoutMs);
    });
    try {
      return await Promise.race([promise, timeout]);
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }
}

/** Built-in Pi-routed provider definitions. */
export const PI_PROVIDER_SETTINGS: Record<string, PiProviderSettings> = {
  claude: {
    name: 'claude',
    piProvider: 'anthropic',
    api: 'anthropic-messages',
    defaultBaseUrl: 'https://api.anthropic.com',
    baseUrlEnvVar: 'ANTHROPIC_BASE_URL',
    defaultModel: 'claude-sonnet-4-5-20250929',
    modelEnvVars: ['AI_SDLC_CLAUDE_MODEL', 'AI_SDLC_ANTHROPIC_MODEL'],
    apiKeyEnvVars: ['ANTHROPIC_OAUTH_TOKEN', 'ANTHROPIC_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN'],
    credentialType: 'oauth',
    // Credentials may also come from the keychain / credentials file via the
    // injected getApiKey bridge, so an env var is not strictly required.
    requiresCredential: false,
    maxContextTokens: 200000,
    supportedModels: [
      'claude-sonnet-4-5-20250929',
      'claude-opus-4-5-20251101',
      'claude-opus-4-5',
      'claude-haiku-4-5',
    ],
  },
  openai: {
    name: 'openai',
    piProvider: 'openai',
    api: 'openai-completions',
    defaultBaseUrl: 'https://api.openai.com/v1',
    baseUrlEnvVar: 'OPENAI_BASE_URL',
    defaultModel: 'gpt-5.2',
    modelEnvVars: ['AI_SDLC_OPENAI_MODEL'],
    apiKeyEnvVars: ['OPENAI_API_KEY'],
    credentialType: 'api_key',
    requiresCredential: true,
    maxContextTokens: 400000,
    supportedModels: ['gpt-5.2', 'gpt-5.1', 'gpt-4.1', 'gpt-4o', 'gpt-4o-mini'],
  },
  codex: {
    name: 'codex',
    piProvider: 'openai-codex',
    api: 'openai-codex-responses',
    defaultBaseUrl: 'https://api.openai.com/v1',
    baseUrlEnvVar: 'OPENAI_BASE_URL',
    defaultModel: 'gpt-5.3-codex',
    modelEnvVars: ['AI_SDLC_CODEX_MODEL'],
    apiKeyEnvVars: ['OPENAI_API_KEY'],
    credentialType: 'oauth',
    requiresCredential: false,
    maxContextTokens: 400000,
    supportedModels: ['gpt-5.3-codex', 'gpt-5.2-codex', 'gpt-5.1-codex', 'gpt-5-codex'],
  },
  openrouter: {
    name: 'openrouter',
    piProvider: 'openrouter',
    api: 'openai-completions',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    baseUrlEnvVar: 'OPENROUTER_BASE_URL',
    defaultModel: 'openai/gpt-5.2',
    modelEnvVars: ['AI_SDLC_OPENROUTER_MODEL'],
    apiKeyEnvVars: ['OPENROUTER_API_KEY'],
    credentialType: 'api_key',
    requiresCredential: true,
    maxContextTokens: 200000,
    supportedModels: [
      'openai/gpt-5.2',
      'openai/gpt-4.1',
      'anthropic/claude-sonnet-4.5',
      'google/gemini-2.5-pro',
    ],
  },
  copilot: {
    name: 'copilot',
    piProvider: 'github-copilot',
    api: 'openai-completions',
    defaultBaseUrl: 'https://models.github.ai/inference',
    baseUrlEnvVar: 'COPILOT_BASE_URL',
    defaultModel: 'openai/gpt-4.1',
    modelEnvVars: ['AI_SDLC_COPILOT_MODEL'],
    apiKeyEnvVars: ['COPILOT_API_KEY', 'GITHUB_TOKEN', 'GH_TOKEN'],
    credentialType: 'oauth',
    requiresCredential: false,
    maxContextTokens: 128000,
    supportedModels: ['openai/gpt-4.1', 'openai/gpt-4o', 'openai/gpt-4o-mini'],
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2026-03-10',
    },
  },
  ollama: {
    name: 'ollama',
    piProvider: 'ollama',
    api: 'openai-completions',
    defaultBaseUrl: 'http://localhost:11434/v1',
    baseUrlEnvVar: 'OLLAMA_BASE_URL',
    defaultModel: 'llama3.1',
    modelEnvVars: ['AI_SDLC_OLLAMA_MODEL'],
    apiKeyEnvVars: [],
    credentialType: 'none',
    requiresCredential: false,
    maxContextTokens: 128000,
    supportedModels: ['llama3.1', 'llama3.2', 'qwen2.5-coder', 'mistral'],
  },
};

/**
 * Create a Pi-routed provider by ai-sdlc registry name.
 *
 * @param name - one of the keys in {@link PI_PROVIDER_SETTINGS}
 * @param deps - optional dependency seams (used by tests)
 */
export function createPiProvider(name: string, deps?: PiProviderDeps): PiAgenticProvider {
  const settings = PI_PROVIDER_SETTINGS[name];
  if (!settings) {
    throw new Error(
      `Unknown Pi provider "${name}". Available: ${Object.keys(PI_PROVIDER_SETTINGS).join(', ')}`
    );
  }
  return new PiAgenticProvider(settings, deps);
}
