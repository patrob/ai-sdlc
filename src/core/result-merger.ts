/**
 * Result Merger for Parallel Agent Outputs
 *
 * Combines outputs from parallel agent execution into a unified result.
 * Handles concern deduplication, severity ranking, and summary generation.
 *
 * @module core/result-merger
 */

import {
  AgentOutput,
  Concern,
  ConcernSeverity,
  ConcernCategory,
} from '../types/workflow-config.js';

/**
 * Severity ranking for prioritization (lower = more severe)
 */
const SEVERITY_RANK: Record<ConcernSeverity, number> = {
  blocker: 0,
  warning: 1,
  suggestion: 2,
};

/**
 * Merged result from multiple agent outputs
 */
export interface MergedResult {
  /** All agent outputs that contributed to this result */
  outputs: AgentOutput[];
  /** Whether all agents approved */
  allApproved: boolean;
  /** Deduplicated and sorted concerns from all agents */
  concerns: Concern[];
  /** Concerns grouped by category */
  concernsByCategory: Record<ConcernCategory, Concern[]>;
  /** Concerns grouped by severity */
  concernsBySeverity: Record<ConcernSeverity, Concern[]>;
  /** Human-readable summary */
  summary: string;
  /** Whether there are any blockers */
  hasBlockers: boolean;
  /** IDs of agents that did not approve */
  dissenting: string[];
}

/**
 * Merge multiple agent outputs into a unified result
 *
 * @param outputs - Array of agent outputs to merge
 * @returns Merged result with deduplicated concerns and summary
 */
export function mergeAgentOutputs(outputs: AgentOutput[]): MergedResult {
  if (outputs.length === 0) {
    return {
      outputs: [],
      allApproved: true,
      concerns: [],
      concernsByCategory: {
        security: [],
        technical: [],
        product: [],
        general: [],
      },
      concernsBySeverity: {
        blocker: [],
        warning: [],
        suggestion: [],
      },
      summary: 'No agent outputs to merge',
      hasBlockers: false,
      dissenting: [],
    };
  }

  // Collect all concerns
  const allConcerns: Concern[] = [];
  for (const output of outputs) {
    allConcerns.push(...output.concerns);
  }

  // Deduplicate concerns (by description similarity)
  const deduplicatedConcerns = deduplicateConcerns(allConcerns);

  // Sort by severity (most severe first)
  const sortedConcerns = sortConcernsBySeverity(deduplicatedConcerns);

  // Group by category
  const concernsByCategory: Record<ConcernCategory, Concern[]> = {
    security: [],
    technical: [],
    product: [],
    general: [],
  };
  for (const concern of sortedConcerns) {
    concernsByCategory[concern.category].push(concern);
  }

  // Group by severity
  const concernsBySeverity: Record<ConcernSeverity, Concern[]> = {
    blocker: [],
    warning: [],
    suggestion: [],
  };
  for (const concern of sortedConcerns) {
    concernsBySeverity[concern.severity].push(concern);
  }

  // Check approval status
  const allApproved = outputs.every(o => o.approved);
  const dissenting = outputs.filter(o => !o.approved).map(o => o.agentId);
  const hasBlockers = concernsBySeverity.blocker.length > 0;

  // Generate summary
  const summary = generateSummary(outputs, sortedConcerns, allApproved, hasBlockers);

  return {
    outputs,
    allApproved,
    concerns: sortedConcerns,
    concernsByCategory,
    concernsBySeverity,
    summary,
    hasBlockers,
    dissenting,
  };
}

/**
 * Deduplicate concerns based on description similarity
 * Uses exact match for now; could be enhanced with fuzzy matching
 */
function deduplicateConcerns(concerns: Concern[]): Concern[] {
  const seen = new Map<string, Concern>();

  for (const concern of concerns) {
    const key = normalizeDescription(concern.description);

    if (seen.has(key)) {
      // Merge: keep the more severe one
      const existing = seen.get(key)!;
      if (SEVERITY_RANK[concern.severity] < SEVERITY_RANK[existing.severity]) {
        seen.set(key, concern);
      }
    } else {
      seen.set(key, concern);
    }
  }

  return Array.from(seen.values());
}

/**
 * Normalize description for comparison
 */
function normalizeDescription(description: string): string {
  return description
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Sort concerns by severity (most severe first)
 */
function sortConcernsBySeverity(concerns: Concern[]): Concern[] {
  return [...concerns].sort((a, b) => {
    const severityDiff = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (severityDiff !== 0) return severityDiff;

    // Secondary sort by category
    return a.category.localeCompare(b.category);
  });
}

/**
 * Generate a human-readable summary of the merged result
 */
function generateSummary(
  outputs: AgentOutput[],
  concerns: Concern[],
  allApproved: boolean,
  hasBlockers: boolean
): string {
  const agentCount = outputs.length;
  const approvedCount = outputs.filter(o => o.approved).length;

  const parts: string[] = [];

  // Approval status
  if (allApproved) {
    parts.push(`All ${agentCount} agents approved.`);
  } else {
    parts.push(`${approvedCount}/${agentCount} agents approved.`);
  }

  // Concern summary
  if (concerns.length === 0) {
    parts.push('No concerns raised.');
  } else {
    const blockerCount = concerns.filter(c => c.severity === 'blocker').length;
    const warningCount = concerns.filter(c => c.severity === 'warning').length;
    const suggestionCount = concerns.filter(c => c.severity === 'suggestion').length;

    const concernParts: string[] = [];
    if (blockerCount > 0) concernParts.push(`${blockerCount} blocker${blockerCount > 1 ? 's' : ''}`);
    if (warningCount > 0) concernParts.push(`${warningCount} warning${warningCount > 1 ? 's' : ''}`);
    if (suggestionCount > 0) concernParts.push(`${suggestionCount} suggestion${suggestionCount > 1 ? 's' : ''}`);

    parts.push(`Concerns: ${concernParts.join(', ')}.`);
  }

  // Overall status
  if (hasBlockers) {
    parts.push('Blockers must be resolved before proceeding.');
  } else if (!allApproved) {
    parts.push('Review required before proceeding.');
  }

  return parts.join(' ');
}

/**
 * Find concerns that appear in multiple agent outputs
 * Useful for identifying cross-cutting issues
 */
export function findSharedConcerns(outputs: AgentOutput[]): Concern[] {
  const concernCounts = new Map<string, { concern: Concern; count: number }>();

  for (const output of outputs) {
    for (const concern of output.concerns) {
      const key = normalizeDescription(concern.description);
      const existing = concernCounts.get(key);
      if (existing) {
        existing.count++;
        // Upgrade severity if needed
        if (SEVERITY_RANK[concern.severity] < SEVERITY_RANK[existing.concern.severity]) {
          existing.concern = concern;
        }
      } else {
        concernCounts.set(key, { concern, count: 1 });
      }
    }
  }

  // Return concerns that appear more than once
  return Array.from(concernCounts.values())
    .filter(entry => entry.count > 1)
    .map(entry => entry.concern)
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
}

/**
 * Combine content from multiple agent outputs
 * Useful for synthesizing feedback into a single document
 */
export function combineAgentContent(outputs: AgentOutput[], separator = '\n\n---\n\n'): string {
  return outputs
    .map(output => {
      const header = `## ${output.role} (${output.agentId})${output.approved ? ' ✓' : ' ✗'}`;
      return `${header}\n\n${output.content}`;
    })
    .join(separator);
}
