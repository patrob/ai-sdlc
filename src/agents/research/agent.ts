import path from 'path';

import { type AgentProgressCallback, runAgentQuery } from '../../core/client.js';
import { getLogger } from '../../core/logger.js';
import {
  parseStory,
  readSectionContent,
  updateStoryField,
  writeSectionContent,
} from '../../core/story.js';
import type { IProvider } from '../../providers/types.js';
import { type AgentResult } from '../../types/index.js';
import { gatherCodebaseContext } from './context.js';
import { shouldPerformWebResearch } from './decision.js';
import { RESEARCH_SYSTEM_PROMPT } from './prompts.js';
import { sanitizeCodebaseContext, sanitizeWebResearchContent } from './sanitize.js';
import { performWebResearch } from './web-research.js';

export interface AgentOptions {
  /** Context from a previous review failure - must address these issues */
  reworkContext?: string;
  /** Callback for real-time progress updates from agent execution */
  onProgress?: AgentProgressCallback;
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
  options: AgentOptions = {},
  provider?: IProvider
): Promise<AgentResult> {
  const story = parseStory(storyPath);
  const changesMade: string[] = [];

  try {
    // Gather codebase context
    const codebaseContext = await gatherCodebaseContext(sdlcRoot);

    // Sanitize codebase context before including in prompt (prevent prompt injection)
    const sanitizedContext = sanitizeCodebaseContext(codebaseContext);

    // Build the prompt, including rework context if this is a refinement iteration
    let prompt = `Please research how to implement this story:

Title: ${story.frontmatter.title}

Story content:
${story.content}

Codebase context:
${sanitizedContext}`;

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

    const researchContent = provider
      ? await runAgentQuery({
          prompt,
          systemPrompt: RESEARCH_SYSTEM_PROMPT,
          workingDirectory: path.dirname(sdlcRoot),
          onProgress: options.onProgress,
        }, provider)
      : await runAgentQuery({
          prompt,
          systemPrompt: RESEARCH_SYSTEM_PROMPT,
          workingDirectory: path.dirname(sdlcRoot),
          onProgress: options.onProgress,
        });

    // Sanitize research content before storage (prevent ANSI/markdown injection)
    const sanitizedResearch = sanitizeWebResearchContent(researchContent);

    // Determine if this is an iteration (rework context implies previous attempt)
    const isIteration = !!options.reworkContext;
    const iterationNum = isIteration ? (story.frontmatter.refinement_count || 0) + 1 : 1;

    // Write codebase research to section file
    await writeSectionContent(storyPath, 'research', sanitizedResearch, {
      append: isIteration,
      iteration: iterationNum,
      isRework: isIteration,
    });
    changesMade.push('Added codebase research findings');

    // Phase 2: Web Research (conditional)
    if (shouldPerformWebResearch(story, sanitizedContext)) {
      const webResearchContent = await performWebResearch(
        story,
        sanitizedContext,
        path.dirname(sdlcRoot),
        options.onProgress,
        provider
      );

      if (webResearchContent.trim()) {
        // Sanitize web research content before storage (prevent ANSI/markdown injection)
        const sanitizedWebResearch = sanitizeWebResearchContent(webResearchContent);

        // Read existing research and append web findings
        const existingResearch = await readSectionContent(storyPath, 'research');
        const combinedResearch = existingResearch + '\n\n## Web Research Findings\n\n' + sanitizedWebResearch;
        await writeSectionContent(storyPath, 'research', combinedResearch);
        changesMade.push('Added web research findings');
      } else {
        getLogger().info('web-research', 'Web research returned empty - tools may be unavailable');
        changesMade.push('Web research skipped: tools unavailable');
      }
    } else {
      changesMade.push('Web research skipped: no external dependencies detected');
    }

    // Mark research as complete - re-parse to get latest content including web research
    const finalStory = parseStory(storyPath);
    await updateStoryField(finalStory, 'research_complete', true);
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
