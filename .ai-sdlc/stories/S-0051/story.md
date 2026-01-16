---
id: S-0051
title: Unified collaborative review with deduplicated feedback
priority: 3
status: ready
type: feature
created: '2026-01-16'
labels:
  - review
  - ux
  - token-efficiency
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
---
# Unified collaborative review with deduplicated feedback

## User Story

**As a** developer using ai-sdlc,
**I want** the three review perspectives (code, security, PO) to produce one unified, deduplicated set of feedback,
**So that** I receive clear, actionable guidance without redundant issues inflating the problem.

## Problem Statement

Currently, the review phase runs 3 independent LLM reviews:
1. Code Review
2. Security Review
3. Product Owner Review

Each review operates in isolation, often flagging the same underlying problem from different angles. For example, when S-0012 had no implementation:
- Code Review: "NO IMPLEMENTATION EXISTS" (4 blockers)
- Security Review: "NO IMPLEMENTATION EXISTS" (4 blockers)
- PO Review: "NO IMPLEMENTATION EXISTS" (4 blockers)

This results in 12+ issues that all say the same thing, creating noise and confusion.

## Summary

Replace the 3 independent reviews with a single collaborative review that:
1. Considers all three perspectives (code quality, security, requirements)
2. Produces one unified set of issues
3. Deduplicates similar concerns
4. Provides clearer, more actionable feedback

## Acceptance Criteria

- [ ] Single LLM call replaces 3 separate review calls
- [ ] Review prompt includes all three perspectives (code, security, PO)
- [ ] Output is one unified list of issues (not 3 separate sections)
- [ ] Similar issues are consolidated (e.g., "no tests" appears once, not per-reviewer)
- [ ] Each issue indicates which perspective(s) it relates to
- [ ] Total issue count reflects actual distinct problems
- [ ] Feedback is more actionable (prioritized, not redundant)
- [ ] Token usage reduced (~3x fewer input tokens for context)
- [ ] Review result structure remains compatible with existing types

## Technical Notes

### Current Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   runReviewAgent()                       │
├─────────────────────────────────────────────────────────┤
│                                                         │
│   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│   │ Code Review  │  │Security Review│  │  PO Review   │ │
│   │   (LLM #1)   │  │   (LLM #2)   │  │   (LLM #3)   │ │
│   └──────┬───────┘  └──────┬───────┘  └──────┬───────┘ │
│          │                 │                 │         │
│          └────────────────┬┴─────────────────┘         │
│                           │                            │
│                    aggregateReviews()                   │
│                           │                            │
│                   ┌───────┴───────┐                    │
│                   │ Combined List │  ← Duplicates!     │
│                   │   (45 issues) │                    │
│                   └───────────────┘                    │
└─────────────────────────────────────────────────────────┘
```

### Proposed Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   runReviewAgent()                       │
├─────────────────────────────────────────────────────────┤
│                                                         │
│   ┌─────────────────────────────────────────────────┐  │
│   │           Unified Collaborative Review           │  │
│   │                   (LLM #1)                       │  │
│   │                                                  │  │
│   │   Perspectives: Code + Security + Requirements   │  │
│   │   Output: Deduplicated, prioritized issues       │  │
│   └──────────────────────┬──────────────────────────┘  │
│                          │                             │
│                   ┌──────┴──────┐                      │
│                   │ Clean List  │  ← No duplicates     │
│                   │ (12 issues) │                      │
│                   └─────────────┘                      │
└─────────────────────────────────────────────────────────┘
```

### Unified Review Prompt

```typescript
const UNIFIED_REVIEW_PROMPT = `You are a senior engineering team conducting a comprehensive review.

You must evaluate the implementation from THREE perspectives, but produce ONE unified set of issues:

## Perspective 1: Code Quality (Senior Developer)
- Code quality and maintainability
- Best practices and patterns
- Test coverage and quality
- Error handling

## Perspective 2: Security (Security Engineer)
- OWASP Top 10 vulnerabilities
- Input validation
- Authentication/authorization
- Data exposure risks

## Perspective 3: Requirements (Product Owner)
- Acceptance criteria met?
- User experience appropriate?
- Edge cases handled?
- Documentation adequate?

## CRITICAL INSTRUCTIONS:
1. DO NOT repeat the same issue from different perspectives
2. If an issue relates to multiple perspectives, list it ONCE with all relevant tags
3. Prioritize issues by actual impact, not by how many perspectives notice it
4. If the fundamental problem is "no implementation exists", say it ONCE as a blocker

## Output Format:
{
  "passed": true/false,
  "issues": [
    {
      "severity": "blocker" | "critical" | "major" | "minor",
      "category": "code_quality" | "security" | "requirements" | "testing",
      "perspectives": ["code", "security", "po"],  // Which perspectives this affects
      "description": "Clear description of the single issue",
      "file": "path/to/file.ts" (if applicable),
      "line": 42 (if applicable),
      "suggestedFix": "Actionable fix"
    }
  ]
}

Severity guidelines:
- blocker: Must be fixed (security holes, broken functionality, no implementation)
- critical: Should be fixed (major bugs, poor practices)
- major: Address soon (code quality, maintainability)
- minor: Nice to have (style, optimizations)
`;
```

### Updated Issue Schema

Add `perspectives` field to track which review angles an issue relates to:

```typescript
const ReviewIssueSchema = z.object({
  severity: z.enum(['blocker', 'critical', 'major', 'minor']),
  category: z.string().max(100),
  perspectives: z.array(z.enum(['code', 'security', 'po'])).optional(),
  description: z.string().max(5000),
  file: z.string().nullish().transform(v => v ?? undefined),
  line: z.number().int().positive().nullish().transform(v => v ?? undefined),
  suggestedFix: z.string().max(5000).nullish().transform(v => v ?? undefined),
});
```

### Display Format Update

Update `formatIssuesForDisplay()` to show perspectives:

```typescript
// Before:
// **code_quality**: No tests written

// After:
// **code_quality** [code, po]: No tests written
```

### Backward Compatibility

- Keep `codeReviewPassed`, `securityReviewPassed`, `poReviewPassed` fields in `ReviewAttempt`
- Derive these from issue perspectives:
  ```typescript
  const codeReviewPassed = !issues.some(i =>
    i.perspectives?.includes('code') &&
    ['blocker', 'critical'].includes(i.severity)
  );
  ```

## Benefits

| Metric | Before | After |
|--------|--------|-------|
| LLM calls per review | 3 | 1 |
| Token usage | ~150k | ~50k |
| Duplicate issues | Many | None |
| Issue count (S-0012 case) | 45 | ~12 |
| Actionability | Confusing | Clear |

## Out of Scope

- Changing review criteria/standards
- Adding new review perspectives
- Changing pass/fail thresholds

## Definition of Done

- [ ] Single unified review prompt implemented
- [ ] 3 parallel LLM calls replaced with 1 call
- [ ] `perspectives` field added to issue schema
- [ ] Display format shows which perspectives flagged each issue
- [ ] Backward compatibility maintained (derived pass/fail per perspective)
- [ ] Token usage reduced by ~60%
- [ ] Unit tests for new prompt and parsing
- [ ] Integration test comparing old vs new issue counts
- [ ] All existing tests pass

## Risks

- **LLM might still duplicate**: Mitigated by explicit "DO NOT repeat" instruction
- **Loss of specialized depth**: Mitigated by detailed per-perspective criteria in prompt
- **Longer single prompt**: Acceptable trade-off for better output

---

**Effort:** medium
**Risk:** low - can A/B test before full rollout
