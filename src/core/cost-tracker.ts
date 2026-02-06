/**
 * Cost & Duration Tracker
 *
 * Accumulates token usage and duration metrics per-agent, per-story, per-phase.
 * Supports configurable cost limits with warning thresholds.
 */

import type { TokenUsage } from '../providers/types.js';
import type { CostLimitConfig } from '../types/index.js';

/**
 * Record of a single usage entry
 */
export interface UsageEntry {
  storyId: string;
  phase: string;
  agentId: string;
  usage: TokenUsage;
  durationMs: number;
  model?: string;
  timestamp: string;
}

/**
 * Aggregated cost summary
 */
export interface CostSummary {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalDurationMs: number;
  entryCount: number;
}

/**
 * Result of a cost limit check
 */
export interface CostLimitCheck {
  /** Whether the limit has been exceeded */
  exceeded: boolean;
  /** Whether the warning threshold has been reached */
  warning: boolean;
  /** Current token count */
  currentTokens: number;
  /** The configured limit (undefined if no limit) */
  limitTokens?: number;
  /** Percentage of limit used (0-100) */
  percentUsed: number;
}

/**
 * Tracks token usage and costs across the SDLC pipeline.
 */
export class CostTracker {
  private entries: UsageEntry[] = [];
  private costLimits?: CostLimitConfig;

  constructor(costLimits?: CostLimitConfig) {
    this.costLimits = costLimits;
  }

  /**
   * Record a usage entry from a provider query
   */
  addUsage(
    storyId: string,
    phase: string,
    agentId: string,
    usage: TokenUsage,
    durationMs: number,
    model?: string
  ): void {
    this.entries.push({
      storyId,
      phase,
      agentId,
      usage,
      durationMs,
      model,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Get aggregated cost for a specific story
   */
  getStoryCost(storyId: string): CostSummary {
    return this.aggregate(this.entries.filter(e => e.storyId === storyId));
  }

  /**
   * Get aggregated cost for a specific phase within a story
   */
  getPhaseCost(storyId: string, phase: string): CostSummary {
    return this.aggregate(
      this.entries.filter(e => e.storyId === storyId && e.phase === phase)
    );
  }

  /**
   * Get total cost across all stories
   */
  getTotalCost(): CostSummary {
    return this.aggregate(this.entries);
  }

  /**
   * Get cost breakdown grouped by story
   */
  getCostByStory(): Map<string, CostSummary> {
    const storyIds = new Set(this.entries.map(e => e.storyId));
    const result = new Map<string, CostSummary>();
    for (const storyId of storyIds) {
      result.set(storyId, this.getStoryCost(storyId));
    }
    return result;
  }

  /**
   * Check if cost limits have been exceeded for a story
   */
  checkStoryLimit(storyId: string): CostLimitCheck {
    const limit = this.costLimits?.perStoryMaxTokens;
    const summary = this.getStoryCost(storyId);
    return this.buildLimitCheck(summary.totalTokens, limit);
  }

  /**
   * Check if the total run cost limit has been exceeded
   */
  checkRunLimit(): CostLimitCheck {
    const limit = this.costLimits?.perRunMaxTokens;
    const summary = this.getTotalCost();
    return this.buildLimitCheck(summary.totalTokens, limit);
  }

  /**
   * Get all usage entries (for serialization/reporting)
   */
  getEntries(): readonly UsageEntry[] {
    return this.entries;
  }

  /**
   * Update cost limit configuration
   */
  setCostLimits(costLimits: CostLimitConfig): void {
    this.costLimits = costLimits;
  }

  /**
   * Reset all tracked usage data
   */
  reset(): void {
    this.entries = [];
  }

  private aggregate(entries: UsageEntry[]): CostSummary {
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalTokens = 0;
    let totalDurationMs = 0;

    for (const entry of entries) {
      totalInputTokens += entry.usage.inputTokens;
      totalOutputTokens += entry.usage.outputTokens;
      totalTokens += entry.usage.totalTokens;
      totalDurationMs += entry.durationMs;
    }

    return {
      totalInputTokens,
      totalOutputTokens,
      totalTokens,
      totalDurationMs,
      entryCount: entries.length,
    };
  }

  private buildLimitCheck(currentTokens: number, limit?: number): CostLimitCheck {
    if (limit === undefined) {
      return {
        exceeded: false,
        warning: false,
        currentTokens,
        limitTokens: undefined,
        percentUsed: 0,
      };
    }

    const percentUsed = limit > 0 ? (currentTokens / limit) * 100 : 0;
    const warningThreshold = this.costLimits?.warningThresholdPercent ?? 80;

    return {
      exceeded: currentTokens >= limit,
      warning: percentUsed >= warningThreshold,
      currentTokens,
      limitTokens: limit,
      percentUsed: Math.round(percentUsed * 100) / 100,
    };
  }
}

// Singleton instance
let instance: CostTracker | undefined;

/**
 * Get the singleton CostTracker instance
 */
export function getCostTracker(): CostTracker {
  if (!instance) {
    instance = new CostTracker();
  }
  return instance;
}

/**
 * Initialize the CostTracker with cost limits from config
 */
export function initCostTracker(costLimits?: CostLimitConfig): CostTracker {
  instance = new CostTracker(costLimits);
  return instance;
}

/**
 * Reset the singleton (for testing)
 */
export function resetCostTracker(): void {
  instance = undefined;
}
