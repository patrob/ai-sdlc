import { parseStory, updateStoryField } from '../core/story.js';
import { loadConfig } from '../core/config.js';
import { getEventBus } from '../core/event-bus.js';
import { ghPRChecks, ghPRMerge, extractPRNumber } from '../services/gh-cli.js';
import { AgentResult, MergeConfig } from '../types/index.js';

/**
 * Poll PR checks and auto-merge when all pass.
 *
 * Reads the story's pr_url, polls CI checks, and merges when green.
 * Respects MergeConfig for strategy, timeout, and polling interval.
 */
export async function runMergeAgent(
  storyPath: string,
  sdlcRoot: string
): Promise<AgentResult> {
  const story = parseStory(storyPath);
  const config = loadConfig();
  const mergeConfig: MergeConfig = config.merge ?? {
    enabled: false,
    strategy: 'squash',
    deleteBranchAfterMerge: true,
    checksTimeout: 600000,
    checksPollingInterval: 10000,
    requireAllChecksPassing: true,
  };
  const eventBus = getEventBus();
  const workingDir = storyPath.includes('/worktrees/')
    ? storyPath.split('/worktrees/')[0]
    : undefined;

  // Validate PR URL exists
  const prUrl = story.frontmatter.pr_url;
  if (!prUrl) {
    return {
      success: false,
      story,
      changesMade: [],
      error: 'No PR URL found on story. Create a PR first.',
    };
  }

  // Already merged
  if (story.frontmatter.pr_merged) {
    return {
      success: true,
      story,
      changesMade: ['PR already merged'],
    };
  }

  const prNumber = extractPRNumber(prUrl);
  if (!prNumber) {
    return {
      success: false,
      story,
      changesMade: [],
      error: `Invalid PR URL: ${prUrl}`,
    };
  }

  eventBus.emit({
    type: 'agent_start',
    storyId: story.frontmatter.id,
    phase: 'merge',
    agentId: 'merge-agent',
    timestamp: new Date().toISOString(),
  });

  const startTime = Date.now();

  try {
    // Poll checks until pass, fail, or timeout
    let checksStatus = ghPRChecks(prNumber, workingDir);

    while (checksStatus.anyPending && (Date.now() - startTime) < mergeConfig.checksTimeout) {
      await sleep(mergeConfig.checksPollingInterval);
      checksStatus = ghPRChecks(prNumber, workingDir);
    }

    // Timeout
    if (checksStatus.anyPending) {
      const error = `CI checks timed out after ${mergeConfig.checksTimeout}ms`;
      eventBus.emit({
        type: 'agent_error',
        storyId: story.frontmatter.id,
        phase: 'merge',
        agentId: 'merge-agent',
        error,
        timestamp: new Date().toISOString(),
      });
      return { success: false, story, changesMade: [], error };
    }

    // Checks failed
    if (checksStatus.anyFailed && mergeConfig.requireAllChecksPassing) {
      const failedChecks = checksStatus.checks
        .filter(c => c.conclusion === 'failure' || c.conclusion === 'cancelled')
        .map(c => c.name);
      const error = `CI checks failed: ${failedChecks.join(', ')}`;
      eventBus.emit({
        type: 'agent_error',
        storyId: story.frontmatter.id,
        phase: 'merge',
        agentId: 'merge-agent',
        error,
        timestamp: new Date().toISOString(),
      });
      return { success: false, story, changesMade: [], error };
    }

    // All green — merge
    const mergeOutput = ghPRMerge(
      prNumber,
      mergeConfig.strategy,
      mergeConfig.deleteBranchAfterMerge,
      workingDir
    );

    // Update story frontmatter
    const updatedStory = parseStory(storyPath);
    await updateStoryField(updatedStory, 'pr_merged', true);
    await updateStoryField(updatedStory, 'merged_at', new Date().toISOString());
    if (mergeOutput) {
      await updateStoryField(updatedStory, 'merge_sha', mergeOutput.substring(0, 40));
    }

    const durationMs = Date.now() - startTime;
    eventBus.emit({
      type: 'agent_complete',
      storyId: story.frontmatter.id,
      phase: 'merge',
      agentId: 'merge-agent',
      durationMs,
      success: true,
      timestamp: new Date().toISOString(),
    });

    return {
      success: true,
      story: parseStory(storyPath),
      changesMade: [`PR #${prNumber} merged via ${mergeConfig.strategy}`],
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    eventBus.emit({
      type: 'agent_error',
      storyId: story.frontmatter.id,
      phase: 'merge',
      agentId: 'merge-agent',
      error: errorMsg,
      timestamp: new Date().toISOString(),
    });
    return { success: false, story, changesMade: [], error: errorMsg };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
