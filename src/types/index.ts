// Barrel re-exports for src/types modules
export * from './analysis.js';
export * from './config.js';
export * from './story.js';
export * from './tasks.js';
// Note: agents.js is re-exported via explicit list because agents.js's PhaseExecutionResult
// must shadow the one star-exported from workflow-config.js. Named exports take precedence over
// export *, so PhaseExecutionResult is included here to ensure the agents.js variant is used.
export type {
  AgentResult,
  AgentTaskResult,
  ChildProcessInfo,
  EpicProcessingOptions,
  EpicSummary,
  FailedTaskInfo,
  FARScore,
  FileContent,
  IPCMessage,
  IPCMessageType,
  OrchestratorOptions,
  OrchestratorResult,
  PhaseExecutionResult,
  ProcessExecutionResult,
  ProcessOrchestratorOptions,
  ProcessOrchestratorState,
  ProcessStatus,
  ReviewResult,
  ReworkContext,
  SerializedStory,
  SingleTaskAgentOptions,
  StatusJsonOutput,
  StoryExecutionStatus,
  TaskContext,
} from './agents.js';

// Export workflow state types
export * from './workflow-state.js';

// Export workflow config types for modular agent architecture
export * from './workflow-config.js';
