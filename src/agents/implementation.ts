/**
 * Implementation agent barrel - re-exports all public interfaces and functions
 */

// Re-export from core client
export type { AgentProgressCallback };

// Re-export types and interfaces
export type { TDDPhaseResult, TDDPhaseOptions, TDDImplementationOptions } from './implementation/tdd.js';
export type { RetryAttemptOptions, AttemptOutcome, AttemptHistoryEntry } from './implementation/retry-attempt.js';

// Re-export prompts
export { TDD_SYSTEM_PROMPT, IMPLEMENTATION_SYSTEM_PROMPT, getContentTypeGuidance, RECOVERY_STRATEGIES } from './implementation/prompts.js';

// Re-export test runners
export { runSingleTest, runAllTests, commitIfAllTestsPass } from './implementation/test-runners.js';

// Re-export TDD functions
export {
  executeRedPhase,
  executeGreenPhase,
  executeRefactorPhase,
  recordTDDCycle,
  checkACCoverage,
  runTDDImplementation,
} from './implementation/tdd.js';

// Re-export retry functions
export {
  captureCurrentDiffHash,
  hasChangesOccurred,
  extractChangedFiles,
  buildRetryHistorySection,
  buildRetryPrompt,
} from './implementation/retry.js';

// Re-export test output utilities
export type { ExtractedTestOutput } from './implementation/test-output.js';
export {
  sanitizeTestOutput,
  extractTestFailures,
  truncateTestOutput,
  detectMissingDependencies,
} from './implementation/test-output.js';

// Re-export retry attempt
export { attemptImplementationWithRetries } from './implementation/retry-attempt.js';

// Re-export main agent
export { runImplementationAgent } from './implementation/agent.js';

// Re-export AgentProgressCallback from core
import { AgentProgressCallback } from '../core/client.js';
