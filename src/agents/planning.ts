import { parseStory, writeStory, appendToSection, updateStoryField } from '../core/story.js';
import { runAgentQuery } from '../core/client.js';
import { getLogger } from '../core/logger.js';
import { Story, AgentResult } from '../types/index.js';
import path from 'path';
import { AgentOptions } from './research.js';

/**
 * System prompt for the planning agent
 */
export const PLANNING_SYSTEM_PROMPT = `You are a technical planning specialist. Your job is to create detailed, step-by-step implementation plans for user stories.

When creating a plan, you should:
1. Break the work into phases (setup, implementation, testing, etc.)
2. Create specific, actionable tasks within each phase
3. Use checkbox format for tracking progress
4. Consider test-driven development (write tests first)
5. Include verification steps

Output your plan in markdown format with checkboxes. Each task should be small enough to complete in one focused session.`;

/**
 * TDD-specific planning instructions
 * When TDD is enabled, this is appended to the planning prompt to ensure
 * the plan follows the Red-Green-Refactor cycle structure.
 */
export const TDD_PLANNING_INSTRUCTIONS = `
**TDD Mode Enabled - Use Red-Green-Refactor Cycle Structure**

Structure your plan using the TDD cycle for EACH feature/acceptance criterion:

For each task that involves writing code:
- 🔴 RED: Write a failing test first that expresses the expected behavior
- 🟢 GREEN: Write the MINIMUM code to make the test pass
- 🔵 REFACTOR: Improve the code while keeping all tests green

Example TDD task structure:
### Feature: User Login
- [ ] 🔴 Write failing test for successful login with valid credentials (expect fail)
- [ ] 🟢 Implement login function to make test pass (expect pass)
- [ ] 🔵 Refactor login code if needed (keep passing)

- [ ] 🔴 Write failing test for login rejection with invalid password (expect fail)
- [ ] 🟢 Implement password validation to make test pass (expect pass)
- [ ] 🔵 Refactor validation code if needed (keep passing)

IMPORTANT TDD Rules:
1. NEVER write implementation code before writing a test
2. Each test should verify ONE specific behavior
3. Tests must fail before implementation (verify the test is actually testing something)
4. After GREEN phase, run ALL tests to check for regressions
5. REFACTOR phase is optional but should not change behavior`;

/**
 * Build a planning prompt for a story, optionally with TDD instructions
 *
 * @param story - The story to create a plan for
 * @param tddEnabledInConfig - Whether TDD is enabled in the global config
 * @param reworkContext - Optional context from a failed review
 * @returns The complete planning prompt
 */
export function buildPlanningPrompt(
  story: Story,
  tddEnabledInConfig: boolean,
  reworkContext?: string
): string {
  const tddEnabled = story.frontmatter.tdd_enabled ?? tddEnabledInConfig;

  let prompt = `Please create an implementation plan for this story:

Title: ${story.frontmatter.title}

Story content:
${story.content}`;

  if (reworkContext) {
    prompt += `

---
${reworkContext}
---

IMPORTANT: This is a refinement iteration. The previous implementation did not pass review.
Your plan MUST specifically address all the issues listed above. Include explicit tasks
to fix each identified problem. Do not repeat the same approach that failed.`;
  }

  if (tddEnabled) {
    prompt += `

${TDD_PLANNING_INSTRUCTIONS}`;
  }

  prompt += `

Create a detailed implementation plan including:
1. Phases (e.g., Setup, Implementation, Testing, Verification)
2. Specific tasks within each phase (as checkboxes)
3. Files to create or modify
4. Tests to write
5. Verification steps

Format the plan with markdown checkboxes like:
### Phase 1: Setup
- [ ] Task 1
- [ ] Task 2

### Phase 2: Implementation
- [ ] Task 3
...`;

  return prompt;
}

/**
 * Planning Agent
 *
 * Creates a step-by-step implementation plan from the research findings.
 */
export async function runPlanningAgent(
  storyPath: string,
  sdlcRoot: string,
  options: AgentOptions = {}
): Promise<AgentResult> {
  const logger = getLogger();
  const startTime = Date.now();
  const story = parseStory(storyPath);
  const changesMade: string[] = [];
  const workingDir = path.dirname(sdlcRoot);

  logger.info('planning', 'Starting planning phase', {
    storyId: story.frontmatter.id,
    hasReworkContext: !!options.reworkContext,
  });

  try {
    // Load config to check if TDD is enabled globally
    const { loadConfig } = await import('../core/config.js');
    const config = loadConfig(workingDir);
    const tddEnabledInConfig = config.tdd?.enabled ?? false;

    // Build the planning prompt with TDD support if enabled
    const prompt = buildPlanningPrompt(story, tddEnabledInConfig, options.reworkContext);

    if (story.frontmatter.tdd_enabled ?? tddEnabledInConfig) {
      changesMade.push('TDD mode enabled - plan will use Red-Green-Refactor structure');
      logger.debug('planning', 'TDD mode enabled for planning');
    }

    const planContent = await runAgentQuery({
      prompt,
      systemPrompt: PLANNING_SYSTEM_PROMPT,
      workingDirectory: path.dirname(sdlcRoot),
      onProgress: options.onProgress,
    });

    // Append plan to the story
    await appendToSection(story, 'Implementation Plan', planContent);
    changesMade.push('Added implementation plan');

    // Mark plan as complete
    await updateStoryField(story, 'plan_complete', true);
    changesMade.push('Marked plan_complete: true');

    logger.info('planning', 'Planning phase complete', {
      storyId: story.frontmatter.id,
      durationMs: Date.now() - startTime,
      planLength: planContent.length,
    });

    return {
      success: true,
      story: parseStory(storyPath), // Re-read to get updated content
      changesMade,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('planning', 'Planning phase failed', {
      storyId: story.frontmatter.id,
      durationMs: Date.now() - startTime,
      error: errorMessage,
    });

    return {
      success: false,
      story,
      changesMade,
      error: errorMessage,
    };
  }
}
