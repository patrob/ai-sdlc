import { parseStory } from '../core/story.js';
import { findAllStories } from '../core/kanban.js';
import { runAgentQuery } from '../core/client.js';
import type { IProvider } from '../providers/types.js';
import { getLogger } from '../core/logger.js';
import { Story } from '../types/index.js';

const IDEATION_SYSTEM_PROMPT = `You are an AI product ideation specialist. You help refine story ideas by:

1. Suggesting specific, testable acceptance criteria
2. Detecting if a story is too large and suggesting decomposition into smaller stories
3. Identifying missing context or ambiguities
4. Checking for duplicates in the existing backlog

When analyzing a story, provide structured output in this format:

## Acceptance Criteria
- [ ] Specific, testable criterion 1
- [ ] Specific, testable criterion 2

## Decomposition (if needed)
If the story is too large (more than 3-5 days of work), suggest how to split it:
- Sub-story 1: brief description
- Sub-story 2: brief description

## Potential Duplicates
List any existing backlog items that overlap significantly.

## Refinement Notes
Any additional context, edge cases, or considerations.

Be concise and actionable. Focus on making the story implementable.`;

export interface IdeationResult {
  acceptanceCriteria: string[];
  suggestedDecomposition: string[] | null;
  potentialDuplicates: string[];
  refinementNotes: string;
  rawOutput: string;
}

/**
 * Run AI-powered ideation on a story title/description.
 *
 * Queries the AI to generate acceptance criteria, detect decomposition
 * opportunities, and check for backlog duplicates.
 *
 * @param title Story title or description
 * @param sdlcRoot Path to .ai-sdlc folder
 * @param provider Optional AI provider (uses default if not specified)
 * @returns Structured ideation result
 */
export async function runIdeation(
  title: string,
  sdlcRoot: string,
  provider?: IProvider
): Promise<IdeationResult> {
  const logger = getLogger();

  // Gather existing backlog for dedup check
  const existingStories = findAllStories(sdlcRoot);
  const backlogSummary = existingStories
    .slice(0, 50) // Limit to prevent token overflow
    .map(s => `- [${s.frontmatter.id}] ${s.frontmatter.title} (${s.frontmatter.status})`)
    .join('\n');

  const prompt = `Analyze this story idea and provide structured refinement:

## New Story
Title: ${title}

## Existing Backlog
${backlogSummary || '(empty backlog)'}

Please provide acceptance criteria, decomposition analysis, duplicate detection, and refinement notes.`;

  logger.info('ideation', 'Running ideation analysis', { title });

  const result = await runAgentQuery(
    { prompt, systemPrompt: IDEATION_SYSTEM_PROMPT },
    provider
  );

  return parseIdeationOutput(result);
}

/**
 * Check if a story title is potentially a duplicate of an existing backlog item.
 * Uses simple text similarity (Jaccard coefficient on word bigrams).
 *
 * @param title New story title
 * @param existingStories Existing stories to check against
 * @param threshold Similarity threshold (0-1). @default 0.4
 * @returns Array of potential duplicate stories with similarity scores
 */
export function findPotentialDuplicates(
  title: string,
  existingStories: Story[],
  threshold: number = 0.4
): Array<{ story: Story; similarity: number }> {
  const titleBigrams = getBigrams(title.toLowerCase());

  const results: Array<{ story: Story; similarity: number }> = [];

  for (const story of existingStories) {
    const existingBigrams = getBigrams(story.frontmatter.title.toLowerCase());
    const similarity = jaccardSimilarity(titleBigrams, existingBigrams);

    if (similarity >= threshold) {
      results.push({ story, similarity });
    }
  }

  return results.sort((a, b) => b.similarity - a.similarity);
}

/**
 * Detect if a story description suggests it should be decomposed.
 * Heuristic: stories mentioning multiple distinct features or having
 * many acceptance criteria likely need splitting.
 *
 * @param content Story content to analyze
 * @returns Whether decomposition is recommended
 */
export function shouldDecompose(content: string): boolean {
  // Count acceptance criteria
  const acMatches = content.match(/- \[[ x]\]/gi);
  const acCount = acMatches?.length || 0;

  // Check for multiple "and" conjunctions suggesting scope creep
  const andCount = (content.match(/\band\b/gi) || []).length;

  // Count distinct feature keywords
  const featureKeywords = ['add', 'create', 'implement', 'build', 'integrate', 'support'];
  const featureCount = featureKeywords.filter(kw =>
    new RegExp(`\\b${kw}\\b`, 'i').test(content)
  ).length;

  // Heuristic: decompose if too many acceptance criteria or feature verbs
  return acCount > 8 || (andCount > 5 && featureCount > 3);
}

/**
 * Generate word bigrams from text
 */
function getBigrams(text: string): Set<string> {
  const words = text.split(/\s+/).filter(w => w.length > 1);
  const bigrams = new Set<string>();

  for (let i = 0; i < words.length - 1; i++) {
    bigrams.add(`${words[i]} ${words[i + 1]}`);
  }

  // Include unigrams for short titles
  for (const word of words) {
    bigrams.add(word);
  }

  return bigrams;
}

/**
 * Calculate Jaccard similarity between two sets
 */
function jaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
  if (setA.size === 0 && setB.size === 0) return 0;

  let intersectionCount = 0;
  for (const item of setA) {
    if (setB.has(item)) {
      intersectionCount++;
    }
  }

  const unionSize = setA.size + setB.size - intersectionCount;
  return unionSize === 0 ? 0 : intersectionCount / unionSize;
}

/**
 * Parse raw AI output into structured ideation result
 */
function parseIdeationOutput(rawOutput: string): IdeationResult {
  const acceptanceCriteria: string[] = [];
  const suggestedDecomposition: string[] = [];
  const potentialDuplicates: string[] = [];
  let refinementNotes = '';

  // Parse acceptance criteria
  const acSection = rawOutput.match(/## Acceptance Criteria\n([\s\S]*?)(?=\n##|$)/);
  if (acSection) {
    const lines = acSection[1].split('\n').filter(l => l.trim().startsWith('- '));
    for (const line of lines) {
      acceptanceCriteria.push(line.replace(/^- \[[ x]\]\s*/i, '').trim());
    }
  }

  // Parse decomposition
  const decompSection = rawOutput.match(/## Decomposition[\s\S]*?\n([\s\S]*?)(?=\n##|$)/);
  if (decompSection) {
    const lines = decompSection[1].split('\n').filter(l => l.trim().startsWith('- '));
    for (const line of lines) {
      suggestedDecomposition.push(line.replace(/^-\s*/, '').trim());
    }
  }

  // Parse duplicates
  const dupSection = rawOutput.match(/## Potential Duplicates\n([\s\S]*?)(?=\n##|$)/);
  if (dupSection) {
    const lines = dupSection[1].split('\n').filter(l => l.trim().startsWith('- '));
    for (const line of lines) {
      potentialDuplicates.push(line.replace(/^-\s*/, '').trim());
    }
  }

  // Parse refinement notes
  const notesSection = rawOutput.match(/## Refinement Notes\n([\s\S]*?)$/);
  if (notesSection) {
    refinementNotes = notesSection[1].trim();
  }

  return {
    acceptanceCriteria,
    suggestedDecomposition: suggestedDecomposition.length > 0 ? suggestedDecomposition : null,
    potentialDuplicates,
    refinementNotes,
    rawOutput,
  };
}
