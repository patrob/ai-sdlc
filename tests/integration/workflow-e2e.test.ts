/**
 * End-to-end smoke test for complete workflow orchestration
 *
 * This test validates that all workflow phases (refine → research → plan → implement → review → create_pr)
 * execute correctly and produce expected artifacts. It mocks external boundaries (LLM, GitHub API)
 * but uses real file system and git operations for integration validation.
 *
 * Mock Strategy:
 * - runAgentQuery: Mocked to return deterministic responses for each phase
 * - ora spinner: Mocked to prevent console output during test execution
 * - gh pr create: Mocked via child_process to capture arguments without calling real GitHub API
 * - File system: Real operations in temp directory
 * - Git: Real git commands in temp repository (passthrough in mock)
 */

import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync as realExecSync, spawnSync as realSpawnSync } from 'child_process';
import { STORIES_FOLDER } from '../../src/types/index.js';

// Use vi.hoisted to define mocks at the hoisted level (before vi.mock runs)
const { mockExecSync, mockSpawnSync, mockSpawn, capturedGhCommand, testDirRef, implementationDone } = vi.hoisted(() => {
  // Store captured gh commands and test directory in refs that can be mutated
  const capturedGhCommand = { value: '' };
  const testDirRef = { value: '' };

  // Import real implementations at hoisted time
  const { execSync: hoistedRealExecSync, spawnSync: hoistedRealSpawnSync } = require('child_process');

  const mockExecSync = vi.fn((command: string, options?: any) => {
    const cmd = String(command);

    // Mock gh CLI version check (gh is "available")
    if (cmd.includes('gh --version')) {
      return Buffer.from('gh version 2.0.0');
    }

    // Mock gh pr view (no existing PR)
    if (cmd.includes('gh pr view')) {
      const error = new Error('no pull requests found') as any;
      error.status = 1;
      throw error;
    }

    // Capture gh pr create commands
    if (cmd.includes('gh pr create')) {
      capturedGhCommand.value = cmd;
      return 'https://github.com/test/repo/pull/123';
    }

    // Mock git push (no real remote in test repo)
    if (cmd.includes('git push')) {
      return '';
    }

    // Pass through git commands and others to real implementation
    return hoistedRealExecSync(command, options);
  });

  // Track if implementation has happened (set by mock agent during implement phase)
  const implementationDone = { value: false };

  const mockSpawnSync = vi.fn((command: string, args?: readonly string[], options?: any) => {
    // Mock git diff --name-only HEAD~1 to return source files after implementation
    // This is used by getSourceCodeChanges() in review.ts
    // Always return mock response for this command to ensure review phase sees source changes
    if (command === 'git' && args && args[0] === 'diff' && args[1] === '--name-only' && args[2] === 'HEAD~1') {
      // Return mock source code changes - the implementation mock creates these files
      // and they get committed, so we simulate what git diff would show
      return {
        status: 0,
        stdout: 'src/executor.ts\nsrc/validator.ts\n',
        stderr: '',
      };
    }
    // Pass through to real implementation for git
    return hoistedRealSpawnSync(command, args, options);
  });

  const mockSpawn = vi.fn(() => {
    const mockProcess: any = {
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn((event: string, callback: (code: number) => void) => {
        if (event === 'close') {
          // All spawned commands succeed (exit code 0)
          setTimeout(() => callback(0), 10);
        }
        return mockProcess;
      }),
      kill: vi.fn(),
    };

    // Simulate successful test output
    setTimeout(() => {
      const stdoutCallback = mockProcess.stdout.on.mock.calls.find((call: any) => call[0] === 'data')?.[1];
      if (stdoutCallback) {
        stdoutCallback(Buffer.from('All tests passed\n'));
      }
    }, 5);

    return mockProcess;
  });

  return { mockExecSync, mockSpawnSync, mockSpawn, capturedGhCommand, testDirRef, implementationDone };
});

// Mock child_process at module level BEFORE any imports that use it
vi.mock('child_process', () => ({
  execSync: mockExecSync,
  spawnSync: mockSpawnSync,
  spawn: mockSpawn,
}));

// Mock the LLM client
vi.mock('../../src/core/client.js', () => ({
  runAgentQuery: vi.fn(),
}));

// Mock ora spinner
vi.mock('ora', () => ({
  default: vi.fn(() => ({
    start: vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    fail: vi.fn().mockReturnThis(),
    stop: vi.fn().mockReturnThis(),
    text: '',
  })),
}));

// Import modules AFTER mocks are set up
import { WorkflowRunner } from '../../src/cli/runner.js';
import { parseStory } from '../../src/core/story.js';

describe.sequential('End-to-end Workflow Smoke Test', () => {
  let sdlcRoot: string;
  let storyPath: string;
  let originalCwd: string;

  // Helper to access testDir value
  const getTestDir = () => testDirRef.value;

  /**
   * Setup helpers using real execSync for git initialization
   */
  function setupGitRepo(): void {
    const testDir = getTestDir();
    // Initialize git repository using real execSync
    realExecSync('git init', { cwd: testDir, stdio: 'ignore' });
    realExecSync('git config user.name "Test User"', { cwd: testDir, stdio: 'ignore' });
    realExecSync('git config user.email "test@example.com"', { cwd: testDir, stdio: 'ignore' });
    realExecSync('git checkout -b main', { cwd: testDir, stdio: 'ignore' });
  }

  function setupProjectStructure(): void {
    const testDir = getTestDir();
    // Create .ai-sdlc folder structure
    sdlcRoot = path.join(testDir, '.ai-sdlc');
    fs.mkdirSync(sdlcRoot, { recursive: true });
    fs.mkdirSync(path.join(sdlcRoot, STORIES_FOLDER), { recursive: true });

    // Create minimal package.json
    fs.writeFileSync(
      path.join(testDir, 'package.json'),
      JSON.stringify({ name: 'test-project', version: '1.0.0' }, null, 2)
    );

    // Create .ai-sdlc.json config
    const config = {
      sdlcFolder: '.ai-sdlc',
      refinement: {
        maxIterations: 3,
        escalateOnMaxAttempts: 'manual',
        enableCircuitBreaker: true,
      },
      reviewConfig: {
        maxRetries: 3,
        maxRetriesUpperBound: 10,
        autoCompleteOnApproval: false, // Disable to allow create_pr action to run
        autoRestartOnRejection: true,
      },
      implementation: {
        maxRetries: 3,
        maxRetriesUpperBound: 10,
      },
      stageGates: {
        requireApprovalBeforeImplementation: false,
        requireApprovalBeforePR: false,
        autoMergeOnApproval: false,
      },
      defaultLabels: [],
      theme: 'auto',
      timeouts: {
        agentTimeout: 600000,
        buildTimeout: 120000,
        testTimeout: 300000,
      },
    };
    fs.writeFileSync(
      path.join(testDir, '.ai-sdlc.json'),
      JSON.stringify(config, null, 2)
    );

    // Create src directory
    fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
  }

  function setupInitialCommit(): void {
    const testDir = getTestDir();
    realExecSync('git add .', { cwd: testDir, stdio: 'ignore' });
    realExecSync('git commit -m "initial commit"', { cwd: testDir, stdio: 'ignore' });
  }

  function setupStoryFile(): void {
    // Create story folder - folder name must match story ID (S-9999), not include slug
    const storyFolder = path.join(sdlcRoot, STORIES_FOLDER, 'S-9999');
    fs.mkdirSync(storyFolder, { recursive: true });

    // Copy fixture story
    const fixtureContent = fs.readFileSync(
      path.join(originalCwd, 'tests/fixtures/test-story-e2e.md'),
      'utf-8'
    );
    storyPath = path.join(storyFolder, 'story.md');
    fs.writeFileSync(storyPath, fixtureContent);
  }

  /**
   * Mock LLM responses for each phase
   */
  async function setupAgentMocks(): Promise<void> {
    const { runAgentQuery } = await import('../../src/core/client.js');

    vi.mocked(runAgentQuery).mockImplementation(async ({ prompt }: { prompt: string }) => {
      const testDir = getTestDir();

      // IMPORTANT: Check conditions in order of specificity to avoid false matches
      // The story content accumulates sections, so later prompts contain earlier content
      // Use startsWith() to match specific prompt patterns

      // Implement phase - check FIRST because the prompt starts with "Implement"
      // and may contain research/plan content from the story
      if (prompt.startsWith('Implement this story')) {
        // Create actual files for implementation
        const executorPath = path.join(testDir, 'src', 'executor.ts');
        fs.writeFileSync(
          executorPath,
          '// E2E test implementation\nexport function execute() { return true; }\n'
        );

        const validatorPath = path.join(testDir, 'src', 'validator.ts');
        fs.writeFileSync(
          validatorPath,
          '// E2E test validation\nexport function validate() { return true; }\n'
        );

        // Track that implementation has happened (for potential future use)
        implementationDone.value = true;

        return 'Implementation complete. Created executor.ts and validator.ts modules.';
      }

      // Review phase - check early because review prompts start with "Review"
      if (prompt.startsWith('Review this story')) {
        return `APPROVED

All acceptance criteria have been met:
- Workflow phases execute correctly
- Implementation follows project patterns
- Code quality is satisfactory

No issues found.`;
      }

      // Plan phase - use startsWith to avoid matching "Implementation Plan" in story content
      if (prompt.startsWith('Please create an implementation plan')) {
        return `## Implementation Plan

### Phase 1: Core Implementation

- [ ] **T1**: Create test execution module
  - Files: src/executor.ts
  - Dependencies: none
  - Create module to execute workflow phases

### Phase 2: Validation

- [ ] **T2**: Add validation logic
  - Files: src/validator.ts
  - Dependencies: T1
  - Validate execution results
`;
      }

      // Research phase - use startsWith
      if (prompt.startsWith('Please research') || prompt.startsWith('You are performing supplementary')) {
        return `## Research

Found relevant patterns in existing test infrastructure:
- Integration tests use temp directories for isolation
- Mocking strategy follows vitest best practices
- Git operations use real commands in test repos
`;
      }

      // Refine phase - use startsWith
      if (prompt.startsWith('Please refine')) {
        return `# End-to-end test story

## User Story

**As a** developer testing the ai-sdlc workflow
**I want** to verify all phases execute correctly
**So that** I can ensure the system integrity

## Acceptance Criteria

- [ ] All workflow phases execute in sequence
- [ ] Git commits are created correctly
- [ ] Pull request is generated with correct format
- [ ] Story status transitions are accurate

## Technical Notes

This is a minimal test story for E2E workflow validation.

effort: small
labels: test, e2e
`;
      }

      // Default fallback
      return 'Mock agent response';
    });
  }

  beforeEach(async () => {
    // Save original working directory FIRST
    originalCwd = process.cwd();

    // Create temporary test directory
    testDirRef.value = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-sdlc-e2e-'));

    // Setup test environment
    setupProjectStructure();
    setupGitRepo();
    setupInitialCommit();
    setupStoryFile();

    // Setup mocks
    await setupAgentMocks();

    // Clear captured command and reset implementation flag
    capturedGhCommand.value = '';
    implementationDone.value = false;

    // Clear mock call history
    mockExecSync.mockClear();
    mockSpawnSync.mockClear();
    mockSpawn.mockClear();

    // Change to test directory
    process.chdir(getTestDir());
  });

  afterEach(() => {
    // Restore working directory
    process.chdir(originalCwd);

    // Clean up test directory
    const testDir = getTestDir();
    if (testDir && fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }

    // Clear all mocks
    vi.clearAllMocks();
  });

  it('should execute complete workflow from refine to PR creation', async () => {
    const testDir = getTestDir();
    // Create workflow runner
    const runner = new WorkflowRunner({ auto: true });

    // Execute workflow - this should run all phases automatically
    await runner.run();

    // Verify story file exists and has been updated
    expect(fs.existsSync(storyPath)).toBe(true);

    // Parse final story state
    const story = parseStory(storyPath);

    // Verify all completion flags are set
    expect(story.frontmatter.research_complete).toBe(true);
    expect(story.frontmatter.plan_complete).toBe(true);
    expect(story.frontmatter.implementation_complete).toBe(true);
    expect(story.frontmatter.reviews_complete).toBe(true);

    // Verify PR URL was set
    expect(story.frontmatter.pr_url).toBeDefined();
    expect(story.frontmatter.pr_url).toContain('github.com');

    // Verify branch was set (uses story slug, not ID)
    expect(story.frontmatter.branch).toBeDefined();
    expect(story.frontmatter.branch).toMatch(/ai-sdlc\/end-to-end-test-story/);

    // Verify story content has research section
    expect(story.content).toContain('## Research');

    // Verify story content has implementation plan
    expect(story.content).toContain('## Implementation Plan');

    // Verify git commits were created (using real execSync)
    // Commit format is: feat(slug): Title
    const gitLog = realExecSync('git log --oneline', { cwd: testDir, encoding: 'utf-8' });
    expect(gitLog).toContain('feat(end-to-end-test-story)');

    // Verify feature branch was created
    const branches = realExecSync('git branch --list', { cwd: testDir, encoding: 'utf-8' });
    expect(branches).toMatch(/ai-sdlc\/end-to-end-test-story/);

    // Verify gh pr create was called
    expect(capturedGhCommand.value).toContain('gh pr create');
    expect(capturedGhCommand.value).toContain('--title');
    expect(capturedGhCommand.value).toContain('--body');

    // Verify implementation files were created
    expect(fs.existsSync(path.join(testDir, 'src', 'executor.ts'))).toBe(true);
    expect(fs.existsSync(path.join(testDir, 'src', 'validator.ts'))).toBe(true);
  }, 30000); // 30 second timeout

  it('should handle phase transitions correctly', async () => {
    // Parse initial story state
    const story = parseStory(storyPath);
    expect(story.frontmatter.status).toBe('backlog');

    // Verify initial state - all completion flags should be false
    expect(story.frontmatter.research_complete).toBe(false);
    expect(story.frontmatter.plan_complete).toBe(false);
    expect(story.frontmatter.implementation_complete).toBe(false);
    expect(story.frontmatter.reviews_complete).toBe(false);
  });

  it('should create git commits with correct structure', async () => {
    const testDir = getTestDir();
    const runner = new WorkflowRunner({ auto: true });
    await runner.run();

    // Verify initial commit exists (using real execSync)
    const gitLog = realExecSync('git log --oneline', { cwd: testDir, encoding: 'utf-8' });
    expect(gitLog).toContain('initial commit');

    // Verify at least one implementation commit was created
    const commitCount = gitLog.split('\n').filter(line => line.trim()).length;
    expect(commitCount).toBeGreaterThan(1);
  }, 30000);
});
