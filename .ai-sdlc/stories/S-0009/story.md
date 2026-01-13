---
id: S-0009
title: Robust LLM response parsing with fallback handling
priority: 23
status: backlog
type: feature
created: '2026-01-13'
labels:
  - p1-production
  - reliability
  - llm
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
slug: robust-llm-response-parsing
---
# Robust LLM response parsing with fallback handling

## User Story

**As a** solopreneur using ai-sdlc
**I want** the system to handle unexpected LLM responses gracefully
**So that** the workflow doesn't crash when Claude returns malformed or unexpected output

## Summary

LLMs are probabilistic - they occasionally return unexpected formats. The current fallback parsing in `parseReviewResponse()` uses basic keyword matching. This story improves parsing reliability with a chain of extraction strategies and better error handling.

## Acceptance Criteria

- [ ] All LLM response parsing uses try-catch with specific error messages
- [ ] When structured output (JSON/YAML) is expected, validate schema before using
- [ ] Support multiple extraction strategies in priority order:
  1. Direct JSON parse (current approach)
  2. JSON within markdown code blocks (```json ... ```)
  3. JSON with leading/trailing text stripped
  4. YAML format fallback
- [ ] If parsing fails, log the raw response for debugging
- [ ] If parsing fails, prompt LLM to retry with clearer instructions (max 2 retry attempts)
- [ ] If parsing fails after retries, fail gracefully with actionable error message to user
- [ ] Add unit tests covering malformed responses for each parsing point
- [ ] Export utility for use in all agents that need structured responses

## Technical Notes

**Files to create:**
- `src/core/llm-utils.ts` - New extraction utility
- `src/core/llm-utils.test.ts` - Unit tests

**Files to modify:**
- `src/agents/review.ts` - Replace parseReviewResponse (~line 375-417)

**Implementation hints:**
- Create `extractStructuredResponse<T>(response: string, schema: ZodSchema<T>)` utility
- Leverage existing Zod schemas (ReviewResponseSchema ~line 116-119)
- Use `zod.safeParse` consistently (already used ~line 387)
- Focus on critical parsing points: action decisions, implementation results, PR descriptions

**Complexity:** Small (1-2 days)

## Out of Scope

- Custom parsing strategies per agent
- Machine learning-based response extraction
- Response caching
