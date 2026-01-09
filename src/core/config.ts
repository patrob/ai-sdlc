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
};

/**
 * Get the SDLC root folder path
 */
export function getSdlcRoot(workingDir: string = process.cwd()): string {
  const config = loadConfig(workingDir);
  return path.join(workingDir, config.sdlcFolder);
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
      const userConfig = JSON.parse(content) as Partial<Config>;

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
      console.warn(`Warning: Could not parse ${CONFIG_FILENAME}, using defaults`);
      config = { ...DEFAULT_CONFIG };
    }
  }

  // Apply environment variable overrides
  if (process.env.AGENTIC_SDLC_MAX_RETRIES) {
    const maxRetries = parseInt(process.env.AGENTIC_SDLC_MAX_RETRIES, 10);
    if (!isNaN(maxRetries)) {
      config.reviewConfig.maxRetries = maxRetries;
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
