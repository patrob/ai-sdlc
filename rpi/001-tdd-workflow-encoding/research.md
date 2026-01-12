# Research: Encoding TDD into AI-Driven SDLC Workflow

## 1. Problem Overview

### Problem Statement
The AI-driven SDLC workflow experiences repeated review failures because tests aren't being written and run properly during implementation. We need to enforce true Test-Driven Development (TDD) with the classic Red-Green-Refactor cycle.

### Key Objectives
1. Enforce one-test-at-a-time discipline during implementation
2. Require tests to fail first (RED) before implementation
3. Require minimal code that makes the test pass (GREEN)
4. Require all tests to stay green throughout
5. Enable refactoring only while maintaining green tests
6. Loop until all Acceptance Criteria are covered

### Success Criteria
- First-review pass rate increases significantly
- All implementations have corresponding tests
- Tests are written BEFORE implementation code
- No regressions introduced during implementation
- Clear audit trail of TDD cycles completed

---

## 2. Web Research Findings

### Recommended Approaches

#### Layer 1: CLAUDE.md Instructions (Implement First)
**Source**: [TDD with Claude Code](https://stevekinney.com/courses/ai-development/test-driven-development-with-claude)

Embed TDD discipline directly into project instructions:

```markdown
## Test-Driven Development (TDD) - MANDATORY

### Core Principle: Test-First ALWAYS

**NEVER write implementation code without a failing test first.**

If asked to "create a feature" or "implement X":
1. Respond: "Let me write a test first"
2. Write ONE test that describes the desired behavior
3. Run the test and READ the output to confirm it FAILS
4. Only AFTER confirming failure, write MINIMAL code to pass
5. Run ALL tests to ensure no regressions
6. Refactor only after all tests pass

### One Test at a Time

- Write ONE test per implementation cycle
- Do NOT write multiple tests at once
- Do NOT anticipate future requirements
- Each test should focus on ONE specific behavior

### Red-Green-Refactor Discipline

**RED Phase:**
- Write test for non-existent functionality
- Run test with: `npm test -- <test-file>`
- VERIFY test fails with expected error message
- If test passes immediately, it's invalid - rewrite it

**GREEN Phase:**
- Write the SIMPLEST code that makes the test pass
- Do NOT add "nice-to-have" features
- Do NOT refactor yet
- Run test to confirm it passes

**REFACTOR Phase:**
- Run ALL tests first: `npm test`
- Only refactor if ALL tests are green
- Run tests again after each refactoring change
- Keep tests passing throughout refactoring
```

**Pros**: Simple, low overhead, works immediately
**Cons**: Relies on AI compliance (no enforcement mechanism)

#### Layer 2: Agentic Workflow with Phase Transitions
**Source**: [Agentic Coding Handbook](https://tweag.github.io/agentic-coding-handbook/WORKFLOW_TDD/)

Structure workflow with explicit phase gates:

```
implement:
  1. write_one_test (RED)
  2. verify_test_fails (RED validation)
  3. implement_minimal (GREEN)
  4. verify_test_passes (GREEN validation)
  5. run_all_tests (regression check)
  6. refactor (if needed)
  7. repeat until all ACs covered
```

Each phase requires validation before proceeding.

#### Layer 3: TDD Guard Pattern
**Source**: [TDD Guard](https://github.com/nizos/tdd-guard)

Intercept file operations and block changes that violate TDD:
- Blocks implementation without failing tests
- Prevents code beyond current test requirements
- Enforces one test at a time

**Pros**: True enforcement (can't be bypassed)
**Cons**: Significant setup, doubles development time

#### Layer 4: Subagent Context Isolation
**Source**: [Forcing Claude to TDD](https://alexop.dev/posts/custom-tdd-workflow-claude-code-vue/)

Use separate subagents for each TDD phase to prevent context pollution:
- Test Writer agent (RED) - sees only requirements
- Implementer agent (GREEN) - sees only failing test
- Refactorer agent - evaluates with fresh context

**Pros**: Prevents implementation thinking from influencing test design
**Cons**: Complex setup, higher token usage

### Best Practices

1. **Be Explicit About TDD Intent**: Always state "We're doing TDD" at the start
2. **Request Tests for Non-Existent Features**: Prevents mock implementations
3. **Three-Step Verification Loop**:
   - Run tests and confirm they fail
   - Commit the failing tests
   - Implement with sole goal of making committed tests pass
4. **Track AC Coverage**: Map each acceptance criterion to at least one test

### Relevant Resources
- [AI-Powered TDD Best Practices 2025](https://www.nopaccelerate.com/test-driven-development-guide-2025/)
- [How CI/CD Empowers TDD](https://medium.com/@hivemind_tech/how-ci-cd-empowers-test-driven-development-a96c8ae1ad91)
- [ATDD Complete Guide](https://www.testingxperts.com/blog/acceptance-test-driven-development-atdd/)

---

## 3. Codebase Analysis

### Affected Files

#### 1. Type Definitions (`src/types/index.ts`)
**Lines**: 76-108 (StoryFrontmatter), 230+ (Config)

Add TDD tracking types:
```typescript
export interface TDDTestCycle {
  test_name: string;
  test_file: string;
  red_timestamp: string;
  green_timestamp?: string;
  refactor_timestamp?: string;
  test_output_red: string;
  test_output_green?: string;
  all_tests_green: boolean;
  cycle_number: number;
}

export interface TDDConfig {
  enabled: boolean;
  strictMode: boolean;
  maxCycles: number;
  requireApprovalPerCycle: boolean;
}
```

Add to `StoryFrontmatter`:
```typescript
tdd_enabled?: boolean;
tdd_current_test?: string;
tdd_test_history?: TDDTestCycle[];
```

#### 2. Configuration (`src/core/config.ts`)
**Lines**: 29+ (DEFAULT_CONFIG)

Add TDD defaults:
```typescript
tdd: {
  enabled: false,  // Opt-in
  strictMode: true,
  maxCycles: 50,
  requireApprovalPerCycle: false,
}
```

#### 3. Implementation Agent (`src/agents/implementation.ts`)
**Lines**: 30-142 (runImplementationAgent)

This is the primary integration point. Needs to:
- Check if TDD is enabled
- Route to TDD implementation loop vs standard implementation
- Execute RED → GREEN → REFACTOR cycles
- Validate test execution at each phase
- Track cycle history in frontmatter

#### 4. Review Agent (`src/agents/review.ts`)
**Lines**: 526+ (verification)

Add TDD process validation:
- Verify TDD cycles were recorded if TDD enabled
- Check all cycles completed (red → green → refactor)
- Flag incomplete cycles as blockers

#### 5. Planning Agent (`src/agents/planning.ts`)
**Lines**: 7-16 (PLANNING_SYSTEM_PROMPT)

Update to structure plans as TDD cycles when enabled:
```markdown
### Cycle 1: [First Acceptance Criterion]
- [ ] RED: Write test for [specific behavior]
- [ ] GREEN: Implement minimal code to pass test
- [ ] REFACTOR: Improve code quality
```

### Existing Patterns to Follow

#### Test Execution Pattern (`src/agents/review.ts:214-262`)
```typescript
async function runCommandAsync(
  command: string,
  workingDir: string,
  timeout: number,
  onProgress?: (output: string) => void
): Promise<{ success: boolean; output: string }>
```
Reuse this for TDD test execution.

#### Frontmatter Update Pattern (`src/core/story.ts:224-233`)
```typescript
export function updateStoryField<K extends keyof StoryFrontmatter>(
  story: Story,
  field: K,
  value: StoryFrontmatter[K]
): Story
```
Use for updating `tdd_test_history` after each cycle.

#### Agent Progress Callbacks (`src/agents/research.ts:6-10`)
```typescript
export interface AgentOptions {
  onProgress?: AgentProgressCallback;
}
```
Report TDD phase progress: "RED phase...", "GREEN phase...", etc.

### Current Workflow Structure
```
research → plan → implement → review → (rework if needed) → done
```

Will become:
```
research → plan → implement[TDD cycles] → review[+TDD validation] → done
```

---

## 4. Proposed Solution Approach

### High-Level Strategy

Implement a **layered approach** with increasing enforcement:

1. **CLAUDE.md Instructions** - Immediate guidance
2. **Workflow Phase Gates** - Structural enforcement in implementation agent
3. **Pre-Review Verification** - Hard gate before review can proceed
4. **Review Validation** - Audit trail verification

### Key Implementation Steps

#### Phase 1: Types & Configuration
1. Add `TDDTestCycle` interface to `src/types/index.ts`
2. Add `TDDConfig` interface to `src/types/index.ts`
3. Extend `StoryFrontmatter` with TDD tracking fields
4. Add TDD config defaults to `src/core/config.ts`

#### Phase 2: Implementation Agent TDD Loop
1. Add TDD system prompt constant
2. Create `runTDDImplementation()` function with cycle loop
3. Implement phase execution helpers (RED, GREEN, REFACTOR)
4. Add test execution helpers (single test, all tests)
5. Add acceptance criteria coverage check
6. Preserve `runStandardImplementation()` as fallback

#### Phase 3: Review Integration
1. Add TDD process validation to review agent
2. Generate TDD-specific review issues for violations
3. Track TDD compliance in review output

#### Phase 4: Planning & UI
1. Update planning agent for TDD-structured plans
2. Add TDD history display to story details
3. Update story template with `tdd_enabled` field

### Technology/Library Choices

| Choice | Justification |
|--------|---------------|
| Opt-in by default | Allows gradual adoption, won't break existing workflows |
| Story-level override | Fine-grained control for testing the approach |
| Cycle history in frontmatter | Audit trail, visible in story file |
| Reuse existing test execution | Consistent with review agent pattern |

### Risk Factors and Mitigations

| Risk | Mitigation |
|------|------------|
| Test output parsing fragility | Use structured JSON output, provide fallbacks |
| Test command variability | Detect runner, allow config override |
| Long feedback loops | Make approval optional, use streaming |
| Breaking existing workflows | Opt-in only, preserve standard implementation |
| Test history bloat | Limit to 100 cycles, compress old entries |

---

## 5. Example Code Snippets

### TDD System Prompt
```typescript
const TDD_SYSTEM_PROMPT = `You are practicing strict Test-Driven Development.

Your workflow MUST follow this exact cycle:

**RED Phase**:
1. Write ONE test that expresses the next acceptance criterion
2. The test MUST fail because the functionality doesn't exist
3. Run the test and verify it fails
4. Explain why it fails and what it's testing

**GREEN Phase**:
1. Write the MINIMUM code to make this ONE test pass
2. Do NOT add extra features
3. Run the test to verify it passes
4. Run ALL tests to ensure nothing broke

**REFACTOR Phase**:
1. Look for improvements (DRY, clarity, performance)
2. Make changes ONLY if tests stay green
3. Run ALL tests after each change

Complete one full cycle before starting the next test.
Never write code before writing a test.
Never write multiple tests before making the first one pass.`;
```

### TDD Implementation Loop Structure
```typescript
async function runTDDImplementation(
  storyPath: string,
  sdlcRoot: string,
  options: AgentOptions
): Promise<AgentResult> {
  const story = parseStory(storyPath);
  const config = loadConfig(path.dirname(sdlcRoot));

  let cycleNumber = (story.frontmatter.tdd_test_history?.length || 0) + 1;

  while (cycleNumber <= config.tdd.maxCycles) {
    // RED: Write failing test
    const redResult = await executeTDDPhase(story, 'RED', ...);
    const testFail = await runTests(workingDir);
    if (testFail.passed) {
      return { error: 'TDD Violation: Test passed immediately' };
    }

    // GREEN: Write minimal code
    const greenResult = await executeTDDPhase(story, 'GREEN', ...);
    const testPass = await runTests(workingDir);
    if (!testPass.passed) {
      return { error: 'TDD Violation: Test still failing' };
    }

    // REFACTOR: Improve while green
    const refactorResult = await executeTDDPhase(story, 'REFACTOR', ...);
    const stillGreen = await runTests(workingDir);
    if (!stillGreen.passed) {
      return { error: 'TDD Violation: Refactoring broke tests' };
    }

    // Record cycle
    recordTDDCycle(story, cycleNumber, ...);

    // Check if done
    if (await allACsCovered(story)) {
      return { success: true };
    }

    cycleNumber++;
  }
}
```

### CLAUDE.md TDD Section
```markdown
## Test-Driven Development (TDD) - MANDATORY

### The TDD Loop

For EVERY acceptance criterion:

1. **RED**: Write ONE failing test
   - Run: `npm test -- <test-file>`
   - MUST see failure output
   - If it passes, test is invalid

2. **GREEN**: Write MINIMAL code
   - Only enough to pass THIS test
   - No extra features
   - Run test to confirm pass

3. **ALL GREEN**: Run full suite
   - `npm test`
   - ALL tests must pass
   - Fix any regressions before continuing

4. **REFACTOR**: Improve code quality
   - Only if ALL tests green
   - Run tests after each change
   - Stop if any test fails

5. **REPEAT**: Next acceptance criterion
```

---

## 6. Next Steps

### Prerequisites
1. Ensure `testCommand` is configured in project config
2. Ensure test runner supports test name filtering (vitest, jest)
3. Review existing test patterns in codebase

### Recommended Implementation Order

| Phase | Tasks | Estimate |
|-------|-------|----------|
| 1. Types & Config | Add interfaces, config defaults | 1-2 hours |
| 2. Implementation Agent | TDD loop, phase helpers | 4-6 hours |
| 3. Review Integration | TDD validation | 1-2 hours |
| 4. Planning & UI | TDD plans, history display | 2-3 hours |
| 5. Testing | Unit + integration tests | 3-4 hours |

**Total**: 11-17 hours

### Testing Considerations

1. **Unit Tests for TDD Enforcement**:
   - TDD disabled → uses standard implementation
   - Test passes immediately → violation error
   - Test fails after GREEN → violation error
   - Refactoring breaks tests → violation error
   - All ACs covered → marks complete

2. **Integration Tests**:
   - Full story completes all TDD cycles
   - Cycle history recorded correctly
   - Review validates TDD process
   - Failed cycles trigger rework

### Key Design Decisions

1. **Opt-in vs Opt-out**: Recommend **opt-in** for gradual adoption
2. **Cycle Approval**: Make **optional** via config
3. **Test Granularity**: Enforce **one-test-per-cycle**
4. **Failure Handling**: **Abort and generate rework action**
5. **History Retention**: Keep **last 100 cycles**

---

## Summary

To encode TDD into the AI-driven SDLC workflow:

1. **Track TDD state** in story frontmatter (`tdd_enabled`, `tdd_test_history`)
2. **Modify implementation agent** to execute RED → GREEN → REFACTOR cycles
3. **Validate each phase** with actual test execution
4. **Verify in review** that TDD process was followed
5. **Display progress** with cycle history in story details

The approach is:
- **Opt-in**: Won't break existing workflows
- **Auditable**: Full history of TDD cycles
- **Enforceable**: Hard gates at each phase
- **Gradual**: Can enable per-story for testing
