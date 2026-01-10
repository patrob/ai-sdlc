import fs from 'fs';
import path from 'path';
import { Config, StageGateConfig, RefinementConfig, ReviewConfig } from '../types/index.js';

const CONFIG_FILENAME = '.agentic-sdlc.json';

/**
 * Default configuration
 */
export const DEFAULT_CONFIG: Config = {
  sdlcFolder: '.agentic-sdlc',
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
    maxRetries: 3,
    maxRetriesUpperBound: 10,
    autoCompleteOnApproval: true,
    autoRestartOnRejection: true,
  },
  defaultLabels: [],
  theme: 'auto',
  // Test and build commands - auto-detected from package.json if present
  testCommand: 'npm test',
  buildCommand: 'npm run build',
  // Agent SDK settings sources - empty array maintains SDK isolation mode (default)
  settingSources: [],
};

/**
 * Get the SDLC root folder path
 * Respects AGENTIC_SDLC_ROOT env var if set (useful for testing)
 */
export function getSdlcRoot(workingDir: string = process.cwd()): string {
  // Check for test override first
  if (process.env.AGENTIC_SDLC_ROOT) {
    return process.env.AGENTIC_SDLC_ROOT;
  }
  const config = loadConfig(workingDir);
  return path.join(workingDir, config.sdlcFolder);
}

/**
 * Validate and sanitize user configuration to prevent prototype pollution
 */
function sanitizeUserConfig(userConfig: any): Partial<Config> {
  // Check for prototype pollution attempts
  if (
    Object.prototype.hasOwnProperty.call(userConfig, '__proto__') ||
    Object.prototype.hasOwnProperty.call(userConfig, 'constructor') ||
    Object.prototype.hasOwnProperty.call(userConfig, 'prototype')
  ) {
    throw new Error('Invalid configuration: prototype pollution attempt detected');
  }

  // Validate settingSources if present
  if (userConfig.settingSources !== undefined) {
    if (!Array.isArray(userConfig.settingSources)) {
      console.warn('Invalid settingSources in config (must be array), ignoring');
      delete userConfig.settingSources;
    } else {
      const validSources = ['user', 'project', 'local'];
      const invalidSources = userConfig.settingSources.filter(
        (s: any) => typeof s !== 'string' || !validSources.includes(s)
      );
      if (invalidSources.length > 0) {
        console.warn(
          `Invalid settingSources values in config: ${invalidSources.join(', ')}. Valid values: ${validSources.join(', ')}`
        );
        userConfig.settingSources = userConfig.settingSources.filter((s: any) =>
          validSources.includes(s)
        );
      }
    }
  }

  return userConfig;
}

/**
 * Load configuration from the working directory
 */
export function loadConfig(workingDir: string = process.cwd()): Config {
  const configPath = path.join(workingDir, CONFIG_FILENAME);

  let config: Config;

  if (!fs.existsSync(configPath)) {
    config = { ...DEFAULT_CONFIG };
  } else {
    try {
      const content = fs.readFileSync(configPath, 'utf-8');
      const parsedConfig = JSON.parse(content);
      const userConfig = sanitizeUserConfig(parsedConfig) as Partial<Config>;

      config = {
        ...DEFAULT_CONFIG,
        ...userConfig,
        stageGates: {
          ...DEFAULT_CONFIG.stageGates,
          ...userConfig.stageGates,
        },
        refinement: {
          ...DEFAULT_CONFIG.refinement,
          ...userConfig.refinement,
        },
        reviewConfig: {
          ...DEFAULT_CONFIG.reviewConfig,
          ...userConfig.reviewConfig,
        },
      };
    } catch (error) {
      // Re-throw security-related errors (prototype pollution, etc.)
      if (error instanceof Error && error.message.includes('prototype pollution')) {
        throw error;
      }
      console.warn(`Warning: Could not parse ${CONFIG_FILENAME}, using defaults`);
      config = { ...DEFAULT_CONFIG };
    }
  }

  // Apply environment variable overrides with validation
  if (process.env.AGENTIC_SDLC_MAX_RETRIES) {
    const maxRetries = parseInt(process.env.AGENTIC_SDLC_MAX_RETRIES, 10);
    if (!isNaN(maxRetries) && maxRetries >= 0 && maxRetries <= 100) {
      config.reviewConfig.maxRetries = maxRetries;
      // If user sets maxRetries via env, raise upper bound to allow it
      config.reviewConfig.maxRetriesUpperBound = Math.max(
        config.reviewConfig.maxRetriesUpperBound,
        maxRetries
      );
    } else {
      console.warn('Invalid AGENTIC_SDLC_MAX_RETRIES value, ignoring');
    }
  }

  if (process.env.AGENTIC_SDLC_AUTO_COMPLETE) {
    config.reviewConfig.autoCompleteOnApproval = process.env.AGENTIC_SDLC_AUTO_COMPLETE === 'true';
  }

  if (process.env.AGENTIC_SDLC_AUTO_RESTART) {
    config.reviewConfig.autoRestartOnRejection = process.env.AGENTIC_SDLC_AUTO_RESTART === 'true';
  }

  // Validate review config
  config.reviewConfig = validateReviewConfig(config.reviewConfig);

  return config;
}

/**
 * Save configuration to the working directory
 */
export function saveConfig(config: Config, workingDir: string = process.cwd()): void {
  const configPath = path.join(workingDir, CONFIG_FILENAME);
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
}

/**
 * Update stage gate configuration
 */
export function updateStageGates(
  gates: Partial<StageGateConfig>,
  workingDir: string = process.cwd()
): Config {
  const config = loadConfig(workingDir);
  config.stageGates = {
    ...config.stageGates,
    ...gates,
  };
  saveConfig(config, workingDir);
  return config;
}

/**
 * Check if a specific stage gate is enabled
 */
export function isStageGateEnabled(
  gate: keyof StageGateConfig,
  workingDir: string = process.cwd()
): boolean {
  const config = loadConfig(workingDir);
  return config.stageGates[gate];
}

/**
 * Initialize configuration file with defaults
 */
export function initConfig(workingDir: string = process.cwd()): Config {
  const configPath = path.join(workingDir, CONFIG_FILENAME);

  if (!fs.existsSync(configPath)) {
    saveConfig(DEFAULT_CONFIG, workingDir);
  }

  return loadConfig(workingDir);
}

/**
 * Update refinement configuration
 */
export function updateRefinementConfig(
  refinementConfig: Partial<RefinementConfig>,
  workingDir: string = process.cwd()
): Config {
  const config = loadConfig(workingDir);
  config.refinement = {
    ...config.refinement,
    ...refinementConfig,
  };
  saveConfig(config, workingDir);
  return config;
}

/**
 * Get the maximum number of refinement iterations allowed
 */
export function getMaxRefinementIterations(workingDir: string = process.cwd()): number {
  const config = loadConfig(workingDir);
  return config.refinement.maxIterations;
}

/**
 * Validate review configuration
 */
export function validateReviewConfig(reviewConfig: ReviewConfig): ReviewConfig {
  const validated = { ...reviewConfig };

  // Ensure maxRetries is within valid bounds
  if (validated.maxRetries < 0) {
    console.warn(`Warning: maxRetries cannot be negative, using 0`);
    validated.maxRetries = 0;
  }

  if (validated.maxRetries > validated.maxRetriesUpperBound) {
    console.warn(
      `Warning: maxRetries (${validated.maxRetries}) exceeds upper bound (${validated.maxRetriesUpperBound}), capping at ${validated.maxRetriesUpperBound}`
    );
    validated.maxRetries = validated.maxRetriesUpperBound;
  }

  // Log unusual values
  if (validated.maxRetries === 0) {
    console.warn('Warning: maxRetries is set to 0 - auto-retry is disabled');
  } else if (validated.maxRetries > 5) {
    console.warn(`Warning: maxRetries is set to ${validated.maxRetries} - this is higher than recommended (3-5)`);
  }

  return validated;
}

/**
 * Update review configuration
 */
export function updateReviewConfig(
  reviewConfig: Partial<ReviewConfig>,
  workingDir: string = process.cwd()
): Config {
  const config = loadConfig(workingDir);
  config.reviewConfig = {
    ...config.reviewConfig,
    ...reviewConfig,
  };
  config.reviewConfig = validateReviewConfig(config.reviewConfig);
  saveConfig(config, workingDir);
  return config;
}
