/**
 * Phase Executor
 *
 * Orchestrates agent execution within a phase based on configuration.
 * Handles sequential, parallel, and nested compositions with
 * consensus-based conflict resolution.
 *
 * @module core/phase-executor
 */

import {
  WorkflowConfig,
  PhaseConfig,
  AgentConfig,
  AgentOutput,
  PhaseExecutionContext,
  PhaseExecutionResult,
  DEFAULT_WORKFLOW_CONFIG,
  DEFAULT_COMPOSITION,
  DEFAULT_CONSENSUS,
  DEFAULT_MAX_ITERATIONS,
  ConsensusResult,
  Concern,
} from '../types/workflow-config.js';
import { loadWorkflowConfig, getPhaseConfig, hasCustomAgents } from './workflow-config.js';
import { mergeAgentOutputs, MergedResult } from './result-merger.js';
import {
  ConsensusManager,
  ConsensusIterationContext,
  formatConcernsForIteration,
} from './consensus-manager.js';
import { getLogger } from './logger.js';
import type { IProvider } from '../providers/types.js';
import { ProviderRegistry } from '../providers/registry.js';

// Import perspective reviewers
import {
  runTechLeadReviewer,
  runSecurityReviewer,
  runProductOwnerReviewer,
} from '../agents/perspectives/index.js';

// Import standard agents
import { runRefinementAgent } from '../agents/refinement.js';
import { runResearchAgent } from '../agents/research.js';
import { runPlanningAgent } from '../agents/planning.js';
import { runPlanReviewAgent } from '../agents/plan-review.js';
import { runImplementationAgent } from '../agents/implementation.js';
import { runReviewAgent } from '../agents/review.js';

/**
 * Map of agent roles to their executor functions
 */
type AgentExecutorFn = (
  storyPath: string,
  sdlcRoot: string,
  options: { onProgress?: (msg: string) => void; iterationContext?: ConsensusIterationContext },
  provider?: IProvider
) => Promise<AgentOutput>;

/**
 * Options for phase execution
 */
export interface PhaseExecutorOptions {
  /** AI provider to use (defaults to registry default) */
  provider?: IProvider;
  /** Callback for progress updates */
  onProgress?: (message: string) => void;
}

/**
 * Orchestrates agent execution within workflow phases
 */
export class PhaseExecutor {
  private config: WorkflowConfig;
  private sdlcRoot: string;
  private logger = getLogger();

  constructor(sdlcRoot: string, config?: WorkflowConfig) {
    this.sdlcRoot = sdlcRoot;
    this.config = config ?? loadWorkflowConfig(sdlcRoot);
  }

  /**
   * Execute a phase with its configured agents
   *
   * @param phase - Phase name to execute
   * @param context - Execution context
   * @param options - Execution options
   * @returns Phase execution result
   */
  async execute(
    phase: string,
    context: PhaseExecutionContext,
    options: PhaseExecutorOptions = {}
  ): Promise<PhaseExecutionResult> {
    const phaseConfig = getPhaseConfig(this.config, phase);

    this.logger.info('phase-executor', `Executing phase: ${phase}`, {
      storyPath: context.storyPath,
      hasCustomAgents: hasCustomAgents(phaseConfig),
    });

    const onProgress = options.onProgress ?? context.onProgress ?? (() => {});

    // If no custom agents, use default behavior (backward compatible)
    if (!hasCustomAgents(phaseConfig)) {
      return this.executeDefaultAgent(phase, context, options);
    }

    // Execute configured agents
    const agents = phaseConfig.agents!;
    const allOutputs: AgentOutput[] = [];
    let consensusResult: ConsensusResult | undefined;

    for (const agentConfig of agents) {
      onProgress(`Executing agent: ${agentConfig.id}`);

      if (this.isAgentGroup(agentConfig)) {
        // Execute agent group (sequential or parallel)
        const groupResult = await this.executeAgentGroup(
          agentConfig,
          context,
          options
        );
        allOutputs.push(...groupResult.outputs);

        // If this group required consensus, track it
        if (agentConfig.consensus === 'required' && groupResult.consensus) {
          consensusResult = groupResult.consensus;

          // If consensus not reached and has blockers, fail early
          if (!groupResult.consensus.reached && groupResult.consensus.requiresHumanReview) {
            return {
              success: false,
              outputs: allOutputs,
              consensus: consensusResult,
              error: 'Consensus not reached - human review required',
              summary: this.buildSummary(allOutputs, consensusResult),
            };
          }
        }
      } else {
        // Execute single agent
        const output = await this.executeSingleAgent(
          agentConfig,
          context,
          options
        );
        allOutputs.push(output);

        // Check for blocking concerns
        if (this.hasBlockingConcerns(output)) {
          this.logger.warn('phase-executor', 'Agent raised blocking concerns', {
            agentId: agentConfig.id,
            blockerCount: output.concerns.filter(c => c.severity === 'blocker').length,
          });
        }
      }
    }

    // Determine overall success
    const merged = mergeAgentOutputs(allOutputs);
    const success = merged.allApproved && !merged.hasBlockers;

    return {
      success,
      outputs: allOutputs,
      consensus: consensusResult,
      summary: this.buildSummary(allOutputs, consensusResult),
    };
  }

  /**
   * Execute the default agent for a phase (backward compatible)
   */
  private async executeDefaultAgent(
    phase: string,
    context: PhaseExecutionContext,
    options: PhaseExecutorOptions
  ): Promise<PhaseExecutionResult> {
    const provider = options.provider ?? ProviderRegistry.getDefault();
    const onProgress = options.onProgress ?? context.onProgress;

    this.logger.debug('phase-executor', `Executing default agent for phase: ${phase}`);

    try {
      // Map phase to default agent
      const result = await this.runDefaultPhaseAgent(
        phase,
        context.storyPath,
        { onProgress },
        provider
      );

      // Convert AgentResult to AgentOutput
      const output: AgentOutput = {
        agentId: `default-${phase}`,
        role: this.phaseToRole(phase),
        content: result.changesMade.join('\n'),
        concerns: [],
        approved: result.success,
      };

      return {
        success: result.success,
        outputs: [output],
        summary: result.success
          ? `Phase ${phase} completed successfully`
          : `Phase ${phase} failed: ${result.error}`,
        error: result.error,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        outputs: [],
        error: errorMessage,
        summary: `Phase ${phase} failed: ${errorMessage}`,
      };
    }
  }

  /**
   * Execute an agent group (sequential or parallel)
   */
  private async executeAgentGroup(
    groupConfig: AgentConfig,
    context: PhaseExecutionContext,
    options: PhaseExecutorOptions
  ): Promise<{ outputs: AgentOutput[]; consensus?: ConsensusResult }> {
    const composition = groupConfig.composition ?? DEFAULT_COMPOSITION;
    const consensus = groupConfig.consensus ?? DEFAULT_CONSENSUS;
    const maxIterations = groupConfig.maxIterations ?? DEFAULT_MAX_ITERATIONS;
    const nestedAgents = groupConfig.agents ?? [];

    this.logger.info('phase-executor', `Executing agent group: ${groupConfig.id}`, {
      composition,
      consensus,
      agentCount: nestedAgents.length,
    });

    if (composition === 'parallel') {
      // Execute all agents in parallel
      const outputs = await this.executeAgentsParallel(nestedAgents, context, options);

      // Handle consensus if required
      if (consensus === 'required') {
        const consensusManager = new ConsensusManager({
          maxIterations,
          onProgress: options.onProgress ?? context.onProgress,
        });

        const consensusResult = await consensusManager.seekConsensus(
          outputs,
          async (iterContext) => {
            // Re-execute agents with iteration context
            return this.executeAgentsParallel(nestedAgents, context, {
              ...options,
              iterationContext: iterContext,
            });
          }
        );

        return {
          outputs: consensusResult.finalOutputs,
          consensus: consensusResult,
        };
      }

      return { outputs };
    } else {
      // Sequential execution
      const outputs: AgentOutput[] = [];
      for (const agentConfig of nestedAgents) {
        const output = await this.executeSingleAgent(agentConfig, context, options);
        outputs.push(output);

        // Stop if agent has blockers (unless consensus is none)
        if (consensus !== 'none' && this.hasBlockingConcerns(output)) {
          this.logger.warn('phase-executor', 'Sequential execution stopped due to blockers', {
            agentId: agentConfig.id,
          });
          break;
        }
      }

      return { outputs };
    }
  }

  /**
   * Execute multiple agents in parallel
   */
  private async executeAgentsParallel(
    agents: AgentConfig[],
    context: PhaseExecutionContext,
    options: PhaseExecutorOptions & { iterationContext?: ConsensusIterationContext }
  ): Promise<AgentOutput[]> {
    const promises = agents.map(agent =>
      this.executeSingleAgent(agent, context, options)
    );

    return Promise.all(promises);
  }

  /**
   * Execute a single agent
   */
  private async executeSingleAgent(
    agentConfig: AgentConfig,
    context: PhaseExecutionContext,
    options: PhaseExecutorOptions & { iterationContext?: ConsensusIterationContext }
  ): Promise<AgentOutput> {
    const role = agentConfig.role;
    if (!role) {
      return {
        agentId: agentConfig.id,
        role: 'story_refiner', // fallback
        content: 'Error: Agent configuration missing role',
        concerns: [{
          severity: 'blocker',
          category: 'general',
          description: `Agent ${agentConfig.id} has no role configured`,
        }],
        approved: false,
      };
    }

    const provider = options.provider ?? ProviderRegistry.getDefault();
    const onProgress = options.onProgress ?? context.onProgress;

    try {
      // Execute the appropriate reviewer based on role
      // Note: onProgress types differ between internal use and agent APIs
      // We use 'as any' to bridge the type mismatch
      switch (role) {
        case 'tech_lead_reviewer': {
          const result = await runTechLeadReviewer(
            context.storyPath,
            this.sdlcRoot,
            { onProgress: onProgress as any },
            provider
          );
          return {
            ...result.output,
            agentId: agentConfig.id,
            iteration: options.iterationContext?.iteration,
          };
        }

        case 'security_reviewer': {
          const result = await runSecurityReviewer(
            context.storyPath,
            this.sdlcRoot,
            { onProgress: onProgress as any },
            provider
          );
          return {
            ...result.output,
            agentId: agentConfig.id,
            iteration: options.iterationContext?.iteration,
          };
        }

        case 'product_owner_reviewer': {
          const result = await runProductOwnerReviewer(
            context.storyPath,
            this.sdlcRoot,
            { onProgress: onProgress as any },
            provider
          );
          return {
            ...result.output,
            agentId: agentConfig.id,
            iteration: options.iterationContext?.iteration,
          };
        }

        case 'story_refiner': {
          const result = await runRefinementAgent(
            context.storyPath,
            this.sdlcRoot,
            { onProgress: onProgress as any },
            provider
          );
          return {
            agentId: agentConfig.id,
            role: 'story_refiner',
            content: result.changesMade.join('\n'),
            concerns: result.error ? [{
              severity: 'blocker',
              category: 'general',
              description: result.error,
            }] : [],
            approved: result.success,
            iteration: options.iterationContext?.iteration,
          };
        }

        default:
          return {
            agentId: agentConfig.id,
            role,
            content: `Unsupported role: ${role}`,
            concerns: [{
              severity: 'blocker',
              category: 'general',
              description: `Agent role "${role}" is not yet implemented`,
            }],
            approved: false,
          };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('phase-executor', `Agent execution failed: ${agentConfig.id}`, {
        role,
        error: errorMessage,
      });

      return {
        agentId: agentConfig.id,
        role,
        content: `Execution failed: ${errorMessage}`,
        concerns: [{
          severity: 'blocker',
          category: 'general',
          description: errorMessage,
        }],
        approved: false,
      };
    }
  }

  /**
   * Run the default phase agent
   */
  private async runDefaultPhaseAgent(
    phase: string,
    storyPath: string,
    options: { onProgress?: (msg: string) => void },
    provider?: IProvider
  ): Promise<{ success: boolean; changesMade: string[]; error?: string }> {
    // Cast options to bridge type mismatch between internal and agent callback types
    const agentOptions = options as any;
    switch (phase) {
      case 'refine':
        return runRefinementAgent(storyPath, this.sdlcRoot, agentOptions, provider);
      case 'research':
        return runResearchAgent(storyPath, this.sdlcRoot, agentOptions, provider);
      case 'plan':
        return runPlanningAgent(storyPath, this.sdlcRoot, agentOptions, provider);
      case 'plan_review':
        return runPlanReviewAgent(storyPath, this.sdlcRoot, agentOptions, provider);
      case 'implement':
        return runImplementationAgent(storyPath, this.sdlcRoot, agentOptions, provider);
      case 'review':
        return runReviewAgent(storyPath, this.sdlcRoot, agentOptions, provider) as any;
      default:
        throw new Error(`Unknown phase: ${phase}`);
    }
  }

  /**
   * Convert phase name to agent role
   */
  private phaseToRole(phase: string): any {
    const mapping: Record<string, string> = {
      refine: 'story_refiner',
      research: 'researcher',
      plan: 'planner',
      plan_review: 'plan_reviewer',
      implement: 'implementer',
      review: 'reviewer',
    };
    return mapping[phase] ?? 'story_refiner';
  }

  /**
   * Check if an agent config represents a group (has nested agents)
   */
  private isAgentGroup(config: AgentConfig): boolean {
    return Array.isArray(config.agents) && config.agents.length > 0;
  }

  /**
   * Check if an output has blocking concerns
   */
  private hasBlockingConcerns(output: AgentOutput): boolean {
    return output.concerns.some(c => c.severity === 'blocker');
  }

  /**
   * Build a summary of the phase execution
   */
  private buildSummary(outputs: AgentOutput[], consensus?: ConsensusResult): string {
    const merged = mergeAgentOutputs(outputs);
    const parts: string[] = [];

    parts.push(merged.summary);

    if (consensus) {
      if (consensus.reached) {
        parts.push(`Consensus reached after ${consensus.iterations} iteration(s).`);
      } else {
        parts.push(`Consensus not reached after ${consensus.iterations} iteration(s).`);
        if (consensus.requiresHumanReview) {
          parts.push('Human review required.');
        }
      }
    }

    return parts.join(' ');
  }
}

/**
 * Create a phase executor for the given SDLC root
 */
export function createPhaseExecutor(sdlcRoot: string, config?: WorkflowConfig): PhaseExecutor {
  return new PhaseExecutor(sdlcRoot, config);
}

/**
 * Execute a phase with default configuration
 * Convenience function for simple use cases
 */
export async function executePhase(
  phase: string,
  storyPath: string,
  sdlcRoot: string,
  options: PhaseExecutorOptions = {}
): Promise<PhaseExecutionResult> {
  const executor = new PhaseExecutor(sdlcRoot);
  const context: PhaseExecutionContext = {
    phase,
    storyPath,
    sdlcRoot,
    onProgress: options.onProgress,
  };
  return executor.execute(phase, context, options);
}
