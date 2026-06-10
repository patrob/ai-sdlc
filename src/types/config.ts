import type {
  CostLimitConfig,
  GroupingConfig,
  NotificationConfig,
} from './analysis.js';
import type { ProjectConfig, SettingSource } from './story.js';

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
  requirePassingTestsForComplete: boolean;
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
 * Plan review configuration
 * Controls the plan review phase that occurs after planning but before implementation.
 * Plan review is a single-pass enrichment step, not a gate.
 */
 
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- retained for Config compatibility and future extensibility
export interface PlanReviewConfig {
  // Plan review is enrichment-only; no iteration or gating config needed.
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
  /** Enable test anti-pattern detection. @default true */
  detectTestAntipatterns?: boolean;
  /** Automatically create PR after review approval in automated mode. @default false (true when --auto flag used) */
  autoCreatePROnApproval?: boolean;
}

/**
 * AI provider selection configuration.
 */
export interface AIProviderConfig {
  /** Registered provider name to use for agent queries. @default 'claude' */
  provider: string;
  /** Optional model name passed through to providers that support model selection. */
  model?: string;
}

/**
 * Implementation retry configuration
 */
export interface ImplementationConfig {
  /** Maximum retry attempts when tests fail. @default 3 */
  maxRetries: number;
  /** Hard upper bound for maxRetries. @default 10 */
  maxRetriesUpperBound: number;
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
 * Retry configuration for API calls
 */
export interface RetryConfig {
  /** Maximum number of retry attempts. @default 3 */
  maxRetries: number;
  /** Initial delay in milliseconds before first retry. @default 2000 */
  initialDelay: number;
  /** Maximum delay in milliseconds between retries. @default 32000 */
  maxDelay: number;
  /** Maximum total duration in milliseconds for all retries. @default 60000 */
  maxTotalDuration: number;
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

/**
 * Information about a git worktree managed by ai-sdlc
 */
export interface WorktreeInfo {
  /** Absolute path to the worktree directory */
  path: string;
  /** Branch name (without refs/heads/ prefix) */
  branch: string;
  /** Story ID extracted from branch name (if ai-sdlc managed) */
  storyId?: string;
  /** Whether the worktree directory exists on filesystem */
  exists: boolean;
}

/**
 * Worktree configuration for isolated story execution
 */
export interface WorktreeConfig {
  /** Enable worktrees by default for story execution. @default false */
  enabled: boolean;
  /** Base path for worktree directories relative to project root. @default '.ai-sdlc/worktrees' */
  basePath: string;
}

/**
 * Epic processing configuration for parallel story execution
 */
export interface EpicConfig {
  /** Maximum parallel stories to execute concurrently. @default 3 */
  maxConcurrent: number;
  /** Preserve worktrees after completion for debugging. @default false */
  keepWorktrees: boolean;
  /** Continue processing other stories when one fails. @default true */
  continueOnFailure: boolean;
}

/**
 * Merge strategy for pull requests
 */
export type MergeStrategy = 'squash' | 'merge' | 'rebase';

/**
 * Merge configuration for automatic PR merging in epic processing
 */
export interface MergeConfig {
  /** Enable automatic PR merging after review approval. @default false */
  enabled: boolean;
  /** Strategy for merging PRs. @default 'squash' */
  strategy: MergeStrategy;
  /** Delete the branch after merge. @default true */
  deleteBranchAfterMerge: boolean;
  /** Timeout in ms for CI checks to complete. @default 600000 (10 min) */
  checksTimeout: number;
  /** Polling interval in ms for checking CI status. @default 10000 (10 sec) */
  checksPollingInterval: number;
  /** Require all CI checks to pass before merging. @default true */
  requireAllChecksPassing: boolean;
}

/**
 * Logging configuration for ai-sdlc operations
 */
export interface LogConfig {
  /** Enable logging to file. @default true */
  enabled: boolean;
  /** Minimum log level to record. @default 'info' */
  level: 'debug' | 'info' | 'warn' | 'error';
  /** Maximum log file size in MB before rotation. @default 10 */
  maxFileSizeMb: number;
  /** Maximum number of log files to retain. @default 5 */
  maxFiles: number;
}

/**
 * Log levels for per-story logging
 */
export type LogLevel = 'INFO' | 'AGENT' | 'ERROR' | 'WARN' | 'DEBUG';

/**
 * File locking options for atomic story updates
 */
export interface LockOptions {
  /** Lock timeout in milliseconds. @default 10000 */
  lockTimeout?: number;
  /** Number of retry attempts with exponential backoff and jitter. @default 5 */
  retries?: number;
  /** Stale lock threshold in milliseconds. @default matches lockTimeout */
  stale?: number;
}


/**
 * GitHub integration configuration
 * Controls PR creation behavior
 */
export interface GithubConfig {
  /** Create PRs as drafts by default */
  createDraftPRs?: boolean;
}

/**
 * Ticketing integration configuration.
 * Controls external ticket provider integration (GitHub Issues, Jira, etc.)
 */
export interface TicketingConfig {
  /** Ticket provider type. @default 'none' */
  provider: 'none' | 'github' | 'jira';
  /** Sync ticket status on story status changes. @default true */
  syncOnRun?: boolean;
  /** Post progress comments to tickets. @default true */
  postProgressComments?: boolean;
  /** GitHub-specific configuration (when provider is 'github') */
  github?: {
    /** Repository in format 'owner/repo'. If not set, uses git remote. */
    repo?: string;
    /** GitHub Projects v2 project number for status sync. */
    projectNumber?: number;
    /** Map story statuses to GitHub labels. */
    statusLabels?: Record<string, string>;
  };
}



export interface Config {
  sdlcFolder: string;
  /**
   * AI provider configuration.
   * Environment variable AI_SDLC_PROVIDER takes precedence over this value.
   */
  ai?: AIProviderConfig;
  stageGates: StageGateConfig;
  refinement: RefinementConfig;
  /**
   * Plan review configuration.
   * Controls the plan review phase that shapes plans before implementation.
   */
  planReview?: PlanReviewConfig;
  reviewConfig: ReviewConfig;
  implementation: ImplementationConfig;
  defaultLabels: string[];
  /**
   * GitHub integration configuration.
   * Controls PR creation and integration behavior.
   */
  github?: GithubConfig;
  /**
   * Optional grouping configurations for story organization.
   * If not specified, defaults to DEFAULT_GROUPINGS (epic, sprint, team).
   * @see DEFAULT_GROUPINGS
   */
  groupings?: GroupingConfig[];
  theme: ThemePreference;
  /** Command to run tests (e.g., 'npm test'). If set, runs before review. */
  testCommand?: string;
  /** Command to build/compile (e.g., 'npm run build'). If set, runs before review. */
  buildCommand?: string;
  /** Command to install dependencies (e.g., 'npm install'). Auto-detected during init. */
  installCommand?: string;
  /** Command to start the application (e.g., 'npm start'). Auto-detected during init. */
  startCommand?: string;
  /** Command to run linting (e.g., 'npm run lint'). Auto-detected during init. */
  lintCommand?: string;
  /** Command to run full verification (e.g., 'make verify'). Auto-detected during init. */
  verifyCommand?: string;
  /**
   * Detected projects within the repository.
   * Supports monorepos with multiple projects in subdirectories.
   * Auto-populated during init if projects are detected in subdirectories.
   */
  projects?: ProjectConfig[];
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
   * Retry configuration for API calls.
   * Controls automatic retry behavior for transient failures.
   */
  retry?: RetryConfig;
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
  /**
   * Worktree configuration for isolated story execution.
   * Controls git worktree creation and location.
   */
  worktree?: WorktreeConfig;
  /**
   * Logging configuration for diagnostics and debugging.
   * Controls log file location, rotation, and verbosity.
   */
  logging?: LogConfig;
  /**
   * Epic processing configuration for parallel story execution.
   * Controls concurrency limits and cleanup behavior.
   */
  epic?: EpicConfig;
  /**
   * Merge configuration for automatic PR merging in epic processing.
   * Controls whether PRs are merged after CI passes.
   */
  merge?: MergeConfig;
  /**
   * Ticketing integration configuration.
   * Controls external ticket provider (GitHub Issues, Jira, etc.)
   * @default { provider: 'none', syncOnRun: true, postProgressComments: true }
   */
  ticketing?: TicketingConfig;
  /**
   * Enable sequential task orchestrator for implementation.
   * When true, implementation runs as separate agents orchestrated sequentially.
   * @default false
   */
  useOrchestrator?: boolean;
  /**
   * Cost limit configuration for controlling AI token spending.
   * Prevents runaway costs from unbounded token consumption.
   * @default undefined (no limits)
   */
  costLimits?: CostLimitConfig;
  /**
   * Notification configuration for human-in-the-loop workflows.
   * Controls how and where approval/feedback notifications are sent.
   * @default { enabled: true, channels: ['console'] }
   */
  notification?: NotificationConfig;
}
