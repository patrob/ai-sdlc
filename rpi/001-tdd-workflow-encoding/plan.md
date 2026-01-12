# Implementation Plan: Encoding TDD into AI-Driven SDLC Workflow

## Problem Summary

Encode Test-Driven Development (TDD) enforcement into the AI-driven SDLC workflow to eliminate repeated review failures caused by missing or improperly sequenced tests. The implementation will enforce the Red-Green-Refactor cycle with validation at each phase.

**Research Reference:** `rpi/001-tdd-workflow-encoding/research.md`

## Prerequisites

- Node.js and npm installed
- Existing test runner configured (`testCommand` in project config)
- Test runner supports test name filtering (vitest, jest)
- ⚠️ This changes implementation workflow - existing stories in-progress will use standard implementation until TDD is explicitly enabled

## Implementation Phases

### Phase 1: TDD Type Definitions

**Goal:** Define TypeScript interfaces for TDD tracking and configuration.

**Context:**
- Builds on `src/types/index.ts` (StoryFrontmatter at lines 76-108)
- Follow existing interface patterns in the types file

**Tasks:**

- [x] 🔴 Write unit test for TDDTestCycle interface structure (expect fail)
- [x] 🟢 Add TDDTestCycle interface to src/types/index.ts (expect pass)
- [x] 🔵 Refactor TDDTestCycle if needed (keep passing)

- [x] 🔴 Write unit test for TDDConfig interface structure (expect fail)
- [x] 🟢 Add TDDConfig interface to src/types/index.ts (expect pass)
- [x] 🔵 Refactor TDDConfig if needed (keep passing)

- [x] 🔴 Write unit test for StoryFrontmatter TDD fields (expect fail)
- [x] 🟢 Extend StoryFrontmatter with tdd_enabled, tdd_current_test, tdd_test_history (expect pass)
- [x] 🔵 Refactor StoryFrontmatter extensions if needed (keep passing)

---

### Phase 2: TDD Configuration

**Goal:** Add TDD configuration options to the config system with sensible defaults.

**Context:**
- Builds on `src/core/config.ts` (DEFAULT_CONFIG at line 29+)
- TDD is opt-in by default to preserve existing workflows

**Tasks:**

- [x] 🔴 Write unit test for TDD config defaults (expect fail)
- [x] 🟢 Add TDD config section to DEFAULT_CONFIG in src/core/config.ts (expect pass)
- [x] 🔵 Refactor config structure if needed (keep passing)

- [x] 🔴 Write unit test for TDD config validation (expect fail)
- [x] 🟢 Add TDD config validation to config loader (expect pass)
- [x] 🔵 Refactor validation logic if needed (keep passing)

---

### Phase 3: TDD Implementation Loop

**Goal:** Create the core TDD execution loop that enforces Red-Green-Refactor cycles.

**Context:**
- Builds on `src/agents/implementation.ts` (runImplementationAgent at lines 30-142)
- Reuse test execution from `src/agents/review.ts:214-262`
- Use frontmatter updates from `src/core/story.ts:224-233`

**Tasks:**

- [x] 🔴 Write unit test for TDD system prompt constant (expect fail)
- [x] 🟢 Add TDD_SYSTEM_PROMPT constant to implementation agent (expect pass)
- [x] 🔵 Refactor prompt if needed (keep passing)

- [x] 🔴 Write unit test for runSingleTest helper (expect fail)
- [x] 🟢 Implement runSingleTest function to execute one test file/name (expect pass)
- [x] 🔵 Refactor runSingleTest if needed (keep passing)

- [x] 🔴 Write unit test for runAllTests helper (expect fail)
- [x] 🟢 Implement runAllTests function to execute full test suite (expect pass)
- [x] 🔵 Refactor runAllTests if needed (keep passing)

- [x] 🔴 Write unit test for RED phase validation (test must fail) (expect fail)
- [x] 🟢 Implement executeRedPhase that writes test and verifies failure (expect pass)
- [x] 🔵 Refactor executeRedPhase if needed (keep passing)

- [x] 🔴 Write unit test for GREEN phase validation (test must pass) (expect fail)
- [x] 🟢 Implement executeGreenPhase that writes code and verifies pass (expect pass)
- [x] 🔵 Refactor executeGreenPhase if needed (keep passing)

- [x] 🔴 Write unit test for REFACTOR phase validation (all tests stay green) (expect fail)
- [x] 🟢 Implement executeRefactorPhase that improves code and verifies all green (expect pass)
- [x] 🔵 Refactor executeRefactorPhase if needed (keep passing)

- [x] 🔴 Write unit test for TDD cycle recording (expect fail)
- [x] 🟢 Implement recordTDDCycle to update story frontmatter with cycle history (expect pass)
- [x] 🔵 Refactor recordTDDCycle if needed (keep passing)

- [x] 🔴 Write unit test for AC coverage check (expect fail)
- [x] 🟢 Implement checkACCoverage to verify all acceptance criteria have tests (expect pass)
- [x] 🔵 Refactor checkACCoverage if needed (keep passing)

- [x] 🔴 Write unit test for runTDDImplementation main loop (expect fail)
- [x] 🟢 Implement runTDDImplementation with full Red-Green-Refactor cycle loop (expect pass)
- [x] 🔵 Refactor runTDDImplementation if needed (keep passing)

- [x] 🔴 Write unit test for TDD routing in runImplementationAgent (expect fail)
- [x] 🟢 Add TDD routing logic to check tdd_enabled and call appropriate function (expect pass)
- [x] 🔵 Refactor routing logic if needed (keep passing)

---

### Phase 4: Review Agent TDD Validation

**Goal:** Add TDD process validation to the review agent to verify cycles were completed correctly.

**Context:**
- Builds on `src/agents/review.ts` (verification at line 526+)
- Generates review issues for TDD violations

**Tasks:**

- [x] 🔴 Write unit test for TDD cycle completeness validation (expect fail)
- [x] 🟢 Implement validateTDDCycles to check all cycles have red→green→refactor (expect pass)
- [x] 🔵 Refactor validateTDDCycles if needed (keep passing)

- [x] 🔴 Write unit test for TDD violation issue generation (expect fail)
- [x] 🟢 Implement generateTDDIssues to create review issues for violations (expect pass)
- [x] 🔵 Refactor generateTDDIssues if needed (keep passing)

- [x] 🔴 Write unit test for TDD validation integration in review agent (expect fail)
- [x] 🟢 Add TDD validation call to review agent when tdd_enabled (expect pass)
- [x] 🔵 Refactor integration if needed (keep passing)

---

### Phase 5: Planning Agent TDD Structure

**Goal:** Update planning agent to generate TDD-structured plans when TDD is enabled.

**Context:**
- Builds on `src/agents/planning.ts` (PLANNING_SYSTEM_PROMPT at lines 7-16)
- Plans should structure tasks as TDD cycles

**Tasks:**

- [x] 🔴 Write unit test for TDD-aware planning prompt (expect fail)
- [x] 🟢 Add TDD planning instructions to PLANNING_SYSTEM_PROMPT (expect pass)
- [x] 🔵 Refactor planning prompt if needed (keep passing)

- [x] 🔴 Write unit test for TDD plan structure generation (expect fail)
- [x] 🟢 Implement TDD cycle structure in plan output format (expect pass)
- [x] 🔵 Refactor plan structure if needed (keep passing)

---

## Appendix: Code Examples

### Example A: TDDTestCycle Interface
```typescript
// src/types/index.ts
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
```

### Example B: TDDConfig Interface
```typescript
// src/types/index.ts
export interface TDDConfig {
  enabled: boolean;
  strictMode: boolean;
  maxCycles: number;
  requireApprovalPerCycle: boolean;
}
```

### Example C: TDD Config Defaults
```typescript
// src/core/config.ts - add to DEFAULT_CONFIG
tdd: {
  enabled: false,  // Opt-in
  strictMode: true,
  maxCycles: 50,
  requireApprovalPerCycle: false,
}
```

### Example D: TDD System Prompt
```typescript
// src/agents/implementation.ts
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

### Example E: TDD Implementation Loop Structure
```typescript
// src/agents/implementation.ts
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
    const redResult = await executeRedPhase(story, cycleNumber, options);
    const testFail = await runSingleTest(redResult.testFile, workingDir);
    if (testFail.passed) {
      return { error: 'TDD Violation: Test passed immediately (RED phase)' };
    }

    // GREEN: Write minimal code
    const greenResult = await executeGreenPhase(story, cycleNumber, options);
    const testPass = await runSingleTest(greenResult.testFile, workingDir);
    if (!testPass.passed) {
      return { error: 'TDD Violation: Test still failing (GREEN phase)' };
    }

    // Regression check
    const allGreen = await runAllTests(workingDir);
    if (!allGreen.passed) {
      return { error: 'TDD Violation: Regression detected after GREEN phase' };
    }

    // REFACTOR: Improve while green
    const refactorResult = await executeRefactorPhase(story, cycleNumber, options);
    const stillGreen = await runAllTests(workingDir);
    if (!stillGreen.passed) {
      return { error: 'TDD Violation: Refactoring broke tests' };
    }

    // Record cycle
    await recordTDDCycle(story, cycleNumber, redResult, greenResult, refactorResult);

    // Check if done
    if (await checkACCoverage(story)) {
      return { success: true, message: 'All acceptance criteria covered' };
    }

    cycleNumber++;
  }

  return { error: `TDD: Max cycles (${config.tdd.maxCycles}) reached` };
}
```

### Example F: Test Execution Helper (Reuse from review.ts)
```typescript
// See src/agents/review.ts:214-262 for runCommandAsync pattern
async function runSingleTest(
  testFile: string,
  workingDir: string
): Promise<{ passed: boolean; output: string }> {
  const result = await runCommandAsync(
    `npm test -- ${testFile}`,
    workingDir,
    60000
  );
  return {
    passed: result.success,
    output: result.output,
  };
}
```

### Example G: Frontmatter Update for TDD Cycles
```typescript
// Use src/core/story.ts:224-233 updateStoryField pattern
async function recordTDDCycle(
  story: Story,
  cycleNumber: number,
  redResult: PhaseResult,
  greenResult: PhaseResult,
  refactorResult: PhaseResult
): Promise<void> {
  const cycle: TDDTestCycle = {
    test_name: redResult.testName,
    test_file: redResult.testFile,
    red_timestamp: redResult.timestamp,
    green_timestamp: greenResult.timestamp,
    refactor_timestamp: refactorResult.timestamp,
    test_output_red: redResult.output,
    test_output_green: greenResult.output,
    all_tests_green: true,
    cycle_number: cycleNumber,
  };

  const history = story.frontmatter.tdd_test_history || [];
  history.push(cycle);

  // Limit to last 100 cycles
  const trimmedHistory = history.slice(-100);

  updateStoryField(story, 'tdd_test_history', trimmedHistory);
}
```

---

## Notes

- **Opt-in Design**: TDD enforcement is disabled by default. Enable per-story with `tdd_enabled: true` in frontmatter or globally in config.
- **Preserves Existing Workflow**: When TDD is disabled, the standard implementation flow is used unchanged.
- **Cycle Limit**: Default max of 50 cycles prevents infinite loops. History is trimmed to last 100 entries.
- **Error Recovery**: TDD violations abort implementation and generate rework actions for correction.
