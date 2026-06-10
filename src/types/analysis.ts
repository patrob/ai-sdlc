import type { StoryStatus } from './story.js';

/**
 * Severity level for conflict detection between stories
 */
export type ConflictSeverity = 'high' | 'medium' | 'low' | 'none';

/**
 * Analysis of potential conflicts between two stories
 */
export interface ConflictAnalysis {
  /** ID of the first story */
  storyA: string;
  /** ID of the second story */
  storyB: string;
  /** Files modified by both stories */
  sharedFiles: string[];
  /** Directories containing modifications from both stories */
  sharedDirectories: string[];
  /** Severity level of the conflict */
  severity: ConflictSeverity;
  /** Human-readable recommendation for handling the conflict */
  recommendation: string;
}

/**
 * Result of conflict detection analysis across multiple stories
 */
export interface ConflictDetectionResult {
  /** Pairwise conflict analysis for all story combinations */
  conflicts: ConflictAnalysis[];
  /** Whether it's safe to run all stories concurrently (false if any high-severity conflicts) */
  safeToRunConcurrently: boolean;
  /** Human-readable summary of the conflict detection results */
  summary: string;
}

/**
 * Result of pre-flight conflict check before starting story work
 */
export interface PreFlightResult {
  /** Whether to proceed with story execution */
  proceed: boolean;
  /** Warning messages to display to the user */
  warnings: string[];
}

/**
 * Grouping dimension type for story organization.
 * - 'thematic': Epic-based grouping (e.g., epic-ticketing-integration)
 * - 'temporal': Time-based grouping (e.g., sprint-2024-q1)
 * - 'structural': Team/component-based grouping (e.g., team-backend)
 */
export type GroupingDimension = 'thematic' | 'temporal' | 'structural';

/**
 * Cardinality constraint for grouping labels.
 * - 'single': Story can only have one label from this dimension (e.g., one epic)
 * - 'many': Story can have multiple labels from this dimension (e.g., multiple teams)
 */
export type GroupingCardinality = 'single' | 'many';

/**
 * Configuration for a single grouping dimension.
 * Defines label conventions and optional external system mappings.
 *
 * @example
 * {
 *   dimension: 'thematic',
 *   prefix: 'epic-',
 *   cardinality: 'single',
 *   externalMapping: {
 *     system: 'jira',
 *     field: 'epic'
 *   }
 * }
 */
export interface GroupingConfig {
  /** Dimension type for this grouping */
  dimension: GroupingDimension;
  /** Label prefix for this dimension (e.g., 'epic-', 'sprint-') */
  prefix: string;
  /** Cardinality constraint: 'single' or 'many' */
  cardinality: GroupingCardinality;
  /**
   * Optional external system mapping for future ticketing integration.
   * @future Used for S-0073+ ticketing integration stories.
   * Configuration is stored but not yet implemented.
   */
  externalMapping?: {
    system: string;
    field: string;
  };
}

/**
 * Summary of stories grouped by a specific dimension.
 * Includes story counts and status breakdowns.
 */
export interface GroupingSummary {
  /** Grouping identifier (e.g., 'ticketing-integration' from 'epic-ticketing-integration') */
  id: string;
  /** Full label including prefix (e.g., 'epic-ticketing-integration') */
  label: string;
  /** Dimension type */
  dimension: GroupingDimension;
  /** Total number of stories with this label */
  storyCount: number;
  /** Breakdown of stories by status */
  statusBreakdown: Record<StoryStatus, number>;
}

/**
 * Default grouping configurations for out-of-box conventions.
 * - epic-*: Thematic grouping (single epic per story)
 * - sprint-*: Temporal grouping (single sprint per story)
 * - team-*: Structural grouping (multiple teams allowed)
 */
export const DEFAULT_GROUPINGS: GroupingConfig[] = [
  {
    dimension: 'thematic',
    prefix: 'epic-',
    cardinality: 'single',
  },
  {
    dimension: 'temporal',
    prefix: 'sprint-',
    cardinality: 'single',
  },
  {
    dimension: 'structural',
    prefix: 'team-',
    cardinality: 'many',
  },
];

/**
 * Cost limit configuration for controlling AI token spending.
 * Prevents runaway costs from unbounded token consumption.
 */
export interface CostLimitConfig {
  /** Maximum total tokens per story before auto-pause. @default undefined (no limit) */
  perStoryMaxTokens?: number;
  /** Maximum total tokens per run (all stories) before auto-pause. @default undefined (no limit) */
  perRunMaxTokens?: number;
  /** Percentage of limit at which to emit a warning (0-100). @default 80 */
  warningThresholdPercent?: number;
}

/**
 * Notification channel type for human-in-the-loop events
 */
export type NotificationChannelType = 'console' | 'file';

/**
 * Notification configuration for human-in-the-loop workflows
 */
export interface NotificationConfig {
  /** Enable notifications. @default true */
  enabled: boolean;
  /** Channels to send notifications through. @default ['console'] */
  channels: NotificationChannelType[];
  /** File path for file-based notifications (relative to sdlcRoot). @default 'notifications.log' */
  filePath?: string;
}
