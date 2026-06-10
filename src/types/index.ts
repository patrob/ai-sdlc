// Barrel re-exports for src/types modules
export * from './story.js';
export * from './tasks.js';
export * from './config.js';
export * from './analysis.js';
// Note: agents.js is re-exported via explicit list because agents.js's PhaseExecutionResult
// must shadow the one star-exported from workflow-config.js. Named exports take precedence over
// export *, so PhaseExecutionResult is included here to ensure the agents.js variant is used.
export type {
  StoryExecutionStatus,
  EpicProcessingOptions,
  PhaseExecutionResult,
  EpicSummary,
  AgentResult,
  FARScore,
  ReviewResult,
  ReworkContext,
  FileContent,
  TaskContext,
  SingleTaskAgentOptions,
  AgentTaskResult,
  FailedTaskInfo,
  OrchestratorOptions,
  OrchestratorResult,
  IPCMessageType,
  IPCMessage,
  ProcessOrchestratorOptions,
  ProcessExecutionResult,
  ChildProcessInfo,
  ProcessStatus,
  ProcessOrchestratorState,
  SerializedStory,
  StatusJsonOutput,
} from './agents.js';

// Export workflow state types
export * from './workflow-state.js';

// Export workflow config types for modular agent architecture
export * from './workflow-config.js';
