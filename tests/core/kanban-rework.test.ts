import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { assessState } from '../../src/core/kanban.js';
import { createStory, moveStory, appendReviewHistory, writeStory } from '../../src/core/story.js';
import { ReviewDecision, ReviewSeverity } from '../../src/types/index.js';

describe('Kanban Rework Detection', () => {
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

  it('should generate rework action when review is rejected', () => {
    // Create story and move to in-progress
    let story = createStory('Test Story', sdlcRoot);
    story = moveStory(story, 'in-progress', sdlcRoot);

    // Mark implementation complete
    story.frontmatter.implementation_complete = true;

    // Add rejected review to history
    appendReviewHistory(story, {
      timestamp: new Date().toISOString(),
      decision: ReviewDecision.REJECTED,
      severity: ReviewSeverity.HIGH,
      feedback: 'Code quality issues',
      blockers: ['Missing error handling', 'No input validation'],
      codeReviewPassed: false,
      securityReviewPassed: false,
      poReviewPassed: true,
    });

    const assessment = assessState(sdlcRoot);

    // Should have a rework action
    const reworkActions = assessment.recommendedActions.filter(a => a.type === 'rework');
    expect(reworkActions).toHaveLength(1);
    expect(reworkActions[0].reason).toContain('needs rework');
    expect(reworkActions[0].context).toBeDefined();
    expect(reworkActions[0].context.targetPhase).toBeDefined();
  });

  it('should not generate rework action when review is approved', () => {
    // Create story and move to in-progress
    let story = createStory('Test Story', sdlcRoot);
    story = moveStory(story, 'in-progress', sdlcRoot);

    // Mark implementation complete
    story.frontmatter.implementation_complete = true;

    // Add approved review to history
    appendReviewHistory(story, {
      timestamp: new Date().toISOString(),
      decision: ReviewDecision.APPROVED,
      feedback: 'All reviews passed',
      blockers: [],
      codeReviewPassed: true,
      securityReviewPassed: true,
      poReviewPassed: true,
    });

    // Mark reviews complete after approval
    story.frontmatter.reviews_complete = true;
    writeStory(story);

    const assessment = assessState(sdlcRoot);

    // Should have create_pr action, not rework
    const reworkActions = assessment.recommendedActions.filter(a => a.type === 'rework');
    expect(reworkActions).toHaveLength(0);

    const prActions = assessment.recommendedActions.filter(a => a.type === 'create_pr');
    expect(prActions).toHaveLength(1);
  });

  it('should trigger circuit breaker after max refinement attempts', () => {
    // Create story and move to in-progress
    let story = createStory('Test Story', sdlcRoot);
    story = moveStory(story, 'in-progress', sdlcRoot);

    // Mark implementation complete
    story.frontmatter.implementation_complete = true;

    // Set refinement count to max
    story.frontmatter.refinement_count = 3;
    story.frontmatter.refinement_iterations = [
      { iteration: 1, agentType: 'implement', startedAt: new Date().toISOString(), result: 'failed' },
      { iteration: 2, agentType: 'implement', startedAt: new Date().toISOString(), result: 'failed' },
      { iteration: 3, agentType: 'implement', startedAt: new Date().toISOString(), result: 'failed' },
    ];

    // Add rejected review
    appendReviewHistory(story, {
      timestamp: new Date().toISOString(),
      decision: ReviewDecision.REJECTED,
      severity: ReviewSeverity.CRITICAL,
      feedback: 'Still failing after 3 attempts',
      blockers: ['Same issue persists'],
      codeReviewPassed: false,
      securityReviewPassed: false,
      poReviewPassed: false,
    });

    const assessment = assessState(sdlcRoot);

    // Should not generate rework action
    const reworkActions = assessment.recommendedActions.filter(a => a.type === 'rework');
    expect(reworkActions).toHaveLength(0);

    // Should have escalation action
    const escalationActions = assessment.recommendedActions.filter(
      a => a.reason.includes('max refinement attempts')
    );
    expect(escalationActions).toHaveLength(1);
    expect(escalationActions[0].context?.blockedByMaxRefinements).toBe(true);
  });

  it('should prioritize rework actions higher than normal review', () => {
    // Create two stories
    let story1 = createStory('Story 1', sdlcRoot);
    story1 = moveStory(story1, 'in-progress', sdlcRoot);
    story1.frontmatter.implementation_complete = true;
    story1.frontmatter.priority = 5;
    writeStory(story1); // Persist changes to disk

    let story2 = createStory('Story 2', sdlcRoot);
    story2 = moveStory(story2, 'in-progress', sdlcRoot);
    story2.frontmatter.implementation_complete = true;
    story2.frontmatter.priority = 1; // Higher base priority
    writeStory(story2); // Persist changes to disk

    // Story 1 has rejected review (needs rework)
    appendReviewHistory(story1, {
      timestamp: new Date().toISOString(),
      decision: ReviewDecision.REJECTED,
      severity: ReviewSeverity.HIGH,
      feedback: 'Issues found',
      blockers: ['Error'],
      codeReviewPassed: false,
      securityReviewPassed: true,
      poReviewPassed: true,
    });

    // Story 2 needs initial review
    // (no review history)

    const assessment = assessState(sdlcRoot);

    // Rework action should be prioritized (lower priority number = higher priority)
    const reworkAction = assessment.recommendedActions.find(a => a.type === 'rework');
    const reviewAction = assessment.recommendedActions.find(a => a.type === 'review');

    expect(reworkAction).toBeDefined();
    expect(reviewAction).toBeDefined();

    // Rework gets priority + 450, review gets priority + 500
    // So rework for story1 (5 + 450 = 455) should be higher priority than review for story2 (1 + 500 = 501)
    expect(reworkAction!.priority).toBeLessThan(reviewAction!.priority);
  });

  it('should track iteration number in rework action context', () => {
    let story = createStory('Test Story', sdlcRoot);
    story = moveStory(story, 'in-progress', sdlcRoot);
    story.frontmatter.implementation_complete = true;

    // Set to iteration 2
    story.frontmatter.refinement_count = 2;

    appendReviewHistory(story, {
      timestamp: new Date().toISOString(),
      decision: ReviewDecision.REJECTED,
      severity: ReviewSeverity.MEDIUM,
      feedback: 'Still some issues',
      blockers: ['Issue'],
      codeReviewPassed: false,
      securityReviewPassed: true,
      poReviewPassed: true,
    });

    const assessment = assessState(sdlcRoot);
    const reworkAction = assessment.recommendedActions.find(a => a.type === 'rework');

    expect(reworkAction).toBeDefined();
    expect(reworkAction!.context.iteration).toBe(3); // Next iteration
    expect(reworkAction!.reason).toContain('iteration 3');
  });

  it('should respect per-story max_refinement_attempts override', () => {
    let story = createStory('Test Story', sdlcRoot);
    story = moveStory(story, 'in-progress', sdlcRoot);
    story.frontmatter.implementation_complete = true;

    // Set custom max to 1
    story.frontmatter.max_refinement_attempts = 1;
    story.frontmatter.refinement_count = 1;

    appendReviewHistory(story, {
      timestamp: new Date().toISOString(),
      decision: ReviewDecision.REJECTED,
      severity: ReviewSeverity.HIGH,
      feedback: 'Failed',
      blockers: ['Error'],
      codeReviewPassed: false,
      securityReviewPassed: true,
      poReviewPassed: true,
    });

    const assessment = assessState(sdlcRoot);

    // Should trigger circuit breaker even though default is 3
    const reworkActions = assessment.recommendedActions.filter(a => a.type === 'rework');
    expect(reworkActions).toHaveLength(0);

    const escalationActions = assessment.recommendedActions.filter(
      a => a.context?.blockedByMaxRefinements
    );
    expect(escalationActions).toHaveLength(1);
  });

  it('should not generate rework for stories without implementation complete', () => {
    let story = createStory('Test Story', sdlcRoot);
    story = moveStory(story, 'in-progress', sdlcRoot);
    // implementation_complete is false

    appendReviewHistory(story, {
      timestamp: new Date().toISOString(),
      decision: ReviewDecision.REJECTED,
      severity: ReviewSeverity.HIGH,
      feedback: 'Issues',
      blockers: ['Error'],
      codeReviewPassed: false,
      securityReviewPassed: true,
      poReviewPassed: true,
    });

    const assessment = assessState(sdlcRoot);

    // Should generate implement action, not rework
    const reworkActions = assessment.recommendedActions.filter(a => a.type === 'rework');
    expect(reworkActions).toHaveLength(0);

    const implementActions = assessment.recommendedActions.filter(a => a.type === 'implement');
    expect(implementActions).toHaveLength(1);
  });
});
