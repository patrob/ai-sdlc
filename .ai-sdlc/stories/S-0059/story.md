---
id: S-0059
title: Workflow automation incorrectly flags configuration-only stories as incomplete
priority: 50
status: backlog
type: bug
created: '2026-01-18'
labels:
  - workflow
  - false-positive
  - configuration
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
slug: workflow-flags-config-stories-incomplete
---
# Workflow automation incorrectly flags configuration-only stories as incomplete

## User Story

**As a** developer using ai-sdlc with automated workflows
**I want** the workflow automation to correctly identify completed configuration-only stories
**So that** stories that don't require TypeScript source changes are not incorrectly restarted or flagged as incomplete

## Summary

The workflow automation incorrectly flags stories as incomplete when they don't modify files in `src/`. This causes false positive "implementation wrote documentation only" errors for legitimate configuration-only stories that create files in `.claude/`, `.github/`, or other non-source directories.

## Bug Evidence

**Discovered in S-0043** (Create Core SDLC Agent Skills):

| Expected | Actual |
|----------|--------|
| 4 SKILL.md files created = complete | Flagged as incomplete |
| Story status: done | Story status: in-progress |
| No restart reason | `last_restart_reason: No source code changes detected. Implementation wrote documentation only.` |

**Timeline:**
1. S-0043 created all 4 SKILL.md files in `.claude/skills/`
2. `npm test` passed (1262 tests)
3. `npm run build` succeeded
4. Workflow automation detected no changes to `src/` directory
5. Workflow set `last_restart_reason` and kept `implementation_complete: false`
6. Story remained stuck in `in-progress` despite all deliverables being created

## Root Cause Analysis

**Location:** The workflow automation that validates implementation completion checks for TypeScript/JavaScript changes in `src/` directory.

**Problem:** The validation logic applies a universal rule ("must modify `src/`") to all stories, regardless of story type. Configuration-only stories explicitly state "No TypeScript source changes required" in their requirements, but this is not detected by the automation.

**CLAUDE.md Anti-Hallucination Section:**
```markdown
### Self-Check Before Marking Complete:
1. Did I modify files in `src/` (not just `.ai-sdlc/stories/`)?
2. Did I write new tests that verify the new functionality?
3. Would `git diff --name-only` show `.ts` or `.js` files I changed?
4. If I answer "no" to any of these, I have NOT completed implementation.
```

This rule is correct for most stories but **incorrectly applied** to stories that explicitly don't require source changes.

## Acceptance Criteria

### Core Functionality
- [ ] Stories with `type: configuration` (or similar marker) bypass the `src/` modification check
- [ ] Stories that explicitly state "No TypeScript source changes required" in their body are not flagged
- [ ] Valid configuration changes (`.claude/`, `.github/`, config files) are recognized as legitimate implementation

### Detection Logic
- [ ] Add story type classification: `code`, `configuration`, `documentation`
- [ ] Configuration stories allow completion when config files are created/modified
- [ ] The `last_restart_reason` is not set for configuration-only stories that meet their acceptance criteria

### Edge Cases
- [ ] Mixed stories (config + code) still require source changes
- [ ] Stories with unclear type default to requiring source changes (safe default)
- [ ] Manual override available via frontmatter field (e.g., `requires_source_changes: false`)

### Quality
- [ ] `make verify` passes
- [ ] Unit tests for story type classification
- [ ] Integration test with configuration-only story

## Technical Notes

### Proposed Solution

**Option A: Story Type Field**
Add a `story_type` or `requires_source_changes` field to frontmatter:

```yaml
---
id: S-0043
title: Create Core SDLC Agent Skills
type: feature
story_type: configuration  # NEW: code | configuration | documentation
# OR
requires_source_changes: false  # NEW: explicit override
---
```

**Option B: Intelligent Detection**
Parse the story body for explicit statements like:
- "No TypeScript source changes required"
- "configuration-only story"
- "creates configuration files only"

**Option C: File Pattern Recognition**
Recognize valid implementation patterns:
- Changes to `.claude/` = valid for Skills stories
- Changes to `.github/` = valid for CI/CD stories
- Changes to config files = valid for configuration stories

### Files to Investigate
- Workflow automation code that checks for `src/` changes
- Logic that sets `last_restart_reason`
- Implementation completion validation

### Files to Modify (TBD after research)
- Story validation logic
- Implementation completion check
- Frontmatter type definitions (`src/types/index.ts`)

## Out of Scope

- Changing the default behavior for code-based stories
- Removing the anti-hallucination checks entirely
- Auto-detecting story type from commit history

## Definition of Done

- [ ] Configuration-only stories can complete without `src/` changes
- [ ] S-0043 scenario would not trigger false positive
- [ ] New frontmatter field or detection logic implemented
- [ ] Unit tests cover story type classification
- [ ] `make verify` passes
- [ ] Manual verification: create a configuration-only story, verify it can complete

## Related

- **S-0043**: Story affected by this bug (used for investigation)
- **CLAUDE.md**: Contains the anti-hallucination rules that are being over-applied

## Research

<!-- Populated by research agent -->

## Implementation Plan

<!-- Populated by planning agent -->

## Review Notes

<!-- Populated by review agents -->
