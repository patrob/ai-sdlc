# Spike Result: Pi (`@earendil-works/pi-*`) as the provider-agnostic agent engine

**Issue:** #81 · **Status:** Complete · **Decision: ADOPT** Pi as the agentic engine behind a single
provider adapter.

## Context: the repo's goal

ai-sdlc exists to **autonomously run and maintain a repository** — taking a story through
refine → research → plan → **implement** → review → PR. The "run and maintain a repo" goal hinges on
the **implement** phase, which must *use tools to edit files and run commands* in a real working
directory. Today that capability is **Anthropic-locked**: only the Claude provider
(`src/providers/claude/index.ts`, via `@anthropic-ai/claude-agent-sdk`) is a true agentic harness.
The HTTP providers (`src/providers/openai-compatible-provider.ts`) are text-only
(`supportsTools: false`). The question this spike answers: can Pi be the provider-agnostic engine that
lets OpenAI/Codex, OpenRouter, Ollama, and GitHub Copilot drive the implement phase too?

## What Pi is

Pi is the minimal, self-extensible coding agent by **Mario Zechner** (`badlogic`, creator of libGDX;
[pi.dev](https://pi.dev), AI Engineer talk *"Building pi in a World of Slop"*). MIT, monorepo
[`badlogic/pi-mono`](https://github.com/badlogic/pi-mono), npm scope `@earendil-works/*`. Two packages
matter to us:

- **`@earendil-works/pi-ai`** — unified multi-provider LLM API. *Ships only models that support tool
  calling* (function calling is treated as essential for agentic work). Token + cost tracking, OAuth,
  streaming, OpenAI-compatibility settings.
- **`@earendil-works/pi-agent-core`** — a stateful agent loop **and** a full harness
  (`Agent`, `AgentHarness`, `agentLoop`): tool execution, session persistence (JSONL), context
  compaction, skills, system-prompt assembly, and a `NodeExecutionEnv` (real filesystem + shell).

> **Note:** Flue (#80) is *built on these exact packages* (`@flue/runtime` depends on
> `@earendil-works/pi-agent-core` and `pi-ai` `^0.79.0`). Pi is the engine; Flue is a layer on top.

## Evidence — a real PoC was run (not merged)

A throwaway PoC (Node 22, packages pinned to `0.79.0` to match Flue) was executed. **No API key was
required** — it exercises the harness and tool plumbing, not a live LLM call.

| Check | Result |
|---|---|
| Library embeddability | ✅ `Agent`, `AgentHarness`, `agentLoop` import and construct as libraries |
| Construct an agent | ✅ `new Agent({ initialState:{ systemPrompt, model, tools }, beforeToolCall, getApiKey })` |
| Real working-directory edits | ✅ `NodeExecutionEnv({cwd})` → `writeFile`/`readTextFile`/`exec('echo && ls')` all worked on a real temp dir |
| Custom file tool | ✅ A `write_file` `AgentTool` backed by the env executed and the file landed on disk |
| Provider resolution | ✅ `getModel` resolved `openai`, `openai-codex`, `github-copilot`, `openrouter`; Ollama/local via OpenAI-compatible `baseUrl` |

The agent loop, guardrail hook (`beforeToolCall`, e.g. to block `bash`), and dynamic credential hook
(`getApiKey`, for expiring OAuth tokens) are all first-class constructor options — they map directly
onto the safety/permission and auth concerns ai-sdlc already has.

## Provider coverage vs. our targets

`pi-ai`'s `KnownProvider` union and providers list cover **every** target, all with tool calling:

| ai-sdlc target | Pi provider / API | Auth | Tools |
|---|---|---|---|
| **OpenAI** | `openai` (`openai-responses` / `openai-completions`) | `OPENAI_API_KEY` | ✅ |
| **OpenAI / Codex Auth** | `openai-codex` (`openai-codex-responses`) | **OAuth** (ChatGPT Plus/Pro) | ✅ |
| **OpenRouter** | `openrouter` | `OPENROUTER_API_KEY` | ✅ |
| **Ollama / local** | "Any OpenAI-compatible" via `openai-completions` + `baseUrl` (e.g. `http://localhost:11434/v1`) | none | ✅ |
| **GitHub Copilot** | `github-copilot` | **OAuth** | ✅ |
| _bonus_ | Anthropic, Google/Vertex, Bedrock, Groq, Mistral, xAI, DeepSeek, … | mixed | ✅ |

This single library delivers the four required providers **plus** the Codex/Copilot OAuth flows that
issue #71 asks for, and the Ollama/local support that issue #70 asks for.

## How it maps onto ai-sdlc

- **One adapter, not a rewrite.** Introduce a `PiAgenticProvider` that implements our `IProvider`
  (`src/providers/types.ts`). For text phases (refine/research/plan/review) it uses `pi-ai`
  `complete`/`stream`. For the agentic **implement** phase it drives `AgentHarness` with
  `NodeExecutionEnv({ cwd: workingDirectory })` and the read/write/edit/bash tools.
- **Capabilities become honest.** The Pi-backed adapter can advertise `supportsTools: true`,
  `supportsStreaming: true`, `supportsMultiTurn: true` per routed provider — feeding the
  agentic-harness interface in #74.
- **Auth maps cleanly.** `pi-ai`'s `env-api-keys` + `oauth` modules and the `getApiKey` hook map onto
  our `IAuthenticator` (`api_key` / `oauth` / `none`).
- **Events map cleanly.** Pi's `tool_execution_start/_end`, `message_update`, and `Usage`/cost data map
  onto our `ProviderProgressEvent` (`tool_start`/`tool_end`/`assistant_message`/`cost_update`).
- **Guardrails & isolation preserved.** `beforeToolCall` is our permission gate; we keep our own
  orchestrator, kanban, worktrees, and phase logic. Pi replaces only the per-provider agent loop.

## Impact on the backlog

Adopting Pi **shrinks or absorbs** several planned stories rather than us building them from scratch:

- **#75 (generic tool-calling loop)** — largely *replaced* by Pi's `agentLoop`/`AgentHarness`. Reduces
  to "wire our tool set + permission gate into Pi." Big scope reduction.
- **#76 (streaming + multi-turn parity)** — provided by `pi-ai` streaming + Pi sessions.
- **#71 (Codex/OpenAI OAuth)** — provided by `pi-ai` `oauth` (`openai-codex`, `github-copilot`).
- **#70 (Ollama)** — provided by `pi-ai` OpenAI-compatible routing.
- **#78 (cost tracking parity)** — `pi-ai` exposes `Usage` + `calculateCost`; wire into
  `src/core/cost-tracker.ts`.
- **#74 (agentic interface)** — still do; the "agentic provider" is the Pi-backed adapter.

## Risks & mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| Pre-1.0 (`0.79.0`), fast-moving API | Medium | Pin the version (Flue tracks `^0.79.0`); isolate all churn behind one `PiAgenticProvider` adapter |
| Single maintainer | Medium | MIT-licensed and vendorable; the Astro team depends on it via Flue, adding ecosystem confidence |
| New transitive deps (`openai`, `@anthropic-ai/sdk`, `@google/genai`, …) | Low | We already ship the Anthropic SDK; the rest are mainstream provider SDKs |
| Built-in read/write/edit/bash tool *definitions* live in the coding-agent layer, not `pi-agent-core` | Low | `NodeExecutionEnv` exposes all primitives; we define a small, audited `AgentTool` set (as the PoC did) and keep them under our control |

## Decision

**Adopt Pi (`pi-ai` + `pi-agent-core`) as the provider-agnostic engine.** It directly serves the
"run and maintain a repo" goal: it gives the implement phase real, tool-using, file-editing agents
across all four target providers (plus Codex/Copilot OAuth and Ollama), as a maintained library,
behind a single adapter we control — instead of us hand-rolling per-provider tool loops, OAuth, and
streaming. Keep ai-sdlc's orchestrator, kanban, worktrees, and phases; swap only the agent engine.

**Next step:** implement `PiAgenticProvider` behind the agentic-harness interface (#74), then converge
#70/#71/#75/#76/#78 onto it.
