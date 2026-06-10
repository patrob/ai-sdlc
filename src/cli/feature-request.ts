import path from 'path';

import { runAgentQuery } from '../core/client.js';
import { createStory, sanitizeTitle } from '../core/story.js';
import type { IProvider } from '../providers/types.js';
import type { Story } from '../types/index.js';

const GRILL_ME_SYSTEM_PROMPT = `You are applying the /grill-me intake style to prepare an ai-sdlc story.

Stress-test the raw request before it enters the backlog. Walk the design decision tree, resolve dependent decisions in order, provide your recommended answers, and inspect available codebase context when it can answer a question. Do not implement.

This command runs in daemon-friendly, non-interactive mode. Instead of asking one question at a time, produce the clarified request, testable acceptance criteria, and only the remaining questions that still require human input.

Return only markdown in this shape:

## Story Title
Short, action-oriented title

## Clarified Request
One or two paragraphs describing the clarified feature.

## Acceptance Criteria
- [ ] Specific, testable criterion

## Open Questions
- Question that still needs human input, or "None"`;

export interface GrillMeResult {
  title: string;
  content: string;
  rawOutput: string;
}

export interface FeatureRequestOptions {
  grillMe?: boolean;
  provider?: IProvider;
}

/**
 * Clarify a raw feature request with the configured AI provider.
 */
export async function clarifyFeatureRequest(
  featureRequest: string,
  sdlcRoot: string,
  provider?: IProvider
): Promise<GrillMeResult> {
  const workingDirectory = path.dirname(sdlcRoot);
  const prompt = `Clarify this feature request for ai-sdlc:

## Feature Request
${featureRequest.trim()}`;

  const rawOutput = provider
    ? await runAgentQuery({ prompt, systemPrompt: GRILL_ME_SYSTEM_PROMPT, workingDirectory }, provider)
    : await runAgentQuery({ prompt, systemPrompt: GRILL_ME_SYSTEM_PROMPT, workingDirectory });

  const title = extractStoryTitle(rawOutput) || summarizeTitle(featureRequest);
  const content = rawOutput.trim();

  return {
    title,
    content,
    rawOutput,
  };
}

/**
 * Create a backlog story from a feature request, optionally clarified by /grill-me.
 */
export async function createStoryFromFeatureRequest(
  featureRequest: string,
  sdlcRoot: string,
  options: FeatureRequestOptions = {}
): Promise<Story> {
  const request = featureRequest.trim();
  if (!request) {
    throw new Error('Feature request cannot be empty');
  }

  if (options.grillMe) {
    const clarification = await clarifyFeatureRequest(request, sdlcRoot, options.provider);
    const content = `## Original Feature Request

${request}

## /grill-me Clarification

${clarification.content}
`;

    return createStory(clarification.title, sdlcRoot, {}, content);
  }

  const title = summarizeTitle(request);
  const content = `## Feature Request

${request}
`;

  return createStory(title, sdlcRoot, {}, content);
}

function extractStoryTitle(markdown: string): string | null {
  const section = markdown.match(/## Story Title\s*\n+([\s\S]*?)(?=\n##|$)/i);
  if (!section) return null;

  const line = section[1]
    .split('\n')
    .map(value => value.trim())
    .find(value => value.length > 0 && !value.startsWith('-'));

  return line ? sanitizeTitle(line.replace(/^#+\s*/, '')) : null;
}

function summarizeTitle(featureRequest: string): string {
  const firstLine = featureRequest
    .split('\n')
    .map(value => value.trim())
    .find(Boolean) || 'New Feature Request';

  const stripped = firstLine.replace(/^#+\s*/, '');
  return sanitizeTitle(stripped).slice(0, 80) || 'New Feature Request';
}
