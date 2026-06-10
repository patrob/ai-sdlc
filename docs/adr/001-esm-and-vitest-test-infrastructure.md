# ADR-001: ESM-first module system with Vitest and unit/integration split

**Status:** Accepted
**Date:** 2025-12

## Context

ai-sdlc is distributed as a Node.js CLI package on npm. The modern Node.js
ecosystem has largely moved to ES Modules (ESM), and the primary AI SDK
dependency (`@anthropic-ai/claude-agent-sdk`) is ESM-only. A testing framework
was needed that:
- Works natively with ESM without CJS transpilation shims
- Supports TypeScript without a separate build step in tests
- Allows test isolation at the unit level (fast, mocked) and end-to-end at
  the integration level (real filesystem, git operations, temp repos)
- Runs in parallel across files to keep CI under a reasonable time budget

Jest requires additional configuration (`--experimental-vm-modules`,
`babel-jest`, or `ts-jest`) to support ESM + TypeScript, and its CJS-first
architecture creates friction with ESM-only dependencies.

## Decision

- Set `"type": "module"` in `package.json` — the entire package is ESM.
- Use **Vitest** as the test runner. Vitest natively understands ESM and
  TypeScript, and has a Jest-compatible API.
- Split the test suite into two separate Vitest configs:
  - `vitest.config.ts`: unit tests colocated with source (`src/**/*.test.ts`)
  - `vitest.integration.config.ts`: integration tests (`tests/integration/**`)
- Colocate unit tests with their source file (`src/core/story.ts` →
  `src/core/story.test.ts`); place integration tests in `tests/integration/`.

## Consequences

**Positive:**
- Zero transpilation overhead for tests.
- ESM-only dependencies (`chalk`, `@anthropic-ai/claude-agent-sdk`) work
  without workarounds.
- Process isolation prevents test-order dependency bugs when tests
  call `process.chdir()`.

**Negative:**
- The `"type": "module"` requirement means all relative imports in source must
  include the `.js` extension (TypeScript resolves to `.ts` at compile time,
  but Node.js requires `.js` for ESM at runtime).
- `moduleResolution: "bundler"` is used in `tsconfig.json` to accommodate this,
  which is less strict than `"node16"`.
