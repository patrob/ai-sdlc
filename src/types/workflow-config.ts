/**
 * Workflow Configuration Types
 *
 * Defines the configuration schema for the modular agent architecture.
 * Supports plug-and-play agents with parallel/sequential execution
 * and consensus-based conflict resolution.
 *
 * @module types/workflow-config
 */

/**
 * Composition mode for agent groups
 */
export type CompositionMode = 'sequential' | 'parallel';

/**
 * Consensus requirement for agent groups
 * - 'required': Agents must reach agreement (iterate until consensus or maxIterations)
 * - 'optional': Record disagreements but don't block progress
 * - 'none': No consensus tracking, results are independent
 */
export type ConsensusRequirement = 'required' | 'optional' | 'none';

/**
 * Available agent roles in the system
 *
 * Perspective reviewers are used in multi-agent refinement:
 * - tech_lead_reviewer: Technical feasibility, architecture concerns
 * - security_reviewer: Security requirements, compliance, vulnerabilities
 * - product_owner_reviewer: User value, scope, acceptance criteria
 */
export type AgentRole =
  | 'story_refiner'
  | 'tech_lead_reviewer'
  | 'security_reviewer'
  | 'product_owner_reviewer'
  | 'researcher'
  | 'planner'
  | 'plan_reviewer'
  | 'implementer'
  | 'reviewer';

/**
 * Concern severity levels for agent feedback
 */
export type ConcernSeverity = 'blocker' | 'warning' | 'suggestion';

/**
 * Concern categories for classifying agent feedback
 */
export type ConcernCategory = 'security' | 'technical' | 'product' | 'general';

/**
 * Individual concern raised by an agent during review
 */
export interface Concern {
  /** Severity of the concern */
  severity: ConcernSeverity;
  /** Human-readable description of the concern */
  description: string;
  /** Category for grouping concerns */
  category: ConcernCategory;
  /** Optional file reference if concern is location-specific */
  file?: string;
  /** Optional line number if concern is location-specific */
  line?: number;
  /** Optional suggestion for addressing the concern */
  suggestedFix?: string;
}

/**
 * Output from a single agent execution
 */
export interface AgentOutput {
  /** Unique identifier for this agent instance */
  agentId: string;
  /** Role of the agent that produced this output */
  role: AgentRole;
  /** Main content/feedback from the agent */
  content: string;
  /** List of concerns raised by the agent */
  concerns: Concern[];
  /** Whether the agent approves the current state */
  approved: boolean;
  /** Optional iteration number (for consensus tracking) */
  iteration?: number;
}

/**
 * Result of a consensus-seeking process
 */
export interface ConsensusResult {
  /** Whether consensus was reached among all agents */
  reached: boolean;
  /** Number of iterations performed */
  iterations: number;
  /** Final outputs from all participating agents */
  finalOutputs: AgentOutput[];
  /** Concerns that remain unresolved (blockers if consensus not reached) */
  unresolvedConcerns: Concern[];
  /** Whether human escalation is needed (max iterations reached without consensus) */
  requiresHumanReview: boolean;
}

/**
 * Configuration for a single agent or agent group
 */
export interface AgentConfig {
  /** Unique identifier for this agent configuration */
  id: string;
  /** Role of the agent (required for leaf agents, omitted for groups) */
  role?: AgentRole;
  /** Composition mode for nested agents (sequential or parallel) */
  composition?: CompositionMode;
  /** Consensus requirement for agent groups */
  consensus?: ConsensusRequirement;
  /** Maximum iterations for consensus-seeking (default: 3) */
  maxIterations?: number;
  /** Nested agent configurations (for groups) */
  agents?: AgentConfig[];
}

/**
 * Configuration for a workflow phase
 */
export interface PhaseConfig {
  /** Agent configurations for this phase */
  agents?: AgentConfig[];
  /** Whether this phase is enabled (default: true) */
  enabled?: boolean;
}

/**
 * Root workflow configuration loaded from workflow.yaml
 */
export interface WorkflowConfig {
  /** Configuration version for schema compatibility */
  version: string;
  /** Phase configurations keyed by phase name */
  phases: Record<string, PhaseConfig>;
}

/**
 * Validation error for workflow configuration
 */
export interface WorkflowConfigError {
  /** Path to the invalid field (e.g., 'phases.refine.agents[0].role') */
  path: string;
  /** Human-readable error message */
  message: string;
}

/**
 * Result of validating a workflow configuration
 */
export interface WorkflowConfigValidation {
  /** Whether the configuration is valid */
  valid: boolean;
  /** List of validation errors */
  errors: WorkflowConfigError[];
  /** List of warnings (non-blocking issues) */
  warnings: WorkflowConfigError[];
}

/**
 * Context passed to phase executor
 */
export interface PhaseExecutionContext {
  /** Phase name being executed */
  phase: string;
  /** Absolute path to the story file */
  storyPath: string;
  /** Absolute path to the .ai-sdlc directory */
  sdlcRoot: string;
  /** Optional callback for progress updates */
  onProgress?: (message: string) => void;
}

/**
 * Result of executing a phase with agents
 */
export interface PhaseExecutionResult {
  /** Whether the phase completed successfully */
  success: boolean;
  /** All agent outputs from the phase */
  outputs: AgentOutput[];
  /** Consensus result if applicable */
  consensus?: ConsensusResult;
  /** Error message if phase failed */
  error?: string;
  /** Human-readable summary of what happened */
  summary: string;
}

/**
 * Default workflow configuration when no workflow.yaml exists
 * Maintains backward compatibility with single-agent execution
 */
export const DEFAULT_WORKFLOW_CONFIG: WorkflowConfig = {
  version: '1.0',
  phases: {
    refine: {},
    research: {},
    plan: {},
    plan_review: {},
    implement: {},
    review: {},
  },
};

/**
 * Default maximum iterations for consensus seeking
 */
export const DEFAULT_MAX_ITERATIONS = 3;

/**
 * Default consensus requirement
 */
export const DEFAULT_CONSENSUS: ConsensusRequirement = 'none';

/**
 * Default composition mode
 */
export const DEFAULT_COMPOSITION: CompositionMode = 'sequential';
