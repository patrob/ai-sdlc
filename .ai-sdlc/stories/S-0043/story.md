---
id: S-0043
title: Create Core SDLC Agent Skills
priority: 60
status: backlog
type: feature
created: '2026-01-15'
labels:
  - agent-sdk
  - skills
  - sdlc-workflow
estimated_effort: medium
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
slug: create-core-sdlc-agent-skills
---
# Create Core SDLC Agent Skills

## User Story

**As a** developer using ai-sdlc,
**I want** pre-built Skills for each SDLC phase (Research, Plan, Implement, Review),
**So that** agents have domain-specific guidance that improves quality and consistency.

## Summary

Create a set of core SKILL.md files that provide specialized instructions for each phase of the SDLC workflow. These Skills complement the existing agent system prompts by adding best practices, coding standards, and domain knowledge.

## Context

This story builds on S-0042 (Enable Agent Skills Infrastructure). With Skills infrastructure enabled, we can now create content.

**What are Agent Skills?**
Skills are SKILL.md files with:
- YAML frontmatter containing a `description` field (determines when Claude invokes the Skill)
- Markdown body with instructions, best practices, and guidance

**Reference Documentation:**
- Claude Agent SDK Skills: https://platform.claude.com/docs/en/agent-sdk/skills
- Skills Best Practices: https://code.claude.com/docs/en/skills

**SKILL.md File Format:**
```markdown
---
name: skill-name
description: When to invoke this skill (Claude uses this to decide autonomously)
---

# Skill Title

Instructions and guidance in Markdown...
```

## Acceptance Criteria

- [ ] Create `sdlc-research` Skill with codebase-first research approach
- [ ] Create `sdlc-planning` Skill with structured planning and AC patterns
- [ ] Create `sdlc-implementation` Skill with TDD-aware implementation guidance
- [ ] Create `sdlc-review` Skill with code review standards and checklists
- [ ] Each Skill has clear, specific `description` for autonomous invocation
- [ ] Skills follow SKILL.md format (YAML frontmatter + Markdown body)
- [ ] Skills directory structure: `.claude/skills/{skill-name}/SKILL.md`
- [ ] Skills complement existing agent system prompts (no conflicts)
- [ ] All existing tests pass (`npm test`)
- [ ] TypeScript compilation succeeds (`npm run build`)

## Technical Notes

### Directory Structure

```
.claude/
  skills/
    sdlc-research/
      SKILL.md
    sdlc-planning/
      SKILL.md
    sdlc-implementation/
      SKILL.md
    sdlc-review/
      SKILL.md
```

### Skill Designs

#### 1. sdlc-research Skill

```markdown
---
name: sdlc-research
description: Use when researching a software feature, bug, or technical problem. Provides codebase-first research methodology.
---

# SDLC Research Skill

## Approach
1. **Codebase First**: Search existing code before external sources
2. **Pattern Recognition**: Identify existing patterns to follow
3. **Dependency Audit**: List affected files and components
4. **Knowledge Gaps**: Document what needs external research

## Research Checklist
- [ ] Search codebase for similar implementations
- [ ] Identify relevant files and modules
- [ ] List dependencies and integration points
- [ ] Note existing patterns and conventions
- [ ] Document unknowns requiring external research
```

#### 2. sdlc-planning Skill

```markdown
---
name: sdlc-planning
description: Use when creating an implementation plan for a user story or feature. Provides structured planning methodology.
---

# SDLC Planning Skill

## Plan Structure
1. **Tasks**: Numbered, atomic implementation steps
2. **Files**: List files to create/modify per task
3. **Tests**: Test approach for each task (unit, integration)
4. **Dependencies**: Task ordering and prerequisites

## Acceptance Criteria Pattern
- Start with "Given..." (precondition)
- Then "When..." (action)
- Then "Then..." (expected result)

## Planning Checklist
- [ ] Break into atomic tasks (1-2 hours each)
- [ ] Identify files for each task
- [ ] Define test approach per task
- [ ] Order by dependencies
- [ ] Include verification steps
```

#### 3. sdlc-implementation Skill

```markdown
---
name: sdlc-implementation
description: Use when implementing code based on a plan. Provides TDD-aware implementation guidance.
---

# SDLC Implementation Skill

## TDD Workflow (when enabled)
1. **RED**: Write failing test first
2. **GREEN**: Minimal code to pass
3. **REFACTOR**: Improve without changing behavior

## Implementation Rules
- Follow existing code patterns
- Update tests with implementation (not separately)
- Keep changes minimal and focused
- Commit frequently with meaningful messages

## Quality Checklist
- [ ] Tests written alongside implementation
- [ ] No debug/temp code left behind
- [ ] All linter warnings addressed
- [ ] Build passes locally
- [ ] Changes follow project conventions
```

#### 4. sdlc-review Skill

```markdown
---
name: sdlc-review
description: Use when reviewing code changes or implementation. Provides structured code review methodology.
---

# SDLC Review Skill

## Review Dimensions
1. **Correctness**: Does it do what was asked?
2. **Tests**: Adequate coverage? Edge cases?
3. **Security**: OWASP top 10 violations?
4. **Performance**: Obvious inefficiencies?
5. **Maintainability**: Clear, documented, follows patterns?

## Issue Severity Levels
- **Blocker**: Must fix before merge
- **Critical**: Should fix, high risk
- **Major**: Should fix, moderate risk
- **Minor**: Nice to fix, low priority

## Review Checklist
- [ ] All acceptance criteria met
- [ ] Tests pass and cover changes
- [ ] No security vulnerabilities
- [ ] Code follows project patterns
- [ ] Documentation updated if needed
```

### Skill Description Best Practices

The `description` field is crucial - it determines when Claude autonomously invokes the Skill:
- Be specific about the context/trigger
- Avoid overlap with other Skills
- Use action-oriented language ("Use when...")
- Include key terms that match likely prompts

### Testing Skills Integration

To verify Skills are working:
1. Run an agent query with context matching a Skill's description
2. Check agent output mentions using the Skill
3. Verify Skill instructions are followed in agent behavior

## Edge Cases

1. **Multiple Skills match**: Claude decides based on best description match
2. **Skill conflicts with system prompt**: System prompt takes precedence
3. **Skill too generic**: May trigger inappropriately - refine description
4. **Missing Skills directory**: Skills not loaded (expected behavior)

## Definition of Done

- [ ] Code review completed
- [ ] All tests passing (`npm test` shows 0 failures)
- [ ] TypeScript compilation succeeds (`npm run build`)
- [ ] All 4 Skills created with proper SKILL.md format
- [ ] Skills directories follow `.claude/skills/{name}/SKILL.md` structure
- [ ] Manual verification that Skills are discovered and invokable
- [ ] Skills complement (don't conflict with) existing agent prompts

---

**Effort:** medium
**Dependencies:** S-0042 (Enable Agent Skills Infrastructure)
**Blocks:** None
