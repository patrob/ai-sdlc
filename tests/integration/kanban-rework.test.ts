import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { assessState } from '../../src/core/kanban.js';
import { createStory, updateStoryStatus, appendReviewHistory, writeStory, parseStory } from '../../src/core/story.js';
import { ReviewDecision, ReviewSeverity, STORIES_FOLDER } from '../../src/types/index.js';

describe.sequential('Kanban Rework Detection', () => {
  let testDir: string;
  let sdlcRoot: string;

  beforeEach(() => {
    // Create temporary test directory
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-sdlc-test-'));
    sdlcRoot = path.join(testDir, '.ai-sdlc');

    // Create SDLC folder structure (new architecture: stories/ folder)
    fs.mkdirSync(sdlcRoot, { recursive: true });
    fs.mkdirSync(path.join(sdlcRoot, STORIES_FOLDER));

    // Create default config
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
      stageGates: {
        requireApprovalBeforeImplementation: false,
        requireApprovalBeforePR: false,
        autoMergeOnApproval: false,
      },
      defaultLabels: [],
      theme: 'auto',
    };
    fs.writeFileSync(
      path.join(testDir, '.ai-sdlc.json'),
      JSON.stringify(config, null, 2)
    );
  });

  afterEach(() => {
    // Clean up test directory
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('should generate rework action when review is rejected', async () => {
    // Create story and move to in-progress
    let story = await createStory('Test Story', sdlcRoot);
    story = await updateStoryStatus(story, 'in-progress');

    // Mark implementation complete
    story.frontmatter.implementation_complete = true;

    // Add rejected review to history
    await appendReviewHistory(story, {
      timestamp: new Date().toISOString(),
      decision: ReviewDecision.REJECTED,
      severity: ReviewSeverity.HIGH,
      feedback: 'Code quality issues',
      blockers: ['Missing error handling', 'No input validation'],
      codeReviewPassed: false,
      securityReviewPassed: false,
      poReviewPassed: true,
    });

    const assessment = await assessState(sdlcRoot);

    // Should have a rework action
    const reworkActions = assessment.recommendedActions.filter(a => a.type === 'rework');
    expect(reworkActions).toHaveLength(1);
    expect(reworkActions[0].reason).toContain('needs rework');
    expect(reworkActions[0].context).toBeDefined();
    expect(reworkActions[0].context.targetPhase).toBeDefined();
  });

  it('should not generate rework action when review is approved', async () => {
    // Create story and move to in-progress
    let story = await createStory('Test Story', sdlcRoot);
    story = await updateStoryStatus(story, 'in-progress');

    // Mark implementation complete
    story.frontmatter.implementation_complete = true;

    // Add approved review to history
    await appendReviewHistory(story, {
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
    await writeStory(story);

    const assessment = await assessState(sdlcRoot);

    // Should have create_pr action, not rework
    const reworkActions = assessment.recommendedActions.filter(a => a.type === 'rework');
    expect(reworkActions).toHaveLength(0);

    const prActions = assessment.recommendedActions.filter(a => a.type === 'create_pr');
    expect(prActions).toHaveLength(1);
  });

  it('should trigger circuit breaker after max refinement attempts', async () => {
    // Create story and move to in-progress
    let story = await createStory('Test Story', sdlcRoot);
    story = await updateStoryStatus(story, 'in-progress');

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
    await appendReviewHistory(story, {
      timestamp: new Date().toISOString(),
      decision: ReviewDecision.REJECTED,
      severity: ReviewSeverity.CRITICAL,
      feedback: 'Still failing after 3 attempts',
      blockers: ['Same issue persists'],
      codeReviewPassed: false,
      securityReviewPassed: false,
      poReviewPassed: false,
    });

    await assessState(sdlcRoot);

    // Should not generate rework action (circuit breaker moves to blocked directly)
    // Re-parse story to see updated status after assessState
    const updatedStory = parseStory(story.path);

    // Story should now be blocked
    expect(updatedStory.frontmatter.status).toBe('blocked');
    expect(updatedStory.frontmatter.blocked_reason).toContain('Max refinement attempts');
  });

  it('should prioritize rework actions higher than normal review', async () => {
    // Create two stories
    let story1 = await createStory('Story 1', sdlcRoot);
    story1 = await updateStoryStatus(story1, 'in-progress');
    story1.frontmatter.implementation_complete = true;
    story1.frontmatter.priority = 5;
    await writeStory(story1); // Persist changes to disk

    let story2 = await createStory('Story 2', sdlcRoot);
    story2 = await updateStoryStatus(story2, 'in-progress');
    story2.frontmatter.implementation_complete = true;
    story2.frontmatter.priority = 1; // Higher base priority
    await writeStory(story2); // Persist changes to disk

    // Story 1 has rejected review (needs rework)
    await appendReviewHistory(story1, {
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

    const assessment = await assessState(sdlcRoot);

    // Rework action should be prioritized (lower priority number = higher priority)
    const reworkAction = assessment.recommendedActions.find(a => a.type === 'rework');
    const reviewAction = assessment.recommendedActions.find(a => a.type === 'review');

    expect(reworkAction).toBeDefined();
    expect(reviewAction).toBeDefined();

    // Rework gets priority + 450, review gets priority + 500
    // So rework for story1 (5 + 450 = 455) should be higher priority than review for story2 (1 + 500 = 501)
    expect(reworkAction!.priority).toBeLessThan(reviewAction!.priority);
  });

  it('should track iteration number in rework action context', async () => {
    let story = await createStory('Test Story', sdlcRoot);
    story = await updateStoryStatus(story, 'in-progress');
    story.frontmatter.implementation_complete = true;

    // Set to iteration 2
    story.frontmatter.refinement_count = 2;

    await appendReviewHistory(story, {
      timestamp: new Date().toISOString(),
      decision: ReviewDecision.REJECTED,
      severity: ReviewSeverity.MEDIUM,
      feedback: 'Still some issues',
      blockers: ['Issue'],
      codeReviewPassed: false,
      securityReviewPassed: true,
      poReviewPassed: true,
    });

    const assessment = await assessState(sdlcRoot);
    const reworkAction = assessment.recommendedActions.find(a => a.type === 'rework');

    expect(reworkAction).toBeDefined();
    expect(reworkAction!.context.iteration).toBe(3); // Next iteration
    expect(reworkAction!.reason).toContain('iteration 3');
  });

  it('should respect per-story max_refinement_attempts override', async () => {
    let story = await createStory('Test Story', sdlcRoot);
    story = await updateStoryStatus(story, 'in-progress');
    story.frontmatter.implementation_complete = true;

    // Set custom max to 1
    story.frontmatter.max_refinement_attempts = 1;
    story.frontmatter.refinement_count = 1;

    await appendReviewHistory(story, {
      timestamp: new Date().toISOString(),
      decision: ReviewDecision.REJECTED,
      severity: ReviewSeverity.HIGH,
      feedback: 'Failed',
      blockers: ['Error'],
      codeReviewPassed: false,
      securityReviewPassed: true,
      poReviewPassed: true,
    });

    await assessState(sdlcRoot);

    // Should trigger circuit breaker even though default is 3
    // Re-parse story to see updated status after assessState
    const updatedStory = parseStory(story.path);

    // Story should now be blocked
    expect(updatedStory.frontmatter.status).toBe('blocked');
    expect(updatedStory.frontmatter.blocked_reason).toContain('Max refinement attempts (1/1)');
  });

  it('should not generate rework for stories without implementation complete', async () => {
    let story = await createStory('Test Story', sdlcRoot);
    story = await updateStoryStatus(story, 'in-progress');
    // implementation_complete is false

    await appendReviewHistory(story, {
      timestamp: new Date().toISOString(),
      decision: ReviewDecision.REJECTED,
      severity: ReviewSeverity.HIGH,
      feedback: 'Issues',
      blockers: ['Error'],
      codeReviewPassed: false,
      securityReviewPassed: true,
      poReviewPassed: true,
    });

    const assessment = await assessState(sdlcRoot);

    // Should generate implement action, not rework
    const reworkActions = assessment.recommendedActions.filter(a => a.type === 'rework');
    expect(reworkActions).toHaveLength(0);

    const implementActions = assessment.recommendedActions.filter(a => a.type === 'implement');
    expect(implementActions).toHaveLength(1);
  });
});
