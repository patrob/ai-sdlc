# ADR-002: Provider-agnostic agentic harness via Pi over direct Claude SDK

**Status:** Accepted
**Date:** 2026-02
**Reference:** GitHub issue #81 (Pi evaluation spike), #80 (Flue evaluation spike)

## Context

ai-sdlc's core value is taking a story through `refine → research → plan →
implement → review → PR`. The **implement** phase requires an agent that can
edit files, run build/test commands, and iterate — a real agentic loop with
tool-calling, not just LLM text generation.

The initial implementation locked this capability to Anthropic's Claude via
`@anthropic-ai/claude-agent-sdk`. Other providers were text-only, making the
implement phase inaccessible to teams using OpenAI, Codex, OpenRouter, Ollama,
or GitHub Copilot.

Two candidate frameworks were spiked:
- **Flue**: A runtime/sandbox layer built on top of Pi. Adds virtual
  filesystems, sandboxes, multi-target deployment, and MCP tool integration.
- **Pi** (`@earendil-works/pi-agent-core`, `@earendil-works/pi-ai`): The
  underlying engine for Flue. Provides `Agent`, `AgentHarness`, `agentLoop`,
  `NodeExecutionEnv` (real filesystem + shell), and a unified LLM API covering
  all tool-calling providers.

## Decision

**Adopt Pi directly; defer Flue.**

ai-sdlc already owns the concerns Flue adds (orchestration, isolation via git
worktrees, phase prompts). Adding Flue would introduce a competing
orchestration model.

Pi is adopted as the engine behind a single Pi provider adapter registered in
the provider registry. The adapter routes any Pi-supported provider (OpenAI,
Codex Auth, OpenRouter, Ollama via OpenAI-compatible base URL, GitHub Copilot)
through the same provider interface the rest of the codebase uses.

**Why not just the Claude SDK:** The Claude SDK is Anthropic-locked by design.
Pi gives the same agentic capabilities (tool execution, session persistence,
context compaction) against any provider that supports function calling.

## Consequences

**Positive:**
- The implement phase is no longer Anthropic-exclusive.
- OAuth-based providers (Codex Auth, GitHub Copilot) work via Pi's
  `getApiKey` callback — mapping directly onto ai-sdlc's existing auth expiry
  handling.

**Negative:**
- Adds two runtime dependencies from a smaller ecosystem.
- Pi's version is pinned at `^0.79.x`; minor updates must be tested for
  breaking changes in the agent loop API.
- Flue is deferred, not rejected. If hosted/sandboxed execution becomes a
  product requirement, Flue should be revisited since it is built on Pi.
