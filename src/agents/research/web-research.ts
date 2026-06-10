import { type AgentProgressCallback, runAgentQuery } from '../../core/client.js';
import { getLogger } from '../../core/logger.js';
import type { IProvider } from '../../providers/types.js';
import type { Story } from '../../types/index.js';
import { WEB_RESEARCH_PROMPT_TEMPLATE } from './prompts.js';
import { sanitizeCodebaseContext } from './sanitize.js';

/**
 * Perform web research using Context7/WebSearch/WebFetch.
 * Returns formatted markdown with FAR evaluations, or empty string if all tools unavailable.
 */
export async function performWebResearch(
  story: Story,
  codebaseContext: string,
  workingDir: string,
  onProgress?: AgentProgressCallback,
  provider?: IProvider
): Promise<string> {
  const logger = getLogger();
  logger.info('web-research', 'Starting web research phase', { storyId: story.frontmatter.id });

  try {
    const sanitizedContext = sanitizeCodebaseContext(codebaseContext.substring(0, 2000));
    const webResearchPrompt = WEB_RESEARCH_PROMPT_TEMPLATE(
      story.frontmatter.title,
      story.content,
      sanitizedContext
    );

    const webResearchResult = provider
      ? await runAgentQuery({
          prompt: webResearchPrompt,
          systemPrompt: 'You are a web research specialist. Use available tools to find authoritative documentation and best practices.',
          workingDirectory: workingDir,
          onProgress,
        }, provider)
      : await runAgentQuery({
          prompt: webResearchPrompt,
          systemPrompt: 'You are a web research specialist. Use available tools to find authoritative documentation and best practices.',
          workingDirectory: workingDir,
          onProgress,
        });

    // Check if web tools were unavailable
    if (webResearchResult.toLowerCase().includes('web research tools unavailable')) {
      logger.info('web-research', 'Web research tools unavailable, skipping');
      return '';
    }

    logger.info('web-research', 'Web research completed successfully');
    return webResearchResult;

  } catch (error) {
    logger.error('web-research', 'Web research failed', { error });
    // Gracefully degrade - return empty string to continue with codebase-only research
    return '';
  }
}
