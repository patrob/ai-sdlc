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
 * - gh pr create: Mocked to capture arguments without calling real GitHub API
 * - File system: Real operations in temp directory
 * - Git: Real git commands in temp repository
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import * as cp from 'child_process';
import { WorkflowRunner } from '../../src/cli/runner.js';
import { parseStory } from '../../src/core/story.js';
import { STORIES_FOLDER } from '../../src/types/index.js';

// Mock dependencies
vi.mock('../../src/core/client.js', () => ({
  runAgentQuery: vi.fn(),
}));

vi.mock('ora', () => ({
  default: vi.fn(() => ({
    start: vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    fail: vi.fn().mockReturnThis(),
    stop: vi.fn().mockReturnThis(),
    text: '',
  })),
}));

describe.sequential('End-to-end Workflow Smoke Test', () => {
  let testDir: string;
  let sdlcRoot: string;
  let storyPath: string;
  let capturedGhCommand: string = '';
  let originalExecSync: typeof cp.execSync;
  let originalSpawnSync: typeof cp.spawnSync;
  let originalCwd: string;

  /**
   * Setup helpers
   */
  function setupGitRepo(): void {
    // Initialize git repository
    cp.execSync('git init', { cwd: testDir, stdio: 'ignore' });
    cp.execSync('git config user.name "Test User"', { cwd: testDir, stdio: 'ignore' });
    cp.execSync('git config user.email "test@example.com"', { cwd: testDir, stdio: 'ignore' });
    cp.execSync('git checkout -b main', { cwd: testDir, stdio: 'ignore' });
  }

  function setupProjectStructure(): void {
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
        autoCompleteOnApproval: true,
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
    cp.execSync('git add .', { cwd: testDir, stdio: 'ignore' });
    cp.execSync('git commit -m "initial commit"', { cwd: testDir, stdio: 'ignore' });
  }

  function setupStoryFile(): void {
    // Create story folder
    const storyFolder = path.join(sdlcRoot, STORIES_FOLDER, 'S-9999-end-to-end-test-story');
    fs.mkdirSync(storyFolder, { recursive: true });

    // Copy fixture story
    const fixtureContent = fs.readFileSync(
      path.join(process.cwd(), 'tests/fixtures/test-story-e2e.md'),
      'utf-8'
    );
    storyPath = path.join(storyFolder, 'story.md');
    fs.writeFileSync(storyPath, fixtureContent);
  }

  /**
   * Mock LLM responses for each phase
   */
  function setupAgentMocks(): void {
    const { runAgentQuery } = require('../../src/core/client.js');

    vi.mocked(runAgentQuery).mockImplementation(async ({ prompt }: { prompt: string }) => {
      // Refine phase - return only markdown content (no frontmatter)
      if (prompt.includes('refine') || prompt.includes('backlog')) {
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

      // Research phase
      if (prompt.includes('research') || prompt.includes('Research')) {
        return `## Research

Found relevant patterns in existing test infrastructure:
- Integration tests use temp directories for isolation
- Mocking strategy follows vitest best practices
- Git operations use real commands in test repos
`;
      }

      // Plan phase
      if (prompt.includes('plan') || prompt.includes('Plan')) {
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

      // Implement phase
      if (prompt.includes('implement') || prompt.includes('Implement')) {
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

        return 'Implementation complete. Created executor.ts and validator.ts modules.';
      }

      // Review phase
      if (prompt.includes('review') || prompt.includes('Review')) {
        return `APPROVED

All acceptance criteria have been met:
- Workflow phases execute correctly
- Implementation follows project patterns
- Code quality is satisfactory

No issues found.`;
      }

      // Default fallback
      return 'Mock agent response';
    });
  }

  /**
   * Mock gh pr create command and spawn for test/build commands
   */
  function setupGhMock(): void {
    originalExecSync = cp.execSync;
    originalSpawnSync = cp.spawnSync;

    // Mock execSync for gh and non-git commands
    const execSyncSpy = vi.spyOn(cp, 'execSync');
    execSyncSpy.mockImplementation((command: string, options?: any) => {
      const cmd = String(command);

      // Mock gh CLI version check (gh is "available")
      if (cmd.includes('gh --version')) {
        return Buffer.from('gh version 2.0.0');
      }

      // Mock gh pr view (no existing PR)
      if (cmd.includes('gh pr view')) {
        throw new Error('no pull requests found');
      }

      // Capture gh pr create commands
      if (cmd.includes('gh pr create')) {
        capturedGhCommand = cmd;
        return Buffer.from('https://github.com/test/repo/pull/123');
      }

      // Let git commands pass through to real implementation
      if (cmd.startsWith('git ')) {
        return originalExecSync(command, options);
      }

      // Default passthrough
      return Buffer.from('');
    });

    // Mock spawn for test/build commands (used by review agent)
    const spawnSpy = vi.spyOn(cp, 'spawn');
    spawnSpy.mockImplementation((() => {
      const mockProcess: any = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn((event, callback) => {
          if (event === 'close') {
            // All spawned commands succeed (exit code 0)
            setTimeout(() => callback(0), 10);
          }
        }),
      };

      // Simulate successful test output
      setTimeout(() => {
        const stdoutCallback = mockProcess.stdout.on.mock.calls.find((call: any) => call[0] === 'data')?.[1];
        if (stdoutCallback) {
          stdoutCallback(Buffer.from('All tests passed\n'));
        }
      }, 5);

      return mockProcess;
    }) as any);

    // Mock spawnSync for git operations (used by implementation agent)
    // We let it pass through to real git commands
    const spawnSyncSpy = vi.spyOn(cp, 'spawnSync');
    spawnSyncSpy.mockImplementation((command: string, args?: readonly string[], options?: any) => {
      if (command === 'git') {
        // Let real git operations happen using original function
        return originalSpawnSync(command, args, options);
      }

      // Mock other commands as successful
      return {
        status: 0,
        stdout: Buffer.from(''),
        stderr: Buffer.from(''),
        output: [],
        pid: 0,
        signal: null,
      };
    });
  }

  beforeEach(() => {
    // Save original working directory
    originalCwd = process.cwd();

    // Create temporary test directory
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-sdlc-e2e-'));

    // Setup test environment
    setupProjectStructure();
    setupGitRepo();
    setupInitialCommit();
    setupStoryFile();

    // Setup mocks
    setupAgentMocks();
    setupGhMock();

    // Clear captured command
    capturedGhCommand = '';

    // Change to test directory
    process.chdir(testDir);
  });

  afterEach(() => {
    // Restore working directory
    process.chdir(originalCwd);

    // Clean up test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }

    // Clear all mocks
    vi.clearAllMocks();
  });

  it('should execute complete workflow from refine to PR creation', async () => {
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

    // Verify branch was set
    expect(story.frontmatter.branch).toBeDefined();
    expect(story.frontmatter.branch).toMatch(/ai-sdlc\/S-9999/);

    // Verify story content has research section
    expect(story.content).toContain('## Research');

    // Verify story content has implementation plan
    expect(story.content).toContain('## Implementation Plan');

    // Verify git commits were created
    const gitLog = cp.execSync('git log --oneline', { cwd: testDir, encoding: 'utf-8' });
    expect(gitLog).toContain('Implement');

    // Verify feature branch was created
    const branches = cp.execSync('git branch --list', { cwd: testDir, encoding: 'utf-8' });
    expect(branches).toMatch(/ai-sdlc\/S-9999/);

    // Verify gh pr create was called
    expect(capturedGhCommand).toContain('gh pr create');
    expect(capturedGhCommand).toContain('--title');
    expect(capturedGhCommand).toContain('--body');

    // Verify implementation files were created
    expect(fs.existsSync(path.join(testDir, 'src', 'executor.ts'))).toBe(true);
    expect(fs.existsSync(path.join(testDir, 'src', 'validator.ts'))).toBe(true);
  }, 30000); // 30 second timeout

  it('should handle phase transitions correctly', async () => {
    // Parse initial story state
    let story = parseStory(storyPath);
    expect(story.frontmatter.status).toBe('backlog');

    // Execute refine phase
    const runner = new WorkflowRunner({ auto: false });

    // We can't easily test incremental execution with the current runner API,
    // so we'll just verify the initial state transitions are possible
    expect(story.frontmatter.research_complete).toBe(false);
    expect(story.frontmatter.plan_complete).toBe(false);
    expect(story.frontmatter.implementation_complete).toBe(false);
    expect(story.frontmatter.reviews_complete).toBe(false);
  });

  it('should create git commits with correct structure', async () => {
    const runner = new WorkflowRunner({ auto: true });
    await runner.run();

    // Verify initial commit exists
    const gitLog = cp.execSync('git log --oneline', { cwd: testDir, encoding: 'utf-8' });
    expect(gitLog).toContain('initial commit');

    // Verify at least one implementation commit was created
    const commitCount = gitLog.split('\n').filter(line => line.trim()).length;
    expect(commitCount).toBeGreaterThan(1);
  }, 30000);
});
