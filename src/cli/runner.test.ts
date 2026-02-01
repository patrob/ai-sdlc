import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WorkflowRunner, runWorkflow, RunOptions } from './runner.js';
import * as config from '../core/config.js';
import * as kanban from '../core/kanban.js';
import * as story from '../core/story.js';
import * as refinement from '../agents/refinement.js';
import * as research from '../agents/research.js';
import * as planning from '../agents/planning.js';
import * as implementation from '../agents/implementation.js';
import * as review from '../agents/review.js';
import * as rework from '../agents/rework.js';
import { Action, StateAssessment, ReviewDecision, Story } from '../types/index.js';

// Mock all dependencies
vi.mock('../core/config.js');
vi.mock('../core/kanban.js');
vi.mock('../core/story.js');
vi.mock('../agents/refinement.js');
vi.mock('../agents/research.js');
vi.mock('../agents/planning.js');
vi.mock('../agents/implementation.js');
vi.mock('../agents/review.js');
vi.mock('../agents/rework.js');
vi.mock('../core/theme.js', () => ({
  getThemedChalk: () => ({
    success: (s: string) => s,
    error: (s: string) => s,
    warning: (s: string) => s,
    info: (s: string) => s,
    dim: (s: string) => s,
  }),
}));
vi.mock('ora', () => ({
  default: () => ({
    start: () => ({
      succeed: vi.fn(),
      fail: vi.fn(),
    }),
  }),
}));

describe('WorkflowRunner', () => {
  const mockSdlcRoot = '/test/sdlc';
  const mockStory: Story = {
    path: '/test/sdlc/in-progress/S-001-test-story.md',
    slug: 'S-001-test-story',
    frontmatter: {
      id: 'S-001',
      title: 'Test Story',
      slug: 'test-story',
      priority: 10,
      status: 'in-progress',
      type: 'feature',
      created: '2024-01-01',
      labels: [],
      research_complete: false,
      plan_complete: false,
      implementation_complete: false,
      reviews_complete: false,
    },
    content: 'Test story content',
  };

  const mockConfig = {
    reviewConfig: {
      autoCompleteOnApproval: true,
      autoRestartOnRejection: true,
      maxRetries: 3,
    },
  };

  const mockAction: Action = {
    type: 'refine',
    storyId: 'S-001',
    storyPath: '/test/sdlc/backlog/S-001-test-story.md',
    priority: 1,
  };

  const mockAssessment: StateAssessment = {
    recommendedActions: [mockAction],
    storyCounts: { backlog: 1, ready: 0, 'in-progress': 0, blocked: 0, done: 0 },
    currentPhase: 'refinement',
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Default mocks
    vi.mocked(config.getSdlcRoot).mockReturnValue(mockSdlcRoot);
    vi.mocked(config.loadConfig).mockReturnValue(mockConfig as any);
    vi.mocked(config.isStageGateEnabled).mockReturnValue(false);
    vi.mocked(kanban.kanbanExists).mockReturnValue(true);
    vi.mocked(kanban.assessState).mockResolvedValue(mockAssessment);
    vi.mocked(story.getStory).mockReturnValue(mockStory);
    vi.mocked(story.parseStory).mockReturnValue(mockStory);
    vi.mocked(story.isAtMaxRetries).mockReturnValue(false);
    vi.mocked(story.isAtGlobalRecoveryLimit).mockReturnValue(false);
    vi.mocked(story.getTotalRecoveryAttempts).mockReturnValue(0);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('run()', () => {
    it('should warn if ai-sdlc is not initialized', async () => {
      vi.mocked(kanban.kanbanExists).mockReturnValue(false);
      const consoleSpy = vi.spyOn(console, 'log');

      const runner = new WorkflowRunner();
      await runner.run();

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('not initialized'));
    });

    it('should report when no pending actions', async () => {
      vi.mocked(kanban.assessState).mockResolvedValue({
        ...mockAssessment,
        recommendedActions: [],
      });
      const consoleSpy = vi.spyOn(console, 'log');

      const runner = new WorkflowRunner();
      await runner.run();

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('No pending actions'));
    });

    it('should show dry run output when dryRun option is set', async () => {
      const consoleSpy = vi.spyOn(console, 'log');

      const runner = new WorkflowRunner({ dryRun: true });
      await runner.run();

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Dry run'));
    });

    it('should process single action when not in auto mode', async () => {
      vi.mocked(refinement.runRefinementAgent).mockResolvedValue({
        success: true,
        story: mockStory,
        changesMade: ['Refined story'],
      });

      const runner = new WorkflowRunner();
      await runner.run();

      expect(refinement.runRefinementAgent).toHaveBeenCalledTimes(1);
    });
  });

  describe('executeAction()', () => {
    it('should execute refine action', async () => {
      vi.mocked(refinement.runRefinementAgent).mockResolvedValue({
        success: true,
        story: mockStory,
        changesMade: ['Refined story'],
      });

      const action: Action = { ...mockAction, type: 'refine' };
      vi.mocked(kanban.assessState).mockResolvedValue({
        ...mockAssessment,
        recommendedActions: [action],
      });

      const runner = new WorkflowRunner();
      await runner.run();

      expect(refinement.runRefinementAgent).toHaveBeenCalled();
    });

    it('should execute research action', async () => {
      vi.mocked(research.runResearchAgent).mockResolvedValue({
        success: true,
        story: mockStory,
        changesMade: ['Research complete'],
      });

      const action: Action = { ...mockAction, type: 'research' };
      vi.mocked(kanban.assessState).mockResolvedValue({
        ...mockAssessment,
        recommendedActions: [action],
      });

      const runner = new WorkflowRunner();
      await runner.run();

      expect(research.runResearchAgent).toHaveBeenCalled();
    });

    it('should execute plan action', async () => {
      vi.mocked(planning.runPlanningAgent).mockResolvedValue({
        success: true,
        story: mockStory,
        changesMade: ['Plan complete'],
      });

      const action: Action = { ...mockAction, type: 'plan' };
      vi.mocked(kanban.assessState).mockResolvedValue({
        ...mockAssessment,
        recommendedActions: [action],
      });

      const runner = new WorkflowRunner();
      await runner.run();

      expect(planning.runPlanningAgent).toHaveBeenCalled();
    });

    it('should execute implement action', async () => {
      vi.mocked(implementation.runImplementationAgent).mockResolvedValue({
        success: true,
        story: mockStory,
        changesMade: ['Implementation complete'],
      });

      const action: Action = { ...mockAction, type: 'implement' };
      vi.mocked(kanban.assessState).mockResolvedValue({
        ...mockAssessment,
        recommendedActions: [action],
      });

      const runner = new WorkflowRunner();
      await runner.run();

      expect(implementation.runImplementationAgent).toHaveBeenCalled();
    });

    it('should execute review action and handle decision', async () => {
      vi.mocked(review.runReviewAgent).mockResolvedValue({
        success: true,
        story: mockStory,
        changesMade: ['Review complete'],
        decision: ReviewDecision.APPROVED,
        issues: [],
      });
      vi.mocked(story.autoCompleteStoryAfterReview).mockResolvedValue(mockStory);

      const action: Action = { ...mockAction, type: 'review' };
      vi.mocked(kanban.assessState).mockResolvedValue({
        ...mockAssessment,
        recommendedActions: [action],
      });

      const runner = new WorkflowRunner();
      await runner.run();

      expect(review.runReviewAgent).toHaveBeenCalled();
      expect(story.autoCompleteStoryAfterReview).toHaveBeenCalled();
    });

    it('should execute create_pr action', async () => {
      vi.mocked(review.createPullRequest).mockResolvedValue({
        success: true,
        story: mockStory,
        changesMade: ['PR created'],
      });

      const action: Action = { ...mockAction, type: 'create_pr' };
      vi.mocked(kanban.assessState).mockResolvedValue({
        ...mockAssessment,
        recommendedActions: [action],
      });

      const runner = new WorkflowRunner();
      await runner.run();

      expect(review.createPullRequest).toHaveBeenCalled();
    });

    it('should handle action failure gracefully', async () => {
      vi.mocked(refinement.runRefinementAgent).mockResolvedValue({
        success: false,
        story: mockStory,
        changesMade: [],
        error: 'Agent failed',
      });

      const runner = new WorkflowRunner();
      await runner.run();

      // Should not throw
      expect(refinement.runRefinementAgent).toHaveBeenCalled();
    });

    it('should handle story not found error', async () => {
      vi.mocked(story.getStory).mockImplementation(() => {
        throw new Error('Story not found');
      });
      const consoleSpy = vi.spyOn(console, 'log');

      const runner = new WorkflowRunner();
      await runner.run();

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Cannot execute action'));
    });

    it('should block story when at global recovery limit', async () => {
      vi.mocked(story.isAtGlobalRecoveryLimit).mockReturnValue(true);
      vi.mocked(story.getTotalRecoveryAttempts).mockReturnValue(10);
      vi.mocked(story.moveToBlocked).mockResolvedValue(undefined);
      const consoleSpy = vi.spyOn(console, 'log');

      const runner = new WorkflowRunner();
      await runner.run();

      expect(story.moveToBlocked).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Global recovery limit'));
    });
  });

  describe('handleReviewDecision()', () => {
    beforeEach(() => {
      vi.mocked(review.generateReviewSummary).mockReturnValue('Summary');
    });

    it('should auto-complete story on approval when enabled', async () => {
      vi.mocked(review.runReviewAgent).mockResolvedValue({
        success: true,
        story: mockStory,
        changesMade: ['Review complete'],
        decision: ReviewDecision.APPROVED,
        issues: [],
      });
      vi.mocked(story.autoCompleteStoryAfterReview).mockResolvedValue(mockStory);

      const action: Action = { ...mockAction, type: 'review' };
      vi.mocked(kanban.assessState).mockResolvedValue({
        ...mockAssessment,
        recommendedActions: [action],
      });

      const runner = new WorkflowRunner();
      await runner.run();

      expect(story.autoCompleteStoryAfterReview).toHaveBeenCalled();
    });

    it('should not auto-complete when autoCompleteOnApproval is disabled', async () => {
      vi.mocked(config.loadConfig).mockReturnValue({
        ...mockConfig,
        reviewConfig: { ...mockConfig.reviewConfig, autoCompleteOnApproval: false },
      } as any);
      vi.mocked(review.runReviewAgent).mockResolvedValue({
        success: true,
        story: mockStory,
        changesMade: ['Review complete'],
        decision: ReviewDecision.APPROVED,
        issues: [],
      });

      const action: Action = { ...mockAction, type: 'review' };
      vi.mocked(kanban.assessState).mockResolvedValue({
        ...mockAssessment,
        recommendedActions: [action],
      });

      const runner = new WorkflowRunner();
      await runner.run();

      expect(story.autoCompleteStoryAfterReview).not.toHaveBeenCalled();
    });

    it('should reset RPIV cycle on rejection when enabled', async () => {
      vi.mocked(review.runReviewAgent).mockResolvedValue({
        success: true,
        story: mockStory,
        changesMade: ['Review complete'],
        decision: ReviewDecision.REJECTED,
        issues: [{ type: 'error', message: 'Test failure', severity: 'high' }],
        feedback: 'Tests are failing',
      });
      vi.mocked(story.resetRPIVCycle).mockResolvedValue(undefined);
      vi.mocked(story.incrementTotalRecoveryAttempts).mockResolvedValue(undefined);

      const action: Action = { ...mockAction, type: 'review' };
      vi.mocked(kanban.assessState).mockResolvedValue({
        ...mockAssessment,
        recommendedActions: [action],
      });

      const runner = new WorkflowRunner();
      await runner.run();

      expect(story.resetRPIVCycle).toHaveBeenCalled();
      expect(story.incrementTotalRecoveryAttempts).toHaveBeenCalled();
    });

    it('should not reset RPIV if at max retries', async () => {
      vi.mocked(story.isAtMaxRetries).mockReturnValue(true);
      vi.mocked(review.runReviewAgent).mockResolvedValue({
        success: true,
        story: { ...mockStory, frontmatter: { ...mockStory.frontmatter, retry_count: 3 } },
        changesMade: ['Review complete'],
        decision: ReviewDecision.REJECTED,
        issues: [],
      });

      const action: Action = { ...mockAction, type: 'review' };
      vi.mocked(kanban.assessState).mockResolvedValue({
        ...mockAssessment,
        recommendedActions: [action],
      });

      const consoleSpy = vi.spyOn(console, 'log');
      const runner = new WorkflowRunner();
      await runner.run();

      expect(story.resetRPIVCycle).not.toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('max retries'));
    });

    it('should handle RECOVERY decision by incrementing implementation retry', async () => {
      vi.mocked(review.runReviewAgent).mockResolvedValue({
        success: true,
        story: mockStory,
        changesMade: [],
        decision: ReviewDecision.RECOVERY,
        issues: [],
      });
      vi.mocked(story.incrementImplementationRetryCount).mockResolvedValue(undefined);
      vi.mocked(story.incrementTotalRecoveryAttempts).mockResolvedValue(undefined);

      const action: Action = { ...mockAction, type: 'review' };
      vi.mocked(kanban.assessState).mockResolvedValue({
        ...mockAssessment,
        recommendedActions: [action],
      });

      const runner = new WorkflowRunner();
      await runner.run();

      expect(story.incrementImplementationRetryCount).toHaveBeenCalled();
      expect(story.incrementTotalRecoveryAttempts).toHaveBeenCalled();
    });

    it('should handle FAILED decision without incrementing retry count', async () => {
      vi.mocked(review.runReviewAgent).mockResolvedValue({
        success: true,
        story: mockStory,
        changesMade: [],
        decision: ReviewDecision.FAILED,
        issues: [],
        error: 'Review process error',
      });

      const action: Action = { ...mockAction, type: 'review' };
      vi.mocked(kanban.assessState).mockResolvedValue({
        ...mockAssessment,
        recommendedActions: [action],
      });

      const consoleSpy = vi.spyOn(console, 'log');
      const runner = new WorkflowRunner();
      await runner.run();

      expect(story.resetRPIVCycle).not.toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Review process failed'));
    });
  });

  describe('runAutoMode()', () => {
    it('should process multiple actions in auto mode', async () => {
      const refineAction: Action = { ...mockAction, type: 'refine' };
      const researchAction: Action = { ...mockAction, type: 'research' };

      let callCount = 0;
      vi.mocked(kanban.assessState).mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return { ...mockAssessment, recommendedActions: [refineAction] };
        } else if (callCount === 2) {
          return { ...mockAssessment, recommendedActions: [researchAction] };
        }
        return { ...mockAssessment, recommendedActions: [] };
      });

      vi.mocked(refinement.runRefinementAgent).mockResolvedValue({
        success: true,
        story: mockStory,
        changesMade: ['Refined'],
      });
      vi.mocked(research.runResearchAgent).mockResolvedValue({
        success: true,
        story: mockStory,
        changesMade: ['Researched'],
      });

      const runner = new WorkflowRunner({ auto: true });
      await runner.run();

      expect(refinement.runRefinementAgent).toHaveBeenCalledTimes(1);
      expect(research.runResearchAgent).toHaveBeenCalledTimes(1);
    });

    it('should stop at stage gate in auto mode', async () => {
      vi.mocked(config.isStageGateEnabled).mockImplementation((gate) => {
        return gate === 'requireApprovalBeforeImplementation';
      });

      const implementAction: Action = { ...mockAction, type: 'implement' };
      vi.mocked(kanban.assessState).mockResolvedValue({
        ...mockAssessment,
        recommendedActions: [implementAction],
      });

      const consoleSpy = vi.spyOn(console, 'log');
      const runner = new WorkflowRunner({ auto: true });
      await runner.run();

      expect(implementation.runImplementationAgent).not.toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Stage gate'));
    });

    it('should stop at PR stage gate in auto mode', async () => {
      vi.mocked(config.isStageGateEnabled).mockImplementation((gate) => {
        return gate === 'requireApprovalBeforePR';
      });

      const prAction: Action = { ...mockAction, type: 'create_pr' };
      vi.mocked(kanban.assessState).mockResolvedValue({
        ...mockAssessment,
        recommendedActions: [prAction],
      });

      const consoleSpy = vi.spyOn(console, 'log');
      const runner = new WorkflowRunner({ auto: true });
      await runner.run();

      expect(review.createPullRequest).not.toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Stage gate'));
    });

    it('should respect maximum actions limit', async () => {
      // Always return an action to simulate infinite loop
      vi.mocked(kanban.assessState).mockResolvedValue(mockAssessment);
      vi.mocked(refinement.runRefinementAgent).mockResolvedValue({
        success: true,
        story: mockStory,
        changesMade: ['Refined'],
      });

      const consoleSpy = vi.spyOn(console, 'log');
      const runner = new WorkflowRunner({ auto: true });
      await runner.run();

      // Should have called agent 100 times (maxActions limit)
      expect(refinement.runRefinementAgent).toHaveBeenCalledTimes(100);
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('maximum actions limit'));
    });
  });

  describe('rework action', () => {
    it('should execute rework and trigger target phase agent', async () => {
      const reworkAction: Action = {
        ...mockAction,
        type: 'rework',
        context: {
          targetPhase: 'research',
          reviewFeedback: 'Need more research',
        },
      };

      vi.mocked(kanban.assessState).mockResolvedValue({
        ...mockAssessment,
        recommendedActions: [reworkAction],
      });
      vi.mocked(rework.runReworkAgent).mockResolvedValue({
        success: true,
        story: mockStory,
        changesMade: ['Rework setup complete'],
      });
      vi.mocked(rework.packageReworkContext).mockReturnValue({
        originalFeedback: 'Need more research',
        suggestions: [],
      });
      vi.mocked(research.runResearchAgent).mockResolvedValue({
        success: true,
        story: mockStory,
        changesMade: ['Research re-run'],
      });

      const runner = new WorkflowRunner();
      await runner.run();

      expect(rework.runReworkAgent).toHaveBeenCalled();
      expect(research.runResearchAgent).toHaveBeenCalled();
    });

    it('should trigger planning agent for plan target phase', async () => {
      const reworkAction: Action = {
        ...mockAction,
        type: 'rework',
        context: {
          targetPhase: 'plan',
          reviewFeedback: 'Need better plan',
        },
      };

      vi.mocked(kanban.assessState).mockResolvedValue({
        ...mockAssessment,
        recommendedActions: [reworkAction],
      });
      vi.mocked(rework.runReworkAgent).mockResolvedValue({
        success: true,
        story: mockStory,
        changesMade: [],
      });
      vi.mocked(rework.packageReworkContext).mockReturnValue({
        originalFeedback: 'Need better plan',
        suggestions: [],
      });
      vi.mocked(planning.runPlanningAgent).mockResolvedValue({
        success: true,
        story: mockStory,
        changesMade: [],
      });

      const runner = new WorkflowRunner();
      await runner.run();

      expect(planning.runPlanningAgent).toHaveBeenCalled();
    });

    it('should trigger implementation agent for implement target phase', async () => {
      const reworkAction: Action = {
        ...mockAction,
        type: 'rework',
        context: {
          targetPhase: 'implement',
          reviewFeedback: 'Fix implementation',
        },
      };

      vi.mocked(kanban.assessState).mockResolvedValue({
        ...mockAssessment,
        recommendedActions: [reworkAction],
      });
      vi.mocked(rework.runReworkAgent).mockResolvedValue({
        success: true,
        story: mockStory,
        changesMade: [],
      });
      vi.mocked(rework.packageReworkContext).mockReturnValue({
        originalFeedback: 'Fix implementation',
        suggestions: [],
      });
      vi.mocked(implementation.runImplementationAgent).mockResolvedValue({
        success: true,
        story: mockStory,
        changesMade: [],
      });

      const runner = new WorkflowRunner();
      await runner.run();

      expect(implementation.runImplementationAgent).toHaveBeenCalled();
    });

    it('should throw error if rework context is missing', async () => {
      const reworkAction: Action = {
        ...mockAction,
        type: 'rework',
        // No context
      };

      vi.mocked(kanban.assessState).mockResolvedValue({
        ...mockAssessment,
        recommendedActions: [reworkAction],
      });

      const consoleSpy = vi.spyOn(console, 'error');
      const runner = new WorkflowRunner();
      await runner.run();

      expect(consoleSpy).toHaveBeenCalled();
    });
  });

  describe('verbose output', () => {
    it('should show changes when verbose option is set', async () => {
      vi.mocked(refinement.runRefinementAgent).mockResolvedValue({
        success: true,
        story: mockStory,
        changesMade: ['Change 1', 'Change 2'],
      });

      const consoleSpy = vi.spyOn(console, 'log');
      const runner = new WorkflowRunner({ verbose: true });
      await runner.run();

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Change 1'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Change 2'));
    });
  });
});

describe('runWorkflow', () => {
  beforeEach(() => {
    vi.mocked(config.getSdlcRoot).mockReturnValue('/test/sdlc');
    vi.mocked(config.loadConfig).mockReturnValue({ reviewConfig: {} } as any);
    vi.mocked(kanban.kanbanExists).mockReturnValue(true);
    vi.mocked(kanban.assessState).mockResolvedValue({
      recommendedActions: [],
      storyCounts: { backlog: 0, ready: 0, 'in-progress': 0, blocked: 0, done: 0 },
      currentPhase: 'idle',
    });
  });

  it('should create WorkflowRunner and run', async () => {
    const consoleSpy = vi.spyOn(console, 'log');
    await runWorkflow();

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('No pending actions'));
  });

  it('should pass options to WorkflowRunner', async () => {
    const options: RunOptions = { auto: true, verbose: true };
    await runWorkflow(options);

    // Should not throw
    expect(config.getSdlcRoot).toHaveBeenCalled();
  });
});
