import { parseStory, writeStory, updateStoryStatus } from '../core/story.js';
import { runAgentQuery, AgentProgressCallback } from '../core/client.js';
import type { IProvider } from '../providers/types.js';
import { getLogger } from '../core/logger.js';
import { Story, AgentResult } from '../types/index.js';
import path from 'path';
import { AgentOptions } from './research.js';

const REFINEMENT_SYSTEM_PROMPT = `You are a product refinement specialist. Your job is to take raw story ideas from the backlog and transform them into well-defined, actionable user stories.

When refining a story, you should:
1. Clarify the user story format: "As a [user type], I want [goal], so that [benefit]"
2. Add specific, testable acceptance criteria
3. Identify edge cases and constraints
4. Suggest an effort estimate (small/medium/large)
5. Add relevant labels

Output your refined story content in markdown format. Be concise but thorough.

At the end of your response, include:
- effort: small|medium|large
- labels: comma-separated list`;

/**
 * Refinement Agent
 *
 * Takes a raw backlog item and transforms it into a well-defined,
 * ready-to-implement user story.
 */
export async function runRefinementAgent(
  storyPath: string,
  sdlcRoot: string,
  options: AgentOptions = {},
  provider?: IProvider
): Promise<AgentResult> {
  const logger = getLogger();
  const startTime = Date.now();
  const story = parseStory(storyPath);
  const changesMade: string[] = [];

  logger.info('refinement', 'Starting refinement phase', {
    storyId: story.frontmatter.id,
    status: story.frontmatter.status,
  });

  try {
    const prompt = `Please refine this story:

Title: ${story.frontmatter.title}

Current content:
${story.content}

Provide the refined story content including:
1. A clear user story summary
2. Detailed acceptance criteria (as checkboxes)
3. Any constraints or edge cases to consider
4. Suggested effort estimate (small/medium/large)
5. Suggested labels (comma-separated)

Format your response as markdown that will replace the story content.`;

    const refinedContent = provider
      ? await runAgentQuery({
          prompt,
          systemPrompt: REFINEMENT_SYSTEM_PROMPT,
          workingDirectory: path.dirname(sdlcRoot),
          onProgress: options.onProgress,
        }, provider)
      : await runAgentQuery({
          prompt,
          systemPrompt: REFINEMENT_SYSTEM_PROMPT,
          workingDirectory: path.dirname(sdlcRoot),
          onProgress: options.onProgress,
        });

    // Parse effort estimate from the response
    const effortMatch = refinedContent.match(/effort[:\s]*(small|medium|large)/i);
    if (effortMatch) {
      story.frontmatter.estimated_effort = effortMatch[1].toLowerCase() as 'small' | 'medium' | 'large';
      changesMade.push(`Set effort estimate: ${story.frontmatter.estimated_effort}`);
    }

    // Parse labels from the response
    const labelsMatch = refinedContent.match(/labels?[:\s]*([a-z0-9,\s-]+)/i);
    if (labelsMatch) {
      const newLabels = labelsMatch[1].split(',').map(l => l.trim().toLowerCase()).filter(Boolean);
      story.frontmatter.labels = [...new Set([...story.frontmatter.labels, ...newLabels])];
      changesMade.push(`Added labels: ${newLabels.join(', ')}`);
    }

    // Update the story content (clean up the parsed metadata)
    story.content = cleanRefinedContent(refinedContent);
    changesMade.push('Refined story content');

    // Update timestamp
    story.frontmatter.updated = new Date().toISOString().split('T')[0];

    // Write the story
    await writeStory(story);

    // Update status to ready
    const movedStory = await updateStoryStatus(story, 'ready');
    changesMade.push('Updated status to ready');

    logger.info('refinement', 'Refinement phase complete', {
      storyId: story.frontmatter.id,
      durationMs: Date.now() - startTime,
      newStatus: 'ready',
      changesCount: changesMade.length,
    });

    return {
      success: true,
      story: movedStory,
      changesMade,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('refinement', 'Refinement phase failed', {
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

/**
 * Clean up the refined content by removing metadata lines
 */
function cleanRefinedContent(content: string): string {
  // Remove effort and label lines that we've parsed
  return content
    .replace(/^effort[:\s]*(small|medium|large)\s*$/gim, '')
    .replace(/^labels?[:\s]*[a-z0-9,\s-]+\s*$/gim, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
