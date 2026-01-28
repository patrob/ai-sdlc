/**
 * Types for GitHub Projects v2 integration.
 */

/**
 * Represents an item in a GitHub Project.
 */
export interface ProjectItem {
  /** Issue number */
  issueNumber: number;
  /** Priority field value (e.g., 'P0', 'P1', 'High', 'Medium') */
  priorityValue?: string;
  /** Position in the project view (1-indexed) */
  position?: number;
}

/**
 * Priority data extracted from a GitHub Project.
 */
export interface ProjectPriorityData {
  /** Normalized priority value (10, 20, 30, etc.) */
  priority: number;
  /** Source of the priority value */
  source: PrioritySource;
}

/**
 * Source of the priority value.
 * - 'project-position': Priority derived from issue position in project board
 * - 'project-field': Priority derived from explicit priority field value
 * - 'local': Priority set locally, not synced from project
 */
export type PrioritySource = 'project-position' | 'project-field' | 'local';

/**
 * Configuration for GitHub Projects priority sync.
 */
export interface GitHubProjectsConfig {
  /** Owner of the repository (org or user) */
  owner: string;
  /** Repository name */
  repo: string;
  /** GitHub Projects v2 project number */
  projectNumber: number;
  /** Name of the priority field in the project (if using explicit field) */
  priorityField?: string;
  /** Mapping from priority field values to numeric priorities */
  priorityMapping?: Record<string, number>;
}
