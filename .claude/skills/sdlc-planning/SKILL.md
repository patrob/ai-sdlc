---
name: sdlc-planning
description: Use when creating implementation plans, breaking down tasks, sequencing changes, planning TDD cycles, or creating a roadmap for implementing a user story.
---

# SDLC Planning Skill

This skill provides guidance for creating effective implementation plans during the SDLC planning phase.

## Overview

A good implementation plan transforms research findings into actionable, atomic tasks that can be executed systematically. The plan serves as both a roadmap and a checklist for implementation.

## Planning Methodology

### Step 1: Review Research Findings

Before planning, ensure you have:
- Clear understanding of the problem
- List of files requiring changes
- Identified patterns to follow
- Testing strategy outlined
- Dependencies mapped

### Step 2: Define Atomic Tasks

Break work into tasks that are:
- **Atomic** - Can be completed in one focused session (1-2 hours max)
- **Verifiable** - Has clear success criteria
- **Independent** - Minimal dependencies on other incomplete tasks
- **Testable** - Can be verified with automated tests when applicable

### Step 3: Establish Dependencies

For each task, identify:
- What must be completed before this task?
- What tasks are blocked by this task?
- Are there any circular dependencies to resolve?

### Step 4: Sequence by Dependency Order

Order tasks so that:
1. Setup/infrastructure tasks come first
2. Core functionality follows
3. Edge cases and error handling
4. Tests and verification
5. Documentation (if required)

## Task Format

Use this structured format for tasks:

```markdown
## Phase 1: Setup

- [ ] **T1**: Create the service interface
  - Files: `src/services/auth.ts`, `src/types/auth.ts`
  - Dependencies: none

- [ ] **T2**: Add authentication middleware
  - Files: `src/middleware/auth.ts`
  - Dependencies: T1

## Phase 2: Implementation

- [ ] **T3**: Implement login endpoint
  - Files: `src/routes/auth.ts`
  - Dependencies: T1, T2

## Phase 3: Testing

- [ ] **T4**: Write unit tests for auth service
  - Files: `src/services/auth.test.ts`
  - Dependencies: T1
```

### Task ID Convention

- Use sequential IDs: T1, T2, T3, etc.
- IDs help track dependencies clearly
- Reference IDs in dependency lists

### File List Guidelines

- List ALL files that will be created or modified
- Use backticks for file paths: `src/services/auth.ts`
- Include test files in the plan

### Dependency Guidelines

- Use "none" for tasks with no dependencies
- List multiple dependencies comma-separated: T1, T2
- Ensure no circular dependencies exist

## TDD Planning (When Enabled)

When TDD mode is enabled, structure each feature using RED-GREEN-REFACTOR:

```markdown
### Feature: User Login

- [ ] **T1**: 🔴 RED - Write failing test for successful login
  - Files: `src/auth/login.test.ts`
  - Dependencies: none
  - Expected: Test fails (function doesn't exist)

- [ ] **T2**: 🟢 GREEN - Implement login function
  - Files: `src/auth/login.ts`
  - Dependencies: T1
  - Expected: Test passes with minimal code

- [ ] **T3**: 🔵 REFACTOR - Clean up login implementation
  - Files: `src/auth/login.ts`
  - Dependencies: T2
  - Expected: All tests still pass

- [ ] **T4**: 🔴 RED - Write failing test for invalid credentials
  - Files: `src/auth/login.test.ts`
  - Dependencies: T3
  - Expected: Test fails

- [ ] **T5**: 🟢 GREEN - Add credential validation
  - Files: `src/auth/login.ts`
  - Dependencies: T4
  - Expected: Test passes
```

### TDD Rules

1. **NEVER write implementation before a test**
2. Each test verifies ONE specific behavior
3. Tests must fail before implementation (verify the test works)
4. After GREEN, run ALL tests to check for regressions
5. REFACTOR phase is optional but recommended

## Given-When-Then for Acceptance Criteria

Map acceptance criteria to test scenarios:

```markdown
### AC: User can log in with valid credentials

**Given** a registered user with email "test@example.com" and password "secret123"
**When** they submit the login form with correct credentials
**Then** they receive an access token and are redirected to dashboard

Test: `src/auth/login.test.ts` - "should return token for valid credentials"
```

## Plan Quality Checklist

Before finalizing the plan:

- [ ] Every task has a clear, actionable description (starts with a verb)
- [ ] All files to be modified are listed
- [ ] Dependencies are explicit (task IDs or "none")
- [ ] No circular dependencies exist
- [ ] Tasks are atomic (completable in 1-2 hours)
- [ ] Test tasks are included for new functionality
- [ ] Phases are logically ordered (setup → implementation → testing)

## Common Phases

### Standard Implementation

1. **Setup** - Create interfaces, types, configuration
2. **Core Implementation** - Main functionality
3. **Error Handling** - Edge cases, validation
4. **Testing** - Unit tests, integration tests
5. **Verification** - Final checks, documentation

### TDD Implementation

1. **Setup** - Configure test environment, create fixtures
2. **Feature Cycles** - Repeat RED-GREEN-REFACTOR for each feature
3. **Integration** - Connect components, integration tests
4. **Verification** - Full test suite, build verification

## Anti-Patterns to Avoid

1. **Monolithic tasks** - "Implement the feature" is too big. Break it down.

2. **Missing dependencies** - If T3 needs T1's output, list T1 as a dependency.

3. **Test-last planning** - Tests should be planned alongside implementation, not as an afterthought.

4. **Vague task descriptions** - "Work on auth" is unclear. "Create JWT token generation function" is specific.

5. **Skipping phases** - Don't jump to implementation without setup tasks for types/interfaces.

## Tips for Effective Planning

- **Think in layers** - Database → Service → API → UI
- **Plan for testability** - How will each task be verified?
- **Consider rollback** - If this fails, can we safely revert?
- **Include cleanup** - Remove temporary code, update imports
- **Document decisions** - Note why you chose this sequence
