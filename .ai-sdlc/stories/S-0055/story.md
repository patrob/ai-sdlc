---
id: S-0055
title: Add TypeScript error classification to implementation agent
priority: 2
status: backlog
type: enhancement
created: '2026-01-17'
labels:
  - p1-production
  - implementation-agent
  - typescript
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
slug: typescript-error-classification
---
# Add TypeScript error classification to implementation agent

## User Story

**As a** developer using the ai-sdlc implementation agent
**I want** the agent to understand TypeScript error relationships and fix root causes first
**So that** I don't waste time in whack-a-mole cycles where fixing one error creates cascading errors

## Summary

The implementation agent currently treats all TypeScript errors equally, leading to a "whack-a-mole" pattern where fixing one error introduces another. This happens because the agent doesn't understand that some TypeScript errors are "root causes" (e.g., missing type definition) while others are "cascading errors" (e.g., downstream files that reference the missing type).

**Root Cause Analysis:** A recent production run showed this exact pattern:
| Attempt | Error | Location |
|---------|-------|----------|
| 1 | TS2322 (type mismatch) | `src/app.tsx:59` |
| 2 | TS2307 (module not found) | test file:60 |
| 3 | TS2345 (argument type) | test file:245 |
| 4 | TS2345 (argument type) | `src/hooks/use-ai-sdlc.ts:162` |

Each fix introduced new errors in different files, wasting 20+ minutes before giving up.

## Business Value

- **Reduced iteration cycles**: Fix root causes first, potentially resolving multiple errors at once
- **Faster time-to-completion**: Estimated 30-50% reduction in average implementation attempts
- **Better developer experience**: Clearer guidance on which errors to prioritize

## Acceptance Criteria

- [ ] TypeScript errors are classified into categories:
  - **Source errors**: Missing imports (TS2307 in source), type definitions (TS2304, TS2339), type assignments (TS2322 in type files)
  - **Cascading errors**: Reference errors that stem from source errors (TS2307 in test files, TS2345)
- [ ] Implementation retry prompt includes guidance to prioritize root cause errors
- [ ] When multiple TS errors exist, agent receives ordered list with root causes first
- [ ] Integration test demonstrates agent handles cascading errors correctly

## Technical Notes

**Files to modify:**
- `src/agents/implementation.ts` - Modify `buildRetryPrompt()` to add error classification
- `src/services/error-classifier.ts` (new) - Service to categorize TS errors
- `tests/services/error-classifier.test.ts` (new) - Unit tests for classifier

**Error Classification Strategy:**
```typescript
// High-level approach
const SOURCE_ERROR_CODES = ['TS2304', 'TS2339']; // Missing type definitions
const TYPE_ASSIGNMENT_CODES = ['TS2322'];         // Type mismatches
const CASCADING_ERROR_CODES = ['TS2307', 'TS2345']; // Often symptoms

// Classification logic:
// 1. TS2322 in .d.ts or types/ files = source error
// 2. TS2307 in test files = likely cascading (source file may not build)
// 3. TS2345 anywhere = check if related types have source errors
```

**Open Questions:**
- Should we use regex patterns or parse TS compiler JSON output (`--pretty false`)?
- Do we need AI-based classification or are heuristics sufficient?
- Should classification be conservative (fewer source errors) or aggressive?

## Out of Scope

- Full TypeScript AST parsing (stick to error output analysis)
- Multi-project/monorepo TypeScript error correlation
- Automatic type generation or inference
- Changes to how tests are run or build is executed

## Testing Strategy

**Unit tests:**
- `classifyErrors()` correctly categorizes various error patterns
- Source errors sorted before cascading errors
- Empty input returns empty result
- Invalid error format handled gracefully

**Integration tests:**
- Mock implementation agent receives properly ordered error list
- Agent retry prompt contains classification guidance
- Real TypeScript error output from compiler is parsed correctly

## Definition of Done

- [ ] Error classifier service implemented with unit tests
- [ ] `buildRetryPrompt()` enhanced with classification guidance
- [ ] Integration test verifying error ordering in retry prompts
- [ ] `make verify` passes
- [ ] No regression in existing implementation agent behavior

## Research

<!-- Populated by research agent -->

## Implementation Plan

<!-- Populated by planning agent -->

## Review Notes

<!-- Populated by review agents -->
