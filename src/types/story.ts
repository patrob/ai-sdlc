import type { TDDTestCycle } from './config.js';

// Story types
export type StoryStatus = 'backlog' | 'ready' | 'in-progress' | 'done' | 'blocked';
export type StoryType = 'feature' | 'bug' | 'chore' | 'spike';
export type EffortEstimate = 'small' | 'medium' | 'large';

/**
 * Detected technology stack for a project.
 * Used during init to auto-configure install/build/test commands.
 */
export type TechStack =
  | 'node-npm' | 'node-yarn' | 'node-pnpm' | 'node-bun'
  | 'python-pip' | 'python-poetry' | 'python-uv'
  | 'rust-cargo' | 'go-mod' | 'ruby-bundler'
  | 'java-maven' | 'java-gradle' | 'dotnet'
  | 'unknown';

/**
 * Configuration for a single project within a repo.
 * Supports monorepos with multiple projects in subdirectories.
 */
export interface ProjectConfig {
  /** Human-readable project name (e.g., "Backend API") */
  name: string;
  /** Path relative to repo root (e.g., "app/" or ".") */
  path: string;
  /** Detected technology stack */
  stack: TechStack;
  /** Project-specific commands */
  commands: {
    install?: string;
    build?: string;
    test?: string;
    start?: string;
    /** Command to run linting (e.g., 'npm run lint') */
    lint?: string;
    /** Command to run full verification (e.g., 'make verify') */
    verify?: string;
  };
}

/**
 * Section types for split story outputs.
 * Each section is stored in a separate file within the story folder.
 */
export type SectionType = 'research' | 'plan' | 'plan_review' | 'review';

/**
 * Content type classification for story implementation.
 * Distinguishes between different kinds of implementation work to enable appropriate validation.
 *
 * - 'code': Requires modifications to TypeScript/JavaScript source files in src/
 * - 'configuration': Only modifies config files (.claude/, .github/, root configs)
 * - 'documentation': Only modifies documentation files (.md, docs/)
 * - 'mixed': Requires both source code AND configuration changes
 *
 * Note: This is separate from StoryType (feature/bug/chore/spike) which describes
 * the nature of the work, not the implementation scope.
 */
export type ContentType = 'code' | 'configuration' | 'documentation' | 'mixed';

/**
 * Source for loading filesystem-based settings from the Agent SDK.
 * - `'user'` - Global user settings (`~/.claude/settings.json`)
 * - `'project'` - Project settings (`.claude/settings.json` and CLAUDE.md)
 * - `'local'` - Local settings (`.claude/settings.local.json`)
 */
export type SettingSource = 'user' | 'project' | 'local';

/**
 * Severity levels for review issues
 */
export type ReviewIssueSeverity = 'blocker' | 'critical' | 'major' | 'minor';

/**
 * Individual issue identified during review
 *
 * The optional `perspectives` field tracks which review perspectives
 * (code quality, security, or product owner) flagged this issue.
 * Used by unified review to indicate multi-perspective issues.
 *
 * Common category values:
 * - 'build': Build failures
 * - 'testing': Test execution failures (tests fail to run or fail assertions)
 * - 'test_alignment': Tests pass but verify outdated behavior (not aligned with new implementation)
 * - 'tdd_violation': TDD cycle violations
 * - 'test_antipattern': Test code duplication or other test anti-patterns
 * - 'implementation': Missing or incomplete source code changes
 * - 'security': Security vulnerabilities and risks
 * - 'code_quality': Code quality and maintainability concerns
 * - 'requirements': Product owner / requirements concerns
 */
export interface ReviewIssue {
  severity: ReviewIssueSeverity;
  category: string;
  description: string;
  file?: string;
  line?: number;
  suggestedFix?: string;
  /**
   * Which review perspectives flagged this issue.
   * - 'code': Code quality and maintainability concerns
   * - 'security': Security vulnerabilities and risks
   * - 'po': Product owner / requirements concerns
   */
  perspectives?: ('code' | 'security' | 'po')[];
}

/**
 * Review decision outcomes
 */
export enum ReviewDecision {
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  FAILED = 'FAILED',
  RECOVERY = 'RECOVERY',
}

/**
 * Severity levels for review rejection
 */
export enum ReviewSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

/**
 * Record of a single review attempt
 */
export interface ReviewAttempt {
  timestamp: string;
  decision: ReviewDecision;
  severity?: ReviewSeverity;
  feedback: string;
  blockers: string[];
  codeReviewPassed: boolean;
  securityReviewPassed: boolean;
  poReviewPassed: boolean;
}

/**
 * Record of a single refinement iteration
 */
export interface RefinementIteration {
  iteration: number;
  agentType: string;
  startedAt: string;
  completedAt?: string;
  reviewFeedback?: string;
  result: 'success' | 'failed' | 'in_progress';
}

/**
 * Single error fingerprint entry for tracking identical errors
 */
export interface ErrorFingerprint {
  /** SHA256 hash of normalized error output */
  hash: string;
  /** Timestamp when this error first occurred */
  firstSeen: string;
  /** Timestamp when this error last occurred */
  lastSeen: string;
  /** Number of consecutive times this exact error has occurred */
  consecutiveCount: number;
  /** First 200 chars of the error for human-readable context */
  errorPreview: string;
}

/**
 * Diagnostic summary generated when a story is blocked.
 * Provides human-readable context for debugging and manual intervention.
 */
export interface FailureDiagnostic {
  /** ISO timestamp when story was blocked */
  blockedAt: string;
  /** Human-readable reason for blocking */
  reason: string;
  /** Last phase the story was in (research, plan, implement, review) */
  lastPhase: string;
  /** Total number of errors/failures encountered */
  errorCount: number;
  /** Most common error pattern (first 200 chars) */
  mostCommonError: string;
  /** Suggested fix or next step (optional, AI-generated) */
  suggestedFix?: string;
  /** Whether identical errors were detected (indicates stuck retry loop) */
  identicalErrorsDetected?: boolean;
  /** Number of consecutive identical errors before blocking */
  consecutiveIdenticalCount?: number;
}

export interface StoryFrontmatter {
  id: string;
  title: string;
  slug: string;
  priority: number; // Numeric with gaps (10, 20, 30...) for easy insertion without renumbering
  status: StoryStatus;
  type: StoryType;
  created: string;
  updated?: string;
  assignee?: string;
  labels: string[];
  estimated_effort?: EffortEstimate;
  /**
   * Story dependencies for epic processing.
   * Array of story IDs that must complete before this story can start.
   */
  dependencies?: string[];
  /**
   * Epic identifier this story belongs to.
   * Used by findStoriesByEpic to discover stories for epic processing.
   */
  epic?: string;
  // Workflow tracking
  research_complete: boolean;
  plan_complete: boolean;
  /**
   * Whether the plan has been reviewed and approved by Tech Lead, Security, and PO.
   * Set to true after plan_review agent approves from all three perspectives.
   * @default false (plan needs review before implementation)
   */
  plan_review_complete?: boolean;
  /**
   * Current iteration number for plan review (1-indexed).
   * Increments each time plan review finds issues and plan is refined.
   * @default undefined (not yet started)
   */
  plan_review_iteration?: number;
  implementation_complete: boolean;
  reviews_complete: boolean;
  pr_url?: string;
  pr_merged?: boolean;
  merge_sha?: string;
  merged_at?: string;
  branch?: string;
  worktree_path?: string;
  last_error?: string;
  // Content type classification for validation
  /**
   * Type of implementation content (code, configuration, documentation, or mixed).
   * Determines which validation rules apply during review.
   * @default 'code' (backward compatibility - requires src/ changes)
   */
  content_type?: ContentType;
  /**
   * Manual override for source code change requirement.
   * When true, forces validation to require src/ changes regardless of content_type.
   * When false, skips src/ validation regardless of content_type.
   * When undefined, validation is based on content_type field.
   */
  requires_source_changes?: boolean;
  // Refinement tracking
  refinement_iterations?: RefinementIteration[];
  refinement_count?: number;
  max_refinement_attempts?: number;
  // Review retry tracking
  retry_count?: number;
  max_retries?: number;
  last_restart_reason?: string;
  last_restart_timestamp?: string;
  review_history?: ReviewAttempt[];
  // Implementation retry tracking
  implementation_retry_count?: number;
  max_implementation_retries?: number;
  // Global recovery tracking
  total_recovery_attempts?: number;
  // Blocked tracking
  blocked_reason?: string;
  blocked_at?: string;
  /**
   * Diagnostic summary generated when story is blocked.
   * Provides context for debugging stuck stories.
   */
  blocked_diagnostic?: FailureDiagnostic;
  // Error fingerprinting for self-healing
  /**
   * History of error fingerprints for detecting identical error loops.
   * Used by implementation retry logic to block early on repeated failures.
   */
  error_history?: ErrorFingerprint[];
  // TDD tracking
  tdd_enabled?: boolean;
  tdd_current_test?: TDDTestCycle;
  tdd_test_history?: TDDTestCycle[];
  // Implementation verification
  last_test_run?: {
    passed: boolean;
    failures: number;
    timestamp: string;
  };
  // External ticket integration (optional)
  ticket_provider?: 'github' | 'jira' | 'linear';
  ticket_id?: string;
  ticket_url?: string;
  ticket_synced_at?: string;
}

export interface Story {
  path: string;
  slug: string;
  frontmatter: StoryFrontmatter;
  content: string;
}

// Kanban folder structure
/**
 * @deprecated Use stories/ folder structure instead. Will be removed in v2.0
 */
export const KANBAN_FOLDERS = ['backlog', 'ready', 'in-progress', 'done'] as const;
export type KanbanFolder = typeof KANBAN_FOLDERS[number];

// Blocked folder (separate from kanban workflow)
export const BLOCKED_DIR = 'blocked';

// New folder-per-story structure constants
export const STORIES_FOLDER = 'stories';
export const STORY_FILENAME = 'story.md';
export const DEFAULT_PRIORITY_GAP = 10;

// Map status to folder (only for kanban statuses, not 'blocked')
/**
 * @deprecated Status is now in frontmatter. Will be removed in v2.0
 */
export const STATUS_TO_FOLDER: Record<Exclude<StoryStatus, 'blocked'>, KanbanFolder> = {
  'backlog': 'backlog',
  'ready': 'ready',
  'in-progress': 'in-progress',
  'done': 'done',
};

// Map folder to status
/**
 * @deprecated Status is now in frontmatter. Will be removed in v2.0
 */
export const FOLDER_TO_STATUS: Record<KanbanFolder, StoryStatus> = {
  'backlog': 'backlog',
  'ready': 'ready',
  'in-progress': 'in-progress',
  'done': 'done',
};
