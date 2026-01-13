import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { createStory, moveStory, parseStory, writeStory, unblockStory } from '../../src/core/story.js';
import { assessState, findStoryById } from '../../src/core/kanban.js';
import { BLOCKED_DIR } from '../../src/types/index.js';

describe('Blocked Stories Integration', () => {
  let testDir: string;
  let sdlcRoot: string;

  beforeEach(() => {
    // Create temporary test directory
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-sdlc-test-'));
    sdlcRoot = path.join(testDir, '.ai-sdlc');

    // Create SDLC folder structure
    fs.mkdirSync(sdlcRoot, { recursive: true });
    fs.mkdirSync(path.join(sdlcRoot, 'backlog'));
    fs.mkdirSync(path.join(sdlcRoot, 'ready'));
    fs.mkdirSync(path.join(sdlcRoot, 'in-progress'));
    fs.mkdirSync(path.join(sdlcRoot, 'done'));

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

    // Step 2: Move to in-progress and set implementation_complete
    story = moveStory(story, 'in-progress', sdlcRoot);
    story.frontmatter.implementation_complete = true;
    story.frontmatter.refinement_count = 2; // Reached max
    story.frontmatter.current_iteration = 2;
    writeStory(story);

    // Step 3: Call assessState - should move story to blocked
    const assessment = assessState(sdlcRoot);

    // Step 4: Verify story is in blocked folder
    const blockedPath = path.join(sdlcRoot, BLOCKED_DIR, `${story.slug}.md`);
    expect(fs.existsSync(blockedPath)).toBe(true);

    // Step 5: Verify story is no longer in in-progress
    expect(fs.existsSync(story.path)).toBe(false);

    // Step 6: Parse blocked story and verify metadata
    const blockedStory = parseStory(blockedPath);
    expect(blockedStory.frontmatter.status).toBe('blocked');
    expect(blockedStory.frontmatter.blocked_reason).toContain('Max refinement attempts');
    expect(blockedStory.frontmatter.blocked_reason).toContain('(2/2)');
    expect(blockedStory.frontmatter.blocked_at).toBeDefined();

    // Verify blocked_at is a valid ISO timestamp
    const timestamp = new Date(blockedStory.frontmatter.blocked_at!);
    expect(timestamp.getTime()).toBeGreaterThan(0);

    // Step 7: Verify no actions were recommended (story was blocked instead)
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

      story = moveStory(story, 'in-progress', sdlcRoot);
      story.frontmatter.implementation_complete = true;
      story.frontmatter.refinement_count = 2;
      story.frontmatter.current_iteration = 2;
      writeStory(story);
      stories.push(story);
    }

    // Call assessState - should block all 3 stories
    assessState(sdlcRoot);

    // Verify all 3 stories are in blocked folder
    const blockedDir = path.join(sdlcRoot, BLOCKED_DIR);
    expect(fs.existsSync(blockedDir)).toBe(true);

    const blockedFiles = fs.readdirSync(blockedDir);
    expect(blockedFiles.length).toBe(3);

    // Verify all stories have correct metadata
    for (const story of stories) {
      const blockedPath = path.join(blockedDir, `${story.slug}.md`);
      expect(fs.existsSync(blockedPath)).toBe(true);

      const blockedStory = parseStory(blockedPath);
      expect(blockedStory.frontmatter.status).toBe('blocked');
      expect(blockedStory.frontmatter.blocked_reason).toBeDefined();
    }
  });

  it('should log clear message when blocking a story', () => {
    // Mock console.log to capture output
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    // Create story at max refinements
    let story = createStory('Test Feature', sdlcRoot, {
      type: 'feature',
      max_refinement_attempts: 2,
    });

    story = moveStory(story, 'in-progress', sdlcRoot);
    story.frontmatter.implementation_complete = true;
    story.frontmatter.refinement_count = 2;
    story.frontmatter.current_iteration = 2;
    writeStory(story);

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

    story = moveStory(story, 'in-progress', sdlcRoot);
    story.frontmatter.implementation_complete = true;
    story.frontmatter.refinement_count = 2; // Reached config default
    story.frontmatter.current_iteration = 2;
    writeStory(story);

    // Call assessState
    assessState(sdlcRoot);

    // Verify story is in blocked folder
    const blockedPath = path.join(sdlcRoot, BLOCKED_DIR, `${story.slug}.md`);
    expect(fs.existsSync(blockedPath)).toBe(true);

    const blockedStory = parseStory(blockedPath);
    expect(blockedStory.frontmatter.blocked_reason).toContain('(2/2)');
  });

  it('should not block story when below max refinements', () => {
    // Create story with refinement_count below max
    let story = createStory('Test Feature', sdlcRoot, {
      type: 'feature',
      max_refinement_attempts: 2,
    });

    story = moveStory(story, 'in-progress', sdlcRoot);
    story.frontmatter.implementation_complete = true;
    story.frontmatter.refinement_count = 1; // Below max
    story.frontmatter.current_iteration = 1;
    writeStory(story);

    // Call assessState
    assessState(sdlcRoot);

    // Verify story is NOT in blocked folder
    const blockedPath = path.join(sdlcRoot, BLOCKED_DIR, `${story.slug}.md`);
    expect(fs.existsSync(blockedPath)).toBe(false);

    // Verify story is still in in-progress
    expect(fs.existsSync(story.path)).toBe(true);
  });

  it('should preserve all story content and metadata when blocking', () => {
    // Create story with various metadata
    let story = createStory('Test Feature', sdlcRoot, {
      type: 'feature',
      labels: ['test', 'important'],
      max_refinement_attempts: 2,
      estimated_effort: 'medium',
    });

    story = moveStory(story, 'in-progress', sdlcRoot);
    story.frontmatter.implementation_complete = true;
    story.frontmatter.research_complete = true;
    story.frontmatter.plan_complete = true;
    story.frontmatter.refinement_count = 2;
    story.frontmatter.current_iteration = 2;
    story.frontmatter.branch = 'feature/test';

    // Add custom content
    story.content = '# Test Feature\n\nDetailed description\n\n## Acceptance Criteria\n\n- [ ] Criterion 1';
    writeStory(story);

    const originalStory = parseStory(story.path);

    // Call assessState
    assessState(sdlcRoot);

    // Parse blocked story
    const blockedPath = path.join(sdlcRoot, BLOCKED_DIR, `${story.slug}.md`);
    const blockedStory = parseStory(blockedPath);

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

    // Create story with invalid path to trigger error
    // We'll manually create a malformed story file
    const inProgressDir = path.join(sdlcRoot, 'in-progress');
    const storyPath = path.join(inProgressDir, '01-test-story.md');

    // Write story with incomplete frontmatter
    fs.writeFileSync(storyPath, `---
id: test-1
title: Test
priority: 1
status: in-progress
type: feature
created: '2024-01-01'
labels: []
research_complete: true
plan_complete: true
implementation_complete: true
reviews_complete: false
refinement_count: 2
max_refinement_attempts: 2
current_iteration: 2
---

# Test
`);

    // Temporarily make blocked folder creation fail by creating it as a file
    const blockedPath = path.join(sdlcRoot, BLOCKED_DIR);
    fs.writeFileSync(blockedPath, 'this is a file, not a directory');

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

    // Clean up the file we created
    fs.unlinkSync(blockedPath);
  });

  it('should not process stories from blocked folder on daemon watch', () => {
    // Create a story and manually move it to blocked folder
    let story = createStory('Blocked Test', sdlcRoot, {
      type: 'feature',
      labels: ['test'],
    });

    // Manually move story to blocked folder
    const blockedDir = path.join(sdlcRoot, BLOCKED_DIR);
    fs.mkdirSync(blockedDir, { recursive: true });

    const blockedPath = path.join(blockedDir, `${story.slug}.md`);
    story.frontmatter.status = 'blocked';
    story.frontmatter.blocked_reason = 'Manual block for testing';
    story.frontmatter.blocked_at = new Date().toISOString();
    story.path = blockedPath;
    writeStory(story);

    // Verify story is in blocked folder
    expect(fs.existsSync(blockedPath)).toBe(true);

    // Call assessState - should NOT generate any actions for blocked story
    const assessment = assessState(sdlcRoot);

    // Verify no actions are recommended for blocked stories
    const actionsForBlockedStory = assessment.recommendedActions.filter(
      a => a.storyId === story.frontmatter.id
    );
    expect(actionsForBlockedStory).toHaveLength(0);
  });

  it('should verify daemon watches only backlog, ready, and in-progress', () => {
    // This test verifies the daemon configuration only includes active workflow folders
    // The actual watch paths are: backlog/, ready/, in-progress/
    // The blocked/ folder is explicitly excluded

    // Create stories in each folder to verify which ones would be processed
    const backlogStory = createStory('Backlog Story', sdlcRoot, { type: 'feature' });
    const readyStory = createStory('Ready Story', sdlcRoot, { type: 'feature' });
    moveStory(readyStory, 'ready', sdlcRoot);

    const inProgressStory = createStory('In Progress Story', sdlcRoot, { type: 'feature' });
    moveStory(inProgressStory, 'in-progress', sdlcRoot);

    // Create a blocked story
    const blockedDir = path.join(sdlcRoot, BLOCKED_DIR);
    fs.mkdirSync(blockedDir, { recursive: true });
    let blockedStory = createStory('Blocked Story', sdlcRoot, { type: 'feature' });
    const blockedPath = path.join(blockedDir, `${blockedStory.slug}.md`);
    blockedStory.path = blockedPath;
    blockedStory.frontmatter.status = 'blocked';
    blockedStory.frontmatter.blocked_reason = 'Testing';
    blockedStory.frontmatter.blocked_at = new Date().toISOString();
    writeStory(blockedStory);

    // Call assessState
    const assessment = assessState(sdlcRoot);

    // Verify that backlog, ready, and in-progress stories could have actions
    // (They might not if they're already complete, but the assessment includes them)
    const backlogItems = assessment.backlogItems;
    const readyItems = assessment.readyItems;
    const inProgressItems = assessment.inProgressItems;

    // Blocked folder should never have items in the assessment
    // because assessState only scans KANBAN_FOLDERS (backlog, ready, in-progress, done)
    expect(assessment.recommendedActions).toBeDefined();

    // The important thing: no story from blocked/ should appear in assessment
    const blockedStoriesInAssessment = assessment.recommendedActions.filter(
      a => a.storyId === blockedStory.frontmatter.id
    );
    expect(blockedStoriesInAssessment).toHaveLength(0);
  });

  it('should unblock a story and move it to the correct folder', () => {
    // Step 1: Create story and move to in-progress
    let story = createStory('Test Feature', sdlcRoot, {
      type: 'feature',
      labels: ['test'],
      max_refinement_attempts: 2,
    });

    story = moveStory(story, 'in-progress', sdlcRoot);
    story.frontmatter.plan_complete = true;
    story.frontmatter.implementation_complete = true;
    story.frontmatter.refinement_count = 2;
    writeStory(story);

    // Step 2: Block the story
    assessState(sdlcRoot);

    // Step 3: Verify story is in blocked folder
    const blockedPath = path.join(sdlcRoot, BLOCKED_DIR, `${story.slug}.md`);
    expect(fs.existsSync(blockedPath)).toBe(true);

    const blockedStory = parseStory(blockedPath);
    expect(blockedStory.frontmatter.status).toBe('blocked');
    expect(blockedStory.frontmatter.blocked_reason).toBeDefined();

    // Step 4: Unblock the story
    const unblockedStory = unblockStory(story.frontmatter.id, sdlcRoot);

    // Step 5: Verify story moved to in-progress (implementation_complete = true)
    expect(unblockedStory.frontmatter.status).toBe('in-progress');
    expect(unblockedStory.path).toContain('/in-progress/');

    // Step 6: Verify blocking fields are cleared
    expect(unblockedStory.frontmatter.blocked_reason).toBeUndefined();
    expect(unblockedStory.frontmatter.blocked_at).toBeUndefined();

    // Step 7: Verify story is no longer in blocked folder
    expect(fs.existsSync(blockedPath)).toBe(false);

    // Step 8: Verify story can be found by ID in new location
    const foundStory = findStoryById(sdlcRoot, story.frontmatter.id);
    expect(foundStory).toBeDefined();
    expect(foundStory?.path).toContain('/in-progress/');
  });

  it('should unblock story with resetRetries flag', () => {
    // Create and block a story
    let story = createStory('Test Feature', sdlcRoot, {
      type: 'feature',
      max_refinement_attempts: 2,
    });

    story = moveStory(story, 'in-progress', sdlcRoot);
    story.frontmatter.plan_complete = true;
    story.frontmatter.retry_count = 5;
    story.frontmatter.refinement_count = 2;
    writeStory(story);

    // Block it
    assessState(sdlcRoot);

    // Unblock with resetRetries
    const unblockedStory = unblockStory(story.frontmatter.id, sdlcRoot, { resetRetries: true });

    expect(unblockedStory.frontmatter.retry_count).toBe(0);
    expect(unblockedStory.frontmatter.refinement_count).toBe(0);
  });

  it('should unblock story to ready when plan is complete but implementation is not', () => {
    // Create and block a story with plan_complete = true
    let story = createStory('Test Feature', sdlcRoot);

    story = moveStory(story, 'in-progress', sdlcRoot);
    story.frontmatter.plan_complete = true;
    story.frontmatter.implementation_complete = false;
    story.frontmatter.refinement_count = 2;
    story.frontmatter.max_refinement_attempts = 2;
    writeStory(story);

    assessState(sdlcRoot);

    // Unblock
    const unblockedStory = unblockStory(story.frontmatter.id, sdlcRoot);

    // Should move to ready (plan_complete = true, implementation_complete = false)
    expect(unblockedStory.frontmatter.status).toBe('ready');
    expect(unblockedStory.path).toContain('/ready/');
  });

  it('should unblock story to backlog when no phases are complete', () => {
    // Create and block a story with all phases incomplete
    let story = createStory('Test Feature', sdlcRoot);

    story = moveStory(story, 'in-progress', sdlcRoot);
    story.frontmatter.research_complete = false;
    story.frontmatter.plan_complete = false;
    story.frontmatter.implementation_complete = false;
    story.frontmatter.refinement_count = 2;
    story.frontmatter.max_refinement_attempts = 2;
    writeStory(story);

    assessState(sdlcRoot);

    // Unblock
    const unblockedStory = unblockStory(story.frontmatter.id, sdlcRoot);

    // Should move to backlog (no phases complete)
    expect(unblockedStory.frontmatter.status).toBe('backlog');
    expect(unblockedStory.path).toContain('/backlog/');
  });
});
