/**
 * Workflow Configuration Loader
 *
 * Loads and validates workflow configuration from YAML files.
 * Supports plug-and-play agent architecture with backward-compatible defaults.
 *
 * @module core/workflow-config
 */

import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import {
  WorkflowConfig,
  PhaseConfig,
  AgentConfig,
  AgentRole,
  WorkflowConfigError,
  WorkflowConfigValidation,
  DEFAULT_WORKFLOW_CONFIG,
  CompositionMode,
  ConsensusRequirement,
} from '../types/workflow-config.js';

/**
 * Valid agent roles in the system
 */
const VALID_ROLES: AgentRole[] = [
  'story_refiner',
  'tech_lead_reviewer',
  'security_reviewer',
  'product_owner_reviewer',
  'researcher',
  'planner',
  'plan_reviewer',
  'implementer',
  'reviewer',
];

/**
 * Valid composition modes
 */
const VALID_COMPOSITION_MODES: CompositionMode[] = ['sequential', 'parallel'];

/**
 * Valid consensus requirements
 */
const VALID_CONSENSUS_REQUIREMENTS: ConsensusRequirement[] = ['required', 'optional', 'none'];

/**
 * Valid phase names
 */
const VALID_PHASES = ['refine', 'research', 'plan', 'plan_review', 'implement', 'review'];

/**
 * Workflow configuration loader with validation
 */
export class WorkflowConfigLoader {
  private configPath: string;

  /**
   * Create a new WorkflowConfigLoader
   * @param sdlcRoot - Path to the .ai-sdlc directory
   */
  constructor(sdlcRoot: string) {
    this.configPath = path.join(sdlcRoot, 'workflow.yaml');
  }

  /**
   * Load workflow configuration from YAML file
   * @returns Parsed and validated workflow configuration
   */
  load(): WorkflowConfig {
    if (!fs.existsSync(this.configPath)) {
      return DEFAULT_WORKFLOW_CONFIG;
    }

    const content = fs.readFileSync(this.configPath, 'utf-8');
    const parsed = yaml.load(content) as Record<string, unknown>;

    const validation = this.validate(parsed);
    if (!validation.valid) {
      const errorMessages = validation.errors.map(e => `  - ${e.path}: ${e.message}`).join('\n');
      throw new Error(`Invalid workflow configuration:\n${errorMessages}`);
    }

    return this.normalize(parsed);
  }

  /**
   * Check if a workflow configuration file exists
   */
  exists(): boolean {
    return fs.existsSync(this.configPath);
  }

  /**
   * Get the path to the workflow configuration file
   */
  getPath(): string {
    return this.configPath;
  }

  /**
   * Validate workflow configuration
   * @param config - Raw parsed configuration
   * @returns Validation result with errors and warnings
   */
  validate(config: unknown): WorkflowConfigValidation {
    const errors: WorkflowConfigError[] = [];
    const warnings: WorkflowConfigError[] = [];

    if (!config || typeof config !== 'object') {
      errors.push({
        path: '',
        message: 'Configuration must be an object',
      });
      return { valid: false, errors, warnings };
    }

    const obj = config as Record<string, unknown>;

    // Validate version
    if (!obj.version) {
      errors.push({
        path: 'version',
        message: 'Missing required field "version"',
      });
    } else if (typeof obj.version !== 'string') {
      errors.push({
        path: 'version',
        message: 'Field "version" must be a string',
      });
    } else if (obj.version !== '1.0') {
      warnings.push({
        path: 'version',
        message: `Unknown version "${obj.version}", expected "1.0"`,
      });
    }

    // Validate phases
    if (!obj.phases) {
      errors.push({
        path: 'phases',
        message: 'Missing required field "phases"',
      });
    } else if (typeof obj.phases !== 'object' || Array.isArray(obj.phases)) {
      errors.push({
        path: 'phases',
        message: 'Field "phases" must be an object',
      });
    } else {
      const phases = obj.phases as Record<string, unknown>;
      for (const [phaseName, phaseConfig] of Object.entries(phases)) {
        if (!VALID_PHASES.includes(phaseName)) {
          warnings.push({
            path: `phases.${phaseName}`,
            message: `Unknown phase "${phaseName}". Valid phases: ${VALID_PHASES.join(', ')}`,
          });
        }

        if (phaseConfig !== null && typeof phaseConfig === 'object') {
          this.validatePhaseConfig(phaseConfig as Record<string, unknown>, `phases.${phaseName}`, errors, warnings);
        }
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  /**
   * Validate phase configuration
   */
  private validatePhaseConfig(
    config: Record<string, unknown>,
    path: string,
    errors: WorkflowConfigError[],
    warnings: WorkflowConfigError[]
  ): void {
    if (config.enabled !== undefined && typeof config.enabled !== 'boolean') {
      errors.push({
        path: `${path}.enabled`,
        message: 'Field "enabled" must be a boolean',
      });
    }

    if (config.agents !== undefined) {
      if (!Array.isArray(config.agents)) {
        errors.push({
          path: `${path}.agents`,
          message: 'Field "agents" must be an array',
        });
      } else {
        config.agents.forEach((agent, index) => {
          this.validateAgentConfig(agent, `${path}.agents[${index}]`, errors, warnings);
        });
      }
    }
  }

  /**
   * Validate agent configuration
   */
  private validateAgentConfig(
    config: unknown,
    path: string,
    errors: WorkflowConfigError[],
    warnings: WorkflowConfigError[]
  ): void {
    if (!config || typeof config !== 'object') {
      errors.push({
        path,
        message: 'Agent configuration must be an object',
      });
      return;
    }

    const agent = config as Record<string, unknown>;

    // Validate id (required)
    if (!agent.id) {
      errors.push({
        path: `${path}.id`,
        message: 'Missing required field "id"',
      });
    } else if (typeof agent.id !== 'string') {
      errors.push({
        path: `${path}.id`,
        message: 'Field "id" must be a string',
      });
    }

    // Check if this is a group (has nested agents) or a leaf agent
    const isGroup = Array.isArray(agent.agents) && agent.agents.length > 0;

    if (isGroup) {
      // Groups should not have a role
      if (agent.role !== undefined) {
        warnings.push({
          path: `${path}.role`,
          message: 'Agent groups typically do not have a role; role will be ignored',
        });
      }

      // Validate composition
      if (agent.composition !== undefined) {
        if (!VALID_COMPOSITION_MODES.includes(agent.composition as CompositionMode)) {
          errors.push({
            path: `${path}.composition`,
            message: `Invalid composition mode "${agent.composition}". Valid modes: ${VALID_COMPOSITION_MODES.join(', ')}`,
          });
        }
      }

      // Validate consensus
      if (agent.consensus !== undefined) {
        if (!VALID_CONSENSUS_REQUIREMENTS.includes(agent.consensus as ConsensusRequirement)) {
          errors.push({
            path: `${path}.consensus`,
            message: `Invalid consensus requirement "${agent.consensus}". Valid values: ${VALID_CONSENSUS_REQUIREMENTS.join(', ')}`,
          });
        }
      }

      // Validate maxIterations
      if (agent.maxIterations !== undefined) {
        if (typeof agent.maxIterations !== 'number' || agent.maxIterations < 1) {
          errors.push({
            path: `${path}.maxIterations`,
            message: 'Field "maxIterations" must be a positive integer',
          });
        }
      }

      // Recursively validate nested agents
      (agent.agents as unknown[]).forEach((nestedAgent, index) => {
        this.validateAgentConfig(nestedAgent, `${path}.agents[${index}]`, errors, warnings);
      });
    } else {
      // Leaf agents must have a role
      if (!agent.role) {
        errors.push({
          path: `${path}.role`,
          message: 'Leaf agents must have a "role" field',
        });
      } else if (!VALID_ROLES.includes(agent.role as AgentRole)) {
        errors.push({
          path: `${path}.role`,
          message: `Invalid role "${agent.role}". Valid roles: ${VALID_ROLES.join(', ')}`,
        });
      }
    }
  }

  /**
   * Normalize configuration by filling in defaults
   */
  private normalize(raw: Record<string, unknown>): WorkflowConfig {
    const phases: Record<string, PhaseConfig> = {};

    // Start with default phases
    for (const phase of VALID_PHASES) {
      phases[phase] = {};
    }

    // Override with configured phases
    if (raw.phases && typeof raw.phases === 'object') {
      const rawPhases = raw.phases as Record<string, unknown>;
      for (const [phaseName, phaseConfig] of Object.entries(rawPhases)) {
        if (phaseConfig && typeof phaseConfig === 'object') {
          phases[phaseName] = this.normalizePhaseConfig(phaseConfig as Record<string, unknown>);
        } else {
          phases[phaseName] = {};
        }
      }
    }

    return {
      version: String(raw.version || '1.0'),
      phases,
    };
  }

  /**
   * Normalize phase configuration
   */
  private normalizePhaseConfig(raw: Record<string, unknown>): PhaseConfig {
    const config: PhaseConfig = {};

    if (raw.enabled !== undefined) {
      config.enabled = Boolean(raw.enabled);
    }

    if (Array.isArray(raw.agents)) {
      config.agents = raw.agents.map(agent => this.normalizeAgentConfig(agent));
    }

    return config;
  }

  /**
   * Normalize agent configuration
   */
  private normalizeAgentConfig(raw: unknown): AgentConfig {
    if (!raw || typeof raw !== 'object') {
      return { id: 'unknown' };
    }

    const agent = raw as Record<string, unknown>;
    const config: AgentConfig = {
      id: String(agent.id || 'unknown'),
    };

    if (agent.role) {
      config.role = agent.role as AgentRole;
    }

    if (agent.composition) {
      config.composition = agent.composition as CompositionMode;
    }

    if (agent.consensus) {
      config.consensus = agent.consensus as ConsensusRequirement;
    }

    if (typeof agent.maxIterations === 'number') {
      config.maxIterations = agent.maxIterations;
    }

    if (Array.isArray(agent.agents)) {
      config.agents = agent.agents.map(a => this.normalizeAgentConfig(a));
    }

    return config;
  }
}

/**
 * Load workflow configuration from the .ai-sdlc directory
 * Convenience function for simple use cases
 *
 * @param sdlcRoot - Path to the .ai-sdlc directory
 * @returns Workflow configuration
 */
export function loadWorkflowConfig(sdlcRoot: string): WorkflowConfig {
  const loader = new WorkflowConfigLoader(sdlcRoot);
  return loader.load();
}

/**
 * Get phase configuration from workflow config
 * Returns default (empty) config if phase not configured
 *
 * @param config - Workflow configuration
 * @param phase - Phase name
 * @returns Phase configuration
 */
export function getPhaseConfig(config: WorkflowConfig, phase: string): PhaseConfig {
  return config.phases[phase] || {};
}

/**
 * Check if a phase has custom agent configuration
 *
 * @param config - Phase configuration
 * @returns True if phase has custom agents configured
 */
export function hasCustomAgents(config: PhaseConfig): boolean {
  return Array.isArray(config.agents) && config.agents.length > 0;
}

/**
 * Check if a phase is enabled
 *
 * @param config - Phase configuration
 * @returns True if phase is enabled (default: true)
 */
export function isPhaseEnabled(config: PhaseConfig): boolean {
  return config.enabled !== false;
}
