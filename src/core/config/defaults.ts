import { type AIProviderConfig, type Config, type DaemonConfig, type EpicConfig, type ImplementationConfig, type LogConfig, type MergeConfig, type NotificationConfig, type PlanReviewConfig, type RetryConfig, type TDDConfig, type TicketingConfig, type TimeoutConfig,type WorktreeConfig } from '../../types/index.js';

export const CONFIG_FILENAME = '.ai-sdlc.json';

/**
 * Default timeout configuration
 */
export const DEFAULT_TIMEOUTS: TimeoutConfig = {
  agentTimeout: 600000,   // 10 minutes
  buildTimeout: 120000,   // 2 minutes
  testTimeout: 300000,    // 5 minutes
};

/**
 * Default daemon configuration
 */
export const DEFAULT_DAEMON_CONFIG: DaemonConfig = {
  enabled: false,
  pollingInterval: 5000,              // 5 seconds
  watchPatterns: ['stories/*/story.md'],
  processDelay: 500,                  // 500ms debounce
  shutdownTimeout: 30000,             // 30 seconds
  enableEscShutdown: false,           // MVP: Ctrl+C only
  escTimeout: 500,                    // 500ms for Esc+Esc
};

/**
 * Default TDD configuration
 */
export const DEFAULT_TDD_CONFIG: TDDConfig = {
  enabled: false,
  strictMode: true,
  maxCycles: 50,
  requireApprovalPerCycle: false,
  requirePassingTestsForComplete: true,
};

/**
 * Default worktree configuration
 */
export const DEFAULT_WORKTREE_CONFIG: WorktreeConfig = {
  enabled: false,
  basePath: '.ai-sdlc/worktrees',
};

/**
 * Default epic configuration
 */
export const DEFAULT_EPIC_CONFIG: EpicConfig = {
  maxConcurrent: 3,
  keepWorktrees: false,
  continueOnFailure: true,
};

/**
 * Default merge configuration for automatic PR merging
 */
export const DEFAULT_MERGE_CONFIG: MergeConfig = {
  enabled: false,
  strategy: 'squash',
  deleteBranchAfterMerge: true,
  checksTimeout: 600000, // 10 minutes
  checksPollingInterval: 10000, // 10 seconds
  requireAllChecksPassing: true,
};

/**
 * Default implementation configuration
 */
export const DEFAULT_IMPLEMENTATION_CONFIG: ImplementationConfig = {
  maxRetries: 3,
  maxRetriesUpperBound: 10,
};

/**
 * Default plan review configuration
 */
export const DEFAULT_PLAN_REVIEW_CONFIG: PlanReviewConfig = {};

/**
 * Default logging configuration
 */
export const DEFAULT_LOGGING_CONFIG: LogConfig = {
  enabled: true,
  level: 'info',
  maxFileSizeMb: 10,
  maxFiles: 5,
};

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelay: 2000,
  maxDelay: 32000,
  maxTotalDuration: 60000,
};

/**
 * Default notification configuration
 */
export const DEFAULT_NOTIFICATION_CONFIG_VALUE: NotificationConfig = {
  enabled: true,
  channels: ['console'],
  filePath: 'notifications.log',
};

/**
 * Default ticketing configuration
 */
export const DEFAULT_TICKETING_CONFIG: TicketingConfig = {
  provider: 'none',
  syncOnRun: true,
  postProgressComments: true,
};

/**
 * Default AI provider configuration
 */
export const DEFAULT_AI_PROVIDER_CONFIG: AIProviderConfig = {
  provider: 'claude',
};

export const DEFAULT_CONFIG: Config = {
  sdlcFolder: '.ai-sdlc',
  ai: { ...DEFAULT_AI_PROVIDER_CONFIG },
  stageGates: {
    requireApprovalBeforeImplementation: false,
    requireApprovalBeforePR: false,
    autoMergeOnApproval: false,
  },
  refinement: {
    maxIterations: 3,
    escalateOnMaxAttempts: 'manual',
    enableCircuitBreaker: true,
  },
  reviewConfig: {
    /** Maximum retry attempts before blocking. @default 3 */
    maxRetries: 3,
    /** Hard upper bound for maxRetries. @default 10 */
    maxRetriesUpperBound: 10,
    autoCompleteOnApproval: true,
    autoRestartOnRejection: true,
    detectTestAntipatterns: true,
    autoCreatePROnApproval: false, // Set to true in automated mode at runtime
  },
  planReview: { ...DEFAULT_PLAN_REVIEW_CONFIG },
  implementation: { ...DEFAULT_IMPLEMENTATION_CONFIG },
  defaultLabels: [],
  groupings: undefined, // Use DEFAULT_GROUPINGS at runtime if not specified
  theme: 'auto',
  // Test and build commands - auto-detected from package.json if present
  testCommand: 'npm test',
  buildCommand: 'npm run build',
  // Agent SDK settings sources - enables Skills discovery from .claude/skills/
  settingSources: ['project'],
  // Timeout configuration
  timeouts: { ...DEFAULT_TIMEOUTS },
  // Retry configuration
  retry: { ...DEFAULT_RETRY_CONFIG },
  // Daemon configuration
  daemon: { ...DEFAULT_DAEMON_CONFIG },
  // TDD configuration
  tdd: { ...DEFAULT_TDD_CONFIG },
  // Worktree configuration
  worktree: { ...DEFAULT_WORKTREE_CONFIG },
  // Logging configuration
  logging: { ...DEFAULT_LOGGING_CONFIG },
  // Epic configuration
  epic: { ...DEFAULT_EPIC_CONFIG },
  // Merge configuration
  merge: { ...DEFAULT_MERGE_CONFIG },
  // Ticketing configuration
  ticketing: { ...DEFAULT_TICKETING_CONFIG },
  // Orchestrator configuration
  useOrchestrator: false,
  // Notification configuration
  notification: { ...DEFAULT_NOTIFICATION_CONFIG_VALUE },
};
