import { execSync } from 'child_process';
import path from 'path';
import { parseStory, writeStory, moveStory, updateStoryField } from '../core/story.js';
import { runAgentQuery } from '../core/client.js';
import { Story, AgentResult } from '../types/index.js';
import { AgentOptions } from './research.js';

const IMPLEMENTATION_SYSTEM_PROMPT = `You are a senior software engineer implementing features based on a detailed plan. Your job is to execute each phase of the implementation plan.

When implementing:
1. Follow the plan step by step
2. Write clean, maintainable code
3. Follow existing patterns in the codebase
4. Write tests alongside implementation (TDD when possible)
5. Update the plan checkboxes as you complete tasks
6. Do NOT create temporary files, shell scripts, or documentation files - keep all notes in the story file
7. Follow the Testing Pyramid: prioritize unit tests (colocated with source, e.g., src/foo.test.ts), then integration tests (in tests/integration/)
8. Do NOT commit changes - that happens in the review phase

You have access to tools for reading and writing files, running commands, and searching the codebase.`;

/**
 * Implementation Agent
 *
 * Executes the implementation plan, creating code changes and tests.
 */
export async function runImplementationAgent(
  storyPath: string,
  sdlcRoot: string,
  options: AgentOptions = {}
): Promise<AgentResult> {
  const story = parseStory(storyPath);
  const changesMade: string[] = [];
  const workingDir = path.dirname(sdlcRoot);

  try {
    // Create a feature branch for this story
    const branchName = `agentic-sdlc/${story.slug}`;

    try {
      // Check if we're in a git repo
      execSync('git rev-parse --git-dir', { cwd: workingDir, stdio: 'pipe' });

      // Create and checkout branch (or checkout if exists)
      try {
        execSync(`git checkout -b ${branchName}`, { cwd: workingDir, stdio: 'pipe' });
        changesMade.push(`Created branch: ${branchName}`);
      } catch {
        // Branch might already exist
        try {
          execSync(`git checkout ${branchName}`, { cwd: workingDir, stdio: 'pipe' });
          changesMade.push(`Checked out existing branch: ${branchName}`);
        } catch {
          // Not a git repo or other error, continue without branching
        }
      }

      // Update story with branch info
      updateStoryField(story, 'branch', branchName);
    } catch {
      // Not a git repo, continue without branching
      changesMade.push('No git repo detected, skipping branch creation');
    }

    // Move story to in-progress if not already there
    if (story.frontmatter.status !== 'in-progress') {
      moveStory(story, 'in-progress', sdlcRoot);
      changesMade.push('Moved story to in-progress/');
    }

    let prompt = `Implement this story based on the plan:

Title: ${story.frontmatter.title}

Story content:
${story.content}`;

    if (options.reworkContext) {
      prompt += `

---
${options.reworkContext}
---

IMPORTANT: This is a refinement iteration. The previous implementation did not pass review.
You MUST fix all the issues listed above. Pay special attention to blocker and critical
severity issues - these must be resolved. Review the specific feedback and make targeted fixes.`;
    }

    prompt += `

Execute the implementation plan. For each task:
1. Read relevant existing files
2. Make necessary code changes
3. Write tests if applicable
4. Verify the changes work

Use the available tools to read files, write code, and run commands as needed.`;

    const implementationResult = await runAgentQuery({
      prompt,
      systemPrompt: IMPLEMENTATION_SYSTEM_PROMPT,
      workingDirectory: workingDir,
    });

    // Add implementation notes to the story
    const implementationNotes = `
### Implementation Notes (${new Date().toISOString().split('T')[0]})

${implementationResult}
`;

    // Append to story content
    const updatedStory = parseStory(storyPath);
    updatedStory.content += '\n\n' + implementationNotes;
    writeStory(updatedStory);
    changesMade.push('Added implementation notes');

    // Mark implementation as complete
    updateStoryField(updatedStory, 'implementation_complete', true);
    changesMade.push('Marked implementation_complete: true');

    return {
      success: true,
      story: parseStory(storyPath),
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
