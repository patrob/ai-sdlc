import { getLogger } from '../../core/logger.js';
import type { Story } from '../../types/index.js';
import { WEB_RESEARCH_EXTERNAL_KEYWORDS,WEB_RESEARCH_INTERNAL_KEYWORDS } from './prompts.js';
import { sanitizeForLogging } from './sanitize.js';

/**
 * Determine if web research would add value based on story content and codebase context.
 *
 * Web research is triggered when:
 * 1. External dependencies are referenced (libraries, APIs, frameworks)
 * 2. Unfamiliar APIs/patterns are mentioned
 * 3. Library-specific documentation is needed
 * 4. Best practices are requested
 *
 * Web research is skipped when:
 * - Topic is purely internal (refactoring, moving code, internal utilities)
 * - No external dependencies mentioned
 */
export function shouldPerformWebResearch(story: Story, codebaseContext: string): boolean {
  const content = story.content.toLowerCase();
  const title = story.frontmatter.title.toLowerCase();
  const combinedText = `${title} ${content}`;

  // Skip if purely internal keywords are dominant
  for (const keyword of WEB_RESEARCH_INTERNAL_KEYWORDS) {
    if (combinedText.includes(keyword)) {
      // Sanitize keyword for logging (prevent log injection)
      getLogger().info('web-research', `Skipping web research: purely internal topic detected (${sanitizeForLogging(keyword)})`);
      return false;
    }
  }

  // Trigger if external library/API/framework mentioned
  for (const keyword of WEB_RESEARCH_EXTERNAL_KEYWORDS) {
    if (combinedText.includes(keyword)) {
      // Sanitize keyword for logging (prevent log injection)
      getLogger().info('web-research', `Web research triggered: external keyword detected (${sanitizeForLogging(keyword)})`);
      return true;
    }
  }

  // Check for package.json mentions (suggests npm dependencies)
  if (codebaseContext.includes('package.json') &&
      (combinedText.includes('npm') || combinedText.includes('install') || combinedText.includes('dependency'))) {
    getLogger().info('web-research', 'Web research triggered: npm dependency context detected');
    return true;
  }

  // Default: skip web research for codebase-only topics
  getLogger().info('web-research', 'Skipping web research: no external dependencies detected');
  return false;
}
