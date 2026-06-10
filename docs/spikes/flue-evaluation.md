# Spike Result: Flue (`withastro/flue`) as a portable agent-harness layer

**Issue:** #80 · **Status:** Complete · **Decision: DEFER** (adopt Pi directly instead, for now).

## Key finding: Flue is built on Pi

Flue's `@flue/runtime` (`packages/runtime/package.json`) depends on
**`@earendil-works/pi-agent-core` `^0.79.0`** and **`@earendil-works/pi-ai` `^0.79.0`** — the same
engine evaluated in the Pi spike (#81). So this is a **stack decision**, not a choice between rival
frameworks:

- **Pi** = the provider-agnostic engine (unified multi-provider LLM API + agent loop with
  read/write/edit/bash tools on a real working directory).
- **Flue** = a runtime/sandbox/deploy **layer** on top of Pi: virtual + Daytona sandboxes
  (`just-bash`), Markdown skills (`.agents/skills/`) + `AGENTS.md` profiles, MCP tool integration, and
  multi-target deploy (Node / Cloudflare Workers / GitHub Actions). Apache-2.0, from the Astro team.

Because provider/tool coverage is inherited from Pi, Flue does **not** add any provider reach beyond
what the Pi spike already proved (OpenAI/Codex, OpenRouter, Ollama, GitHub Copilot, all with tools).

## Evaluation against the repo's goal ("run and maintain a repo")

ai-sdlc already owns the concerns Flue's extra layer provides, in its own way:

| Flue value-add | ai-sdlc already has | Verdict |
|---|---|---|
| Sandboxed/isolated execution (Daytona, virtual fs) | Git worktrees + child-process orchestration (`src/core/orchestrator.ts`) | Overlap; ours is on the critical path |
| Multi-target deploy (Cloudflare / GH Actions) | A local/CI Node CLI; deploy isn't the product | Not needed now |
| Skills / `AGENTS.md` profiles | Our own phase prompts + `.ai-sdlc` story flow | Overlap |
| MCP tool integration | Not currently required for the implement loop | Future, optional |

Adopting Flue would mean taking on a **heavier dependency and a second runtime/orchestration model**
that competes with ai-sdlc's existing orchestrator, worktrees, and phases — for value (hosted/sandboxed
multi-target execution) that is **not on the critical path** for autonomously running and maintaining a
local/CI repo. The engine we actually need is Pi, which Flue itself wraps.

## Decision

**Defer Flue.** Adopt **Pi directly** (see #81) — the lighter dependency that delivers exactly the
provider-agnostic, tool-using implement phase we need, behind a single adapter we control.

**Revisit Flue only if** ai-sdlc later wants hosted, sandboxed, multi-target (Cloudflare/GitHub
Actions) agent execution as a product feature. At that point Flue becomes attractive *because* it is
built on the same Pi engine, so a Pi-based adapter would already align with it.
