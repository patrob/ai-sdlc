# ai-sdlc

TypeScript CLI for AI-assisted software development lifecycle management.

## Pre-Commit

Run `make verify` before committing ANY changes. Fix errors immediately—never commit code that fails verification.

## File Hygiene

Only these markdown files belong in project root: `README.md`, `CLAUDE.md`, `REFINEMENT_LOOP.md`

Do NOT create: temporary/scratch files, shell scripts, or documentation unless explicitly requested.

## Tidy Rule

When modifying a file, you may make small improvements (rename unclear variables, add missing types) within that file only. Do not tidy files you aren't already changing. Tidying should not increase scope by more than 10%.

## Detailed Instructions

- [Testing patterns](docs/testing.md) — Test pyramid, unit vs integration, mocking rules
- [Implementation workflow](docs/implementation-workflow.md) — Anti-hallucination, completion criteria, failure handling
- [Code conventions](docs/code-conventions.md) — ActionType patterns, SOLID, DRY, security
- [Story documents](docs/story-documents.md) — Accuracy and status tracking
