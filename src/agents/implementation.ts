/**
 * Implementation agent barrel - re-exports all public interfaces and functions
 */

// Re-export from core client
export type { AgentProgressCallback };

// Re-export types and interfaces
export type { AttemptHistoryEntry,AttemptOutcome, RetryAttemptOptions } from './implementation/retry-attempt.js';
export type { TDDImplementationOptions,TDDPhaseOptions, TDDPhaseResult } from './implementation/tdd.js';

// Re-export prompts
export { getContentTypeGuidance, IMPLEMENTATION_SYSTEM_PROMPT, RECOVERY_STRATEGIES,TDD_SYSTEM_PROMPT } from './implementation/prompts.js';

// Re-export test runners
export { commitIfAllTestsPass,runAllTests, runSingleTest } from './implementation/test-runners.js';

// Re-export TDD functions
export {
  checkACCoverage,
  executeGreenPhase,
  executeRedPhase,
  executeRefactorPhase,
  recordTDDCycle,
  runTDDImplementation,
} from './implementation/tdd.js';

// Re-export retry functions
export {
  buildRetryHistorySection,
  buildRetryPrompt,
  captureCurrentDiffHash,
  extractChangedFiles,
  hasChangesOccurred,
} from './implementation/retry.js';

// Re-export test output utilities
export type { ExtractedTestOutput } from './implementation/test-output.js';
export {
  detectMissingDependencies,
  extractTestFailures,
  sanitizeTestOutput,
  truncateTestOutput,
} from './implementation/test-output.js';

// Re-export retry attempt
export { attemptImplementationWithRetries } from './implementation/retry-attempt.js';

// Re-export main agent
export { runImplementationAgent } from './implementation/agent.js';

// Re-export AgentProgressCallback from core
import { type AgentProgressCallback } from '../core/client.js';
