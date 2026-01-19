# Architecture Analysis Report: AI-SDLC Codebase

## Executive Summary

This report provides a comprehensive architecture analysis of the AI-SDLC codebase with recommendations for making it modular, extensible, and ready for future provider integrations (such as GitHub Copilot SDK). The codebase is a TypeScript CLI that orchestrates AI-assisted software development lifecycle management using the Claude Code SDK.

**Key Findings:**

1. **Tight Coupling to Claude SDK**: The `client.ts` module directly imports and uses the Claude Agent SDK with no abstraction layer
2. **Function-Based Agent Architecture**: Agents are implemented as standalone functions with hardcoded system prompts
3. **No Provider Abstraction**: Claude-specific code is spread throughout the codebase
4. **Good Separation of Concerns**: Core business logic (story management, kanban, workflow state) is reasonably decoupled
5. **Opportunities for SOLID Improvements**: Several violations can be addressed through refactoring

---

## 1. Current Architecture Analysis

### 1.1 Module Structure Overview

```
src/
├── agents/           # AI agent implementations
│   ├── implementation.ts
│   ├── orchestrator.ts
│   ├── planning.ts
│   ├── refinement.ts
│   ├── research.ts
│   ├── review.ts
│   ├── rework.ts
│   ├── single-task.ts
│   └── state-assessor.ts
├── cli/              # Command-line interface
│   └── commands.ts
├── core/             # Business logic and infrastructure
│   ├── auth.ts
│   ├── client.ts     # PRIMARY COUPLING POINT
│   ├── config.ts
│   ├── kanban.ts
│   ├── logger.ts
│   ├── story.ts
│   ├── task-parser.ts
│   ├── task-progress.ts
│   ├── workflow-state.ts
│   └── worktree.ts
├── types/            # TypeScript type definitions
│   └── index.ts
└── index.ts          # Main entry point
```

### 1.2 Dependency Graph

```
                    ┌─────────────┐
                    │   CLI       │
                    │ commands.ts │
                    └──────┬──────┘
                           │
           ┌───────────────┼───────────────┐
           ▼               ▼               ▼
    ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
    │   Agents    │ │    Core     │ │   Types     │
    │             │ │             │ │             │
    └──────┬──────┘ └──────┬──────┘ └─────────────┘
           │               │
           ▼               │
    ┌─────────────┐        │
    │  client.ts  │◄───────┘
    │ (SDK Layer) │
    └──────┬──────┘
           │
           ▼
    ┌─────────────────────┐
    │ @anthropic-ai/      │
    │ claude-agent-sdk    │
    └─────────────────────┘
```

### 1.3 Primary Coupling Points

#### 1.3.1 `src/core/client.ts` - The Main Integration Point

This file is the **single most critical coupling point** to the Claude SDK:

```typescript
// Line 1 - Direct SDK import
import { query } from '@anthropic-ai/claude-agent-sdk';

// Line 250-259 - Direct SDK usage
const response = query({
  prompt: options.prompt,
  options: {
    model: options.model || 'claude-sonnet-4-5-20250929',
    systemPrompt: options.systemPrompt,
    cwd: workingDir,
    permissionMode: 'acceptEdits',
    settingSources: settingSources,
  },
});
```

**Issues:**
- No interface abstraction for the provider
- Hardcoded Claude-specific model names
- Claude-specific options (permissionMode, settingSources) embedded in core function
- Authentication handling specific to Claude/Anthropic

#### 1.3.2 `src/core/auth.ts` - Authentication Coupling

Authentication is tightly coupled to Anthropic's authentication mechanisms:

- API key environment variable: `ANTHROPIC_API_KEY`
- OAuth token handling specific to Claude Code
- macOS Keychain integration for Claude Code credentials
- Credential file path: `~/.claude/.credentials.json`

#### 1.3.3 Agent System Prompts - Hardcoded Instructions

Each agent contains Claude-specific system prompts:

| File | Constant | Purpose |
|------|----------|---------|
| `research.ts` | `RESEARCH_SYSTEM_PROMPT` | Research methodology instructions |
| `planning.ts` | `PLANNING_SYSTEM_PROMPT` | Planning specialist instructions |
| `implementation.ts` | `IMPLEMENTATION_SYSTEM_PROMPT` | Implementation instructions |
| `single-task.ts` | `TASK_AGENT_SYSTEM_PROMPT` | Single-task execution instructions |
| `review.ts` | Review-specific prompts | Review criteria and evaluation |

### 1.4 Current Data Flow

```
Story File (.md)
      │
      ▼
┌─────────────────┐
│  parseStory()   │  ◄── src/core/story.ts
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  assessState()  │  ◄── src/core/kanban.ts
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Agent Phase    │  ◄── src/agents/*.ts
│  (research,     │
│   plan, impl,   │
│   review)       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ runAgentQuery() │  ◄── src/core/client.ts (COUPLING)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Claude SDK     │
│    query()      │
└─────────────────┘
```

---

## 2. Component-by-Component Analysis

### 2.1 Agents Module (`src/agents/`)

#### Current State

| Agent | Responsibility | Lines | Coupling Level |
|-------|---------------|-------|----------------|
| `research.ts` | Codebase analysis, web research | 713 | HIGH - direct `runAgentQuery` |
| `planning.ts` | Implementation plan creation | 224 | HIGH - direct `runAgentQuery` |
| `implementation.ts` | Code implementation | ~400 | HIGH - direct `runAgentQuery` |
| `review.ts` | Code review and validation | ~500 | HIGH - direct `runAgentQuery` |
| `orchestrator.ts` | Task coordination | 579 | MEDIUM - delegates to single-task |
| `single-task.ts` | Individual task execution | 442 | HIGH - direct `runAgentQuery` |
| `rework.ts` | Refinement coordination | 212 | LOW - workflow only |
| `state-assessor.ts` | State assessment | ~100 | LOW - delegates to kanban |
| `refinement.ts` | Refinement loop | ~200 | MEDIUM |

#### Issues Identified

1. **No Agent Interface**: Agents are functions, not classes implementing a common interface
2. **Hardcoded Prompts**: System prompts are string constants in each file
3. **Direct SDK Dependency**: Each agent calls `runAgentQuery` directly
4. **Inconsistent Return Types**: Some agents return `AgentResult`, others have custom types
5. **Mixed Responsibilities**: Research agent handles both codebase and web research

### 2.2 Core Module (`src/core/`)

#### Current State

| Module | Responsibility | Provider Coupling |
|--------|---------------|-------------------|
| `client.ts` | SDK wrapper | CRITICAL |
| `auth.ts` | Authentication | HIGH (Claude-specific) |
| `config.ts` | Configuration | LOW |
| `story.ts` | Story CRUD | NONE |
| `kanban.ts` | Workflow state | NONE |
| `worktree.ts` | Git worktrees | NONE |
| `workflow-state.ts` | Execution state | NONE |
| `logger.ts` | Logging | NONE |
| `task-parser.ts` | Task parsing | NONE |
| `task-progress.ts` | Progress tracking | NONE |

#### Positive Observations

- Story management (`story.ts`) is well-isolated with proper file locking
- Configuration (`config.ts`) is centralized and extensible
- Workflow state persistence is atomic and recoverable
- Git worktree service uses a proper class-based design

### 2.3 Types Module (`src/types/`)

#### Current State

The types module defines:
- Story-related types (`StoryStatus`, `StoryFrontmatter`, `Story`)
- Agent result types (`AgentResult`, `ReviewResult`)
- Configuration types (`Config`, `TDDConfig`, `ReviewConfig`)
- Task types (`ImplementationTask`, `TaskProgress`)
- Workflow types (`WorkflowExecutionState`)

#### Issues

1. **No Provider-Agnostic Types**: No abstraction for provider capabilities
2. **Claude-Specific Assumptions**: Types assume Claude's response format
3. **Missing Interface Definitions**: No `IAgent`, `IProvider`, or `IAuthenticator` interfaces

### 2.4 CLI Module (`src/cli/`)

The CLI module orchestrates commands but has minimal direct provider coupling. It delegates to agents and core modules appropriately.

---

## 3. Provider Abstraction Layer Design

### 3.1 Proposed Interface Hierarchy

```typescript
// src/providers/types.ts

/**
 * Core capability flags for providers
 */
export interface ProviderCapabilities {
  supportsStreaming: boolean;
  supportsTools: boolean;
  supportsSystemPrompt: boolean;
  supportsMultiTurn: boolean;
  maxContextTokens: number;
  supportedModels: string[];
}

/**
 * Provider-agnostic query options
 */
export interface ProviderQueryOptions {
  prompt: string;
  systemPrompt?: string;
  workingDirectory?: string;
  model?: string;
  timeout?: number;
  onProgress?: ProviderProgressCallback;
}

/**
 * Unified progress event format
 */
export type ProviderProgressEvent =
  | { type: 'session_start'; sessionId: string }
  | { type: 'tool_start'; toolName: string; input?: Record<string, unknown> }
  | { type: 'tool_end'; toolName: string; result?: unknown }
  | { type: 'message'; content: string }
  | { type: 'completion' }
  | { type: 'error'; message: string }
  | { type: 'retry'; attempt: number; delay: number; error: string };

export type ProviderProgressCallback = (event: ProviderProgressEvent) => void;

/**
 * Core provider interface - all providers must implement this
 */
export interface IProvider {
  readonly name: string;
  readonly capabilities: ProviderCapabilities;

  query(options: ProviderQueryOptions): Promise<string>;
  validateConfiguration(): Promise<boolean>;
  getAuthenticator(): IAuthenticator;
}

/**
 * Authentication interface
 */
export interface IAuthenticator {
  isConfigured(): boolean;
  getCredentialType(): 'api_key' | 'oauth' | 'none';
  configure(): Promise<void>;
  validateCredentials(): Promise<boolean>;
  getTokenExpirationInfo?(): { isExpired: boolean; expiresInMs: number | null };
}
```

### 3.2 Claude Provider Implementation

```typescript
// src/providers/claude/index.ts

import { query } from '@anthropic-ai/claude-agent-sdk';
import { IProvider, IAuthenticator, ProviderCapabilities, ProviderQueryOptions } from '../types.js';
import { ClaudeAuthenticator } from './authenticator.js';

export class ClaudeProvider implements IProvider {
  readonly name = 'claude';

  readonly capabilities: ProviderCapabilities = {
    supportsStreaming: true,
    supportsTools: true,
    supportsSystemPrompt: true,
    supportsMultiTurn: true,
    maxContextTokens: 200000,
    supportedModels: [
      'claude-sonnet-4-5-20250929',
      'claude-opus-4-5-20251101',
    ],
  };

  private authenticator: ClaudeAuthenticator;

  constructor(private config: ClaudeProviderConfig) {
    this.authenticator = new ClaudeAuthenticator(config);
  }

  async query(options: ProviderQueryOptions): Promise<string> {
    // Claude-specific implementation
    const response = query({
      prompt: options.prompt,
      options: {
        model: options.model || this.config.defaultModel,
        systemPrompt: options.systemPrompt,
        cwd: options.workingDirectory,
        permissionMode: 'acceptEdits',
        settingSources: this.config.settingSources,
      },
    });

    // Process async generator...
    return result;
  }

  async validateConfiguration(): Promise<boolean> {
    return this.authenticator.validateCredentials();
  }

  getAuthenticator(): IAuthenticator {
    return this.authenticator;
  }
}
```

### 3.3 Provider Registry Pattern

```typescript
// src/providers/registry.ts

import { IProvider } from './types.js';

export class ProviderRegistry {
  private static providers = new Map<string, () => IProvider>();
  private static instances = new Map<string, IProvider>();

  static register(name: string, factory: () => IProvider): void {
    this.providers.set(name, factory);
  }

  static get(name: string): IProvider {
    if (!this.instances.has(name)) {
      const factory = this.providers.get(name);
      if (!factory) {
        throw new Error(`Provider '${name}' is not registered`);
      }
      this.instances.set(name, factory());
    }
    return this.instances.get(name)!;
  }

  static getDefault(): IProvider {
    const defaultName = process.env.AI_SDLC_PROVIDER || 'claude';
    return this.get(defaultName);
  }

  static listProviders(): string[] {
    return Array.from(this.providers.keys());
  }
}

// Registration at startup
ProviderRegistry.register('claude', () => new ClaudeProvider(loadClaudeConfig()));
// Future: ProviderRegistry.register('copilot', () => new CopilotProvider(...));
```

### 3.4 Agent Interface Design

```typescript
// src/agents/types.ts

export interface IAgent {
  readonly name: string;
  readonly requiredCapabilities: (keyof ProviderCapabilities)[];

  execute(context: AgentContext): Promise<AgentResult>;
  getSystemPrompt(context: AgentContext): string;
}

export interface AgentContext {
  storyPath: string;
  sdlcRoot: string;
  provider: IProvider;
  options?: AgentOptions;
}

export abstract class BaseAgent implements IAgent {
  abstract readonly name: string;
  abstract readonly requiredCapabilities: (keyof ProviderCapabilities)[];

  protected provider: IProvider;
  protected logger = getLogger();

  constructor(provider: IProvider) {
    this.provider = provider;
    this.validateCapabilities();
  }

  private validateCapabilities(): void {
    for (const cap of this.requiredCapabilities) {
      if (!this.provider.capabilities[cap]) {
        throw new Error(
          `Provider '${this.provider.name}' does not support required capability: ${cap}`
        );
      }
    }
  }

  abstract execute(context: AgentContext): Promise<AgentResult>;
  abstract getSystemPrompt(context: AgentContext): string;

  protected async runQuery(prompt: string, context: AgentContext): Promise<string> {
    return this.provider.query({
      prompt,
      systemPrompt: this.getSystemPrompt(context),
      workingDirectory: path.dirname(context.sdlcRoot),
      onProgress: context.options?.onProgress,
    });
  }
}
```

---

## 4. SOLID Principles Application

### 4.1 Single Responsibility Principle (SRP) Violations

#### Violation 1: `research.ts` - Multiple Responsibilities

**Current State**: The research agent handles:
- Codebase context gathering
- Web research decision logic
- Content sanitization
- FAR scoring

**Recommendation**: Split into focused modules:

```typescript
// src/agents/research/codebase-analyzer.ts
export class CodebaseAnalyzer {
  async gatherContext(sdlcRoot: string): Promise<CodebaseContext>;
}

// src/agents/research/web-researcher.ts
export class WebResearcher {
  shouldPerform(story: Story, context: CodebaseContext): boolean;
  async perform(story: Story, context: CodebaseContext): Promise<WebResearchResult>;
}

// src/agents/research/content-sanitizer.ts
export class ContentSanitizer {
  sanitizeWebContent(text: string): string;
  sanitizeForLogging(text: string): string;
  sanitizeCodebaseContext(text: string): string;
}

// src/agents/research/far-evaluator.ts
export class FARScoreEvaluator {
  evaluate(finding: string): FARScore;
}
```

#### Violation 2: `client.ts` - Authentication + Query Execution

**Current State**: The client handles authentication checking AND query execution.

**Recommendation**: Separate concerns:

```typescript
// src/core/authentication-manager.ts
export class AuthenticationManager {
  validateCredentials(): Promise<boolean>;
  getActiveCredential(): Credential;
  refreshIfNeeded(): Promise<void>;
}

// src/core/query-executor.ts
export class QueryExecutor {
  constructor(private authManager: AuthenticationManager) {}
  execute(options: QueryOptions): Promise<string>;
}
```

### 4.2 Open/Closed Principle (OCP) Violations

#### Violation: Adding New Providers Requires Code Changes

**Current State**: Adding a new provider requires modifying `client.ts`.

**Recommendation**: Use the provider registry pattern (Section 3.3) to allow extension without modification.

### 4.3 Liskov Substitution Principle (LSP)

**Current State**: No class hierarchies exist, so LSP is not applicable yet.

**Recommendation**: When implementing the agent base class, ensure derived agents can substitute without breaking behavior.

### 4.4 Interface Segregation Principle (ISP) Violations

#### Violation: `Config` Interface is Too Large

**Current State**: The `Config` interface has 15+ properties covering all aspects.

**Recommendation**: Split into focused interfaces:

```typescript
export interface AgentConfig {
  timeouts: TimeoutConfig;
  retry: RetryConfig;
}

export interface WorkflowConfig {
  stageGates: StageGateConfig;
  refinement: RefinementConfig;
  reviewConfig: ReviewConfig;
}

export interface InfrastructureConfig {
  worktree: WorktreeConfig;
  logging: LogConfig;
  daemon: DaemonConfig;
}

export interface Config {
  agent: AgentConfig;
  workflow: WorkflowConfig;
  infrastructure: InfrastructureConfig;
  // ... other focused sections
}
```

### 4.5 Dependency Inversion Principle (DIP) Violations

#### Violation 1: Agents Depend on Concrete `runAgentQuery`

**Current State**:
```typescript
// src/agents/research.ts
import { runAgentQuery } from '../core/client.js';  // Concrete dependency
```

**Recommendation**: Inject provider through constructor:

```typescript
export class ResearchAgent extends BaseAgent {
  constructor(provider: IProvider) {
    super(provider);
  }

  async execute(context: AgentContext): Promise<AgentResult> {
    const result = await this.runQuery(prompt, context);  // Uses injected provider
  }
}
```

#### Violation 2: Hardcoded Logger Dependency

**Current State**:
```typescript
const logger = getLogger();  // Global function call
```

**Recommendation**: Inject logger:

```typescript
export class ResearchAgent extends BaseAgent {
  constructor(provider: IProvider, private logger: ILogger = getLogger()) {
    super(provider);
  }
}
```

---

## 5. Design Pattern Recommendations

### 5.1 Strategy Pattern - For Provider Selection

```typescript
// Provider selection based on configuration
export interface IProviderStrategy {
  selectProvider(context: ExecutionContext): IProvider;
}

export class ConfigBasedProviderStrategy implements IProviderStrategy {
  selectProvider(context: ExecutionContext): IProvider {
    const providerName = context.config.provider || 'claude';
    return ProviderRegistry.get(providerName);
  }
}

export class CapabilityBasedProviderStrategy implements IProviderStrategy {
  selectProvider(context: ExecutionContext): IProvider {
    // Select provider based on required capabilities
    const required = context.requiredCapabilities;
    return ProviderRegistry.findWithCapabilities(required);
  }
}
```

### 5.2 Factory Pattern - For Agent Creation

```typescript
// src/agents/factory.ts

export class AgentFactory {
  constructor(private provider: IProvider) {}

  create(type: AgentType): IAgent {
    switch (type) {
      case 'research':
        return new ResearchAgent(this.provider);
      case 'planning':
        return new PlanningAgent(this.provider);
      case 'implementation':
        return new ImplementationAgent(this.provider);
      case 'review':
        return new ReviewAgent(this.provider);
      default:
        throw new Error(`Unknown agent type: ${type}`);
    }
  }
}
```

### 5.3 Adapter Pattern - For Provider Normalization

```typescript
// src/providers/adapters/copilot-adapter.ts

// Adapts Copilot SDK to our IProvider interface
export class CopilotProviderAdapter implements IProvider {
  readonly name = 'copilot';

  constructor(private copilotClient: CopilotClient) {}

  async query(options: ProviderQueryOptions): Promise<string> {
    // Translate our options to Copilot's format
    const copilotRequest = this.translateRequest(options);
    const response = await this.copilotClient.complete(copilotRequest);
    return this.translateResponse(response);
  }

  private translateRequest(options: ProviderQueryOptions): CopilotRequest {
    // Map our generic options to Copilot-specific format
  }

  private translateResponse(response: CopilotResponse): string {
    // Map Copilot response to our expected format
  }
}
```

### 5.4 Observer Pattern - For Progress Monitoring

```typescript
// src/core/progress-monitor.ts

export interface IProgressObserver {
  onProgress(event: ProgressEvent): void;
}

export class ProgressMonitor {
  private observers: IProgressObserver[] = [];

  subscribe(observer: IProgressObserver): void {
    this.observers.push(observer);
  }

  unsubscribe(observer: IProgressObserver): void {
    this.observers = this.observers.filter(o => o !== observer);
  }

  notify(event: ProgressEvent): void {
    for (const observer of this.observers) {
      observer.onProgress(event);
    }
  }
}

// Usage
const monitor = new ProgressMonitor();
monitor.subscribe(new ConsoleProgressLogger());
monitor.subscribe(new FileProgressLogger());
monitor.subscribe(new MetricsCollector());
```

### 5.5 Template Method Pattern - For Agent Execution

```typescript
// src/agents/base-agent.ts

export abstract class BaseAgent implements IAgent {
  async execute(context: AgentContext): Promise<AgentResult> {
    // Template method defining the algorithm
    try {
      this.beforeExecute(context);

      const prompt = this.buildPrompt(context);
      const result = await this.runQuery(prompt, context);
      const parsed = this.parseResult(result, context);

      await this.afterExecute(context, parsed);

      return this.buildSuccessResult(parsed);
    } catch (error) {
      return this.buildErrorResult(error);
    }
  }

  // Hook methods for subclasses
  protected beforeExecute(context: AgentContext): void {}
  protected afterExecute(context: AgentContext, result: any): void {}

  // Abstract methods subclasses must implement
  protected abstract buildPrompt(context: AgentContext): string;
  protected abstract parseResult(result: string, context: AgentContext): any;
}
```

### 5.6 Dependency Injection Container

```typescript
// src/di/container.ts

export class DIContainer {
  private instances = new Map<string, any>();
  private factories = new Map<string, () => any>();

  register<T>(token: string, factory: () => T): void {
    this.factories.set(token, factory);
  }

  registerSingleton<T>(token: string, factory: () => T): void {
    this.factories.set(token, () => {
      if (!this.instances.has(token)) {
        this.instances.set(token, factory());
      }
      return this.instances.get(token);
    });
  }

  resolve<T>(token: string): T {
    const factory = this.factories.get(token);
    if (!factory) {
      throw new Error(`No factory registered for token: ${token}`);
    }
    return factory();
  }
}

// Bootstrap
const container = new DIContainer();
container.registerSingleton('provider', () => ProviderRegistry.getDefault());
container.registerSingleton('logger', () => createLogger());
container.register('researchAgent', () =>
  new ResearchAgent(container.resolve('provider'), container.resolve('logger'))
);
```

---

## 6. Extensibility Roadmap

### Phase 1: Single Provider Abstraction (Weeks 1-2)

**Goal**: Extract Claude-specific code behind interfaces without changing behavior.

**Tasks**:

1. Create `IProvider` interface and `IAuthenticator` interface
2. Implement `ClaudeProvider` and `ClaudeAuthenticator`
3. Create `ProviderRegistry` with single provider
4. Update `client.ts` to use provider abstraction
5. Ensure all existing tests pass

**Files to Create**:
- `src/providers/types.ts`
- `src/providers/registry.ts`
- `src/providers/claude/index.ts`
- `src/providers/claude/authenticator.ts`

**Files to Modify**:
- `src/core/client.ts` - Use provider from registry
- `src/core/auth.ts` - Move Claude logic to provider

### Phase 2: Agent Abstraction (Weeks 3-4)

**Goal**: Convert agents from functions to classes with injectable dependencies.

**Tasks**:

1. Create `IAgent` interface and `BaseAgent` abstract class
2. Convert each agent function to a class extending `BaseAgent`
3. Create `AgentFactory` for agent instantiation
4. Update CLI to use factory pattern
5. Add unit tests for each agent class

**Conversion Order** (by complexity, lowest first):
1. `state-assessor.ts` (lowest coupling)
2. `rework.ts`
3. `planning.ts`
4. `research.ts` (split into components)
5. `review.ts`
6. `implementation.ts`
7. `single-task.ts`
8. `orchestrator.ts`

### Phase 3: Multi-Provider Support (Weeks 5-8)

**Goal**: Enable registration and use of multiple providers.

**Tasks**:

1. Implement provider capability checking
2. Add provider configuration to `.ai-sdlc.json`
3. Create adapter framework for new providers
4. Implement fallback/retry across providers
5. Add provider-specific prompt optimization
6. Create provider comparison tests

**Configuration Example**:
```json
{
  "provider": {
    "default": "claude",
    "fallback": ["copilot", "openai"],
    "providers": {
      "claude": {
        "model": "claude-sonnet-4-5-20250929",
        "maxTokens": 200000
      },
      "copilot": {
        "model": "gpt-4",
        "endpoint": "https://api.github.com/copilot"
      }
    }
  }
}
```

### Phase 4: Custom Agents (Weeks 9-12)

**Goal**: Allow users to define custom agents via configuration or plugins.

**Tasks**:

1. Define agent plugin interface
2. Create agent discovery mechanism
3. Implement dynamic agent loading
4. Add custom prompt templates
5. Create agent composition (chaining)
6. Document custom agent development

**Plugin Interface**:
```typescript
// User-defined agent in .ai-sdlc/agents/custom-review.ts
export default {
  name: 'custom-review',
  extends: 'review',
  systemPrompt: `...custom prompt...`,

  beforeExecute(context) {
    // Custom pre-processing
  },

  afterExecute(context, result) {
    // Custom post-processing
  }
};
```

---

## 7. Risk Assessment

### 7.1 Breaking Changes

| Change | Risk Level | Mitigation |
|--------|------------|------------|
| Provider interface introduction | LOW | Maintain backward-compatible `runAgentQuery` wrapper |
| Agent class conversion | MEDIUM | Keep function exports that delegate to classes |
| Config structure changes | MEDIUM | Version config schema, support migration |
| Type definition changes | LOW | Export aliases for deprecated types |

### 7.2 Migration Complexity

| Component | Complexity | Effort Estimate |
|-----------|------------|-----------------|
| Provider abstraction | LOW | 2-3 days |
| Single agent conversion | LOW | 1 day per agent |
| All agents conversion | MEDIUM | 2 weeks |
| Multi-provider support | HIGH | 3-4 weeks |
| Custom agent framework | HIGH | 3-4 weeks |

### 7.3 Testing Implications

**New Test Categories Required**:

1. **Provider Unit Tests**: Test each provider in isolation
2. **Provider Integration Tests**: Test provider with real APIs (needs mocking strategy)
3. **Agent Unit Tests**: Test agents with mock providers
4. **Cross-Provider Tests**: Verify same behavior across providers
5. **Migration Tests**: Verify old configs work with new code

**Test Infrastructure Needs**:

```typescript
// src/test/mocks/mock-provider.ts
export class MockProvider implements IProvider {
  readonly name = 'mock';
  readonly capabilities = { /* configurable */ };

  private responses: Map<string, string> = new Map();

  setResponse(promptPattern: RegExp, response: string): void {
    // Configure mock responses
  }

  async query(options: ProviderQueryOptions): Promise<string> {
    // Return configured responses
  }
}
```

### 7.4 Performance Considerations

| Concern | Impact | Mitigation |
|---------|--------|------------|
| Provider initialization overhead | LOW | Lazy initialization, singleton pattern |
| Additional abstraction layers | NEGLIGIBLE | Inline hot paths if needed |
| Dynamic provider loading | LOW | Cache loaded providers |
| Prompt transformation overhead | NEGLIGIBLE | Pre-compile common transformations |

---

## 8. Implementation Priority Matrix

| Item | Business Value | Technical Debt Reduction | Effort | Priority |
|------|---------------|-------------------------|--------|----------|
| Provider interface | HIGH | HIGH | LOW | P0 |
| Agent base class | HIGH | HIGH | MEDIUM | P0 |
| Provider registry | MEDIUM | HIGH | LOW | P1 |
| Agent factory | MEDIUM | MEDIUM | LOW | P1 |
| Claude provider extraction | HIGH | HIGH | MEDIUM | P1 |
| SRP refactoring (research.ts) | MEDIUM | HIGH | MEDIUM | P2 |
| DI container | MEDIUM | MEDIUM | MEDIUM | P2 |
| Multi-provider support | HIGH | LOW | HIGH | P3 |
| Custom agent framework | MEDIUM | LOW | HIGH | P4 |

---

## 9. Appendix: File-by-File Recommendations

### A. High Priority Changes

| File | Current Issues | Recommended Changes |
|------|---------------|---------------------|
| `src/core/client.ts` | Direct SDK coupling | Extract to `ClaudeProvider` class |
| `src/core/auth.ts` | Claude-specific | Move to `providers/claude/authenticator.ts` |
| `src/agents/research.ts` | SRP violation, large file | Split into 4 modules |
| `src/types/index.ts` | No provider abstraction | Add `IProvider`, `IAgent` interfaces |

### B. Medium Priority Changes

| File | Current Issues | Recommended Changes |
|------|---------------|---------------------|
| `src/agents/planning.ts` | Function-based, no interface | Convert to class extending `BaseAgent` |
| `src/agents/review.ts` | Function-based, hardcoded prompts | Convert to class, externalize prompts |
| `src/agents/implementation.ts` | Function-based | Convert to class |
| `src/core/config.ts` | Large Config interface | Split into focused interfaces |

### C. Low Priority Changes

| File | Current Issues | Recommended Changes |
|------|---------------|---------------------|
| `src/agents/orchestrator.ts` | Reasonable design | Minor refactoring after agent conversion |
| `src/agents/single-task.ts` | Reasonable design | Convert to class |
| `src/core/story.ts` | Well-designed | No changes needed |
| `src/core/kanban.ts` | Well-designed | No changes needed |

---

---

## 10. Google ADK Multi-Agent Pattern Integration

Reference: [Google's Developer Guide to Multi-Agent Patterns in ADK](https://developers.googleblog.com/en/developers-guide-to-multi-agent-patterns-in-adk/)

### 10.1 Pattern Applicability Analysis

| Pattern | Current Usage | Applicability | Recommendation |
|---------|--------------|---------------|----------------|
| Sequential Pipeline | ✅ Implicit | HIGH | Formalize SDLC stages |
| Coordinator/Dispatcher | ✅ `orchestrator.ts` | HIGH | Enhance with intelligent routing |
| Parallel Fan-Out/Gather | ⚠️ Limited | MEDIUM | Research phase parallelization |
| Hierarchical Decomposition | ✅ `single-task.ts` | HIGH | Task breakdown pattern |
| Generator-Critic | ✅ `implementation.ts` + `review.ts` | HIGH | Core TDD loop |
| Iterative Refinement | ✅ `refinement.ts` | HIGH | Refinement loop |
| Human-in-the-Loop | ⚠️ Basic | HIGH | Approval gates |
| Composite Patterns | ⚠️ Implicit | HIGH | Formalize combinations |

### 10.2 Pattern 1: Sequential Pipeline (Assembly Line)

**Current State**: The SDLC workflow implicitly follows a pipeline: Research → Planning → Implementation → Review

**Recommendation**: Formalize as explicit pipeline pattern

```typescript
// src/patterns/sequential-pipeline.ts

export interface PipelineStage<TInput, TOutput> {
  name: string;
  execute(input: TInput): Promise<TOutput>;
}

export class SDLCPipeline {
  private stages: PipelineStage<any, any>[] = [];

  addStage<TIn, TOut>(stage: PipelineStage<TIn, TOut>): this {
    this.stages.push(stage);
    return this;
  }

  async execute<TInitial, TFinal>(input: TInitial): Promise<TFinal> {
    let result: any = input;
    for (const stage of this.stages) {
      result = await stage.execute(result);
    }
    return result as TFinal;
  }
}

// Usage
const pipeline = new SDLCPipeline()
  .addStage(new ResearchStage(provider))
  .addStage(new PlanningStage(provider))
  .addStage(new ImplementationStage(provider))
  .addStage(new ReviewStage(provider));

const result = await pipeline.execute(story);
```

**Benefits**:
- Clear data flow between stages
- Easy to debug (inspect intermediate state)
- Allows stage-level retry and recovery

### 10.3 Pattern 2: Coordinator/Dispatcher (Concierge)

**Current State**: `orchestrator.ts` acts as a basic coordinator

**Recommendation**: Enhance with intelligent routing based on task characteristics

```typescript
// src/patterns/coordinator.ts

export interface TaskCharacteristics {
  complexity: 'simple' | 'moderate' | 'complex';
  domain: 'frontend' | 'backend' | 'infra' | 'docs' | 'mixed';
  requiresResearch: boolean;
  riskLevel: 'low' | 'medium' | 'high';
}

export class IntelligentCoordinator {
  constructor(private agents: Map<string, IAgent>) {}

  async dispatch(task: ImplementationTask, characteristics: TaskCharacteristics): Promise<AgentResult> {
    const agent = this.selectAgent(characteristics);
    return agent.execute(task);
  }

  private selectAgent(characteristics: TaskCharacteristics): IAgent {
    // LLM-assisted or rule-based routing
    if (characteristics.complexity === 'simple' && !characteristics.requiresResearch) {
      return this.agents.get('single-task')!;
    }
    if (characteristics.requiresResearch) {
      return this.agents.get('research-first')!;
    }
    if (characteristics.riskLevel === 'high') {
      return this.agents.get('careful-implementation')!;
    }
    return this.agents.get('standard-implementation')!;
  }
}
```

**Benefits**:
- Intelligent task routing
- Specialized agents for different task types
- Better resource utilization

### 10.4 Pattern 3: Parallel Fan-Out/Gather (Octopus)

**Current State**: Limited parallelization (some parallel research in `research.ts`)

**Recommendation**: Add explicit parallel execution for independent tasks

```typescript
// src/patterns/parallel-fanout.ts

export class ParallelExecutor {
  async fanOutGather<T, R>(
    items: T[],
    executor: (item: T) => Promise<R>,
    synthesizer: (results: R[]) => Promise<R>
  ): Promise<R> {
    // Execute all in parallel
    const results = await Promise.all(items.map(executor));

    // Synthesize results
    return synthesizer(results);
  }
}

// Application: Parallel code review
const reviewResult = await parallelExecutor.fanOutGather(
  ['security', 'style', 'performance', 'correctness'],
  (aspect) => reviewAgent.reviewAspect(code, aspect),
  (reviews) => synthesizeReviews(reviews)
);

// Application: Parallel research
const researchResult = await parallelExecutor.fanOutGather(
  [
    { type: 'codebase', query: '...' },
    { type: 'web', query: '...' },
    { type: 'docs', query: '...' },
  ],
  (source) => researchAgent.research(source),
  (findings) => consolidateFindings(findings)
);
```

**Use Cases in ai-sdlc**:
- Parallel aspect-based code review
- Parallel research across multiple sources
- Parallel test execution
- Parallel file analysis

### 10.5 Pattern 4: Hierarchical Decomposition (Russian Doll)

**Current State**: `single-task.ts` handles task decomposition

**Recommendation**: Formalize hierarchical delegation with context preservation

```typescript
// src/patterns/hierarchical.ts

export interface HierarchicalAgent {
  canDecompose(task: Task): boolean;
  decompose(task: Task): Task[];
  executeAtomic(task: Task): Promise<TaskResult>;
  synthesize(results: TaskResult[]): TaskResult;
}

export class HierarchicalExecutor {
  constructor(private agent: HierarchicalAgent, private maxDepth: number = 3) {}

  async execute(task: Task, depth: number = 0): Promise<TaskResult> {
    if (depth >= this.maxDepth || !this.agent.canDecompose(task)) {
      return this.agent.executeAtomic(task);
    }

    const subtasks = this.agent.decompose(task);
    const results = await Promise.all(
      subtasks.map((subtask) => this.execute(subtask, depth + 1))
    );

    return this.agent.synthesize(results);
  }
}

// Application: Complex feature implementation
const result = await hierarchicalExecutor.execute({
  description: 'Add user authentication',
  // Automatically decomposes into:
  // - Add auth middleware
  //   - Create JWT validation
  //   - Add session storage
  // - Update user routes
  //   - Add login endpoint
  //   - Add logout endpoint
  // - Add UI components
  //   - Create login form
  //   - Add auth context
});
```

**Benefits**:
- Handles tasks exceeding context window
- Natural fit for complex feature breakdown
- Preserves context at each level

### 10.6 Pattern 5: Generator-Critic (Editor's Desk)

**Current State**: `implementation.ts` generates, `review.ts` critiques

**Recommendation**: Tighten the feedback loop with explicit pass/fail criteria

```typescript
// src/patterns/generator-critic.ts

export interface GeneratorCriticLoop<T> {
  generator: IAgent;
  critic: IAgent;
  maxIterations: number;
  passThreshold: number;
}

export class GeneratorCriticExecutor<T> {
  constructor(private config: GeneratorCriticLoop<T>) {}

  async execute(input: T): Promise<{ result: T; iterations: number; passed: boolean }> {
    let current = input;
    let iterations = 0;

    while (iterations < this.config.maxIterations) {
      // Generate
      const generated = await this.config.generator.execute(current);

      // Critique
      const critique = await this.config.critic.execute(generated);

      if (critique.score >= this.config.passThreshold) {
        return { result: generated, iterations, passed: true };
      }

      // Feedback loop
      current = this.incorporateFeedback(generated, critique);
      iterations++;
    }

    return { result: current, iterations, passed: false };
  }
}

// Application: TDD cycle
const tddLoop = new GeneratorCriticExecutor({
  generator: implementationAgent,
  critic: testRunnerAgent,
  maxIterations: 5,
  passThreshold: 1.0, // All tests must pass
});
```

**Current Fit**: This is the core of the existing TDD implementation - recommend formalizing.

### 10.7 Pattern 6: Iterative Refinement (Sculptor)

**Current State**: `refinement.ts` implements this pattern

**Recommendation**: Add quality threshold detection for early exit

```typescript
// src/patterns/iterative-refinement.ts

export interface RefinementCycle {
  generator: IAgent;
  critic: IAgent;
  refiner: IAgent;
  qualityThreshold: number;
  maxCycles: number;
}

export class IterativeRefiner {
  constructor(private cycle: RefinementCycle) {}

  async refine(initial: any): Promise<{ result: any; quality: number }> {
    let current = initial;
    let quality = 0;

    for (let i = 0; i < this.cycle.maxCycles; i++) {
      // Critique current state
      const critique = await this.cycle.critic.execute(current);
      quality = critique.qualityScore;

      // Early exit if quality threshold met
      if (quality >= this.cycle.qualityThreshold) {
        return { result: current, quality };
      }

      // Refine based on critique
      current = await this.cycle.refiner.execute({
        current,
        feedback: critique.feedback,
      });
    }

    return { result: current, quality };
  }
}

// Application: Research refinement
const refinedResearch = await refiner.refine({
  initial: rawResearchFindings,
  qualityThreshold: 0.8, // FAR score
});
```

**Enhancement**: Add FAR score as quality metric for early exit.

### 10.8 Pattern 7: Human-in-the-Loop (Safety Net)

**Current State**: Basic approval gates exist but not formalized

**Recommendation**: Explicit approval checkpoints for high-stakes operations

```typescript
// src/patterns/human-in-the-loop.ts

export interface ApprovalGate {
  name: string;
  condition: (context: any) => boolean;
  description: string;
  timeout?: number;
}

export class HumanApprovalManager {
  private gates: ApprovalGate[] = [];

  addGate(gate: ApprovalGate): this {
    this.gates.push(gate);
    return this;
  }

  async checkApproval(context: any, operation: string): Promise<boolean> {
    const applicableGates = this.gates.filter((g) => g.condition(context));

    for (const gate of applicableGates) {
      const approved = await this.requestApproval(gate, operation, context);
      if (!approved) {
        return false;
      }
    }

    return true;
  }

  private async requestApproval(gate: ApprovalGate, operation: string, context: any): Promise<boolean> {
    // Integration with CLI prompts, Slack, email, etc.
    console.log(`\n⚠️  Approval Required: ${gate.name}`);
    console.log(`   Operation: ${operation}`);
    console.log(`   Reason: ${gate.description}`);

    const response = await prompt('Approve? (y/n): ');
    return response.toLowerCase() === 'y';
  }
}

// Application: Production deployment, breaking changes
const approvalManager = new HumanApprovalManager()
  .addGate({
    name: 'Breaking Change',
    condition: (ctx) => ctx.hasBreakingChanges,
    description: 'This change modifies public APIs',
  })
  .addGate({
    name: 'Security Sensitive',
    condition: (ctx) => ctx.touchesSecurityCode,
    description: 'This change affects authentication or authorization',
  })
  .addGate({
    name: 'Large Change',
    condition: (ctx) => ctx.linesChanged > 500,
    description: 'This change modifies more than 500 lines',
  });
```

**Use Cases**:
- Review approval before merge
- Breaking change detection
- Security-sensitive file modifications
- Production deployment gates

### 10.9 Pattern 8: Composite Patterns (Mix-and-Match)

**Current State**: Patterns are used implicitly but not composed explicitly

**Recommendation**: Create pattern composition framework

```typescript
// src/patterns/composite.ts

export type PatternType =
  | 'sequential'
  | 'coordinator'
  | 'parallel'
  | 'hierarchical'
  | 'generator-critic'
  | 'refinement'
  | 'human-approval';

export interface CompositeWorkflow {
  name: string;
  steps: WorkflowStep[];
}

export interface WorkflowStep {
  pattern: PatternType;
  config: any;
  next?: string | ((result: any) => string);
}

// Application: Full SDLC workflow as composite pattern
const sdlcWorkflow: CompositeWorkflow = {
  name: 'full-sdlc',
  steps: [
    {
      // Parallel research from multiple sources
      pattern: 'parallel',
      config: {
        sources: ['codebase', 'web', 'docs'],
        synthesizer: 'consolidate-research',
      },
      next: 'planning',
    },
    {
      // Sequential planning stages
      pattern: 'sequential',
      config: {
        stages: ['task-breakdown', 'dependency-analysis', 'risk-assessment'],
      },
      next: 'implementation',
    },
    {
      // Hierarchical task implementation
      pattern: 'hierarchical',
      config: {
        maxDepth: 3,
        leafExecutor: 'tdd-loop',
      },
      next: 'review',
    },
    {
      // Generator-critic review loop
      pattern: 'generator-critic',
      config: {
        generator: 'implementation',
        critic: 'review',
        maxIterations: 3,
      },
      next: (result) => (result.passed ? 'approval' : 'refinement'),
    },
    {
      // Iterative refinement if needed
      pattern: 'refinement',
      config: {
        qualityThreshold: 0.8,
        maxCycles: 5,
      },
      next: 'approval',
    },
    {
      // Human approval for merge
      pattern: 'human-approval',
      config: {
        gates: ['code-review', 'breaking-change', 'security'],
      },
      next: null, // End
    },
  ],
};
```

### 10.10 Recommended Pattern Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Pattern Orchestrator                         │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                  Composite Workflow Engine               │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                   │
│  ┌───────────┬───────────┬───┴───┬───────────┬───────────┐      │
│  │           │           │       │           │           │      │
│  ▼           ▼           ▼       ▼           ▼           ▼      │
│ ┌───┐     ┌───┐       ┌───┐   ┌───┐       ┌───┐       ┌───┐    │
│ │Seq│     │Par│       │Hie│   │G-C│       │Ref│       │HIL│    │
│ │Pip│     │Fan│       │rar│   │Loo│       │ine│       │App│    │
│ └───┘     └───┘       └───┘   └───┘       └───┘       └───┘    │
│                              │                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    Agent Layer (IAgent)                  │    │
│  │  Research │ Planning │ Implementation │ Review │ Rework  │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                 Provider Layer (IProvider)               │    │
│  │         Claude │ Copilot │ OpenAI │ Custom              │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

---

## 11. Conclusion

The AI-SDLC codebase has a solid foundation with well-designed core modules for story management, workflow state, and git worktrees. The primary architectural debt lies in the tight coupling to the Claude SDK and the function-based agent implementations.

**Key Recommendations**:

1. **Start with Provider Abstraction**: This provides the foundation for all other improvements
2. **Convert Agents Incrementally**: One agent at a time, maintaining backward compatibility
3. **Follow SOLID Principles**: The specific violations identified can be addressed during refactoring
4. **Apply Design Patterns Judiciously**: Strategy, Factory, and Template Method patterns will provide the most value

The roadmap provides a 12-week path from current state to a fully extensible, multi-provider architecture that can accommodate GitHub Copilot SDK and future AI providers.
