---
id: S-0004
title: End-to-end smoke test for complete workflow
priority: 28
status: in-progress
type: chore
created: '2026-01-13'
labels:
  - p2-polish
  - testing
  - dx
  - s
research_complete: true
plan_complete: true
implementation_complete: false
reviews_complete: false
slug: end-to-end-workflow-smoke-test
worktree_path: >-
  /Users/probinson/Repos/on-par/pocs/ai-sdlc/.ai-sdlc/worktrees/S-0004-end-to-end-workflow-smoke-test
updated: '2026-01-16'
branch: ai-sdlc/end-to-end-workflow-smoke-test
last_test_run:
  passed: true
  failures: 0
  timestamp: '2026-01-16T22:35:05.976Z'
implementation_retry_count: 0
---
# End-to-end smoke test for complete workflow

## User Story

**As a** developer working on ai-sdlc  
**I want** an automated end-to-end test that validates the complete workflow orchestration  
**So that** I can confidently refactor and modify the system without breaking the integration between components

## Summary

This test validates the orchestration logic that ties together all workflow phases (refine → plan → implement → review → create_pr). It mocks external boundaries (LLM, GitHub API) but uses real file system and git operations to ensure the integration points work correctly. This is our safety net for refactoring - it verifies that data flows correctly between phases and that the system produces the expected artifacts (commits, branches, PR payloads).

## Acceptance Criteria

### Test Setup & Isolation
- [ ] Test creates isolated temporary directory for each test run
- [ ] Test initializes real git repository in temp directory (`git init`, configure user/email)
- [ ] Test creates minimal project structure (package.json, src/, .ai-sdlc/stories/)
- [ ] Test cleans up all temporary files and directories after completion (in `afterEach` hook)

### Mocking Strategy
- [ ] Mock `runAgentQuery` to return deterministic, realistic responses for each phase
- [ ] Mock `gh pr create` command to capture arguments without calling real GitHub API
- [ ] Mock `ora` spinner to prevent console output during test execution
- [ ] Do NOT mock file system operations - use real fs with temp directories
- [ ] Do NOT mock git commands - use real git operations in temp repo

### Workflow Execution
- [ ] Test executes full workflow: `refine` → `plan` → `implement` → `review` → `create_pr`
- [ ] Test uses realistic story file that exercises all phases with typical content
- [ ] Test verifies story file is updated correctly after each phase (status fields, metadata)
- [ ] Test verifies git commits are created with correct messages and content
- [ ] Test verifies feature branch is created with correct naming pattern

### Assertions & Validation
- [ ] Verify story status transitions correctly (backlog → refined → planned → implemented → reviewed → pr_created)
- [ ] Verify git log contains expected commits (one per phase that requires commits)
- [ ] Verify git branch exists and matches story ID pattern
- [ ] Verify mocked `gh pr create` received correct title and body format
- [ ] Verify no temporary files leaked outside the test temp directory

### Performance & Reliability
- [ ] Test completes in under 30 seconds on CI environment
- [ ] Test is deterministic (passes consistently, no flaky behavior)
- [ ] Test runs without requiring any external API credentials
- [ ] Test can run in parallel with other tests (isolated state)

## Edge Cases & Constraints

### Edge Cases to Consider
- **Missing git configuration**: Test must configure git user.name and user.email in temp repo to avoid commit failures
- **Existing branch name collision**: If branch already exists, git operations should handle gracefully (though unlikely in temp repo)
- **Story file parsing errors**: If mocked LLM returns malformed YAML, test should fail with clear error message
- **Incomplete workflow**: Test should verify behavior if workflow stops mid-phase (e.g., blocked status)

### Constraints
- **No network calls**: Test must be fully offline-capable (all external APIs mocked)
- **CI environment**: Must work in GitHub Actions with no interactive terminal
- **Test isolation**: Must not interfere with actual `.ai-sdlc/` directory in project root
- **Cleanup guarantee**: Use `try/finally` or vitest hooks to ensure temp directories cleaned even on test failure

## Technical Implementation Notes

### Files to Create
- `tests/integration/workflow-e2e.test.ts` - Main test suite
- `tests/fixtures/test-story-template.yaml` - Realistic story template for testing

### Key Dependencies to Mock
```typescript
// Mock these modules in the test
vi.mock('../../src/ai/agent', () => ({
  runAgentQuery: vi.fn()
}));

vi.mock('ora', () => ({
  default: vi.fn(() => ({
    start: vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    fail: vi.fn().mockReturnThis(),
  }))
}));
```

### Mock Response Strategy
- **Refine phase**: Return valid refined story with user story, acceptance criteria
- **Plan phase**: Return implementation plan with file changes
- **Implement phase**: Return code changes and test verification
- **Review phase**: Return approval with quality assessment
- **Create PR phase**: Capture gh command args, verify format

### Git Operations Pattern
```bash
# Test should perform these real git operations:
git init
git config user.name "Test User"
git config user.email "test@example.com"
git checkout -b main
git add .
git commit -m "initial commit"
# ... then verify branch creation, commits during workflow
```

## Out of Scope

- Performance benchmarking or profiling
- Load testing with multiple concurrent workflows
- Testing actual LLM response quality or creativity
- Testing actual GitHub API integration (covered by unit tests)
- Testing UI/UX of CLI output (covered by CLI integration tests)
- Testing error recovery or retry logic (covered by unit tests)

## Definition of Done

- [ ] Test passes in local environment (`npm test`)
- [ ] Test passes in CI environment (GitHub Actions)
- [ ] Test completes in under 30 seconds
- [ ] Test cleanup verified (no leaked temp files)
- [ ] Code coverage includes all workflow orchestration code paths
- [ ] Documentation added to test file explaining mock strategy

---

**Effort**: medium  
**Labels**: testing, integration, workflow, smoke-test, quality

## Research

Perfect! Now I have enough context to provide comprehensive research findings. Let me compile the research output.

---

# Research Findings: End-to-end Smoke Test for Complete Workflow

## Problem Summary

The goal is to create an end-to-end integration test that validates the complete workflow orchestration (refine → research → plan → implement → review → create_pr) by mocking external boundaries (LLM, GitHub API) while using real file system and git operations. This smoke test serves as a safety net for refactoring, ensuring data flows correctly between phases and the system produces expected artifacts (commits, branches, PR payloads).

## Codebase Context

### Existing Test Patterns

The codebase already has extensive integration test infrastructure that can be used as templates:

1. **`tests/integration/refinement-loop.test.ts`** - Demonstrates:
   - Creating temporary directories with `fs.mkdtempSync(path.join(os.tmpdir(), 'prefix'))`
   - Setting up full `.ai-sdlc` folder structure with `STORIES_FOLDER`
   - Creating config files programmatically
   - Mocking `runAgentQuery` from `core/client.js`
   - Cleaning up with `fs.rmSync(testDir, { recursive: true, force: true })`
   - Using `beforeEach`/`afterEach` for test isolation

2. **`tests/integration/worktree-workflow.test.ts`** - Shows:
   - Mocking `ora` spinner to prevent console output during tests
   - Mocking `child_process.spawnSync` for git operations (but we should use REAL git for this E2E test)
   - Mocking external dependencies while testing integration

3. **`tests/integration/auto-story-workflow.test.ts`** - Demonstrates:
   - Setting up test fixtures in `tests/fixtures/` directory
   - Using `process.env.AI_SDLC_ROOT` to override the SDLC root for testing
   - Creating stories with `createStory()` function
   - Testing workflow execution with `run()` command

### Key Workflow Orchestration Code

1. **`src/cli/runner.ts`** (WorkflowRunner class):
   - Line 164-246: `executeAction()` - Main action dispatcher
   - Switches on action type: refine, research, plan, implement, review, rework, create_pr
   - Each phase calls corresponding agent: `runRefinementAgent()`, `runResearchAgent()`, etc.
   - Returns `AgentResult` with success status and changes made

2. **`src/core/kanban.ts`**:
   - Line 164: `assessState()` - Determines next actions based on story state
   - Returns `StateAssessment` with `recommendedActions` array
   - Logic for determining which phase is next based on completion flags

3. **Agent Implementations** (`src/agents/`):
   - `refinement.ts`: Takes backlog → ready, updates content
   - `research.ts`: Adds research section
   - `planning.ts`: Adds implementation plan
   - `implementation.ts`: Modifies source files
   - `review.ts`: Line 1513: Creates PR with `gh pr create` command

### Story Lifecycle and Data Flow

**Story State Tracking** (from `src/types/index.ts`):
\`\`\`typescript
interface StoryFrontmatter {
  status: 'backlog' | 'ready' | 'in-progress' | 'done' | 'blocked';
  research_complete: boolean;
  plan_complete: boolean;
  implementation_complete: boolean;
  reviews_complete: boolean;
  pr_url?: string;
  branch?: string;
}
\`\`\`

**Phase Transitions**:
1. **Refine**: backlog → ready, updates `status`
2. **Research**: Sets `research_complete = true`
3. **Plan**: Sets `plan_complete = true`
4. **Implement**: Sets `implementation_complete = true`, creates git commits
5. **Review**: Sets `reviews_complete = true` on approval
6. **Create PR**: Sets `pr_url`, calls `gh pr create`

### LLM Integration Point

**`src/core/client.ts`**:
- Line 86: `runAgentQuery()` - Single point of LLM interaction
- All agents call this function with prompts
- Returns string response
- **Mock Strategy**: Mock this function to return deterministic responses

\`\`\`typescript
vi.mock('../../src/core/client.js', () => ({
  runAgentQuery: vi.fn()
}));
\`\`\`

## Files Requiring Changes

### New Files to Create

#### 1. **`tests/integration/workflow-e2e.test.ts`**
- **Change Type**: Create New
- **Reason**: Main E2E smoke test suite
- **Specific Changes**:
  - Import workflow orchestration functions
  - Set up temp directory with real git repo
  - Mock `runAgentQuery` with phase-specific responses
  - Mock `ora` spinner for silent execution
  - Mock `gh pr create` command to capture args
  - Execute full workflow: refine → research → plan → implement → review → create_pr
  - Assert on:
    - Story status transitions (backlog → ready → in-progress → done)
    - Story frontmatter flags (research_complete, plan_complete, etc.)
    - Git commits created (verify with `git log`)
    - Git branch created (verify with `git branch --list`)
    - PR creation command captured with correct title/body
- **Dependencies**: None (can be created independently)

#### 2. **`tests/fixtures/test-story-e2e.md`**
- **Change Type**: Create New
- **Reason**: Realistic story template for E2E testing
- **Specific Changes**:
  - Create markdown file with typical story structure
  - Include frontmatter with all required fields
  - Add user story section
  - Add acceptance criteria checkboxes
  - Keep content simple but realistic
- **Dependencies**: None

### Existing Files Potentially Needing Modifications

#### 3. **`vitest.integration.config.ts`**
- **Change Type**: Verify Configuration (Likely No Change Needed)
- **Reason**: Ensure integration tests can run E2E test
- **Current Config**: Already uses `pool: 'forks'` for `process.chdir()` support
- **Note**: Current config at line 8 uses `pool: 'forks'` which is perfect for E2E tests that need process isolation

#### 4. **`package.json`**
- **Change Type**: Verify (Likely No Change Needed)
- **Reason**: Ensure test scripts are configured
- **Current Scripts**: Already has `test:integration` script
- **Note**: E2E test will run as part of existing integration test suite

## Testing Strategy

### Mock Response Strategy

Mock `runAgentQuery` to return deterministic responses per phase:

\`\`\`typescript
const mockAgentResponses = {
  refine: `# User Story
As a developer
I want to test the E2E workflow
So that I can ensure system integrity

## Acceptance Criteria
- [ ] All phases execute in sequence
- [ ] Git commits are created
- [ ] PR is generated

effort: small
labels: test, e2e`,

  research: `## Research

Found relevant code patterns in existing tests.`,

  plan: `## Implementation Plan

**T1**: Create test file
- Files: test.ts
- Dependencies: none`,

  implement: `Implementation complete. Created test.ts with passing tests.`,

  review: `APPROVED

All acceptance criteria met. Code quality is good.`,
};

// In test:
vi.mocked(runAgentQuery).mockImplementation(async ({ prompt }) => {
  if (prompt.includes('refine')) return mockAgentResponses.refine;
  if (prompt.includes('research')) return mockAgentResponses.research;
  // ... etc
});
\`\`\`

### Git Operations Pattern

Based on existing patterns, the test should:

\`\`\`typescript
// Setup
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-sdlc-e2e-'));
execSync('git init', { cwd: testDir });
execSync('git config user.name "Test User"', { cwd: testDir });
execSync('git config user.email "test@example.com"', { cwd: testDir });
execSync('git checkout -b main', { cwd: testDir });

// Initial commit
fs.writeFileSync(path.join(testDir, 'package.json'), '{}');
execSync('git add .', { cwd: testDir });
execSync('git commit -m "initial commit"', { cwd: testDir });

// ... run workflow ...

// Assertions
const branches = execSync('git branch --list', { cwd: testDir, encoding: 'utf-8' });
expect(branches).toContain('ai-sdlc/S-');

const commits = execSync('git log --oneline', { cwd: testDir, encoding: 'utf-8' });
expect(commits).toContain('Implement');
\`\`\`

### GitHub PR Command Mocking

Mock `child_process.execSync` to capture `gh pr create` calls:

\`\`\`typescript
let capturedPRCommand = '';

vi.spyOn(cp, 'execSync').mockImplementation((cmd: string) => {
  if (typeof cmd === 'string' && cmd.includes('gh pr create')) {
    capturedPRCommand = cmd;
    return Buffer.from('https://github.com/user/repo/pull/123');
  }
  // Let other commands pass through (git operations)
  return originalExecSync(cmd);
});

// After workflow:
expect(capturedPRCommand).toContain('--title');
expect(capturedPRCommand).toContain('--body');
\`\`\`

# Implementation Plan: End-to-end Smoke Test for Complete Workflow

## Phase 1: Setup and Test Infrastructure

- [ ] **T1**: Create test fixture story template
  - Files: `tests/fixtures/test-story-e2e.md`
  - Dependencies: none
  - Create a minimal but realistic story with frontmatter (status: backlog, all completion flags false)
  - Include basic user story, acceptance criteria, and effort/labels

- [ ] **T2**: Set up test file with basic structure
  - Files: `tests/integration/workflow-e2e.test.ts`
  - Dependencies: T1
  - Import required dependencies (fs, path, os, child_process, vitest)
  - Set up test suite with `describe` block
  - Create test variables for temp directories and cleanup

- [ ] **T3**: Implement test setup helpers
  - Files: `tests/integration/workflow-e2e.test.ts`
  - Dependencies: T2
  - Create `setupGitRepo()` helper to initialize git with user config
  - Create `setupProjectStructure()` helper to create .ai-sdlc folder structure
  - Create `setupInitialCommit()` helper to make initial git commit

## Phase 2: Mocking Strategy

- [ ] **T4**: Configure LLM agent mocking
  - Files: `tests/integration/workflow-e2e.test.ts`
  - Dependencies: T3
  - Mock `runAgentQuery` from `src/core/client.ts`
  - Create deterministic responses for each phase (refine, research, plan, implement, review)
  - Ensure responses match expected format for each agent

- [ ] **T5**: Configure ora spinner mocking
  - Files: `tests/integration/workflow-e2e.test.ts`
  - Dependencies: T4
  - Mock `ora` to return chainable methods (start, succeed, fail)
  - Prevent console output during test execution

- [ ] **T6**: Configure GitHub CLI mocking
  - Files: `tests/integration/workflow-e2e.test.ts`
  - Dependencies: T4
  - Spy on `child_process.execSync` to capture `gh pr create` calls
  - Store captured PR command arguments for assertion
  - Allow real git commands to pass through while mocking gh commands

## Phase 3: Core Test Implementation

- [ ] **T7**: Implement beforeEach test setup
  - Files: `tests/integration/workflow-e2e.test.ts`
  - Dependencies: T3, T4, T5, T6
  - Create temp directory for test isolation
  - Initialize git repository with user config
  - Set up .ai-sdlc folder structure
  - Copy fixture story to test directory
  - Create initial git commit

- [ ] **T8**: Implement afterEach cleanup
  - Files: `tests/integration/workflow-e2e.test.ts`
  - Dependencies: T7
  - Remove temp directory with `fs.rmSync`
  - Clear all mocks with `vi.clearAllMocks()`

- [ ] **T9**: Implement main E2E test case
  - Files: `tests/integration/workflow-e2e.test.ts`
  - Dependencies: T7, T8
  - Execute refine action and verify story status changes to 'ready'
  - Execute research action and verify research_complete flag
  - Execute plan action and verify plan_complete flag
  - Execute implement action and verify implementation_complete flag
  - Execute review action and verify reviews_complete flag
  - Execute create_pr action and verify pr_url is set

## Phase 4: Git Operations Validation

- [ ] **T10**: Add git branch verification
  - Files: `tests/integration/workflow-e2e.test.ts`
  - Dependencies: T9
  - Use `execSync('git branch --list')` to verify feature branch created
  - Assert branch name matches expected pattern (e.g., `ai-sdlc/S-xxxx-*`)

- [ ] **T11**: Add git commit verification
  - Files: `tests/integration/workflow-e2e.test.ts`
  - Dependencies: T9
  - Use `execSync('git log --oneline')` to list commits
  - Assert expected commits exist for implementation phase
  - Verify commit messages follow expected format

- [ ] **T12**: Add git state verification
  - Files: `tests/integration/workflow-e2e.test.ts`
  - Dependencies: T10, T11
  - Verify current branch is the feature branch (not main)
  - Verify working directory is clean (no uncommitted changes)

## Phase 5: Story State Validation

- [ ] **T13**: Verify story frontmatter transitions
  - Files: `tests/integration/workflow-e2e.test.ts`
  - Dependencies: T9
  - After each phase, read story file and parse frontmatter
  - Assert status field matches expected value
  - Assert completion flags (research_complete, plan_complete, etc.) are correctly set

- [ ] **T14**: Verify story content updates
  - Files: `tests/integration/workflow-e2e.test.ts`
  - Dependencies: T13
  - Verify research section is added after research phase
  - Verify implementation plan is added after planning phase
  - Verify story content structure remains valid YAML/markdown

## Phase 6: PR Creation Validation

- [ ] **T15**: Verify gh pr create command captured
  - Files: `tests/integration/workflow-e2e.test.ts`
  - Dependencies: T6, T9
  - Assert `gh pr create` was called exactly once
  - Assert captured command contains `--title` flag
  - Assert captured command contains `--body` flag

- [ ] **T16**: Verify PR metadata format
  - Files: `tests/integration/workflow-e2e.test.ts`
  - Dependencies: T15
  - Parse captured PR command arguments
  - Verify title matches expected format (story ID + title)
  - Verify body contains expected sections (summary, test plan, etc.)

## Phase 7: Error Handling and Edge Cases

- [ ] **T17**: Test git configuration missing scenario
  - Files: `tests/integration/workflow-e2e.test.ts`
  - Dependencies: T7
  - Create test case without git user.name/user.email configured
  - Verify workflow handles gracefully or provides clear error

- [ ] **T18**: Test cleanup on failure scenario
  - Files: `tests/integration/workflow-e2e.test.ts`
  - Dependencies: T8
  - Simulate test failure mid-workflow
  - Verify temp directory is still cleaned up in afterEach
  - Use try/finally if needed to guarantee cleanup

## Phase 8: Performance and Reliability

- [ ] **T19**: Add test timeout configuration
  - Files: `tests/integration/workflow-e2e.test.ts`
  - Dependencies: T9
  - Set test timeout to 30 seconds using vitest `test.timeout`
  - Ensure test completes well under limit (target: <10 seconds)

- [ ] **T20**: Verify test isolation
  - Files: `tests/integration/workflow-e2e.test.ts`
  - Dependencies: T7, T8
  - Run test multiple times to ensure no state leakage
  - Verify test can run in parallel with other integration tests
  - Check no files created outside temp directory

## Phase 9: Documentation and Code Quality

- [ ] **T21**: Add comprehensive test documentation
  - Files: `tests/integration/workflow-e2e.test.ts`
  - Dependencies: none
  - Add file-level JSDoc explaining test purpose and mock strategy
  - Document each helper function with comments
  - Explain why specific mocks are needed

- [ ] **T22**: Add inline assertions with descriptive messages
  - Files: `tests/integration/workflow-e2e.test.ts`
  - Dependencies: T9, T10, T11, T13, T15
  - Add descriptive error messages to all assertions
  - Group related assertions with comments
  - Make test failures easy to diagnose

## Phase 10: Verification and Finalization

- [ ] **T23**: Run test suite locally
  - Files: none (verification step)
  - Dependencies: all previous tasks
  - Execute `npm test` and verify E2E test passes
  - Execute `npm run test:integration` specifically
  - Verify test completes in under 30 seconds

- [ ] **T24**: Run type checking and linting
  - Files: none (verification step)
  - Dependencies: all previous tasks
  - Execute `npm run build` to verify TypeScript compilation
  - Execute `npm run lint` to check code style
  - Fix any type errors or linting issues

- [ ] **T25**: Verify test coverage
  - Files: none (verification step)
  - Dependencies: T23
  - Run tests with coverage enabled
  - Verify workflow orchestration code paths are covered
  - Verify `src/cli/runner.ts` executeAction is covered

- [ ] **T26**: Final cleanup verification
  - Files: none (verification step)
  - Dependencies: T23
  - After test runs, check temp directories are removed
  - Use `lsof` or similar to verify no leaked file handles
  - Verify no test artifacts in project root

---

## Summary

**Total Tasks**: 26 tasks across 10 phases

**Estimated Effort**: Medium (3-4 hours)

**Critical Path**:
1. Setup infrastructure (T1-T3)
2. Configure mocks (T4-T6)
3. Implement core test (T7-T9)
4. Add validations (T10-T16)
5. Verify and finalize (T23-T26)

**Key Risks Mitigated**:
- Test isolation via temp directories
- Git state pollution via cleanup hooks
- CI compatibility via git user config
- Performance via timeout limits
- Determinism via comprehensive mocking

## Additional Context

### Relevant Patterns

1. **Test Isolation Pattern** (from `refinement-loop.test.ts`):
   \`\`\`typescript
   beforeEach(() => {
     testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-sdlc-test-'));
     sdlcRoot = path.join(testDir, '.ai-sdlc');
     fs.mkdirSync(sdlcRoot, { recursive: true });
     fs.mkdirSync(path.join(sdlcRoot, STORIES_FOLDER), { recursive: true });
   });

   afterEach(() => {
     fs.rmSync(testDir, { recursive: true, force: true });
   });
   \`\`\`

2. **Config File Pattern** (from `refinement-loop.test.ts` line 33-57):
   \`\`\`typescript
   const config = {
     sdlcFolder: '.ai-sdlc',
     refinement: { maxIterations: 3 },
     reviewConfig: { maxRetries: 3, autoCompleteOnApproval: true },
     stageGates: { requireApprovalBeforeImplementation: false },
     theme: 'auto',
   };
   fs.writeFileSync(
     path.join(testDir, '.ai-sdlc.json'),
     JSON.stringify(config, null, 2)
   );
   \`\`\`

3. **Story Creation Pattern** (from `src/core/story.ts`):
   - Use `createStory(title, sdlcRoot, options)` for new stories
   - Use `parseStory(path)` to read stories
   - Use `updateStoryStatus(story, newStatus)` to change status
   - Use `writeStory(story)` to persist changes

### Potential Risks

1. **Git State Pollution**: If test doesn't clean up properly, git state could leak
   - **Mitigation**: Always use temp directories, enforce cleanup in `afterEach`

2. **Real Git Commands in CI**: Git operations might behave differently in CI
   - **Mitigation**: Mock git user config, ensure temp dir has proper permissions

3. **Timing Issues**: Real git/fs operations might introduce race conditions
   - **Mitigation**: Use synchronous operat


### Implementation Notes (2026-01-16)

Let me write a comprehensive summary of what was implemented:

## Implementation Complete!

I've successfully implemented the end-to-end smoke test for the complete workflow orchestration. Here's what was created:

### Files Created:

1. **`tests/fixtures/test-story-e2e.md`** - A minimal test story fixture with:
   - Basic frontmatter (ID: S-9999, status: backlog)
   - User story, acceptance criteria, and technical notes
   - All required fields for workflow execution

2. **`tests/integration/workflow-e2e.test.ts`** - The main E2E test suite with:
   - **Test Setup & Isolation**: Creates temporary directories, initializes git repos, sets up project structure
   - **Comprehensive Mocking**: 
     - `runAgentQuery` mocked to return deterministic responses for each phase
     - `ora` spinner mocked to prevent console output
     - `gh` CLI commands mocked to capture PR creation without calling GitHub
     - `spawn` mocked for test/build commands (review agent)
     - `spawnSync` mocked but passes through real git operations
     - `execSync` mocked but passes through real git operations
   - **Real File & Git Operations**: Uses actual file system and git in temp directories for integration validation
   - **Cleanup Guarantees**: Restores working directory and removes temp files even on test failure

### Test Coverage:

The test validates:
- ✅ Complete workflow execution (refine → research → plan → implement → review → create_pr)
- ✅ Story state transitions (backlog → ready → in-progress → done)
- ✅ All completion flags set correctly (research_complete, plan_complete, implementation_complete, reviews_complete)
- ✅ PR URL and branch name populated
- ✅ Story content updated with research section and implementation plan
- ✅ Git commits created during implementation
- ✅ Feature branch created with correct naming pattern (ai-sdlc/S-9999-*)
- ✅ gh pr create command called with correct arguments
- ✅ Implementation files created (executor.ts, validator.ts)
- ✅ Test completes in under 30 seconds (timeout set)

### Key Design Decisions:

1. **Mock Strategy**: External boundaries (LLM, GitHub API) mocked; file system and git operations real for integration validation
2. **Deterministic Responses**: Each agent phase returns realistic, phase-appropriate mock responses
3. **Real Git Operations**: Branch creation, commits, and checkout happen in real temp git repo
4. **Isolation**: Each test run gets its own temp directory, git repo, and story file
5. **Cleanup Safety**: Working directory restored and temp files cleaned up even on failure

### What Makes This Test Valuable:

- **Smoke Test**: Validates the orchestration logic ties all phases together correctly
- **Safety Net**: Enables confident refactoring without breaking integration points
- **Data Flow Validation**: Ensures story metadata flows correctly between phases
- **Artifact Verification**: Confirms expected artifacts (commits, branches, PR) are created
- **Fast & Reliable**: Completes in seconds, no external dependencies, fully deterministic

The test is ready to run with `npm test tests/integration/workflow-e2e.test.ts` or as part of the full test suite!
