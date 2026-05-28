# AI-SDLC: CLI Outsourcing Recommendations

## Context

Goal: keep **ai-sdlc** focused on workflow/harness value (state machine, quality gates, orchestration) and outsource commodity agent runtime/tool execution to existing CLIs.

This document proposes:
1. What to offload now vs later
2. Candidate CLIs to evaluate
3. Integration design in this repo
4. What to keep as-is or strengthen
5. Sequenced implementation plan

---

## Executive Summary

### Offload now (high confidence)
- LLM runtime orchestration (multi-turn prompt loop, tool-call loop, streaming handlers)
- Provider-specific HTTP/auth plumbing for major vendors
- Basic coding-agent operations that are now solved by mature terminal CLIs

### Keep as-is (core moat)
- Story lifecycle + Kanban movement + phase transitions
- Human gates (approve/feedback/block)
- Retry and recovery policy
- Worktree/epic orchestration and dependency-aware scheduling
- SDLC policy (TDD mode, completion criteria, anti-hallucination checks)

### Bolster next
- Runtime plugin registry for roles/providers/tools (less hardcoding)
- Generic external CLI adapter/provider
- Strong adapter contract tests
- Capability negotiation and fallback routing

---

## Research Snapshot: Existing CLIs to Evaluate

> Quick validation pulled from GitHub API (repo existence, positioning, stars) on 2026-05-28.

- **Anthropic Claude Code** — `anthropics/claude-code` (~127k stars)
  - "Agentic coding tool in your terminal"
- **OpenAI Codex CLI** — `openai/codex` (~86k stars)
  - "Lightweight coding agent in terminal"
- **Google Gemini CLI** — `google-gemini/gemini-cli` (~104k stars)
  - "Open-source AI agent in terminal"
- **OpenCode** — `anomalyco/opencode` (~166k stars)
  - "Open source coding agent"
- **Aider** — `Aider-AI/aider` (~45k stars)
  - Pair-programming CLI
- **Goose** — `aaif-goose/goose` (~45k stars)
  - Extensible agent with tool execution focus

Recommendation: use **2 primary adapters first** (Claude Code + Codex), then add one open-source fallback (OpenCode or Aider) for redundancy.

---

## Offload Matrix (What, Why, How)

## 1) Offload provider/runtime execution loop

### What to offload
- Per-provider request shape differences, streaming event parsing, tool-call emission formats.
- Multi-turn context execution mechanics.

### Why
- High churn, low differentiation.
- Existing CLIs already optimize this path and track vendor changes faster.

### Incorporate into ai-sdlc
1. Add a **generic CLI provider** implementing `IProvider`.
2. Provider runs an external command template with:
   - input: prompt/system prompt/context
   - output: standardized response envelope
3. Map CLI output to `ProviderProgressEvent` + `ProviderQueryResult`.
4. Keep existing `ProviderRegistry`, but allow dynamic registration from config/plugin.

### Concrete repo changes
- New files:
  - `src/providers/cli-provider.ts`
  - `src/providers/cli-adapters/{claude-code,codex,gemini,opencode}.ts`
- Modify:
  - `src/providers/registry.ts` (dynamic loader)
  - `src/core/config.ts` + types for external provider definitions
- Config example:

```json
{
  "ai": {
    "provider": "cli-codex"
  },
  "providers": {
    "cli-codex": {
      "type": "external-cli",
      "command": "codex",
      "args": ["run", "--json"],
      "capabilities": {
        "supportsTools": true,
        "supportsStreaming": true,
        "supportsSystemPrompt": true,
        "supportsMultiTurn": true
      }
    }
  }
}
```

### Detailed next steps
- Step A: define adapter interface (`run(prompt, options) -> standardized JSON`).
- Step B: implement one adapter (Codex) end-to-end.
- Step C: add integration tests for timeout/retry/cancel/progress events.
- Step D: add second adapter (Claude Code), then feature-flag provider selection by story/phase.

---

## 2) Offload built-in coding agent tasks per phase

### What to offload
- In-phase coding mechanics (edit/test/fix loops) done by runtime agent CLIs.

### Why
- Better execution quality and ecosystem velocity from dedicated coding CLIs.

### Incorporate into ai-sdlc
1. Keep phase prompts and acceptance contract in ai-sdlc.
2. Route implement/review/research execution to CLI adapters.
3. Capture outputs into existing story artifacts/logs unchanged.

### Detailed next steps
- Step A: add per-phase provider override in workflow config:
  - `phases.implement.provider: cli-codex`
  - `phases.review.provider: cli-claude`
- Step B: enforce output schema contract (`approved`, `concerns`, `changesMade`).
- Step C: preserve your anti-hallucination completion gates (`npm test`, `npm run build`).
- Step D: compare quality/cost across providers with benchmark stories.

---

## 3) Offload vendor auth/config setup UX where possible

### What to offload
- Interactive auth workflows handled by each CLI (e.g., CLI login commands, token storage conventions).

### Why
- Avoid duplicating brittle auth logic and token-source permutations.

### Incorporate into ai-sdlc
1. Add provider health checks that detect CLI availability + auth state.
2. Display targeted remediation hints (`run <cli> login`).

### Detailed next steps
- Step A: add `ai-sdlc doctor` checks for external CLIs.
- Step B: add adapter-specific `validateConfiguration()` logic.
- Step C: degrade gracefully to alternate provider when auth invalid.

---

## 4) Offload optional web research tooling to CLIs with native tool ecosystems

### What to offload
- Direct web tool integration details when CLI already exposes robust web/search utilities.

### Why
- Reduce duplicate tool integration code and maintenance.

### Incorporate into ai-sdlc
1. Keep research phase policy and FAR format in ai-sdlc.
2. Let external CLI perform tool calls.
3. Parse/normalize into current research artifact schema.

### Detailed next steps
- Step A: add "tool capability profile" per adapter.
- Step B: if provider lacks web tools, fallback to current local behavior or mark partial completion.
- Step C: include source-confidence metadata in normalized result.

---

## 5) Offload low-level provider catalog maintenance

### What to offload
- Frequent model list/default updates across providers.

### Why
- Pure maintenance burden with little strategic value.

### Incorporate into ai-sdlc
- Shift from hardcoded built-ins to config/plugin-driven provider descriptors.

### Detailed next steps
- Step A: keep built-ins only as defaults.
- Step B: allow providers to be loaded from project config and plugin modules.
- Step C: make `ai-sdlc config workflow` and `status` show active provider source and capabilities.

---

## Keep As-Is (and why)

## 1) Workflow harness/state machine (KEEP)
Files today already centralize this value:
- `src/cli/runner.ts`
- `src/cli/commands.ts`
- `src/core/workflow-state.ts` and story state transitions

Why keep:
- This is your IP: reproducible SDLC process, recoverability, and governance.

Bolster:
- Add explicit transition audit events for every state move.
- Add deterministic replay mode for debugging failed workflows.

## 2) Human-in-the-loop gates (KEEP)
- approve/feedback/block flows are critical operational safety.

Bolster:
- Add SLA timers/escalation rules for blocked stories.
- Add richer structured reason taxonomy for block causes.

## 3) Worktree + epic/concurrency orchestration (KEEP)
- Highly differentiated vs most coding CLIs.

Bolster:
- Add smarter queueing (priority + dependency + changed-file risk scoring).
- Add per-epic budget/cost envelopes and hard stops.

## 4) SDLC policy and quality gates (KEEP)
- TDD mode and completion criteria are harness-level, not provider-level.

Bolster:
- Add policy packs (strict/standard/fast) and per-project defaults.
- Add required artifact checks before phase completion.

---

## Refactors Needed to Become Truly "CLI-Pluggable"

## A) Remove hardcoded role constraints
Current issue:
- `VALID_ROLES` hardcoded in `src/core/workflow-config.ts`
- role-to-executor binding heavily static in `src/core/phase-executor.ts`

Action:
1. Introduce `RoleRegistry` with runtime registration.
2. Workflow config validation accepts unknown roles if plugin declares them.
3. `PhaseExecutor` resolves role handlers via registry first.

## B) Dynamic provider/plugin loading
Current issue:
- `registerBuiltInProviders()` fixed set in startup path.

Action:
1. Add plugin discovery hook at startup.
2. Register providers/roles from plugin manifests.
3. Keep built-ins as fallback defaults.

## C) Capability negotiation and fallback
Action:
1. Before phase execution, evaluate required capabilities vs provider capabilities.
2. Route to fallback provider when requirements unmet.
3. Log routing decisions for observability.

---

## Suggested Rollout Plan

## Phase 1 (1–2 weeks): Foundation
- Add `external-cli` provider type and adapter contract
- Implement Codex adapter
- Add contract tests and `doctor` checks

Exit criteria:
- `implement` phase can run on external CLI with parity output

## Phase 2 (1–2 weeks): Dual-provider and fallback
- Add Claude Code adapter
- Add per-phase provider selection + fallback rules
- Add capability mismatch routing

Exit criteria:
- At least 2 CLIs can run full refine→review flow in test fixture projects

## Phase 3 (2+ weeks): Plugin architecture hardening
- Runtime RoleRegistry + ProviderRegistry dynamic loading
- Plugin manifest support for skills/tools/roles/providers
- Tighter telemetry (cost, latency, retries by provider)

Exit criteria:
- New CLI/provider can be integrated mostly via config/plugin, minimal core code edits

---

## Risks & Mitigations

- **Risk: Output schema drift across CLIs**
  - Mitigation: strict normalization layer + adapter contract tests
- **Risk: Auth fragility in CI agents**
  - Mitigation: `doctor` command + pre-flight checks + fallback provider
- **Risk: Reduced determinism**
  - Mitigation: preserve harness-level gates and replayable event logs
- **Risk: Vendor lock-in to one CLI**
  - Mitigation: at least two production-ready adapters + open-source fallback

---

## Immediate Recommended Actions (This repo)

1. Build `external-cli` provider abstraction and one adapter (Codex).
2. Add per-phase provider override in workflow configuration.
3. Introduce adapter contract tests (progress events, timeout, cancellation, schema normalization).
4. Replace hardcoded role/provider assumptions with registries.
5. Add `ai-sdlc doctor` for CLI binary/auth/capability checks.

Once these are done, ai-sdlc can stay focused on **workflow and governance**, while agent/tool innovation is absorbed from the CLI ecosystem with low friction.
