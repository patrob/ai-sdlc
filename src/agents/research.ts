import fs from 'fs';
import path from 'path';
import { glob } from 'glob';
import { parseStory, writeStory, appendToSection, updateStoryField } from '../core/story.js';
import { runAgentQuery } from '../core/client.js';
import { Story, AgentResult } from '../types/index.js';

const RESEARCH_SYSTEM_PROMPT = `You are a technical research specialist. Your job is to research how to implement a user story by analyzing the existing codebase and external best practices.

When researching a story, you should:
1. Identify relevant existing code patterns in the codebase
2. Suggest which files/modules need to be modified
3. Research external best practices if applicable
4. Identify potential challenges or risks
5. Note any dependencies or prerequisites

Output your research findings in markdown format. Be specific about file paths and code patterns.`;

export interface AgentOptions {
  /** Context from a previous review failure - must address these issues */
  reworkContext?: string;
}

/**
 * Research Agent
 *
 * Researches how to implement a story by analyzing the codebase
 * and gathering relevant information.
 */
export async function runResearchAgent(
  storyPath: string,
  sdlcRoot: string,
  options: AgentOptions = {}
): Promise<AgentResult> {
  const story = parseStory(storyPath);
  const changesMade: string[] = [];

  try {
    // Gather codebase context
    const codebaseContext = await gatherCodebaseContext(sdlcRoot);

    // Build the prompt, including rework context if this is a refinement iteration
    let prompt = `Please research how to implement this story:

Title: ${story.frontmatter.title}

Story content:
${story.content}

Codebase context:
${codebaseContext}`;

    if (options.reworkContext) {
      prompt += `

---
${options.reworkContext}
---

IMPORTANT: This is a refinement iteration. The previous implementation did not pass review.
You MUST address all the issues listed above in your research. Focus on finding solutions
to the specific problems identified by reviewers.`;
    }

    prompt += `

Provide research findings including:
1. Relevant existing patterns and code to reference
2. Files/modules that likely need modification
3. External resources or best practices to follow
4. Potential challenges or risks
5. Any dependencies or prerequisites

Format your response as markdown for the Research section of the story.`;

    const researchContent = await runAgentQuery({
      prompt,
      systemPrompt: RESEARCH_SYSTEM_PROMPT,
      workingDirectory: path.dirname(sdlcRoot),
    });

    // Append research to the story
    appendToSection(story, 'Research', researchContent);
    changesMade.push('Added research findings');

    // Mark research as complete
    updateStoryField(story, 'research_complete', true);
    changesMade.push('Marked research_complete: true');

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

/**
 * Gather context about the codebase for research
 */
async function gatherCodebaseContext(sdlcRoot: string): Promise<string> {
  const workingDir = path.dirname(sdlcRoot);
  const context: string[] = [];

  // Check for common project files
  const projectFiles = [
    'package.json',
    'tsconfig.json',
    'pyproject.toml',
    'Cargo.toml',
    'go.mod',
  ];

  for (const file of projectFiles) {
    const filePath = path.join(workingDir, file);
    if (fs.existsSync(filePath)) {
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        context.push(`=== ${file} ===\n${content.substring(0, 1000)}`);
      } catch {
        // Ignore read errors
      }
    }
  }

  // Get directory structure (top level)
  try {
    const entries = fs.readdirSync(workingDir, { withFileTypes: true });
    const dirs = entries
      .filter(e => e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules')
      .map(e => e.name);
    const files = entries
      .filter(e => e.isFile() && !e.name.startsWith('.'))
      .map(e => e.name);

    context.push(`=== Directory Structure ===\nDirectories: ${dirs.join(', ')}\nFiles: ${files.join(', ')}`);
  } catch {
    // Ignore errors
  }

  // Look for source files
  try {
    const sourceFiles = await glob('src/**/*.{ts,js,py,go,rs}', {
      cwd: workingDir,
      ignore: ['node_modules/**', 'dist/**', 'build/**'],
    });

    if (sourceFiles.length > 0) {
      context.push(`=== Source Files ===\n${sourceFiles.slice(0, 20).join('\n')}`);
    }
  } catch {
    // Ignore glob errors
  }

  return context.join('\n\n') || 'No codebase context available.';
}
