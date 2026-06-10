import type { Story, StoryStatus } from './story.js';
import type { ReviewDecision, ReviewSeverity, ReviewIssue } from './story.js';
import type { ImplementationTask } from './tasks.js';
import type { MergeStrategy } from './config.js';

/**
 * Status of a story during epic execution
 */
export type StoryExecutionStatus = 'queued' | 'in-progress' | 'reviewing' | 'completed' | 'failed' | 'skipped';

/**
 * Options for epic processing from CLI
 */
export interface EpicProcessingOptions {
  epicId: string;
  maxConcurrent?: number;
  dryRun?: boolean;
  force?: boolean;
  keepWorktrees?: boolean;
  /** Enable PR merging (overrides config) */
  merge?: boolean;
  /** Merge strategy (overrides config) */
  mergeStrategy?: MergeStrategy;
}

/**
 * Result of processing a single phase of stories
 * (epic processing variant - different from workflow-config.PhaseExecutionResult)
 * Not exported from barrel to avoid naming conflict with workflow-config version.
 * Import directly from agents.ts when needed.
 */
export interface PhaseExecutionResult {
  phase: number;
  succeeded: string[]; // Story IDs that completed successfully
  failed: string[]; // Story IDs that failed
  skipped: string[]; // Story IDs that were skipped due to dependencies
}

/**
 * Final summary of epic processing
 */
export interface EpicSummary {
  epicId: string;
  totalStories: number;
  completed: number;
  failed: number;
  skipped: number;
  duration: number; // milliseconds
  failedStories: Array<{ storyId: string; error: string }>;
  skippedStories: Array<{ storyId: string; reason: string }>;
}

// Agent types
export interface AgentResult {
  success: boolean;
  story: Story;
  changesMade: string[];
  error?: string;
}

/**
 * FAR scale evaluation for web research findings.
 * Used to assess the quality of external documentation and resources.
 *
 * Scale (1-5):
 * - Factuality: How accurate and verifiable is the information?
 *   1 = Unverified/speculative, 5 = Official documentation or peer-reviewed
 * - Actionability: Can this be directly applied to the task?
 *   1 = Abstract concepts only, 5 = Copy-paste code examples or step-by-step instructions
 * - Relevance: How closely does this match the story requirements?
 *   1 = Tangentially related, 5 = Directly addresses a story acceptance criterion
 * - parsingSucceeded: Indicates whether scores were successfully parsed from LLM output
 *   true = scores came from LLM, false = default scores applied due to parsing failure
 */
export interface FARScore {
  factuality: 1 | 2 | 3 | 4 | 5;
  actionability: 1 | 2 | 3 | 4 | 5;
  relevance: 1 | 2 | 3 | 4 | 5;
  justification: string;
  parsingSucceeded: boolean;
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

/**
 * File content for single-task agent context
 */
export interface FileContent {
  path: string;
  content: string;
}

/**
 * Context for single-task agent execution
 */
export interface TaskContext {
  /** Task to execute */
  task: ImplementationTask;
  /** Only acceptance criteria relevant to task files */
  acceptanceCriteria: string[];
  /** Current content of target files */
  existingFiles: FileContent[];
  /** Brief conventions summary. Should be <500 tokens (~2000 characters). Will be truncated if longer. */
  projectPatterns: string;
  /** Working directory for execution. Required for isolation in orchestrator scenarios where tasks may run in different worktree paths. */
  workingDirectory: string;
}

/**
 * Options for single-task agent execution
 */
export interface SingleTaskAgentOptions {
  /** Log prompt without execution */
  dryRun?: boolean;
  /** Max execution time in milliseconds */
  timeout?: number;
  /** Callback for real-time progress updates */
  onProgress?: (event: any) => void;
}

/**
 * Structured result from single-task agent execution
 */
export interface AgentTaskResult {
  /** Overall success/failure */
  success: boolean;
  /** Task that was executed */
  task: ImplementationTask;
  /** Files modified by agent */
  filesChanged: string[];
  /** Build/lint/test results */
  verificationPassed: boolean;
  /** Error message if failed */
  error?: string;
  /** Raw agent output for debugging */
  agentOutput?: string;
  /** Files modified outside declared scope */
  scopeViolation?: string[];
  /** Missing files or dependencies reported by agent */
  missingDependencies?: string[];
}

/**
 * Information about a failed task in orchestration
 */
export interface FailedTaskInfo {
  /** Task ID that failed */
  taskId: string;
  /** Error message explaining the failure */
  error: string;
  /** Number of attempts made before failure */
  attempts: number;
}

/**
 * Options for orchestrator execution
 */
export interface OrchestratorOptions {
  /** Maximum retry attempts per task (default: 2) */
  maxRetriesPerTask?: number;
  /** Whether to commit after each successful task (default: true) */
  commitAfterEachTask?: boolean;
  /** Stop orchestration on first unrecoverable failure (default: true) */
  stopOnFirstFailure?: boolean;
  /** Dry run mode - log actions without executing (default: false) */
  dryRun?: boolean;
}

/**
 * Result from orchestrator execution
 */
export interface OrchestratorResult {
  /** Overall success (all tasks completed) */
  success: boolean;
  /** Number of tasks successfully completed */
  tasksCompleted: number;
  /** Number of tasks that failed */
  tasksFailed: number;
  /** Number of tasks remaining (not attempted) */
  tasksRemaining: number;
  /** Details of failed tasks */
  failedTasks: FailedTaskInfo[];
  /** Total number of agent invocations (including retries) */
  totalAgentInvocations: number;
}

/**
 * Multi-Process Orchestrator Types
 * Used for concurrent story execution via isolated child processes
 */

/**
 * IPC message types for parent-child communication
 */
export type IPCMessageType =
  | 'status_update'
  | 'health_check'
  | 'health_response'
  | 'shutdown'
  | 'error'
  | 'complete';

/**
 * IPC message structure for bidirectional communication
 */
export interface IPCMessage {
  type: IPCMessageType;
  storyId: string;
  timestamp: number;
  payload?: {
    status?: StoryStatus;
    progress?: number;
    error?: string;
    result?: ProcessExecutionResult;
  };
}

/**
 * Options for multi-process orchestrator execution
 */
export interface ProcessOrchestratorOptions {
  /** Maximum number of concurrent child processes (default: 1) */
  concurrency: number;
  /** Per-story watchdog timeout in milliseconds (default: timeouts.agentTimeout / 600000) */
  storyTimeout?: number;
  /** Milliseconds before SIGKILL after SIGTERM (default: 10000) */
  shutdownTimeout?: number;
  /** Base path for worktrees (default: .ai-sdlc/worktrees) */
  worktreeBasePath?: string;
  /** Keep worktrees after execution (default: false) */
  keepWorktrees?: boolean;
  /** Interval for parent->child health checks in ms (default: 5000) */
  healthCheckIntervalMs?: number;
  /** Consecutive missed health responses before warning (default: 2) */
  healthMissThreshold?: number;
}

/**
 * Result from a single child process execution
 */
export interface ProcessExecutionResult {
  storyId: string;
  success: boolean;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  duration: number; // milliseconds
  error?: string;
}

/**
 * Information about a tracked child process
 */
export interface ChildProcessInfo {
  storyId: string;
  pid: number;
  worktreePath: string;
  startTime: number;
}

/**
 * Process execution status
 */
export type ProcessStatus = 'queued' | 'running' | 'completed' | 'failed' | 'killed';

/**
 * State of the multi-process orchestrator
 */
export interface ProcessOrchestratorState {
  /** Currently running child processes */
  running: Map<string, ChildProcessInfo>;
  /** Stories waiting in queue */
  queued: string[];
  /** Completed story results */
  completed: ProcessExecutionResult[];
  /** Whether shutdown is in progress */
  shuttingDown: boolean;
}

// JSON output types for status command
export interface SerializedStory {
  id: string;
  slug: string;
  title: string;
  status: StoryStatus;
  priority: number;
  type: string;
  created: string;
  labels: string[];
}

export interface StatusJsonOutput {
  version: 1;
  generatedAt: string;
  backlog: SerializedStory[];
  ready: SerializedStory[];
  inProgress: SerializedStory[];
  done: SerializedStory[];
  blocked: SerializedStory[];
  total: number;
}
