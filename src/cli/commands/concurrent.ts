import path from 'path';

import { detectConflicts } from '../../core/conflict-detector.js';
import { Orchestrator } from '../../core/orchestrator.js';
import type { ProcessExecutionResult,Story } from '../../types/index.js';

export function selectConflictSafeBatch(stories: Story[], concurrency: number, sdlcRoot: string): {
  selectedStories: Story[];
  deferredStories: Story[];
  lowSeverityWarnings: string[];
} {
  const queue = [...stories];
  const selectedStories: Story[] = [];
  const deferredStories: Story[] = [];
  const lowSeverityWarnings: string[] = [];
  const workingDir = path.dirname(path.normalize(sdlcRoot));

  while (queue.length > 0 && selectedStories.length < concurrency) {
    const candidate = queue.shift()!;
    const candidateSet = [...selectedStories, candidate];
    const result = detectConflicts(candidateSet, workingDir, 'main');

    const conflictsForCandidate = result.conflicts.filter((conflict) => {
      const involvesCandidate = conflict.storyA === candidate.frontmatter.id || conflict.storyB === candidate.frontmatter.id;
      const involvesSelected = selectedStories.some(
        (story) => story.frontmatter.id === conflict.storyA || story.frontmatter.id === conflict.storyB
      );
      return involvesCandidate && involvesSelected;
    });

    if (conflictsForCandidate.some((conflict) => conflict.severity === 'high')) {
      deferredStories.push(candidate);
      continue;
    }

    for (const conflict of conflictsForCandidate) {
      if (conflict.severity === 'low') {
        lowSeverityWarnings.push(`${conflict.storyA} ↔ ${conflict.storyB}`);
      }
    }

    selectedStories.push(candidate);
  }

  return {
    selectedStories,
    deferredStories: [...deferredStories, ...queue],
    lowSeverityWarnings,
  };
}

export async function runConcurrentStoryQueue(
  readyStories: Story[],
  concurrency: number,
  sdlcRoot: string,
  keepWorktrees: boolean | undefined,
  c: ReturnType<typeof import('../../core/theme.js').getThemedChalk>
): Promise<ProcessExecutionResult[]> {
  const queue = [...readyStories];
  const allResults: ProcessExecutionResult[] = [];

  while (queue.length > 0) {
    let selectedStories: Story[];
    let deferredStories: Story[];
    let lowSeverityWarnings: string[];

    try {
      const batch = selectConflictSafeBatch(queue, concurrency, sdlcRoot);
      selectedStories = batch.selectedStories;
      deferredStories = batch.deferredStories;
      lowSeverityWarnings = batch.lowSeverityWarnings;
    } catch (error) {
      console.log(c.warning(`⚠️  Conflict detection failed; running batch without gate (${error instanceof Error ? error.message : String(error)})`));
      selectedStories = queue.slice(0, Math.min(concurrency, queue.length));
      deferredStories = queue.slice(selectedStories.length);
      lowSeverityWarnings = [];
    }

    if (selectedStories.length === 0) {
      selectedStories = queue.slice(0, 1);
      deferredStories = queue.slice(1);
    }

    if (lowSeverityWarnings.length > 0) {
      console.log(c.warning(`⚠️  Low-severity overlaps allowed in batch: ${lowSeverityWarnings.join(', ')}`));
    }

    const orchestrator = new Orchestrator({
      concurrency,
      shutdownTimeout: 10000,
      keepWorktrees,
    });
    const results = await orchestrator.execute(selectedStories);
    allResults.push(...results);

    queue.length = 0;
    queue.push(...deferredStories);
  }

  return allResults;
}
