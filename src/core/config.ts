import fs from 'fs';
import path from 'path';
import { Config, StageGateConfig, RefinementConfig, ReviewConfig, TimeoutConfig } from '../types/index.js';

const CONFIG_FILENAME = '.agentic-sdlc.json';

/**
 * Default timeout configuration
 */
export const DEFAULT_TIMEOUTS: TimeoutConfig = {
  agentTimeout: 600000,   // 10 minutes
  buildTimeout: 120000,   // 2 minutes
  testTimeout: 300000,    // 5 minutes
};

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
    maxRetries: Infinity,
    maxRetriesUpperBound: Infinity,
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
  // Timeout configuration
  timeouts: { ...DEFAULT_TIMEOUTS },
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
 * Security: Validate command string to prevent command injection
 * Whitelists common package managers and build tools
 */
function validateCommand(command: string, fieldName: string): boolean {
  if (!command || typeof command !== 'string') {
    return false;
  }

  // Whitelist of allowed executables
  const allowedExecutables = ['npm', 'yarn', 'pnpm', 'node', 'npx', 'bun', 'make', 'mvn', 'gradle'];

  // Extract first word (executable name)
  const parts = command.trim().split(/\s+/);
  const executable = parts[0];

  // Check if executable is in whitelist
  if (!allowedExecutables.includes(executable)) {
    console.warn(`Warning: ${fieldName} uses non-whitelisted executable "${executable}". Allowed: ${allowedExecutables.join(', ')}`);
    return false;
  }

  // Check for dangerous shell metacharacters
  const dangerousPatterns = [
    /[;&|`$()]/,      // Shell operators
    /\$\{/,           // Variable substitution
    /\$\(/,           // Command substitution
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(command)) {
      console.warn(`Warning: ${fieldName} contains potentially dangerous shell metacharacters: ${command}`);
      return false;
    }
  }

  return true;
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

  // Security: Validate command strings before using them
  if (userConfig.testCommand !== undefined) {
    if (!validateCommand(userConfig.testCommand, 'testCommand')) {
      console.warn('Invalid or unsafe testCommand in config, removing');
      delete userConfig.testCommand;
    }
  }

  if (userConfig.buildCommand !== undefined) {
    if (!validateCommand(userConfig.buildCommand, 'buildCommand')) {
      console.warn('Invalid or unsafe buildCommand in config, removing');
      delete userConfig.buildCommand;
    }
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

  // Security: Enforce hard limits on timeout values
  const MIN_TIMEOUT_MS = 5000;      // 5 seconds minimum
  const MAX_TIMEOUT_MS = 3600000;   // 1 hour maximum

  if (userConfig.timeouts !== undefined) {
    if (typeof userConfig.timeouts !== 'object' || userConfig.timeouts === null) {
      console.warn('Invalid timeouts in config (must be object), ignoring');
      delete userConfig.timeouts;
    } else {
      const timeoutFields = ['agentTimeout', 'buildTimeout', 'testTimeout'] as const;
      for (const field of timeoutFields) {
        if (userConfig.timeouts[field] !== undefined) {
          const value = userConfig.timeouts[field];
          if (typeof value !== 'number' || !Number.isFinite(value) || isNaN(value)) {
            console.warn(`Invalid ${field} in config (must be finite number), using default`);
            delete userConfig.timeouts[field];
          } else if (value < MIN_TIMEOUT_MS) {
            console.warn(`${field} is below minimum (${MIN_TIMEOUT_MS}ms), setting to minimum`);
            userConfig.timeouts[field] = MIN_TIMEOUT_MS;
          } else if (value > MAX_TIMEOUT_MS) {
            console.warn(`${field} exceeds maximum (${MAX_TIMEOUT_MS}ms), setting to maximum`);
            userConfig.timeouts[field] = MAX_TIMEOUT_MS;
          }
        }
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
        timeouts: {
          ...DEFAULT_TIMEOUTS,
          ...userConfig.timeouts,
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

  // Security: Apply environment variable overrides with strict validation
  if (process.env.AGENTIC_SDLC_MAX_RETRIES) {
    const maxRetries = parseInt(process.env.AGENTIC_SDLC_MAX_RETRIES, 10);
    // Security: Limit to 0-10 range (not 0-100) to prevent resource exhaustion
    if (!isNaN(maxRetries) && maxRetries >= 0 && maxRetries <= 10) {
      console.log(`Environment override: maxRetries set to ${maxRetries}`);
      config.reviewConfig.maxRetries = maxRetries;
      // If user sets maxRetries via env, raise upper bound to allow it
      config.reviewConfig.maxRetriesUpperBound = Math.max(
        config.reviewConfig.maxRetriesUpperBound,
        maxRetries
      );
    } else {
      console.warn(`Invalid AGENTIC_SDLC_MAX_RETRIES value "${process.env.AGENTIC_SDLC_MAX_RETRIES}" (must be 0-10), ignoring`);
    }
  }

  if (process.env.AGENTIC_SDLC_AUTO_COMPLETE) {
    const value = process.env.AGENTIC_SDLC_AUTO_COMPLETE;
    if (value === 'true' || value === 'false') {
      console.log(`Environment override: autoCompleteOnApproval set to ${value}`);
      config.reviewConfig.autoCompleteOnApproval = value === 'true';
    } else {
      console.warn(`Invalid AGENTIC_SDLC_AUTO_COMPLETE value "${value}" (must be "true" or "false"), ignoring`);
    }
  }

  if (process.env.AGENTIC_SDLC_AUTO_RESTART) {
    const value = process.env.AGENTIC_SDLC_AUTO_RESTART;
    if (value === 'true' || value === 'false') {
      console.log(`Environment override: autoRestartOnRejection set to ${value}`);
      config.reviewConfig.autoRestartOnRejection = value === 'true';
    } else {
      console.warn(`Invalid AGENTIC_SDLC_AUTO_RESTART value "${value}" (must be "true" or "false"), ignoring`);
    }
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

  // Handle Infinity as valid "no limit" value
  if (validated.maxRetries === Infinity) {
    return validated;
  }

  // Ensure maxRetries is within valid bounds
  if (validated.maxRetries < 0) {
    console.warn(`Warning: maxRetries cannot be negative, using 0`);
    validated.maxRetries = 0;
  }

  // Only apply upper bound check for finite values
  if (Number.isFinite(validated.maxRetries) && Number.isFinite(validated.maxRetriesUpperBound)) {
    if (validated.maxRetries > validated.maxRetriesUpperBound) {
      console.warn(
        `Warning: maxRetries (${validated.maxRetries}) exceeds upper bound (${validated.maxRetriesUpperBound}), capping at ${validated.maxRetriesUpperBound}`
      );
      validated.maxRetries = validated.maxRetriesUpperBound;
    }
  }

  // Log unusual values
  if (validated.maxRetries === 0) {
    console.warn('Warning: maxRetries is set to 0 - auto-retry is disabled');
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
