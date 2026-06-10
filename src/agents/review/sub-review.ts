import { runAgentQuery } from '../../core/client.js';
import type { IProvider } from '../../providers/types.js';

/**
 * Run a sub-review with a specific prompt
 */
export async function runSubReview(
  story: any,
  systemPrompt: string,
  reviewType: string,
  workingDir: string,
  verificationContext: string = '',
  provider?: IProvider
): Promise<string> {
  try {
    const prompt = `Review this story implementation:

Title: ${story.frontmatter.title}
${verificationContext ? `\n---\n# Build & Test Verification Results\n${verificationContext}\n---\n` : ''}
Full story content:
${story.content}

Provide your ${reviewType} feedback. Be specific and actionable.`;

    return provider
      ? await runAgentQuery({
          prompt,
          systemPrompt,
          workingDirectory: workingDir,
        }, provider)
      : await runAgentQuery({
          prompt,
          systemPrompt,
          workingDirectory: workingDir,
        });
  } catch (error) {
    return `${reviewType} failed: ${error instanceof Error ? error.message : String(error)}`;
  }
}
