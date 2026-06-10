/**
 * Self-hosted end-to-end workflow test.
 *
 * Runs ai-sdlc against a disposable repository named "ai-sdlc" and has the
 * mocked agent implement a tiny source feature in that repository. External
 * AI and GitHub boundaries are mocked; filesystem, git, build, test, story
 * transitions, implementation verification, review, and PR creation flow are
 * exercised through the real workflow runner.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { STORIES_FOLDER } from '../../src/types/index.js';

const {
  capturedGhCommand,
  mockExecSync,
  mockRunAgentQuery,
  mockSpawn,
  mockSpawnSync,
  realExecSync,
} = vi.hoisted(() => {
  const {
    execSync: hoistedRealExecSync,
    spawn: hoistedRealSpawn,
    spawnSync: hoistedRealSpawnSync,
  } = require('child_process');

  const capturedGhCommand = { value: '' };

  const mockExecSync = vi.fn((command: string, options?: any) => {
    const cmd = String(command);

    if (cmd.includes('gh --version')) {
      return Buffer.from('gh version 2.64.0');
    }

    if (cmd.includes('gh pr view')) {
      const error = new Error('no pull requests found') as any;
      error.status = 1;
      throw error;
    }

    if (cmd.includes('gh pr create')) {
      capturedGhCommand.value = cmd;
      return 'https://github.com/patrob/ai-sdlc/pull/9001';
    }

    if (cmd.includes('git push')) {
      return '';
    }

    return hoistedRealExecSync(command, options);
  });

  const mockSpawnSync = vi.fn((command: string, args?: readonly string[], options?: any) =>
    hoistedRealSpawnSync(command, args, options)
  );

  const mockSpawn = vi.fn((command: string, args?: readonly string[], options?: any) =>
    hoistedRealSpawn(command, args, options)
  );

  return {
    capturedGhCommand,
    mockExecSync,
    mockRunAgentQuery: vi.fn(),
    mockSpawn,
    mockSpawnSync,
    realExecSync: hoistedRealExecSync,
  };
});

vi.mock('child_process', () => ({
  execSync: mockExecSync,
  spawn: mockSpawn,
  spawnSync: mockSpawnSync,
}));

vi.mock('../../src/core/client.js', () => ({
  runAgentQuery: mockRunAgentQuery,
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

import { run } from '../../src/cli/commands.js';
import { initializeKanban } from '../../src/core/kanban.js';
import { parseStory } from '../../src/core/story.js';

describe.sequential('Self-hosted ai-sdlc workflow E2E', () => {
  let originalCwd: string;
  let testDir: string;
  let sdlcRoot: string;
  let storyPath: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-sdlc-self-e2e-'));
    sdlcRoot = path.join(testDir, '.ai-sdlc');

    setupDisposableAiSdlcRepo();
    setupGitRepo();
    setupStory();
    commitStoryAndCheckoutDriverBranch();
    setupAgent();

    capturedGhCommand.value = '';
    mockExecSync.mockClear();
    mockSpawnSync.mockClear();
    mockSpawn.mockClear();
    process.chdir(testDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    vi.clearAllMocks();
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('implements a feature for ai-sdlc itself from story intake through PR creation', async () => {
    const result = await run({ auto: true, story: 'S-9001' });

    expect(result.success).toBe(true);

    const story = parseStory(storyPath);
    expect(story.frontmatter.research_complete).toBe(true);
    expect(story.frontmatter.plan_complete).toBe(true);
    expect(story.frontmatter.plan_review_complete).toBe(true);
    expect(story.frontmatter.implementation_complete).toBe(true);
    expect(story.frontmatter.reviews_complete).toBe(true);
    expect(story.frontmatter.pr_url).toBe('https://github.com/patrob/ai-sdlc/pull/9001');
    expect(story.frontmatter.status).toBe('done');

    const featurePath = path.join(testDir, 'src', 'self-hosted-workflow.ts');
    const testPath = path.join(testDir, 'src', 'self-hosted-workflow.test.ts');
    expect(fs.readFileSync(featurePath, 'utf-8')).toContain('describeSelfHostedWorkflow');
    expect(fs.readFileSync(testPath, 'utf-8')).toContain('self-hosted workflow');

    const storyDir = path.dirname(storyPath);
    expect(fs.existsSync(path.join(storyDir, 'research.md'))).toBe(true);
    expect(fs.existsSync(path.join(storyDir, 'plan.md'))).toBe(true);
    expect(fs.existsSync(path.join(storyDir, 'plan_review.md'))).toBe(true);
    expect(fs.existsSync(path.join(storyDir, 'review.md'))).toBe(true);

    const gitLog = realExecSync('git log --oneline', { cwd: testDir, encoding: 'utf-8' });
    expect(gitLog).toContain('feat(self-hosted-workflow-marker)');
    expect(capturedGhCommand.value).toContain('gh pr create');
    expect(capturedGhCommand.value).toContain('Self-hosted Workflow Marker');

    const buildOutput = realExecSync('node .ai-sdlc/self-e2e-build.cjs', {
      cwd: testDir,
      encoding: 'utf-8',
    });
    const testOutput = realExecSync('node .ai-sdlc/self-e2e-test.cjs', {
      cwd: testDir,
      encoding: 'utf-8',
    });
    expect(buildOutput).toContain('self e2e build ok');
    expect(testOutput).toContain('self e2e test ok');
  }, 45000);

  function setupDisposableAiSdlcRepo(): void {
    fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
    fs.mkdirSync(path.join(testDir, 'node_modules', 'installed-marker'), { recursive: true });
    fs.mkdirSync(sdlcRoot, { recursive: true });

    fs.writeFileSync(
      path.join(testDir, 'package.json'),
      JSON.stringify({
        name: 'ai-sdlc',
        version: '0.0.0-self-e2e',
        type: 'module',
      }, null, 2)
    );

    fs.writeFileSync(
      path.join(testDir, 'README.md'),
      '# ai-sdlc\n\nDisposable self-hosted integration test repository.\n'
    );

    fs.writeFileSync(
      path.join(testDir, 'src', 'index.ts'),
      'export const projectName = "ai-sdlc";\n'
    );

    fs.writeFileSync(
      path.join(testDir, '.ai-sdlc.json'),
      JSON.stringify({
        sdlcFolder: '.ai-sdlc',
        ai: {
          provider: 'mock',
        },
        testCommand: 'node .ai-sdlc/self-e2e-test.cjs',
        buildCommand: 'node .ai-sdlc/self-e2e-build.cjs',
        reviewConfig: {
          maxRetries: 3,
          maxRetriesUpperBound: 10,
          autoCompleteOnApproval: false,
          autoRestartOnRejection: true,
        },
        stageGates: {
          requireApprovalBeforeImplementation: false,
          requireApprovalBeforePR: false,
          autoMergeOnApproval: false,
        },
        refinement: {
          maxIterations: 3,
          escalateOnMaxAttempts: 'manual',
          enableCircuitBreaker: true,
        },
        implementation: {
          maxRetries: 3,
          maxRetriesUpperBound: 10,
        },
        timeouts: {
          agentTimeout: 30000,
          buildTimeout: 30000,
          testTimeout: 30000,
        },
        tdd: {
          enabled: false,
          strictMode: true,
          maxCycles: 50,
          requireApprovalPerCycle: false,
          requirePassingTestsForComplete: true,
        },
      }, null, 2)
    );

    fs.writeFileSync(
      path.join(sdlcRoot, 'self-e2e-build.cjs'),
      verifierScript('self e2e build ok')
    );
    fs.writeFileSync(
      path.join(sdlcRoot, 'self-e2e-test.cjs'),
      verifierScript('self e2e test ok')
    );

    initializeKanban(sdlcRoot);
  }

  function setupGitRepo(): void {
    realExecSync('git init', { cwd: testDir, stdio: 'ignore' });
    realExecSync('git config user.name "Self E2E"', { cwd: testDir, stdio: 'ignore' });
    realExecSync('git config user.email "self-e2e@example.com"', { cwd: testDir, stdio: 'ignore' });
    realExecSync('git checkout -b main', { cwd: testDir, stdio: 'ignore' });
    realExecSync('git remote add origin https://github.com/patrob/ai-sdlc.git', { cwd: testDir, stdio: 'ignore' });
    realExecSync('git add .', { cwd: testDir, stdio: 'ignore' });
    realExecSync('git commit -m "initial ai-sdlc self-test fixture"', { cwd: testDir, stdio: 'ignore' });
  }

  function commitStoryAndCheckoutDriverBranch(): void {
    realExecSync('git add .', { cwd: testDir, stdio: 'ignore' });
    realExecSync('git commit -m "test: add self-hosted workflow story"', { cwd: testDir, stdio: 'ignore' });
    realExecSync('git checkout -b self-hosted-e2e-driver', { cwd: testDir, stdio: 'ignore' });
  }

  function setupStory(): void {
    const storyDir = path.join(sdlcRoot, STORIES_FOLDER, 'S-9001');
    fs.mkdirSync(storyDir, { recursive: true });
    storyPath = path.join(storyDir, 'story.md');
    fs.writeFileSync(storyPath, `---
id: S-9001
title: Self-hosted Workflow Marker
slug: self-hosted-workflow-marker
priority: 10
status: backlog
type: feature
created: '2026-05-04'
labels: []
estimated_effort: small
research_complete: false
plan_complete: false
plan_review_complete: false
implementation_complete: false
reviews_complete: false
content_type: code
requires_source_changes: true
---

# Self-hosted Workflow Marker

Add a tiny source-level feature to the ai-sdlc repository proving the workflow can implement a feature for itself.
`);
  }

  function setupAgent(): void {
    mockRunAgentQuery.mockImplementation(async ({ prompt }: { prompt: string }) => {
      if (prompt.startsWith('Please refine')) {
        return `# Self-hosted Workflow Marker

## User Story

As an ai-sdlc maintainer, I want a self-hosted workflow marker so that end-to-end workflow tests prove the tool can implement a feature in its own repository.

## Acceptance Criteria

- [ ] A source module describes the self-hosted workflow.
- [ ] A test module documents the expected behavior.
- [ ] Build and test verification pass.

effort: small
labels: self-hosted, e2e`;
      }

      if (prompt.startsWith('Please research')) {
        return `## Research

The ai-sdlc source tree stores production TypeScript under src/. A minimal additive feature can be implemented as a new module plus a colocated test file without touching unrelated workflow code.`;
      }

      if (prompt.startsWith('Please create an implementation plan')) {
        return `## Implementation Tasks

- [ ] **T1**: Add self-hosted workflow description module
  - Files: \`src/self-hosted-workflow.ts\`
  - Dependencies: none

- [ ] **T2**: Add self-hosted workflow behavior test
  - Files: \`src/self-hosted-workflow.test.ts\`
  - Dependencies: T1

- [ ] **T3**: Run build and test verification
  - Files: none
  - Dependencies: T1, T2`;
      }

      if (prompt.includes('Implementation Plan to Review')) {
        return JSON.stringify({
          perspectivesSatisfied: {
            techLead: true,
            security: true,
            productOwner: true,
          },
          suggestions: [],
        });
      }

      if (prompt.startsWith('Implement this story')) {
        fs.writeFileSync(
          path.join(testDir, 'src', 'self-hosted-workflow.ts'),
          `export interface SelfHostedWorkflowDescription {
  project: string;
  verifies: string[];
}

export function describeSelfHostedWorkflow(): SelfHostedWorkflowDescription {
  return {
    project: 'ai-sdlc',
    verifies: ['story workflow', 'implementation', 'review', 'pull request'],
  };
}
`
        );

        fs.writeFileSync(
          path.join(testDir, 'src', 'self-hosted-workflow.test.ts'),
          `import { describeSelfHostedWorkflow } from './self-hosted-workflow';

const workflow = describeSelfHostedWorkflow();

if (workflow.project !== 'ai-sdlc') {
  throw new Error('Expected self-hosted workflow to target ai-sdlc');
}

if (!workflow.verifies.includes('implementation')) {
  throw new Error('Expected self-hosted workflow to verify implementation');
}
`
        );

        return 'Implemented self-hosted workflow marker module and test.';
      }

      if (prompt.startsWith('Review this story') || prompt.includes('comprehensive collaborative review')) {
        return JSON.stringify({
          passed: true,
          issues: [],
        });
      }

      return 'Self-hosted workflow response';
    });
  }

  function verifierScript(successMessage: string): string {
    return `const fs = require('fs');
const path = require('path');

const root = process.cwd();
const feature = path.join(root, 'src', 'self-hosted-workflow.ts');
const test = path.join(root, 'src', 'self-hosted-workflow.test.ts');

if (!fs.existsSync(feature)) {
  throw new Error('Missing self-hosted workflow feature module');
}

if (!fs.existsSync(test)) {
  throw new Error('Missing self-hosted workflow test module');
}

const featureContent = fs.readFileSync(feature, 'utf8');
const testContent = fs.readFileSync(test, 'utf8');

if (!featureContent.includes('describeSelfHostedWorkflow')) {
  throw new Error('Feature module does not export describeSelfHostedWorkflow');
}

if (!testContent.includes('implementation')) {
  throw new Error('Test module does not verify implementation coverage');
}

console.log('${successMessage}');
`;
  }
});
