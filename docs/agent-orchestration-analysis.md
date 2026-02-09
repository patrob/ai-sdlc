# Agent Orchestration Analysis: ai-sdlc vs Claude Code Patterns

## Executive Summary

This analysis compares ai-sdlc's current agent orchestration architecture against Claude Code's proven patterns for multi-agent coordination. The goal: identify concrete changes to simplify the codebase and bring it closer to the vision of a tool that can "run a repo" automatically from discovery through development to self-healing.

Claude Code's key insight is **constrained specialization**: spawn focused agents with limited tool access, isolated context windows, and strict communication boundaries. ai-sdlc has built many of the right abstractions but over-engineers the orchestration layer while under-leveraging the agent runtime itself.

---

## 1. Architecture Comparison

### How Claude Code Orchestrates Agents

Claude Code uses a **hub-and-spoke model** with five specialized subagent types:

| Agent Type | Can Read | Can Write | Can Execute | Can Spawn Children |
|------------|----------|-----------|-------------|-------------------|
| Explore    | Yes      | No        | No          | No                |
| Plan       | Yes      | No        | No          | No                |
| Bash       | Limited  | No        | Yes         | No                |
| General    | Yes      | Yes       | Yes         | No                |
| Main       | Yes      | Yes       | Yes         | Yes (Task tool)   |

Key constraints:
- **Only the main agent can spawn subagents** (no infinite nesting)
- **Each subagent gets a fresh 200K context window** (prevents degradation)
- **Subagents cannot talk to each other** (all communication flows through parent)
- **File-based handoffs** are the primary state-sharing mechanism
- **Model routing**: Opus for orchestration, Sonnet/Haiku for subtasks

### How ai-sdlc Orchestrates Agents

ai-sdlc uses a **phase-pipeline model** with 13 agent types:

```
CLI Runner
  → State Assessor (recommends next action)
    → Phase Executor (loads workflow config)
      → Agent Factory (creates agent by type)
        → Agent Adapter (wraps function → IAgent interface)
          → Provider (Claude SDK query)
```

All agents share the same capabilities. There is no tool-access differentiation between a research agent and an implementation agent — both go through the same `query()` call to the Claude SDK, which gives the agent full tool access.

### The Gap

| Dimension | Claude Code | ai-sdlc | Gap |
|-----------|-------------|---------|-----|
| Agent specialization | Tool-access restrictions per type | All agents equal | No capability constraints |
| Context isolation | Fresh context per subagent | Shared provider, no isolation | Context pollution risk |
| Communication | Hub-and-spoke via parent | File-based (story.md) | Story file is good, but over-coupled |
| Model routing | Per-agent model selection | Single model for all | Cost optimization missing |
| Nesting prevention | Hard limit: 1 level deep | No recursion guards | Orchestrator can nest arbitrarily |
| Parallel execution | Native concurrent Task calls | Promise.all in PhaseExecutor | Similar capability |

---

## 2. What ai-sdlc Does Well

### 2.1 Story-as-State-Machine
The story document with YAML frontmatter is an excellent artifact-driven architecture. It mirrors Claude Code's file-based handoff pattern and adds structured phase tracking (`research_complete`, `plan_complete`, etc.). This is a strength to preserve and build on.

### 2.2 Circuit Breaker Pattern
The refinement loop with `maxIterations`, error fingerprinting, and escalation to `blocked/` is more sophisticated than anything in Claude Code's base orchestration. This self-healing pattern is exactly what "running a repo" requires.

### 2.3 Multi-Perspective Review
Parallel reviewers (tech-lead, security, product-owner) with consensus-seeking is a pattern Claude Code only recently added via Agent Teams. The ai-sdlc implementation is ahead here.

### 2.4 Workflow Configuration
The `workflow.yaml` system for customizing phase→agent mappings is a good extensibility mechanism that Claude Code doesn't have at the project level.

---

## 3. Areas to Simplify

### 3.1 Eliminate the Adapter Layer

**Problem**: The `AgentFactory` has 13 adapter classes that do nothing but forward calls to function-based agents. Each adapter class is ~30 lines of boilerplate wrapping a single function call.

**Current** (`src/agents/factory.ts`):
```typescript
class ResearchAgentAdapter extends FunctionAgentAdapter {
  readonly name = 'research';
  readonly requiredCapabilities = ['supportsTools', 'supportsSystemPrompt'];

  async execute(context: AgentContext): Promise<AgentResult> {
    return runResearchAgent(context.storyPath, context.sdlcRoot, context.options, this.provider);
  }

  getSystemPrompt(): string { return 'Research agent system prompt'; } // placeholder!
}
```

The `getSystemPrompt()` returns placeholder strings. The real prompts live inside each agent function. The adapter adds indirection without value.

**Recommendation**: Replace the adapter layer with a simple function registry:

```typescript
const AGENTS: Record<AgentType, AgentExecutorFn> = {
  research: runResearchAgent,
  planning: runPlanningAgent,
  implementation: runImplementationAgent,
  // ...
};

function createAgent(type: AgentType, provider: IProvider) {
  const fn = AGENTS[type];
  if (!fn) throw new Error(`Unknown agent: ${type}`);
  return { execute: (ctx) => fn(ctx.storyPath, ctx.sdlcRoot, ctx.options, provider) };
}
```

This eliminates ~400 lines of adapter boilerplate while preserving the factory pattern for testing.

### 3.2 Consolidate the Dual Dispatch Problem

**Problem**: The `PhaseExecutor` (`src/core/phase-executor.ts`) has its own switch statement mapping roles to agent functions, completely independent of the `AgentFactory`:

```typescript
// PhaseExecutor.executeSingleAgent() - lines 351-431
switch (role) {
  case 'tech_lead_reviewer': return runTechLeadReviewer(...);
  case 'security_reviewer':  return runSecurityReviewer(...);
  case 'product_owner_reviewer': return runProductOwnerReviewer(...);
  case 'story_refiner': return runRefinementAgent(...);
  default: return { error: 'Unsupported role' };
}

// PhaseExecutor.runDefaultPhaseAgent() - lines 485-501
switch (phase) {
  case 'refine':   return runRefinementAgent(...);
  case 'research': return runResearchAgent(...);
  case 'plan':     return runPlanningAgent(...);
  // ...
}
```

Two separate dispatch mechanisms, neither using the factory that was built specifically for this purpose. Every new agent requires changes in 3 places.

**Recommendation**: PhaseExecutor should delegate to AgentFactory exclusively. One dispatch path, one place to add new agents.

### 3.3 Remove Premature Type Gymnastics

**Problem**: There are `as any` casts scattered throughout the agent system:

- `factory.ts:193` — `context.options as any` for ReviewAgent
- `factory.ts:218` — `taskContext as any` for SingleTaskAgent
- `factory.ts:262` — `result as any` for Orchestrator
- `phase-executor.ts:356` — `onProgress as any` for every reviewer
- `phase-executor.ts:497` — `return ... as any` for review phase

These casts exist because agents have incompatible option/result types despite serving the same purpose.

**Recommendation**: Define a single `AgentExecutionContext` type that all agents accept, and a single `AgentResult` type they all return. The current `AgentContext` is close but not used consistently. Align the function-based agents to accept it directly instead of taking positional arguments `(storyPath, sdlcRoot, options, provider)`.

### 3.4 Flatten the Provider Call Chain

**Problem**: A provider query currently traverses:

```
Agent function
  → runAgentQuery() (client.ts)
    → ProviderRegistry.getDefault()
      → ClaudeProvider.query()
        → retry loop
          → Claude SDK query()
```

`client.ts` is a 69-line file that does nothing but call `ProviderRegistry.getDefault().query()`. The deprecated type aliases take up more space than the logic.

**Recommendation**: Delete `client.ts`. Have agents call the provider directly (it's already injected via the factory). The `runAgentQuery` function is a leftover from before the provider abstraction existed.

---

## 4. Areas to Improve

### 4.1 Add Capability Constraints Per Agent Type

**What Claude Code does**: Explore agents cannot write files. Plan agents cannot execute commands. This prevents accidents and reduces token waste on irrelevant tool calls.

**What ai-sdlc should do**: When querying the Claude SDK, pass different tool configurations per agent type:

```typescript
const AGENT_TOOLS: Record<AgentType, ToolConfig> = {
  research:       { read: true,  write: false, execute: false, web: true  },
  planning:       { read: true,  write: false, execute: false, web: false },
  implementation: { read: true,  write: true,  execute: true,  web: false },
  review:         { read: true,  write: false, execute: true,  web: false },
};
```

The Claude Agent SDK supports tool restriction. Use `allowedTools` or custom MCP tool configurations to limit what each agent can do. A research agent that can't accidentally modify files is more trustworthy and cheaper (fewer tool-use tokens).

### 4.2 Implement Context Window Isolation

**What Claude Code does**: Each subagent gets its own context window. The parent agent synthesizes results into a brief for the next subagent.

**What ai-sdlc should do**: The story file system already provides this — each phase reads the story fresh. But the prompt construction doesn't take advantage of it. Currently, prompts include the entire story content. Instead:

- **Research prompt**: Story title + acceptance criteria only (no prior research)
- **Planning prompt**: Story title + acceptance criteria + research.md summary
- **Implementation prompt**: Plan.md only (not the full story + research + plan)
- **Review prompt**: Story criteria + git diff (not the entire story history)

This mirrors Claude Code's pattern of giving each subagent only what it needs, preventing context pollution and reducing token costs.

### 4.3 Add Model Routing

**What Claude Code does**: Main orchestration on Opus, exploration on Haiku, implementation on Sonnet. Each task uses the cheapest model that can handle it.

**What ai-sdlc should do**: Add `model` to the workflow configuration:

```yaml
phases:
  research:
    model: claude-sonnet-4-20250514
    agents:
      - id: researcher
        role: researcher
  plan:
    model: claude-opus-4-0-20250115
    agents:
      - id: planner
        role: planner
  review:
    model: claude-sonnet-4-20250514
    agents:
      - id: review-group
        composition: parallel
```

The provider already supports `model` in query options. Thread it through from the workflow config.

### 4.4 Adopt the Initializer + Worker Pattern for Long-Running Tasks

**What Claude Code does**: For tasks spanning multiple context windows, an initializer agent sets up state (progress file, git commit), then worker agents make incremental progress, reading the progress file to understand where to resume.

**What ai-sdlc should do**: The `--continue` flag exists but is coarse. Implement a task-level checkpoint system:

```
.ai-sdlc/stories/S-001/
  ├── story.md
  ├── research.md
  ├── plan.md
  ├── progress.json       # <-- NEW: task-level checkpoint
  └── task_progress.json  # Already exists but underutilized
```

`progress.json` records:
- Which phase is active
- For implementation: which task in the plan is current
- For review: which files have been reviewed
- Token usage so far
- Last successful checkpoint timestamp

This enables true resume-from-crash semantics rather than restart-from-phase-beginning.

### 4.5 Introduce an Explore Agent

**What Claude Code does**: The Explore agent is the most-used subagent type — a fast, read-only agent for understanding code before making decisions. It's the first thing spawned for any non-trivial task.

**What ai-sdlc should do**: Add an `explore` agent type that:
- Takes a question about the codebase
- Has read-only tool access (Glob, Grep, Read)
- Returns structured findings (file paths, patterns, relevant code)
- Is used by the planning and implementation agents before they start work

Currently, the research agent does web + codebase research in one pass. Splitting "understand the codebase" (explore) from "research the problem domain" (research) enables:
- Cheaper codebase exploration (Haiku model, read-only tools)
- Reusable exploration results across phases
- Faster iteration when plans change

### 4.6 Implement Agent Teams for Epic Mode

**What Claude Code does**: Agent Teams (Swarms) enable 2-5 agents working in parallel on different parts of a codebase, each in their own git worktree, self-coordinating via peer messages.

**What ai-sdlc already has**: Epic mode with worktree isolation and concurrent story processing.

**The gap**: Stories within an epic execute independently with no cross-story coordination. If Story A creates an API endpoint and Story B needs to call it, there's no mechanism for B to discover A's work.

**Recommendation**: Add a lightweight coordination layer:
- Shared `epic_context.json` at the epic level
- Each story writes its key outputs (new files, new APIs, schema changes) to this file
- Subsequent stories read it as part of their research phase
- On merge conflicts, a coordination agent resolves them

---

## 5. Streamlining Recommendations (Priority Order)

### P0: Reduce Boilerplate, Unify Dispatch

| Change | Files | Impact |
|--------|-------|--------|
| Replace adapter classes with function registry | `src/agents/factory.ts` | -400 lines |
| PhaseExecutor delegates to AgentFactory | `src/core/phase-executor.ts` | -60 lines, single dispatch path |
| Delete `client.ts`, inject provider directly | `src/core/client.ts` | -69 lines, cleaner dependency chain |
| Unify agent function signatures | All agent files | Eliminate `as any` casts |

**Estimated reduction**: ~530 lines of code, 3 fewer dispatch mechanisms.

### P1: Add Capability Constraints

| Change | Files | Impact |
|--------|-------|--------|
| Define tool configs per agent type | New: `src/agents/capabilities.ts` | Prevent accidents, reduce cost |
| Pass tool restrictions to SDK query | `src/providers/claude/index.ts` | Research can't write, review can't modify |
| Add `model` routing per phase | `src/types/workflow-config.ts`, provider | 2-5x cost reduction |

### P2: Improve Context Management

| Change | Files | Impact |
|--------|-------|--------|
| Phase-specific prompt builders | Each agent file | Reduce token waste |
| Add `progress.json` checkpoint | `src/core/story.ts` | True resume semantics |
| Add explore agent type | New: `src/agents/explore.ts` | Fast, cheap codebase understanding |

### P3: Enable Cross-Story Coordination

| Change | Files | Impact |
|--------|-------|--------|
| Epic-level shared context | `src/core/orchestrator.ts` | Stories can discover each other's work |
| Merge conflict resolution agent | New: `src/agents/merge-resolver.ts` | Autonomous conflict handling |

---

## 6. Architecture Target State

```
┌─────────────────────────────────────────┐
│              CLI / Daemon                │
│  (ai-sdlc run --auto / --watch / --epic)│
└──────────────┬──────────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│         State Assessor                   │
│  (reads stories, recommends actions)     │
└──────────────┬──────────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│         Phase Executor                   │
│  (workflow.yaml → agent dispatch)        │
│                                          │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌────────┐ │
│  │Explore│ │ Plan │ │Build │ │ Review │ │
│  │(read) │ │(read)│ │(r/w/x)│ │(read/x)│ │
│  │Haiku  │ │Opus  │ │Sonnet │ │Sonnet  │ │
│  └───┬───┘ └───┬──┘ └───┬──┘ └────┬───┘ │
│      │         │        │         │      │
│      ▼         ▼        ▼         ▼      │
│  ┌─────────────────────────────────────┐ │
│  │    Provider (Claude SDK + retry)    │ │
│  │    Tool config per agent type       │ │
│  └─────────────────────────────────────┘ │
└──────────────────────────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│         Story Documents                  │
│  story.md ← research.md ← plan.md       │
│  progress.json (checkpoint)              │
│  epic_context.json (cross-story)         │
└──────────────────────────────────────────┘
```

### Key Differences from Current State

1. **Agents have differentiated capabilities** (read-only vs read-write-execute)
2. **Model routing per agent type** (Haiku for exploration, Opus for planning, Sonnet for implementation)
3. **Single dispatch path** (PhaseExecutor → AgentRegistry → Provider)
4. **Progress checkpoints** enable true resume semantics
5. **Cross-story context** enables epic-level coordination

---

## 7. Mapping to the "Run a Repo" Vision

The ultimate goal requires four capabilities:

### Discovery (Partially Built)
- **Current**: `ai-sdlc add` with AI-assisted ideation
- **Gap**: No automatic discovery from logs, monitoring, or user feedback
- **Next step**: Add a `monitor` agent that watches CI logs, error trackers, and creates stories automatically

### Development (Mostly Built)
- **Current**: Full refine → research → plan → implement → review → PR pipeline
- **Gap**: No model routing, no capability constraints, no cross-story coordination
- **Next step**: P0 + P1 changes above

### Self-Healing (Foundation Built)
- **Current**: Circuit breaker, error fingerprinting, refinement loop, rework agent
- **Gap**: Only heals within a single story's lifecycle; no post-deploy monitoring
- **Next step**: Add a `watchdog` agent type (mirrors Claude Code's Agent Teams "Watchdog" pattern) that monitors deployed code and creates fix stories when errors are detected

### Autonomous Operation (Partially Built)
- **Current**: `--watch` daemon mode, `--auto` mode, epic parallelism
- **Gap**: No distributed coordination, no persistent knowledge across stories
- **Next step**: P3 changes + knowledge base that accumulates patterns across stories

---

## 8. Quick Wins (Can Ship This Week)

1. **Delete `client.ts`** — it's a pass-through that adds confusion
2. **Replace adapter classes with function map** — immediate complexity reduction
3. **Add `model` field to workflow.yaml** — thread through existing plumbing
4. **Trim prompts per phase** — each agent gets only the context it needs
5. **Use AgentFactory in PhaseExecutor** — single dispatch path

These changes reduce code, improve clarity, and don't require new features — just removal of unnecessary abstraction layers that have accumulated as the codebase evolved.

---

## 9. Multi-Provider Effort Estimate

The vision: support Claude Agent SDK, GitHub Copilot SDK, and OpenAI Agents SDK as interchangeable backends. Here's what that takes.

### 9.1 Current Provider-Agnostic Readiness

**Good news**: The hard architectural work is already done.

| Layer | Status | Notes |
|-------|--------|-------|
| `IProvider` interface | Provider-agnostic | Clean abstraction with `query()`, `capabilities`, `authenticator` |
| `ProviderRegistry` | Provider-agnostic | Runtime switching via `AI_SDLC_PROVIDER` env var |
| Agent code | Provider-agnostic | All 16 agents use `IProvider`, zero Claude SDK imports |
| Progress events | Provider-agnostic | Discriminated union covers common event types |
| Capability validation | Provider-agnostic | Agents check `supportsTools`, `supportsSystemPrompt` |
| Auth system | Partially coupled | Looks for `~/.claude/`, `ANTHROPIC_API_KEY`, `CLAUDE_CODE_OAUTH_TOKEN` |
| Config system | Partially coupled | `settingSources`, `permissionMode` are Claude-specific concepts |
| Streaming types | Partially coupled | `AgentMessage` interface maps to Claude SDK message shapes |
| Prompt design | Implicitly coupled | System prompts assume Claude's reasoning/formatting style |
| Response parsing | Implicitly coupled | Regex + Zod parsers assume specific output patterns |

### 9.2 SDK Architecture Comparison

The three target SDKs have fundamentally different architectures:

| Dimension | Claude Agent SDK | GitHub Copilot SDK | OpenAI Agents SDK |
|-----------|-----------------|-------------------|-------------------|
| **Architecture** | Wraps CLI process | JSON-RPC to CLI server | Direct API calls |
| **Entry point** | `query(prompt, opts)` | `session.sendMessage(msg)` | `Runner.run(agent, input)` |
| **Agent loop** | Opaque (engine-managed) | Opaque (engine-managed) | Explicit (controllable) |
| **Tool definition** | `allowedTools` + MCP | `defineTool(name, schema, handler)` | `@function_tool` decorator |
| **Streaming** | `AsyncIterable<SDKMessage>` | Event emitter (`session.on`) | `stream_events()` with 3 levels |
| **Multi-agent** | Single agent/session | Single agent/session | First-class handoffs |
| **Model routing** | `model` param | Auto-routing by task type | Per-agent `model` field |
| **Multi-provider** | Anthropic only | BYOK (OpenAI, Anthropic, etc.) | LiteLLM (100+ models) |
| **Auth** | API key / OAuth | GitHub OAuth / BYOK keys | API key |
| **Sandbox** | `permissionMode` + sandbox | Default allow-all | seatbelt/landlock |

**Key insight**: Claude and Copilot SDKs are opaque engines — you send a message and get results. OpenAI gives you the explicit loop. The `IProvider.query()` abstraction already handles the "fire and observe" pattern cleanly. The main work is adapting each SDK's streaming/auth/tool interfaces to the existing `IProvider` contract.

### 9.3 Work Breakdown

#### Epic 1: Simplification (prerequisite for multi-provider)
*Do this first — it reduces the surface area that new providers must integrate with.*

| Story | Size | What | Why First |
|-------|------|------|-----------|
| E1-S1: Kill adapter layer | S | Replace 13 adapter classes with function registry | Less code for new providers to interact with |
| E1-S2: Unify dispatch | S | PhaseExecutor delegates to AgentFactory only | One integration point, not three |
| E1-S3: Delete client.ts | XS | Remove pass-through, agents call provider directly | Cleaner provider injection |
| E1-S4: Unify agent signatures | M | Single `AgentContext` input, single `AgentResult` output | Provider adapters don't need to handle N different shapes |
| E1-S5: Add capability constraints | M | `allowedTools` per agent type, passed through provider | Provider-specific tool config |

**Epic 1 total: ~2-3 weeks**

#### Epic 2: Provider Abstraction Hardening

| Story | Size | What |
|-------|------|------|
| E2-S1: Generalize auth | M | Provider-specific credential resolution (`{PROVIDER}_API_KEY`, `~/.{provider}/`) |
| E2-S2: Generalize config | S | Extract `settingSources`/`permissionMode` into provider-specific config |
| E2-S3: Normalize streaming | M | Adapter pattern: each provider maps native events → `ProviderProgressEvent` |
| E2-S4: Abstract tool registration | M | `IToolConfig` interface that each provider translates to native tool format |
| E2-S5: Model routing | S | `model` in workflow.yaml, provider maps to native model IDs |
| E2-S6: Response parsing resilience | M | Make regex/Zod parsers tolerant of formatting differences across models |

**Epic 2 total: ~3-4 weeks**

#### Epic 3: Copilot SDK Provider

| Story | Size | What |
|-------|------|------|
| E3-S1: CopilotProvider scaffold | M | Implement `IProvider` with `@github/copilot-sdk` |
| E3-S2: Copilot auth | M | GitHub OAuth / token / BYOK credential flow |
| E3-S3: Copilot streaming adapter | M | Map `session.on()` events → `ProviderProgressEvent` |
| E3-S4: Copilot tool config | S | Map `IToolConfig` → `defineTool()` calls |
| E3-S5: Copilot integration tests | M | End-to-end story execution with Copilot backend |

**Epic 3 total: ~3-4 weeks**

#### Epic 4: OpenAI Agents SDK Provider

| Story | Size | What |
|-------|------|------|
| E4-S1: OpenAIProvider scaffold | M | Implement `IProvider` wrapping `Runner.run()` |
| E4-S2: OpenAI auth | S | API key + LiteLLM config for alternate models |
| E4-S3: OpenAI streaming adapter | M | Map `stream_events()` → `ProviderProgressEvent` |
| E4-S4: OpenAI tool config | M | Map `IToolConfig` → `@function_tool` definitions (requires bundling tool implementations) |
| E4-S5: OpenAI agent loop adapter | L | Handle explicit loop control vs fire-and-observe |
| E4-S6: OpenAI integration tests | M | End-to-end story execution with OpenAI backend |

**Epic 4 total: ~4-5 weeks**

#### Epic 5: Cross-Provider Features

| Story | Size | What |
|-------|------|------|
| E5-S1: Provider selection CLI | S | `ai-sdlc config --provider copilot` + `AI_SDLC_PROVIDER` |
| E5-S2: Per-phase provider routing | M | workflow.yaml can specify different providers per phase |
| E5-S3: Cost tracking normalization | M | Unified token/cost tracking across providers |
| E5-S4: Provider capability matrix | S | Runtime capability detection + graceful degradation |
| E5-S5: Fallback chains | M | If primary provider fails, fall back to secondary |

**Epic 5 total: ~3 weeks**

### 9.4 Total Estimate

| Epic | Duration | Dependencies |
|------|----------|-------------|
| Epic 1: Simplification | 2-3 weeks | None |
| Epic 2: Abstraction hardening | 3-4 weeks | Epic 1 |
| Epic 3: Copilot provider | 3-4 weeks | Epic 2 |
| Epic 4: OpenAI provider | 4-5 weeks | Epic 2 |
| Epic 5: Cross-provider features | 3 weeks | Epics 3 + 4 |

**Sequential path**: ~15-19 weeks (~4-5 months)

**Parallel path** (Epics 3 & 4 concurrent): ~11-14 weeks (~3-3.5 months)

**With this tool doing the work** (ai-sdlc running itself): Realistically 6-8 weeks, since each story is a focused, well-scoped change and the tool can run multiple stories per day.

### 9.5 The Hardest Parts

1. **OpenAI's explicit agent loop** (E4-S5): Claude and Copilot SDKs manage the plan-execute loop internally. OpenAI's Agents SDK gives you the loop and expects you to drive it. The `IProvider.query()` abstraction assumes "send prompt, receive result." For OpenAI, you'd need to either:
   - Run the full `Runner.run()` internally (opaque mode) — simpler but loses OpenAI's step-through advantage
   - Expose a `queryStreamed()` method that yields intermediate states — more powerful but breaks the current interface

   **Recommendation**: Start with opaque mode. It works with the current interface. Add step-through later if needed.

2. **Tool implementation bundling** (E4-S4): Claude and Copilot SDKs include built-in file editing, code execution, and search tools. OpenAI's Agents SDK does not — you must implement these tools yourself or use Codex CLI as an MCP server. This means:
   - Either bundle a `codex --mcp` server alongside the OpenAI provider
   - Or implement file/search/execute tools in TypeScript and register them as `@function_tool`s

   **Recommendation**: Use Codex CLI as MCP server. It gives you the same tool quality as Claude/Copilot without reimplementing everything.

3. **Response format divergence** (E2-S6): The biggest hidden cost. Agents parse responses with regex and Zod schemas tuned to Claude's output style. GPT-4o and Copilot models format differently. Each parser needs to either:
   - Be made tolerant of multiple formats (preferred)
   - Or add a response normalization layer per provider (more work)

   **Recommendation**: Switch to structured output / JSON mode where possible. All three SDKs support it. For free-form responses, use the LLM itself to extract structured data rather than regex.

### 9.6 Architecture Target State (Multi-Provider)

```
┌─────────────────────────────────────────────┐
│              CLI / Daemon                     │
│  ai-sdlc run --provider copilot --auto       │
└──────────────┬──────────────────────────────┘
               │
┌──────────────▼──────────────────────────────┐
│         Phase Executor                       │
│  workflow.yaml → agent dispatch              │
│                                              │
│  ┌──────────────────────────────────────┐    │
│  │  Agent Registry (function map)       │    │
│  │  + capability constraints per type   │    │
│  │  + model routing per phase           │    │
│  └──────────────┬───────────────────────┘    │
│                 │                             │
│  ┌──────────────▼───────────────────────┐    │
│  │  Provider Registry                    │    │
│  │                                       │    │
│  │  ┌──────────┐ ┌────────┐ ┌────────┐ │    │
│  │  │ Claude   │ │Copilot │ │ OpenAI │ │    │
│  │  │ Provider │ │Provider│ │Provider│ │    │
│  │  │          │ │        │ │        │ │    │
│  │  │ Agent SDK│ │JSON-RPC│ │Runner  │ │    │
│  │  │ query()  │ │session │ │.run()  │ │    │
│  │  └──────────┘ └────────┘ └────────┘ │    │
│  └──────────────────────────────────────┘    │
└──────────────────────────────────────────────┘
```

### 9.7 Recommendation: Sequencing

**Do Epic 1 now.** It's pure simplification — less code, fewer bugs, cleaner architecture. It pays for itself immediately and makes everything after it cheaper.

**Do Epic 2 next.** Harden the abstraction before adding providers. It's tempting to jump straight to "add Copilot provider" but you'll end up with Claude-shaped assumptions baked into the interface that every new provider has to work around.

**Then pick one provider** (Copilot or OpenAI) based on your users. Ship it. Learn what the abstraction got wrong. Fix it. Then add the other.

Don't try to ship all three providers simultaneously — the abstraction will be wrong in ways you can't predict until you've built the second provider.
