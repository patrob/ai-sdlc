# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed - BREAKING

- **Removed the Anthropic Claude Agent SDK dependency** (`@anthropic-ai/claude-agent-sdk`); all providers (including `claude`) now run on the [Pi](https://pi.dev) agentic engine via Pi's native provider APIs. The `claude` provider routes to Anthropic models through Pi's `anthropic-messages` API. The `claude` provider name and its credentials (`ANTHROPIC_API_KEY` / `ANTHROPIC_OAUTH_TOKEN`) are unchanged. The SDK's automatic CLAUDE.md auto-discovery (`settingSources: ['project']`) is no longer available; see `docs/CLAUDE-MD-FEATURE.md`.
- **Node.js >= 22.19.0 now required** (previously >= 18). The new Pi agent engine (`@earendil-works/pi-ai`, `@earendil-works/pi-agent-core`) requires Node 22.19+.
- **All providers swapped to the Pi agentic engine**: `claude`, `openai`, `codex`, `openrouter`, `copilot` (and the new `ollama`) are now powered by the Pi engine, giving each a real tool-using, file-editing agent loop (read/write/edit/list/bash in the working directory) instead of single-shot text completions. Provider names, env vars, and `.ai-sdlc.json` configuration are unchanged.
- **Status command output format**: The `status` command now displays stories in a uniform table format with columns for Story ID, Title, Status, Labels, and Flags. The previous column-based kanban view has been replaced.
  - ⚠️ **Breaking Change**: Scripts or tools that parse the status command output will need to be updated.
  - Titles are now truncated with '...' suffix for better readability (responsive 30-60 chars based on terminal width)
  - Automatic responsive design: wide terminals (≥100 cols) show table view, narrow terminals show compact view
  - Story IDs are now displayed in the first column for easy identification

### Added

- **`ollama` provider**: local, OpenAI-compatible, no API key required. Defaults to `http://localhost:11434/v1`; override with `OLLAMA_BASE_URL`, select models with `AI_SDLC_OLLAMA_MODEL`.
- **OAuth support for `codex` and `copilot`** via the Pi engine ("Sign in with ChatGPT" / GitHub OAuth), with API keys still supported as fallback.
- **Story ID column** in status output (first column) for quick story identification
- **Unicode table borders** for better visual hierarchy and professional appearance
- **Responsive column widths** based on terminal width for optimal display
- **Compact view** for narrow terminals (<100 cols) with multi-line story format
- **Smart text truncation** at word boundaries for better readability
- **Label list truncation** with "+N more" indicator when many labels exist
- **Optional hint message** when compact view is used (disable with `AI_SDLC_NO_HINTS=1`)
- **Comprehensive input sanitization** and security hardening:
  - ReDoS protection with bounded regex patterns
  - Terminal escape sequence filtering (CSI, OSC, C0/C1 control codes)
  - Prototype pollution prevention for story labels
  - Unicode homograph attack mitigation with NFC normalization
  - Input length limits (DoS protection, max 10,000 chars)
  - Sanitized error messages that don't expose system information

### Fixed

- **Unicode width calculation** for emoji and multi-byte characters (CJK, combining chars)
- **Table alignment** with special characters in story titles
- **Terminal width detection** with proper fallback to 80 columns
- **Multi-byte character truncation** with iterative width adjustment

### Security

- Fixed two high-severity `minimatch` ReDoS advisories in production dependencies (GHSA-3ppc-4f35-3m26, GHSA-7r86-cg39-jmmj); production `npm audit` is clean
- Upgraded `vitest` to v4 to clear dev-only advisories in the vite/esbuild/vitest chain
- Fixed ReDoS vulnerability in ANSI code stripping with bounded quantifiers
- Added protection against terminal escape sequence injection
- Implemented prototype pollution prevention in label processing
- Added Unicode normalization to prevent homograph attacks
- Enforced input length limits to prevent DoS attacks
- Added comprehensive input sanitization for all user-controlled fields
