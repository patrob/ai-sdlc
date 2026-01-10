import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { createStory, moveStory, appendReviewHistory, parseStory, writeStory } from '../../src/core/story.js';
import { assessState } from '../../src/core/kanban.js';
import { runReworkAgent } from '../../src/agents/rework.js';
import { ReviewDecision, ReviewSeverity, ReviewResult } from '../../src/types/index.js';

describe('Refinement Loop Integration', () => {
  let testDir: string;
  let sdlcRoot: string;

  beforeEach(() => {
    // Create temporary test directory
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentic-sdlc-test-'));
    sdlcRoot = path.join(testDir, '.agentic-sdlc');

    // Create SDLC folder structure
    fs.mkdirSync(sdlcRoot, { recursive: true });
    fs.mkdirSync(path.join(sdlcRoot, 'backlog'));
    fs.mkdirSync(path.join(sdlcRoot, 'ready'));
    fs.mkdirSync(path.join(sdlcRoot, 'in-progress'));
    fs.mkdirSync(path.join(sdlcRoot, 'done'));

    // Create default config
    const config = {
      sdlcFolder: '.agentic-sdlc',
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
      stageGates: {
        requireApprovalBeforeImplementation: false,
        requireApprovalBeforePR: false,
        autoMergeOnApproval: false,
      },
      defaultLabels: [],
      theme: 'auto',
    };
    fs.writeFileSync(
      path.join(testDir, '.agentic-sdlc.json'),
      JSON.stringify(config, null, 2)
    );
  });

  afterEach(() => {
    // Clean up test directory
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('should complete full refinement loop: fail → rework → implement → pass', async () => {
    // Step 1: Create story and move to in-progress
    let story = createStory('Test Feature', sdlcRoot, {
      type: 'feature',
      labels: ['test'],
    });
    story = moveStory(story, 'in-progress', sdlcRoot);
    story.frontmatter.implementation_complete = true;

    // Step 2: Add failed review
    appendReviewHistory(story, {
      timestamp: new Date().toISOString(),
      decision: ReviewDecision.REJECTED,
      severity: ReviewSeverity.HIGH,
      feedback: 'Missing error handling and input validation',
      blockers: ['No error handling', 'No input validation'],
      codeReviewPassed: false,
      securityReviewPassed: false,
      poReviewPassed: true,
    });

    // Step 3: Assess state - should generate rework action
    let assessment = assessState(sdlcRoot);
    let reworkAction = assessment.recommendedActions.find(a => a.type === 'rework');
    expect(reworkAction).toBeDefined();
    expect(reworkAction!.context.iteration).toBe(1);
    expect(reworkAction!.context.targetPhase).toBe('implement');

    // Step 4: Execute rework agent
    const mockReviewResult: ReviewResult = {
      success: true,
      passed: false,
      decision: ReviewDecision.REJECTED,
      severity: ReviewSeverity.HIGH,
      reviewType: 'combined',
      issues: [
        {
          severity: 'blocker',
          category: 'security',
          description: 'No input validation',
        },
        {
          severity: 'critical',
          category: 'code_quality',
          description: 'No error handling',
        },
      ],
      feedback: 'Missing error handling and input validation',
      story,
      changesMade: [],
    };

    const reworkResult = await runReworkAgent(story.path, sdlcRoot, {
      reviewFeedback: mockReviewResult,
      targetPhase: 'implement',
      iteration: 1,
    });

    expect(reworkResult.success).toBe(true);

    // Step 5: Verify story state after rework
    story = parseStory(story.path);
    expect(story.frontmatter.refinement_count).toBe(1);
    expect(story.frontmatter.implementation_complete).toBe(false); // Reset for rework
    expect(story.content).toContain('Refinement Iteration 1');

    // Step 6: Simulate implementation complete again
    story.frontmatter.implementation_complete = true;

    // Step 7: Add passing review
    appendReviewHistory(story, {
      timestamp: new Date().toISOString(),
      decision: ReviewDecision.APPROVED,
      feedback: 'All issues resolved',
      blockers: [],
      codeReviewPassed: true,
      securityReviewPassed: true,
      poReviewPassed: true,
    });

    // Mark reviews complete after approval
    story.frontmatter.reviews_complete = true;
    writeStory(story);

    // Step 8: Assess state - should generate create_pr action, not rework
    assessment = assessState(sdlcRoot);
    reworkAction = assessment.recommendedActions.find(a => a.type === 'rework');
    const prAction = assessment.recommendedActions.find(a => a.type === 'create_pr');

    expect(reworkAction).toBeUndefined();
    expect(prAction).toBeDefined();
  });

  it('should escalate after multiple failed refinement iterations', async () => {
    // Create story and move to in-progress
    let story = createStory('Difficult Feature', sdlcRoot);
    story = moveStory(story, 'in-progress', sdlcRoot);
    story.frontmatter.implementation_complete = true;

    // Iteration 1: First failure
    appendReviewHistory(story, {
      timestamp: new Date().toISOString(),
      decision: ReviewDecision.REJECTED,
      severity: ReviewSeverity.HIGH,
      feedback: 'Security issues',
      blockers: ['SQL injection'],
      codeReviewPassed: false,
      securityReviewPassed: false,
      poReviewPassed: true,
    });

    let assessment = assessState(sdlcRoot);
    let reworkAction = assessment.recommendedActions.find(a => a.type === 'rework');
    expect(reworkAction).toBeDefined();

    // Execute rework iteration 1
    await runReworkAgent(story.path, sdlcRoot, {
      reviewFeedback: {
        issues: [{ severity: 'blocker', category: 'security', description: 'SQL injection' }],
      } as any,
      targetPhase: 'implement',
      iteration: 1,
    });

    story = parseStory(story.path);
    story.frontmatter.implementation_complete = true;

    // Iteration 2: Second failure
    appendReviewHistory(story, {
      timestamp: new Date().toISOString(),
      decision: ReviewDecision.REJECTED,
      severity: ReviewSeverity.CRITICAL,
      feedback: 'Still vulnerable',
      blockers: ['SQL injection still present'],
      codeReviewPassed: false,
      securityReviewPassed: false,
      poReviewPassed: true,
    });

    assessment = assessState(sdlcRoot);
    reworkAction = assessment.recommendedActions.find(a => a.type === 'rework');
    expect(reworkAction).toBeDefined();
    expect(reworkAction!.context.iteration).toBe(2);

    // Execute rework iteration 2
    await runReworkAgent(story.path, sdlcRoot, {
      reviewFeedback: {
        issues: [{ severity: 'blocker', category: 'security', description: 'Still vulnerable' }],
      } as any,
      targetPhase: 'implement',
      iteration: 2,
    });

    story = parseStory(story.path);
    story.frontmatter.implementation_complete = true;

    // Iteration 3: Third failure
    appendReviewHistory(story, {
      timestamp: new Date().toISOString(),
      decision: ReviewDecision.REJECTED,
      severity: ReviewSeverity.CRITICAL,
      feedback: 'Issue persists',
      blockers: ['Same SQL injection'],
      codeReviewPassed: false,
      securityReviewPassed: false,
      poReviewPassed: true,
    });

    assessment = assessState(sdlcRoot);
    reworkAction = assessment.recommendedActions.find(a => a.type === 'rework');
    expect(reworkAction).toBeDefined();
    expect(reworkAction!.context.iteration).toBe(3);

    // Execute rework iteration 3
    await runReworkAgent(story.path, sdlcRoot, {
      reviewFeedback: {
        issues: [{ severity: 'blocker', category: 'security', description: 'Same issue' }],
      } as any,
      targetPhase: 'implement',
      iteration: 3,
    });

    story = parseStory(story.path);
    story.frontmatter.implementation_complete = true;

    // Fourth failure: Should trigger circuit breaker
    appendReviewHistory(story, {
      timestamp: new Date().toISOString(),
      decision: ReviewDecision.REJECTED,
      severity: ReviewSeverity.CRITICAL,
      feedback: 'Cannot fix',
      blockers: ['Unfixable'],
      codeReviewPassed: false,
      securityReviewPassed: false,
      poReviewPassed: false,
    });

    assessment = assessState(sdlcRoot);
    reworkAction = assessment.recommendedActions.find(a => a.type === 'rework');
    const escalationAction = assessment.recommendedActions.find(
      a => a.context?.blockedByMaxRefinements === true
    );

    expect(reworkAction).toBeUndefined(); // No more rework
    expect(escalationAction).toBeDefined(); // Escalated for manual intervention
    expect(escalationAction!.reason).toContain('max refinement attempts');
  });

  it('should track refinement history across multiple iterations', async () => {
    let story = createStory('Test Story', sdlcRoot);
    story = moveStory(story, 'in-progress', sdlcRoot);
    story.frontmatter.implementation_complete = true;

    // First refinement
    await runReworkAgent(story.path, sdlcRoot, {
      reviewFeedback: {
        issues: [{ severity: 'major', category: 'code', description: 'Issue 1' }],
        feedback: 'Feedback 1',
      } as any,
      targetPhase: 'implement',
      iteration: 1,
    });

    story = parseStory(story.path);
    expect(story.frontmatter.refinement_iterations).toHaveLength(1);
    expect(story.frontmatter.refinement_iterations![0].iteration).toBe(1);

    // Second refinement
    story.frontmatter.implementation_complete = true;
    await runReworkAgent(story.path, sdlcRoot, {
      reviewFeedback: {
        issues: [{ severity: 'major', category: 'code', description: 'Issue 2' }],
        feedback: 'Feedback 2',
      } as any,
      targetPhase: 'implement',
      iteration: 2,
    });

    story = parseStory(story.path);
    expect(story.frontmatter.refinement_iterations).toHaveLength(2);
    expect(story.frontmatter.refinement_iterations![1].iteration).toBe(2);
    expect(story.frontmatter.refinement_count).toBe(2);

    // Verify content has both iteration notes
    expect(story.content).toContain('Refinement Iteration 1');
    expect(story.content).toContain('Refinement Iteration 2');
  });
});
