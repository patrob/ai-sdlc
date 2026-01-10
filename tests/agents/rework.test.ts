import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { runReworkAgent, determineTargetPhase, packageReworkContext } from '../../src/agents/rework.js';
import { createStory, parseStory, writeStory } from '../../src/core/story.js';
import { ReviewResult, ReviewDecision, ReviewSeverity } from '../../src/types/index.js';

describe('Rework Agent', () => {
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

  it('should record refinement attempt on first rework', async () => {
    const story = createStory('Test Story', sdlcRoot, {
      type: 'feature',
    });

    const reviewFeedback: ReviewResult = {
      success: true,
      passed: false,
      decision: ReviewDecision.REJECTED,
      severity: ReviewSeverity.HIGH,
      reviewType: 'combined',
      issues: [
        {
          severity: 'blocker',
          category: 'security',
          description: 'SQL injection vulnerability',
        },
      ],
      feedback: 'SQL injection found',
      story,
      changesMade: [],
    };

    const result = await runReworkAgent(story.path, sdlcRoot, {
      reviewFeedback,
      targetPhase: 'implement',
      iteration: 1,
    });

    expect(result.success).toBe(true);
    expect(result.changesMade).toContain('Recorded refinement attempt 1');

    const updatedStory = parseStory(story.path);
    expect(updatedStory.frontmatter.refinement_count).toBe(1);
    expect(updatedStory.frontmatter.refinement_iterations).toHaveLength(1);
    expect(updatedStory.frontmatter.refinement_iterations![0].agentType).toBe('implement');
  });

  it('should reset implementation_complete flag for implement rework', async () => {
    const story = createStory('Test Story', sdlcRoot);
    story.frontmatter.implementation_complete = true;

    const reviewFeedback: ReviewResult = {
      success: true,
      passed: false,
      decision: ReviewDecision.REJECTED,
      severity: ReviewSeverity.MEDIUM,
      reviewType: 'combined',
      issues: [],
      feedback: 'Code quality issues',
      story,
      changesMade: [],
    };

    await runReworkAgent(story.path, sdlcRoot, {
      reviewFeedback,
      targetPhase: 'implement',
      iteration: 1,
    });

    const updatedStory = parseStory(story.path);
    expect(updatedStory.frontmatter.implementation_complete).toBe(false);
  });

  it('should reset plan_complete flag for plan rework', async () => {
    const story = createStory('Test Story', sdlcRoot);
    story.frontmatter.plan_complete = true;
    story.frontmatter.implementation_complete = true;

    const reviewFeedback: ReviewResult = {
      success: true,
      passed: false,
      decision: ReviewDecision.REJECTED,
      severity: ReviewSeverity.HIGH,
      reviewType: 'combined',
      issues: [],
      feedback: 'Architecture issues',
      story,
      changesMade: [],
    };

    await runReworkAgent(story.path, sdlcRoot, {
      reviewFeedback,
      targetPhase: 'plan',
      iteration: 1,
    });

    const updatedStory = parseStory(story.path);
    expect(updatedStory.frontmatter.plan_complete).toBe(false);
  });

  it('should trigger circuit breaker after max iterations', async () => {
    const story = createStory('Test Story', sdlcRoot);

    // Set refinement count to max
    story.frontmatter.refinement_count = 3;
    story.frontmatter.refinement_iterations = [
      { iteration: 1, agentType: 'implement', startedAt: new Date().toISOString(), result: 'failed' },
      { iteration: 2, agentType: 'implement', startedAt: new Date().toISOString(), result: 'failed' },
      { iteration: 3, agentType: 'implement', startedAt: new Date().toISOString(), result: 'failed' },
    ];
    writeStory(story); // Persist to disk so runReworkAgent reads the updated state

    const reviewFeedback: ReviewResult = {
      success: true,
      passed: false,
      decision: ReviewDecision.REJECTED,
      severity: ReviewSeverity.HIGH,
      reviewType: 'combined',
      issues: [],
      feedback: 'Still failing',
      story,
      changesMade: [],
    };

    const result = await runReworkAgent(story.path, sdlcRoot, {
      reviewFeedback,
      targetPhase: 'implement',
      iteration: 4,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Circuit breaker activated');
    expect(result.error).toContain('maximum refinement attempts');
  });

  it('should append refinement notes to story content', async () => {
    const story = createStory('Test Story', sdlcRoot);

    const reviewFeedback: ReviewResult = {
      success: true,
      passed: false,
      decision: ReviewDecision.REJECTED,
      severity: ReviewSeverity.MEDIUM,
      reviewType: 'combined',
      issues: [
        {
          severity: 'major',
          category: 'code_quality',
          description: 'Missing error handling',
        },
      ],
      feedback: 'Missing error handling in multiple places',
      story,
      changesMade: [],
    };

    await runReworkAgent(story.path, sdlcRoot, {
      reviewFeedback,
      targetPhase: 'implement',
      iteration: 1,
    });

    const updatedStory = parseStory(story.path);
    expect(updatedStory.content).toContain('Refinement Iteration 1');
    expect(updatedStory.content).toContain('Missing error handling');
  });

  it('should clear previous error on successful rework', async () => {
    const story = createStory('Test Story', sdlcRoot);
    story.frontmatter.last_error = 'Some previous error';

    const reviewFeedback: ReviewResult = {
      success: true,
      passed: false,
      decision: ReviewDecision.REJECTED,
      severity: ReviewSeverity.LOW,
      reviewType: 'combined',
      issues: [],
      feedback: 'Minor issues',
      story,
      changesMade: [],
    };

    await runReworkAgent(story.path, sdlcRoot, {
      reviewFeedback,
      targetPhase: 'implement',
      iteration: 1,
    });

    const updatedStory = parseStory(story.path);
    expect(updatedStory.frontmatter.last_error).toBeUndefined();
  });
});

describe('determineTargetPhase', () => {
  it('should target research phase for requirement issues', () => {
    const reviewResult: ReviewResult = {
      success: true,
      passed: false,
      decision: ReviewDecision.REJECTED,
      severity: ReviewSeverity.HIGH,
      reviewType: 'combined',
      issues: [
        {
          severity: 'blocker',
          category: 'missing_research',
          description: 'Requirements not understood',
        },
      ],
      feedback: '',
      story: {} as any,
      changesMade: [],
    };

    const phase = determineTargetPhase(reviewResult);
    expect(phase).toBe('research');
  });

  it('should target plan phase for architecture issues', () => {
    const reviewResult: ReviewResult = {
      success: true,
      passed: false,
      decision: ReviewDecision.REJECTED,
      severity: ReviewSeverity.HIGH,
      reviewType: 'combined',
      issues: [
        {
          severity: 'critical',
          category: 'architecture',
          description: 'Poor design choices',
        },
      ],
      feedback: '',
      story: {} as any,
      changesMade: [],
    };

    const phase = determineTargetPhase(reviewResult);
    expect(phase).toBe('plan');
  });

  it('should default to implement phase for code issues', () => {
    const reviewResult: ReviewResult = {
      success: true,
      passed: false,
      decision: ReviewDecision.REJECTED,
      severity: ReviewSeverity.MEDIUM,
      reviewType: 'combined',
      issues: [
        {
          severity: 'major',
          category: 'code_quality',
          description: 'Poor code quality',
        },
      ],
      feedback: '',
      story: {} as any,
      changesMade: [],
    };

    const phase = determineTargetPhase(reviewResult);
    expect(phase).toBe('implement');
  });
});

describe('packageReworkContext', () => {
  it('should include iteration number in context', () => {
    const story = {
      frontmatter: {
        refinement_count: 2,
        refinement_iterations: [
          { iteration: 1, agentType: 'implement', result: 'failed' as const, startedAt: '' },
          { iteration: 2, agentType: 'implement', result: 'in_progress' as const, startedAt: '' },
        ],
      },
    };

    const reviewFeedback: ReviewResult = {
      success: true,
      passed: false,
      decision: ReviewDecision.REJECTED,
      severity: ReviewSeverity.HIGH,
      reviewType: 'combined',
      issues: [],
      feedback: 'Test feedback',
      story: {} as any,
      changesMade: [],
    };

    const context = packageReworkContext(story, reviewFeedback);

    expect(context).toContain('Iteration 2');
    expect(context).toContain('Test feedback');
    expect(context).toContain('Previous Attempts');
  });

  it('should not show previous attempts on first iteration', () => {
    const story = {
      frontmatter: {
        refinement_count: 1,
        refinement_iterations: [
          { iteration: 1, agentType: 'implement', result: 'in_progress' as const, startedAt: '' },
        ],
      },
    };

    const reviewFeedback: ReviewResult = {
      success: true,
      passed: false,
      decision: ReviewDecision.REJECTED,
      severity: ReviewSeverity.MEDIUM,
      reviewType: 'combined',
      issues: [],
      feedback: 'First attempt feedback',
      story: {} as any,
      changesMade: [],
    };

    const context = packageReworkContext(story, reviewFeedback);

    expect(context).toContain('Iteration 1');
    expect(context).not.toContain('Previous Attempts');
  });
});
