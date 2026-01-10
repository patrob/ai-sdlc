import { parseStory, writeStory, appendToSection, updateStoryField } from '../core/story.js';
import { runAgentQuery } from '../core/client.js';
import { Story, AgentResult } from '../types/index.js';
import path from 'path';
import { AgentOptions } from './research.js';

const PLANNING_SYSTEM_PROMPT = `You are a technical planning specialist. Your job is to create detailed, step-by-step implementation plans for user stories.

When creating a plan, you should:
1. Break the work into phases (setup, implementation, testing, etc.)
2. Create specific, actionable tasks within each phase
3. Use checkbox format for tracking progress
4. Consider test-driven development (write tests first)
5. Include verification steps

Output your plan in markdown format with checkboxes. Each task should be small enough to complete in one focused session.`;

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
  const story = parseStory(storyPath);
  const changesMade: string[] = [];

  try {
    let prompt = `Please create an implementation plan for this story:

Title: ${story.frontmatter.title}

Story content:
${story.content}`;

    if (options.reworkContext) {
      prompt += `

---
${options.reworkContext}
---

IMPORTANT: This is a refinement iteration. The previous implementation did not pass review.
Your plan MUST specifically address all the issues listed above. Include explicit tasks
to fix each identified problem. Do not repeat the same approach that failed.`;
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

    const planContent = await runAgentQuery({
      prompt,
      systemPrompt: PLANNING_SYSTEM_PROMPT,
      workingDirectory: path.dirname(sdlcRoot),
    });

    // Append plan to the story
    appendToSection(story, 'Implementation Plan', planContent);
    changesMade.push('Added implementation plan');

    // Mark plan as complete
    updateStoryField(story, 'plan_complete', true);
    changesMade.push('Marked plan_complete: true');

    return {
      success: true,
      story: parseStory(storyPath), // Re-read to get updated content
      changesMade,
    };
  } catch (error) {
    return {
      success: false,
      story,
      changesMade,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
