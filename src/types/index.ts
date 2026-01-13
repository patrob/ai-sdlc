// Story types
export type StoryStatus = 'backlog' | 'ready' | 'in-progress' | 'done' | 'blocked';
export type StoryType = 'feature' | 'bug' | 'chore' | 'spike';
export type EffortEstimate = 'small' | 'medium' | 'large';

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
 */
export interface ReviewIssue {
  severity: ReviewIssueSeverity;
  category: string;
  description: string;
  file?: string;
  line?: number;
  suggestedFix?: string;
}

/**
 * Review decision outcomes
 */
export enum ReviewDecision {
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  FAILED = 'FAILED',
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

export interface StoryFrontmatter {
  id: string;
  title: string;
  priority: number;
  status: StoryStatus;
  type: StoryType;
  created: string;
  updated?: string;
  assignee?: string;
  labels: string[];
  estimated_effort?: EffortEstimate;
  // Workflow tracking
  research_complete: boolean;
  plan_complete: boolean;
  implementation_complete: boolean;
  reviews_complete: boolean;
  pr_url?: string;
  branch?: string;
  last_error?: string;
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
  // Blocked tracking
  blocked_reason?: string;
  blocked_at?: string;
  // TDD tracking
  tdd_enabled?: boolean;
  tdd_current_test?: TDDTestCycle;
  tdd_test_history?: TDDTestCycle[];
}

export interface Story {
  path: string;
  slug: string;
  frontmatter: StoryFrontmatter;
  content: string;
}

// Action types for state assessor
export type ActionType =
  | 'refine'
  | 'research'
  | 'plan'
  | 'implement'
  | 'review'
  | 'rework'
  | 'create_pr'
  | 'move_to_done';

export interface Action {
  type: ActionType;
  storyId: string;
  storyPath: string;
  reason: string;
  priority: number;
  context?: any; // Additional context for the action (e.g., review feedback for rework)
}

export interface StateAssessment {
  backlogItems: Story[];
  readyItems: Story[];
  inProgressItems: Story[];
  doneItems: Story[];
  recommendedActions: Action[];
}

// Theme types
export type ThemePreference = 'auto' | 'light' | 'dark' | 'none';

export interface ThemeColors {
  success: any; // Chalk instance
  error: any;
  warning: any;
  info: any;
  dim: any;
  bold: any;
  backlog: any;
  ready: any;
  inProgress: any;
  done: any;
  blocked: any;
  // RPIV phase colors
  phaseRefine: any;
  phaseResearch: any;
  phasePlan: any;
  phaseImplement: any;
  phaseVerify: any;
  // Review action distinction
  reviewAction: any;
  // Phase completion
  phaseComplete: any;
}

// Configuration types
export interface StageGateConfig {
  requireApprovalBeforeImplementation: boolean;
  requireApprovalBeforePR: boolean;
  autoMergeOnApproval: boolean;
}

/**
 * Single test cycle in TDD process
 */
export interface TDDTestCycle {
  test_name: string;
  test_file: string;
  red_timestamp: string;
  green_timestamp?: string;
  refactor_timestamp?: string;
  test_output_red: string;
  test_output_green?: string;
  all_tests_green: boolean;
  cycle_number: number;
}

/**
 * TDD configuration for story execution
 */
export interface TDDConfig {
  enabled: boolean;
  strictMode: boolean;
  maxCycles: number;
  requireApprovalPerCycle: boolean;
}

/**
 * Refinement loop configuration
 */
export interface RefinementConfig {
  maxIterations: number;
  escalateOnMaxAttempts: 'error' | 'manual' | 'skip';
  enableCircuitBreaker: boolean;
}

/**
 * Review flow configuration
 */
export interface ReviewConfig {
  /** Maximum retry attempts before blocking. @default 3 */
  maxRetries: number;
  /** Hard upper bound for maxRetries. @default 10 */
  maxRetriesUpperBound: number;
  autoCompleteOnApproval: boolean;
  autoRestartOnRejection: boolean;
}

/**
 * Timeout configuration for various operations
 */
export interface TimeoutConfig {
  /** Timeout for agent queries in milliseconds. @default 600000 (10 minutes) */
  agentTimeout: number;
  /** Timeout for build commands in milliseconds. @default 120000 (2 minutes) */
  buildTimeout: number;
  /** Timeout for test commands in milliseconds. @default 300000 (5 minutes) */
  testTimeout: number;
}

/**
 * Daemon/watch mode configuration
 */
export interface DaemonConfig {
  /** Enable daemon mode. @default false */
  enabled: boolean;
  /** Polling interval fallback if chokidar fails (ms). @default 5000 */
  pollingInterval: number;
  /** Glob patterns to watch for new stories. @default ['.ai-sdlc/backlog/*.md'] */
  watchPatterns: string[];
  /** Debounce delay for file changes (ms). @default 500 */
  processDelay: number;
  /** Max time to wait for graceful shutdown (ms). @default 30000 */
  shutdownTimeout: number;
  /** Enable Esc+Esc shutdown (Phase 2 feature). @default false */
  enableEscShutdown: boolean;
  /** Max time between Esc presses (ms). @default 500 */
  escTimeout: number;
}

export interface Config {
  sdlcFolder: string;
  stageGates: StageGateConfig;
  refinement: RefinementConfig;
  reviewConfig: ReviewConfig;
  defaultLabels: string[];
  theme: ThemePreference;
  /** Command to run tests (e.g., 'npm test'). If set, runs before review. */
  testCommand?: string;
  /** Command to build/compile (e.g., 'npm run build'). If set, runs before review. */
  buildCommand?: string;
  /**
   * Control which filesystem settings to load for the Agent SDK.
   * - `'user'` - Global user settings (`~/.claude/settings.json`)
   * - `'project'` - Project settings (`.claude/settings.json` and CLAUDE.md)
   * - `'local'` - Local settings (`.claude/settings.local.json`)
   *
   * When omitted or empty array, no filesystem settings are loaded (SDK isolation mode).
   * Must include `'project'` to automatically load CLAUDE.md files from `.claude/` directory.
   *
   * @default []
   */
  settingSources?: SettingSource[];
  /**
   * Timeout configuration for operations.
   * All values are in milliseconds.
   */
  timeouts: TimeoutConfig;
  /**
   * Daemon/watch mode configuration.
   * Controls continuous backlog monitoring.
   */
  daemon?: DaemonConfig;
  /**
   * TDD (Test-Driven Development) configuration.
   * Controls test-first implementation workflow.
   */
  tdd?: TDDConfig;
}

// Agent types
export interface AgentResult {
  success: boolean;
  story: Story;
  changesMade: string[];
  error?: string;
}

/**
 * Review-specific result with structured feedback
 */
export interface ReviewResult extends AgentResult {
  passed: boolean;
  decision: ReviewDecision;
  severity?: ReviewSeverity;
  reviewType: 'code' | 'security' | 'product_owner' | 'combined';
  issues: ReviewIssue[];
  feedback: string;
}

/**
 * Context for rework action
 */
export interface ReworkContext {
  reviewFeedback: ReviewResult;
  targetPhase: 'research' | 'plan' | 'implement';
  iteration: number;
}

// Kanban folder structure
export const KANBAN_FOLDERS = ['backlog', 'ready', 'in-progress', 'done'] as const;
export type KanbanFolder = typeof KANBAN_FOLDERS[number];

// Blocked folder (separate from kanban workflow)
export const BLOCKED_DIR = 'blocked';

// Map status to folder (only for kanban statuses, not 'blocked')
export const STATUS_TO_FOLDER: Record<Exclude<StoryStatus, 'blocked'>, KanbanFolder> = {
  'backlog': 'backlog',
  'ready': 'ready',
  'in-progress': 'in-progress',
  'done': 'done',
};

// Map folder to status
export const FOLDER_TO_STATUS: Record<KanbanFolder, StoryStatus> = {
  'backlog': 'backlog',
  'ready': 'ready',
  'in-progress': 'in-progress',
  'done': 'done',
};

// Export workflow state types
export * from './workflow-state.js';
