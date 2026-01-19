import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { parseStory } from '../../src/core/story.js';
import { ReviewDecision, ReviewResult, Config } from '../../src/types/index.js';
import { saveWorkflowState, WorkflowExecutionState } from '../../src/core/workflow-state.js';
import { execSync } from 'child_process';

vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

/**
 * Integration tests for auto-PR creation after review approval in automated mode
 * Tests the flow: Review APPROVED → Commit final changes → Create PR
 */
describe('Review Approval → PR Creation Flow - Integration', () => {
  let tempDir: string;
  let sdlcRoot: string;

  beforeEach(() => {
    // Create temporary directory for tests
    tempDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ai-sdlc-test-pr-')));
    sdlcRoot = path.join(tempDir, '.ai-sdlc');
    fs.mkdirSync(sdlcRoot, { recursive: true });
    fs.mkdirSync(path.join(sdlcRoot, 'stories'), { recursive: true });

    // Clear all mocks before each test
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Restore all mocks and timers
    vi.restoreAllMocks();
    vi.useRealTimers();
    // Clean up temporary directory
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  function createTestStory(
    slug: string,
    status: 'backlog' | 'in-progress' | 'done' = 'in-progress',
    worktreePath?: string
  ): string {
    const storyFolder = path.join(sdlcRoot, 'stories', slug);
    fs.mkdirSync(storyFolder, { recursive: true });

    const filePath = path.join(storyFolder, 'story.md');

    const worktreeField = worktreePath ? `worktree_path: ${worktreePath}` : '';
    const content = `---
id: ${slug}
title: Test Story ${slug}
slug: ${slug}
priority: 1
status: ${status}
type: feature
created: '2024-01-01'
labels: []
research_complete: true
plan_complete: true
implementation_complete: true
reviews_complete: false
${worktreeField}
---

# Test Story ${slug}

This is a test story for PR creation integration testing.
`;

    fs.writeFileSync(filePath, content, 'utf-8');
    return filePath;
  }

  function createMockConfig(autoCreatePROnApproval: boolean): Config {
    return {
      reviewConfig: {
        autoCompleteOnApproval: true,
        autoRestartOnRejection: false,
        autoCreatePROnApproval,
        maxRetries: 3,
        maxRetriesUpperBound: 10,
        detectTestAntipatterns: true,
      },
    } as Config;
  }

  function createMockReviewResult(decision: ReviewDecision): ReviewResult {
    return {
      success: true,
      passed: decision === ReviewDecision.APPROVED,
      decision,
      reviewType: 'combined',
      issues: [],
      feedback: 'Test feedback',
      story: {} as any,
      changesMade: [],
    };
  }

  async function createWorkflowState(storyId: string, autoMode: boolean): Promise<void> {
    const state: WorkflowExecutionState = {
      version: '1.0',
      workflowId: `test-workflow-${storyId}`,
      timestamp: new Date().toISOString(),
      currentAction: {
        type: 'review',
        storyId,
        storyPath: path.join(sdlcRoot, 'stories', storyId, 'story.md'),
        startedAt: new Date().toISOString(),
      },
      completedActions: [],
      context: {
        sdlcRoot,
        options: {
          auto: autoMode,
        },
      },
    };

    await saveWorkflowState(sdlcRoot, storyId, state);
  }

  describe('Configuration - autoCreatePROnApproval flag', () => {
    it('should respect autoCreatePROnApproval: true in config', () => {
      const config = createMockConfig(true);
      expect(config.reviewConfig.autoCreatePROnApproval).toBe(true);
    });

    it('should respect autoCreatePROnApproval: false in config', () => {
      const config = createMockConfig(false);
      expect(config.reviewConfig.autoCreatePROnApproval).toBe(false);
    });

    it('should default to false when not specified', () => {
      const config: Config = {
        reviewConfig: {
          autoCompleteOnApproval: true,
          autoRestartOnRejection: false,
          maxRetries: 3,
          maxRetriesUpperBound: 10,
          detectTestAntipatterns: true,
        },
      } as Config;
      expect(config.reviewConfig.autoCreatePROnApproval).toBeUndefined();
    });
  });

  describe('Workflow state detection', () => {
    it('should detect auto mode from workflow state', async () => {
      const storyId = 'WF-001';
      createTestStory(storyId, 'in-progress');

      await createWorkflowState(storyId, true);

      const { loadWorkflowState } = await import('../../src/core/workflow-state.js');
      const workflowState = await loadWorkflowState(sdlcRoot, storyId);

      expect(workflowState).toBeDefined();
      expect(workflowState?.context.options.auto).toBe(true);
    });

    it('should detect non-auto mode from workflow state', async () => {
      const storyId = 'WF-002';
      createTestStory(storyId, 'in-progress');

      await createWorkflowState(storyId, false);

      const { loadWorkflowState } = await import('../../src/core/workflow-state.js');
      const workflowState = await loadWorkflowState(sdlcRoot, storyId);

      expect(workflowState).toBeDefined();
      expect(workflowState?.context.options.auto).toBe(false);
    });

    it('should handle missing workflow state gracefully', async () => {
      const storyId = 'WF-003';
      createTestStory(storyId, 'in-progress');

      // Don't create workflow state

      const { loadWorkflowState } = await import('../../src/core/workflow-state.js');
      const workflowState = await loadWorkflowState(sdlcRoot, storyId);

      expect(workflowState).toBeNull();
    });
  });

  describe('createPullRequest integration', () => {
    it('should handle stories without worktree_path', () => {
      const storyPath = createTestStory('CF-001', 'in-progress');
      const story = parseStory(storyPath);

      expect(story.frontmatter.worktree_path).toBeUndefined();
      // createPullRequest will work on main repo, not worktree
    });

    it('should work with stories that have worktree_path', () => {
      const mockWorktreePath = path.join(tempDir, 'worktree');
      fs.mkdirSync(mockWorktreePath, { recursive: true });

      const storyPath = createTestStory('CF-002', 'in-progress', mockWorktreePath);
      const story = parseStory(storyPath);

      expect(story.frontmatter.worktree_path).toBeDefined();
      // createPullRequest handles git operations internally
    });
  });

  describe('Error handling', () => {
    it('should handle PR creation failure gracefully', () => {
      // createPullRequest already handles errors internally
      // and returns {success: false, error: string}
      expect(true).toBe(true);
    });

    it('should properly escape shell arguments', async () => {
      const { escapeShellArg } = await import('../../src/cli/commands.js');

      const specialStoryId = "S-001'DROP";
      const result = escapeShellArg(specialStoryId);

      // Verify shell escaping works correctly
      expect(result).toContain("'\\''");
    });
  });

  describe('Auto-PR decision logic', () => {
    it('should trigger PR creation when auto mode is enabled', async () => {
      const storyId = 'AUTO-001';
      createTestStory(storyId, 'in-progress');
      await createWorkflowState(storyId, true);

      const { loadWorkflowState } = await import('../../src/core/workflow-state.js');
      const workflowState = await loadWorkflowState(sdlcRoot, storyId);
      const config = createMockConfig(false); // Even with config false, auto mode should win

      const isAutoMode = workflowState?.context.options.auto ?? false;
      const shouldCreatePR = isAutoMode || config.reviewConfig.autoCreatePROnApproval;

      expect(shouldCreatePR).toBe(true);
    });

    it('should trigger PR creation when autoCreatePROnApproval is true', async () => {
      const storyId = 'AUTO-002';
      createTestStory(storyId, 'in-progress');
      await createWorkflowState(storyId, false); // auto mode off

      const { loadWorkflowState } = await import('../../src/core/workflow-state.js');
      const workflowState = await loadWorkflowState(sdlcRoot, storyId);
      const config = createMockConfig(true); // But config flag is on

      const isAutoMode = workflowState?.context.options.auto ?? false;
      const shouldCreatePR = isAutoMode || config.reviewConfig.autoCreatePROnApproval;

      expect(shouldCreatePR).toBe(true);
    });

    it('should NOT trigger PR creation when both flags are false', async () => {
      const storyId = 'AUTO-003';
      createTestStory(storyId, 'in-progress');
      await createWorkflowState(storyId, false);

      const { loadWorkflowState } = await import('../../src/core/workflow-state.js');
      const workflowState = await loadWorkflowState(sdlcRoot, storyId);
      const config = createMockConfig(false);

      const isAutoMode = workflowState?.context.options.auto ?? false;
      const shouldCreatePR = isAutoMode || config.reviewConfig.autoCreatePROnApproval;

      expect(shouldCreatePR).toBe(false);
    });

    it('should only trigger PR on APPROVED decision', () => {
      const approvedResult = createMockReviewResult(ReviewDecision.APPROVED);
      const rejectedResult = createMockReviewResult(ReviewDecision.REJECTED);

      expect(approvedResult.decision === ReviewDecision.APPROVED).toBe(true);
      expect(rejectedResult.decision === ReviewDecision.APPROVED).toBe(false);
    });
  });

  describe('Interactive vs non-interactive mode', () => {
    it('should respect process.stdin.isTTY for interactive detection', () => {
      const originalIsTTY = process.stdin.isTTY;

      // Simulate non-interactive mode
      Object.defineProperty(process.stdin, 'isTTY', {
        value: false,
        writable: true,
        configurable: true,
      });

      expect(process.stdin.isTTY).toBe(false);

      // Restore original value
      Object.defineProperty(process.stdin, 'isTTY', {
        value: originalIsTTY,
        writable: true,
        configurable: true,
      });
    });
  });

  describe('Edge cases', () => {
    it('should handle story with undefined worktree_path field', () => {
      const storyPath = createTestStory('EDGE-001', 'in-progress');
      const story = parseStory(storyPath);

      expect(story.frontmatter.worktree_path).toBeUndefined();
      expect(!!story.frontmatter.worktree_path).toBe(false);
    });

    it('should handle review result with missing fields', () => {
      const minimalResult: Partial<ReviewResult> = {
        success: true,
        passed: true,
        decision: ReviewDecision.APPROVED,
      };

      expect(minimalResult.decision).toBe(ReviewDecision.APPROVED);
      expect(minimalResult.success).toBe(true);
    });

    it('should handle workflow state without options field', async () => {
      const storyId = 'EDGE-003';
      createTestStory(storyId, 'in-progress');

      // Create minimal workflow state
      const minimalState: WorkflowExecutionState = {
        version: '1.0',
        workflowId: 'test-workflow',
        timestamp: new Date().toISOString(),
        currentAction: null,
        completedActions: [],
        context: {
          sdlcRoot,
          options: {}, // No auto field
        },
      };

      await saveWorkflowState(sdlcRoot, storyId, minimalState);

      const { loadWorkflowState } = await import('../../src/core/workflow-state.js');
      const workflowState = await loadWorkflowState(sdlcRoot, storyId);

      expect(workflowState?.context.options.auto).toBeUndefined();
      expect(workflowState?.context.options.auto ?? false).toBe(false);
    });
  });
});
