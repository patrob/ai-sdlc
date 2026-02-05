/**
 * Consensus Manager
 *
 * Handles the consensus loop when agents disagree.
 * Iterates until consensus is reached or maxIterations,
 * then flags for human review if needed.
 *
 * @module core/consensus-manager
 */

import {
  AgentOutput,
  Concern,
  ConsensusResult,
  DEFAULT_MAX_ITERATIONS,
} from '../types/workflow-config.js';
import { mergeAgentOutputs, MergedResult, findSharedConcerns } from './result-merger.js';
import { getLogger } from './logger.js';

/**
 * Options for consensus seeking
 */
export interface ConsensusOptions {
  /** Maximum iterations before giving up (default: 3) */
  maxIterations?: number;
  /** Callback for progress updates */
  onProgress?: (message: string) => void;
  /** Whether to require unanimous approval (default: true) */
  requireUnanimous?: boolean;
  /** Minimum approval ratio if not requiring unanimous (e.g., 0.66 for 2/3) */
  minApprovalRatio?: number;
}

/**
 * Context for a single consensus iteration
 */
export interface ConsensusIterationContext {
  /** Current iteration number (1-indexed) */
  iteration: number;
  /** Outputs from the previous iteration */
  previousOutputs: AgentOutput[];
  /** All concerns raised in previous iterations */
  allConcerns: Concern[];
  /** Shared concerns (raised by multiple agents) */
  sharedConcerns: Concern[];
  /** Summary of previous iteration */
  previousSummary: string;
}

/**
 * Callback type for executing agents in a consensus round
 */
export type ConsensusAgentExecutor = (
  context: ConsensusIterationContext
) => Promise<AgentOutput[]>;

/**
 * Manages consensus-seeking between multiple agents
 */
export class ConsensusManager {
  private logger = getLogger();
  private options: Required<ConsensusOptions>;

  constructor(options: ConsensusOptions = {}) {
    this.options = {
      maxIterations: options.maxIterations ?? DEFAULT_MAX_ITERATIONS,
      onProgress: options.onProgress ?? (() => {}),
      requireUnanimous: options.requireUnanimous ?? true,
      minApprovalRatio: options.minApprovalRatio ?? 1.0,
    };
  }

  /**
   * Seek consensus among agents through iterative refinement
   *
   * @param initialOutputs - Initial outputs from first agent run
   * @param executor - Function to execute agents with iteration context
   * @returns Consensus result with final outputs and status
   */
  async seekConsensus(
    initialOutputs: AgentOutput[],
    executor: ConsensusAgentExecutor
  ): Promise<ConsensusResult> {
    this.logger.info('consensus-manager', 'Starting consensus process', {
      agentCount: initialOutputs.length,
      maxIterations: this.options.maxIterations,
    });

    let currentOutputs = initialOutputs;
    let iteration = 1;
    const allConcernsHistory: Concern[][] = [];

    // Check if we already have consensus
    let merged = mergeAgentOutputs(currentOutputs);
    if (this.hasConsensus(merged)) {
      this.logger.info('consensus-manager', 'Consensus reached on first iteration', {
        agentCount: currentOutputs.length,
      });
      return this.buildResult(true, iteration, currentOutputs, merged);
    }

    // Iterate until consensus or max iterations
    while (iteration < this.options.maxIterations) {
      iteration++;
      allConcernsHistory.push(merged.concerns);

      this.options.onProgress(
        `Consensus iteration ${iteration}/${this.options.maxIterations}: ` +
        `${merged.dissenting.length} agent(s) have concerns`
      );

      // Build context for next iteration
      const context: ConsensusIterationContext = {
        iteration,
        previousOutputs: currentOutputs,
        allConcerns: allConcernsHistory.flat(),
        sharedConcerns: findSharedConcerns(currentOutputs),
        previousSummary: merged.summary,
      };

      this.logger.debug('consensus-manager', 'Starting iteration', {
        iteration,
        previousConcernCount: merged.concerns.length,
        sharedConcernCount: context.sharedConcerns.length,
      });

      // Execute agents with context
      try {
        currentOutputs = await executor(context);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error('consensus-manager', 'Agent execution failed during consensus', {
          iteration,
          error: errorMessage,
        });

        // Return partial result with error
        return {
          reached: false,
          iterations: iteration,
          finalOutputs: currentOutputs,
          unresolvedConcerns: merged.concerns.filter(c => c.severity === 'blocker'),
          requiresHumanReview: true,
        };
      }

      // Add iteration number to outputs
      currentOutputs = currentOutputs.map(output => ({
        ...output,
        iteration,
      }));

      // Check for consensus
      merged = mergeAgentOutputs(currentOutputs);
      if (this.hasConsensus(merged)) {
        this.logger.info('consensus-manager', 'Consensus reached', {
          iteration,
          agentCount: currentOutputs.length,
        });
        return this.buildResult(true, iteration, currentOutputs, merged);
      }

      // Check if we're making progress (concerns decreasing)
      const previousConcernCount = allConcernsHistory.length > 0
        ? allConcernsHistory[allConcernsHistory.length - 1].length
        : 0;

      if (merged.concerns.length >= previousConcernCount && iteration > 2) {
        this.logger.warn('consensus-manager', 'No progress in consensus - concerns not decreasing', {
          iteration,
          previousConcerns: previousConcernCount,
          currentConcerns: merged.concerns.length,
        });
      }
    }

    // Max iterations reached without consensus
    this.logger.warn('consensus-manager', 'Max iterations reached without consensus', {
      iterations: iteration,
      unresolvedBlockers: merged.concernsBySeverity.blocker.length,
      dissenting: merged.dissenting,
    });

    this.options.onProgress(
      `Consensus not reached after ${iteration} iterations. ` +
      `${merged.concernsBySeverity.blocker.length} unresolved blockers.`
    );

    return this.buildResult(false, iteration, currentOutputs, merged);
  }

  /**
   * Check if consensus has been reached based on current options
   */
  private hasConsensus(merged: MergedResult): boolean {
    // No blockers is a requirement for consensus
    if (merged.hasBlockers) {
      return false;
    }

    // Check approval status
    if (this.options.requireUnanimous) {
      return merged.allApproved;
    }

    // Check approval ratio
    const totalAgents = merged.outputs.length;
    const approvedAgents = merged.outputs.filter(o => o.approved).length;
    const ratio = totalAgents > 0 ? approvedAgents / totalAgents : 0;

    return ratio >= this.options.minApprovalRatio;
  }

  /**
   * Build the final consensus result
   */
  private buildResult(
    reached: boolean,
    iterations: number,
    outputs: AgentOutput[],
    merged: MergedResult
  ): ConsensusResult {
    const unresolvedConcerns = reached
      ? [] // No unresolved concerns if consensus reached
      : merged.concerns.filter(c => c.severity === 'blocker');

    return {
      reached,
      iterations,
      finalOutputs: outputs,
      unresolvedConcerns,
      requiresHumanReview: !reached && unresolvedConcerns.length > 0,
    };
  }
}

/**
 * Format concerns for sharing with agents in next iteration
 */
export function formatConcernsForIteration(context: ConsensusIterationContext): string {
  const parts: string[] = [];

  parts.push(`## Previous Iteration Summary (Iteration ${context.iteration - 1})`);
  parts.push(context.previousSummary);
  parts.push('');

  if (context.sharedConcerns.length > 0) {
    parts.push('## Shared Concerns (Raised by Multiple Reviewers)');
    parts.push('These concerns were identified by multiple reviewers and should be prioritized:');
    for (const concern of context.sharedConcerns) {
      parts.push(`- **[${concern.severity.toUpperCase()}]** ${concern.description}`);
      if (concern.suggestedFix) {
        parts.push(`  - Suggested fix: ${concern.suggestedFix}`);
      }
    }
    parts.push('');
  }

  // Group concerns by agent
  const concernsByAgent = new Map<string, Concern[]>();
  for (const output of context.previousOutputs) {
    if (output.concerns.length > 0) {
      concernsByAgent.set(output.agentId, output.concerns);
    }
  }

  if (concernsByAgent.size > 0) {
    parts.push('## Individual Agent Concerns');
    for (const [agentId, concerns] of concernsByAgent) {
      parts.push(`\n### ${agentId}`);
      for (const concern of concerns) {
        parts.push(`- **[${concern.severity.toUpperCase()}]** ${concern.description}`);
      }
    }
  }

  parts.push('');
  parts.push('## Instructions for This Iteration');
  parts.push('Please review the concerns raised by other reviewers and:');
  parts.push('1. Consider if their concerns are valid and should affect your assessment');
  parts.push('2. Update your approval if concerns have been adequately addressed');
  parts.push('3. Maintain any concerns that are still relevant');
  parts.push('4. Focus on reaching consensus while maintaining quality standards');

  return parts.join('\n');
}

/**
 * Create a simple consensus check without iteration
 * Useful for checking if initial outputs already have consensus
 */
export function checkConsensus(
  outputs: AgentOutput[],
  options: Pick<ConsensusOptions, 'requireUnanimous' | 'minApprovalRatio'> = {}
): { hasConsensus: boolean; summary: string } {
  const merged = mergeAgentOutputs(outputs);

  const requireUnanimous = options.requireUnanimous ?? true;
  const minApprovalRatio = options.minApprovalRatio ?? 1.0;

  // No blockers required
  if (merged.hasBlockers) {
    return {
      hasConsensus: false,
      summary: `Blockers present: ${merged.concernsBySeverity.blocker.length} blocking concern(s)`,
    };
  }

  // Check approval
  if (requireUnanimous) {
    if (merged.allApproved) {
      return {
        hasConsensus: true,
        summary: 'All agents approved with no blockers',
      };
    }
    return {
      hasConsensus: false,
      summary: `Not all agents approved: ${merged.dissenting.join(', ')} have concerns`,
    };
  }

  // Check ratio
  const totalAgents = merged.outputs.length;
  const approvedAgents = merged.outputs.filter(o => o.approved).length;
  const ratio = totalAgents > 0 ? approvedAgents / totalAgents : 0;

  if (ratio >= minApprovalRatio) {
    return {
      hasConsensus: true,
      summary: `Approval ratio ${(ratio * 100).toFixed(0)}% meets threshold ${(minApprovalRatio * 100).toFixed(0)}%`,
    };
  }

  return {
    hasConsensus: false,
    summary: `Approval ratio ${(ratio * 100).toFixed(0)}% below threshold ${(minApprovalRatio * 100).toFixed(0)}%`,
  };
}
