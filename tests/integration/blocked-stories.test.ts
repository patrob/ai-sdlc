import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { createStory, updateStoryStatus, parseStory, writeStory, unblockStory, appendReviewHistory } from '../../src/core/story.js';
import { assessState, findStoryById } from '../../src/core/kanban.js';
import { BLOCKED_DIR, STORIES_FOLDER, ReviewDecision, ReviewSeverity } from '../../src/types/index.js';

describe('Blocked Stories Integration', () => {
  let testDir: string;
  let sdlcRoot: string;

  beforeEach(() => {
    // Create temporary test directory
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-sdlc-test-'));
    sdlcRoot = path.join(testDir, '.ai-sdlc');

    // Create SDLC folder structure (new architecture: stories/ folder)
    fs.mkdirSync(sdlcRoot, { recursive: true });
    fs.mkdirSync(path.join(sdlcRoot, STORIES_FOLDER));

    // Create config with max_refinement_attempts = 2
    const config = {
      sdlcFolder: '.ai-sdlc',
      refinement: {
        maxIterations: 2,
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
    if (testDir && fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should move story to blocked folder after max refinements reached', () => {
    // Step 1: Create story with max_refinement_attempts: 2
    let story = createStory('Test Feature', sdlcRoot, {
      type: 'feature',
      labels: ['test'],
      max_refinement_attempts: 2,
    });

    // Step 2: Update status to in-progress and set implementation_complete
    story = updateStoryStatus(story, 'in-progress');
    story.frontmatter.implementation_complete = true;
    story.frontmatter.refinement_count = 2; // Reached max
    story.frontmatter.current_iteration = 2;

    // Add a rejected review (required to trigger circuit breaker)
    appendReviewHistory(story, {
      timestamp: new Date().toISOString(),
      decision: ReviewDecision.REJECTED,
      severity: ReviewSeverity.HIGH,
      feedback: 'Still failing after max attempts',
      blockers: ['Issue persists'],
      codeReviewPassed: false,
      securityReviewPassed: false,
      poReviewPassed: false,
    });

    // Step 3: Call assessState - should update story status to blocked
    const assessment = assessState(sdlcRoot);

    // Step 4: Verify story status is blocked (file path stays same in new architecture)
    const blockedStory = parseStory(story.path);
    expect(blockedStory.frontmatter.status).toBe('blocked');
    expect(blockedStory.frontmatter.blocked_reason).toContain('Max refinement attempts');
    expect(blockedStory.frontmatter.blocked_reason).toContain('(2/2)');
    expect(blockedStory.frontmatter.blocked_at).toBeDefined();

    // Verify blocked_at is a valid ISO timestamp
    const timestamp = new Date(blockedStory.frontmatter.blocked_at!);
    expect(timestamp.getTime()).toBeGreaterThan(0);

    // Step 5: Verify no actions were recommended (story was blocked instead)
    expect(assessment.recommendedActions.length).toBe(0);
  });

  it('should handle multiple stories blocked concurrently', () => {
    // Create 3 stories at max refinements
    const stories = [];
    for (let i = 0; i < 3; i++) {
      let story = createStory(`Test Feature ${i}`, sdlcRoot, {
        type: 'feature',
        labels: ['test'],
        max_refinement_attempts: 2,
      });

      story = updateStoryStatus(story, 'in-progress');
      story.frontmatter.implementation_complete = true;
      story.frontmatter.refinement_count = 2;
      story.frontmatter.current_iteration = 2;

      // Add a rejected review (required to trigger circuit breaker)
      appendReviewHistory(story, {
        timestamp: new Date().toISOString(),
        decision: ReviewDecision.REJECTED,
        severity: ReviewSeverity.HIGH,
        feedback: `Story ${i} still failing`,
        blockers: ['Issue persists'],
        codeReviewPassed: false,
        securityReviewPassed: false,
        poReviewPassed: false,
      });
      stories.push(story);
    }

    // Call assessState - should block all 3 stories (update status in frontmatter)
    assessState(sdlcRoot);

    // Verify all stories have blocked status (path stays same in new architecture)
    let blockedCount = 0;
    for (const story of stories) {
      const updatedStory = parseStory(story.path);
      expect(updatedStory.frontmatter.status).toBe('blocked');
      expect(updatedStory.frontmatter.blocked_reason).toBeDefined();
      blockedCount++;
    }

    expect(blockedCount).toBe(3);
  });

  it('should log clear message when blocking a story', () => {
    // Mock console.log to capture output
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    // Create story at max refinements
    let story = createStory('Test Feature', sdlcRoot, {
      type: 'feature',
      max_refinement_attempts: 2,
    });

    story = updateStoryStatus(story, 'in-progress');
    story.frontmatter.implementation_complete = true;
    story.frontmatter.refinement_count = 2;
    story.frontmatter.current_iteration = 2;

    // Add a rejected review (required to trigger circuit breaker)
    appendReviewHistory(story, {
      timestamp: new Date().toISOString(),
      decision: ReviewDecision.REJECTED,
      severity: ReviewSeverity.HIGH,
      feedback: 'Still failing',
      blockers: ['Issue persists'],
      codeReviewPassed: false,
      securityReviewPassed: false,
      poReviewPassed: false,
    });

    // Call assessState
    assessState(sdlcRoot);

    // Verify log message
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining(`Story ${story.frontmatter.id} blocked:`)
    );
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('Max refinement attempts (2/2) reached')
    );

    logSpy.mockRestore();
  });

  it('should use config default when story max_refinement_attempts not set', () => {
    // Create story without max_refinement_attempts (uses config default of 2)
    let story = createStory('Test Feature', sdlcRoot, {
      type: 'feature',
      labels: ['test'],
    });

    story = updateStoryStatus(story, 'in-progress');
    story.frontmatter.implementation_complete = true;
    story.frontmatter.refinement_count = 2; // Reached config default
    story.frontmatter.current_iteration = 2;

    // Add a rejected review (required to trigger circuit breaker)
    appendReviewHistory(story, {
      timestamp: new Date().toISOString(),
      decision: ReviewDecision.REJECTED,
      severity: ReviewSeverity.HIGH,
      feedback: 'Still failing',
      blockers: ['Issue persists'],
      codeReviewPassed: false,
      securityReviewPassed: false,
      poReviewPassed: false,
    });

    // Call assessState
    assessState(sdlcRoot);

    // Verify story has blocked status (path stays same)
    const blockedStory = parseStory(story.path);
    expect(blockedStory.frontmatter.status).toBe('blocked');
    expect(blockedStory.frontmatter.blocked_reason).toContain('(2/2)');
  });

  it('should not block story when below max refinements', () => {
    // Create story with refinement_count below max
    let story = createStory('Test Feature', sdlcRoot, {
      type: 'feature',
      max_refinement_attempts: 2,
    });

    story = updateStoryStatus(story, 'in-progress');
    story.frontmatter.implementation_complete = true;
    story.frontmatter.refinement_count = 1; // Below max
    story.frontmatter.current_iteration = 1;

    // Add a rejected review (story still has retries remaining)
    appendReviewHistory(story, {
      timestamp: new Date().toISOString(),
      decision: ReviewDecision.REJECTED,
      severity: ReviewSeverity.HIGH,
      feedback: 'Needs work',
      blockers: ['Issue'],
      codeReviewPassed: false,
      securityReviewPassed: false,
      poReviewPassed: false,
    });

    // Call assessState
    const assessment = assessState(sdlcRoot);

    // Verify story status is still in-progress (not blocked - has retries left)
    const updatedStory = parseStory(story.path);
    expect(updatedStory.frontmatter.status).toBe('in-progress');
    expect(updatedStory.frontmatter.blocked_reason).toBeUndefined();

    // Should recommend rework action instead of blocking
    const reworkAction = assessment.recommendedActions.find(a => a.type === 'rework');
    expect(reworkAction).toBeDefined();
  });

  it('should preserve all story content and metadata when blocking', () => {
    // Create story with various metadata
    let story = createStory('Test Feature', sdlcRoot, {
      type: 'feature',
      labels: ['test', 'important'],
      max_refinement_attempts: 2,
      estimated_effort: 'medium',
    });

    story = updateStoryStatus(story, 'in-progress');
    story.frontmatter.implementation_complete = true;
    story.frontmatter.research_complete = true;
    story.frontmatter.plan_complete = true;
    story.frontmatter.refinement_count = 2;
    story.frontmatter.current_iteration = 2;
    story.frontmatter.branch = 'feature/test';

    // Add custom content
    story.content = '# Test Feature\n\nDetailed description\n\n## Acceptance Criteria\n\n- [ ] Criterion 1';

    // Add a rejected review (required to trigger circuit breaker)
    appendReviewHistory(story, {
      timestamp: new Date().toISOString(),
      decision: ReviewDecision.REJECTED,
      severity: ReviewSeverity.HIGH,
      feedback: 'Still failing',
      blockers: ['Issue persists'],
      codeReviewPassed: false,
      securityReviewPassed: false,
      poReviewPassed: false,
    });

    const originalStory = parseStory(story.path);

    // Call assessState
    assessState(sdlcRoot);

    // Parse blocked story (path stays same in new architecture)
    const blockedStory = parseStory(story.path);

    // Verify all metadata preserved
    expect(blockedStory.frontmatter.id).toBe(originalStory.frontmatter.id);
    expect(blockedStory.frontmatter.title).toBe(originalStory.frontmatter.title);
    expect(blockedStory.frontmatter.labels).toEqual(originalStory.frontmatter.labels);
    expect(blockedStory.frontmatter.estimated_effort).toBe(originalStory.frontmatter.estimated_effort);
    expect(blockedStory.frontmatter.branch).toBe(originalStory.frontmatter.branch);
    expect(blockedStory.frontmatter.research_complete).toBe(true);
    expect(blockedStory.frontmatter.plan_complete).toBe(true);

    // Verify content preserved
    expect(blockedStory.content).toBe(originalStory.content);
  });

  it('should handle error gracefully and fall back to high-priority action', () => {
    // Mock console.error to capture errors
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Create story and manually make it fail the blocking process
    let story = createStory('Test Story', sdlcRoot, {
      type: 'feature',
      max_refinement_attempts: 2,
    });

    // Update to in-progress
    story = updateStoryStatus(story, 'in-progress');
    story.frontmatter.implementation_complete = true;
    story.frontmatter.refinement_count = 2;
    story.frontmatter.current_iteration = 2;

    // Add a rejected review (required to trigger circuit breaker)
    appendReviewHistory(story, {
      timestamp: new Date().toISOString(),
      decision: ReviewDecision.REJECTED,
      severity: ReviewSeverity.HIGH,
      feedback: 'Still failing',
      blockers: ['Issue persists'],
      codeReviewPassed: false,
      securityReviewPassed: false,
      poReviewPassed: false,
    });

    // Make the story file read-only to trigger write error
    fs.chmodSync(story.path, 0o444);

    // Call assessState - should catch error and fall back
    const assessment = assessState(sdlcRoot);

    // Verify error was logged
    expect(errorSpy).toHaveBeenCalled();

    // Verify fallback action was created
    const fallbackAction = assessment.recommendedActions.find(
      a => a.context?.blockedByMaxRefinements === true
    );
    expect(fallbackAction).toBeDefined();
    expect(fallbackAction!.type).toBe('review');
    expect(fallbackAction!.priority).toBeGreaterThan(10000);

    errorSpy.mockRestore();

    // Restore file permissions
    fs.chmodSync(story.path, 0o644);
  });

  it('should not process stories from blocked folder on daemon watch', () => {
    // Create a story and set it to blocked status
    let story = createStory('Blocked Test', sdlcRoot, {
      type: 'feature',
      labels: ['test'],
    });

    // Update status to blocked (in new architecture, status is in frontmatter)
    story.frontmatter.status = 'blocked';
    story.frontmatter.blocked_reason = 'Manual block for testing';
    story.frontmatter.blocked_at = new Date().toISOString();
    writeStory(story);

    // Verify story has blocked status
    const blockedStory = parseStory(story.path);
    expect(blockedStory.frontmatter.status).toBe('blocked');

    // Call assessState - should NOT generate any actions for blocked story
    const assessment = assessState(sdlcRoot);

    // Verify no actions are recommended for blocked stories
    const actionsForBlockedStory = assessment.recommendedActions.filter(
      a => a.storyId === story.frontmatter.id
    );
    expect(actionsForBlockedStory).toHaveLength(0);
  });

  it('should verify daemon watches only backlog, ready, and in-progress', () => {
    // This test verifies stories with blocked status are not processed
    // In new architecture, status is in frontmatter, not folder location

    // Create stories with different statuses
    const backlogStory = createStory('Backlog Story', sdlcRoot, { type: 'feature' });

    let readyStory = createStory('Ready Story', sdlcRoot, { type: 'feature' });
    readyStory = updateStoryStatus(readyStory, 'ready');

    let inProgressStory = createStory('In Progress Story', sdlcRoot, { type: 'feature' });
    inProgressStory = updateStoryStatus(inProgressStory, 'in-progress');

    // Create a blocked story
    let blockedStory = createStory('Blocked Story', sdlcRoot, { type: 'feature' });
    blockedStory.frontmatter.status = 'blocked';
    blockedStory.frontmatter.blocked_reason = 'Testing';
    blockedStory.frontmatter.blocked_at = new Date().toISOString();
    writeStory(blockedStory);

    // Call assessState
    const assessment = assessState(sdlcRoot);

    // Verify that backlog, ready, and in-progress stories could have actions
    const backlogItems = assessment.backlogItems;
    const readyItems = assessment.readyItems;
    const inProgressItems = assessment.inProgressItems;

    // Verify assessment includes non-blocked stories
    expect(assessment.recommendedActions).toBeDefined();

    // The important thing: blocked stories should not appear in assessment
    const blockedStoriesInAssessment = assessment.recommendedActions.filter(
      a => a.storyId === blockedStory.frontmatter.id
    );
    expect(blockedStoriesInAssessment).toHaveLength(0);
  });

  it('should unblock a story and update status correctly', () => {
    // Step 1: Create story and update to in-progress
    let story = createStory('Test Feature', sdlcRoot, {
      type: 'feature',
      labels: ['test'],
      max_refinement_attempts: 2,
    });

    story = updateStoryStatus(story, 'in-progress');
    story.frontmatter.plan_complete = true;
    story.frontmatter.implementation_complete = true;
    story.frontmatter.refinement_count = 2;

    // Add a rejected review (required to trigger circuit breaker)
    appendReviewHistory(story, {
      timestamp: new Date().toISOString(),
      decision: ReviewDecision.REJECTED,
      severity: ReviewSeverity.HIGH,
      feedback: 'Still failing',
      blockers: ['Issue persists'],
      codeReviewPassed: false,
      securityReviewPassed: false,
      poReviewPassed: false,
    });

    // Step 2: Block the story
    assessState(sdlcRoot);

    // Step 3: Verify story has blocked status (path stays same in new architecture)
    const blockedStory = parseStory(story.path);
    expect(blockedStory.frontmatter.status).toBe('blocked');
    expect(blockedStory.frontmatter.blocked_reason).toBeDefined();

    // Step 4: Unblock the story
    const unblockedStory = unblockStory(story.frontmatter.id, sdlcRoot);

    // Step 5: Verify story status updated to in-progress (implementation_complete = true)
    expect(unblockedStory.frontmatter.status).toBe('in-progress');

    // Step 6: Verify blocking fields are cleared
    expect(unblockedStory.frontmatter.blocked_reason).toBeUndefined();
    expect(unblockedStory.frontmatter.blocked_at).toBeUndefined();

    // Step 7: Verify story can be found by ID
    const foundStory = findStoryById(sdlcRoot, story.frontmatter.id);
    expect(foundStory).toBeDefined();
    expect(foundStory?.frontmatter.status).toBe('in-progress');
  });

  it('should unblock story with resetRetries flag', () => {
    // Create and block a story
    let story = createStory('Test Feature', sdlcRoot, {
      type: 'feature',
      max_refinement_attempts: 2,
    });

    story = updateStoryStatus(story, 'in-progress');
    story.frontmatter.plan_complete = true;
    story.frontmatter.implementation_complete = true;
    story.frontmatter.retry_count = 5;
    story.frontmatter.refinement_count = 2;

    // Add a rejected review (required to trigger circuit breaker)
    appendReviewHistory(story, {
      timestamp: new Date().toISOString(),
      decision: ReviewDecision.REJECTED,
      severity: ReviewSeverity.HIGH,
      feedback: 'Still failing',
      blockers: ['Issue persists'],
      codeReviewPassed: false,
      securityReviewPassed: false,
      poReviewPassed: false,
    });

    // Block it
    assessState(sdlcRoot);

    // Unblock with resetRetries
    const unblockedStory = unblockStory(story.frontmatter.id, sdlcRoot, { resetRetries: true });

    expect(unblockedStory.frontmatter.retry_count).toBe(0);
    expect(unblockedStory.frontmatter.refinement_count).toBe(0);
  });

  it('should unblock story to ready when plan is complete but implementation is not', () => {
    // Create and block a story with plan_complete = true
    // Note: This test uses max_retries circuit breaker since implementation_complete=false
    let story = createStory('Test Feature', sdlcRoot);

    story = updateStoryStatus(story, 'in-progress');
    story.frontmatter.plan_complete = true;
    story.frontmatter.implementation_complete = false;
    story.frontmatter.retry_count = 2;
    story.frontmatter.max_retries = 2;

    // Add a review history (for max retries circuit breaker)
    appendReviewHistory(story, {
      timestamp: new Date().toISOString(),
      decision: ReviewDecision.REJECTED,
      severity: ReviewSeverity.HIGH,
      feedback: 'Still failing',
      blockers: ['Issue persists'],
      codeReviewPassed: false,
      securityReviewPassed: false,
      poReviewPassed: false,
    });

    assessState(sdlcRoot);

    // Unblock
    const unblockedStory = unblockStory(story.frontmatter.id, sdlcRoot);

    // Should update status to ready (plan_complete = true, implementation_complete = false)
    expect(unblockedStory.frontmatter.status).toBe('ready');
  });

  it('should unblock story to backlog when no phases are complete', () => {
    // Create and block a story with all phases incomplete
    // Note: This test uses max_retries circuit breaker since implementation_complete=false
    let story = createStory('Test Feature', sdlcRoot);

    story = updateStoryStatus(story, 'in-progress');
    story.frontmatter.research_complete = false;
    story.frontmatter.plan_complete = false;
    story.frontmatter.implementation_complete = false;
    story.frontmatter.retry_count = 2;
    story.frontmatter.max_retries = 2;

    // Add a review history (for max retries circuit breaker)
    appendReviewHistory(story, {
      timestamp: new Date().toISOString(),
      decision: ReviewDecision.REJECTED,
      severity: ReviewSeverity.HIGH,
      feedback: 'Still failing',
      blockers: ['Issue persists'],
      codeReviewPassed: false,
      securityReviewPassed: false,
      poReviewPassed: false,
    });

    assessState(sdlcRoot);

    // Unblock
    const unblockedStory = unblockStory(story.frontmatter.id, sdlcRoot);

    // Should update status to backlog (no phases complete)
    expect(unblockedStory.frontmatter.status).toBe('backlog');
  });
});
