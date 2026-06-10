import * as fs from 'fs';
import path from 'path';
import { Config } from '../../types/index.js';
import { CONFIG_FILENAME, DEFAULT_CONFIG, DEFAULT_TIMEOUTS, DEFAULT_LOGGING_CONFIG, DEFAULT_RETRY_CONFIG, DEFAULT_DAEMON_CONFIG, DEFAULT_TDD_CONFIG, DEFAULT_WORKTREE_CONFIG, DEFAULT_LOGGING_CONFIG as DEFAULT_LOGGING, DEFAULT_EPIC_CONFIG, DEFAULT_MERGE_CONFIG, DEFAULT_TICKETING_CONFIG, DEFAULT_NOTIFICATION_CONFIG_VALUE, DEFAULT_PLAN_REVIEW_CONFIG, DEFAULT_IMPLEMENTATION_CONFIG } from './defaults.js';
import { sanitizeUserConfig, validateMergeConfig, validateCostLimitConfig, validateReviewConfig, validateRetryConfig, validateImplementationConfig } from './validators.js';

/**
 * Get the SDLC root folder path
 * Respects AI_SDLC_ROOT env var if set (useful for testing)
 */
export function getSdlcRoot(workingDir: string = process.cwd()): string {
  // Check for test override first
  if (process.env.AI_SDLC_ROOT) {
    return process.env.AI_SDLC_ROOT;
  }
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
        planReview: {
          ...DEFAULT_PLAN_REVIEW_CONFIG,
          ...userConfig.planReview,
        },
        implementation: {
          ...DEFAULT_IMPLEMENTATION_CONFIG,
          ...userConfig.implementation,
        },
        ai: {
          ...DEFAULT_CONFIG.ai,
          ...userConfig.ai,
        },
        timeouts: {
          ...DEFAULT_TIMEOUTS,
          ...userConfig.timeouts,
        },
        retry: {
          ...DEFAULT_RETRY_CONFIG,
          ...userConfig.retry,
        },
        daemon: {
          ...DEFAULT_DAEMON_CONFIG,
          ...userConfig.daemon,
        },
        tdd: {
          ...DEFAULT_TDD_CONFIG,
          ...userConfig.tdd,
        },
        worktree: {
          ...DEFAULT_WORKTREE_CONFIG,
          ...userConfig.worktree,
        },
        logging: {
          ...DEFAULT_LOGGING_CONFIG,
          ...userConfig.logging,
        },
        epic: {
          ...DEFAULT_EPIC_CONFIG,
          ...userConfig.epic,
        },
        merge: userConfig.merge
          ? validateMergeConfig(userConfig.merge)
          : { ...DEFAULT_MERGE_CONFIG },
        ticketing: {
          ...DEFAULT_TICKETING_CONFIG,
          ...userConfig.ticketing,
        },
        costLimits: userConfig.costLimits
          ? validateCostLimitConfig(userConfig.costLimits)
          : undefined,
        notification: {
          ...DEFAULT_NOTIFICATION_CONFIG_VALUE,
          ...userConfig.notification,
        },
      } as Config;
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
  if (process.env.AI_SDLC_MAX_RETRIES) {
    const maxRetries = parseInt(process.env.AI_SDLC_MAX_RETRIES, 10);
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
      console.warn(`Invalid AI_SDLC_MAX_RETRIES value "${process.env.AI_SDLC_MAX_RETRIES}" (must be 0-10), ignoring`);
    }
  }

  if (process.env.AI_SDLC_IMPLEMENTATION_MAX_RETRIES) {
    const maxRetries = parseInt(process.env.AI_SDLC_IMPLEMENTATION_MAX_RETRIES, 10);
    // Security: Limit to 0-10 range to prevent resource exhaustion
    if (!isNaN(maxRetries) && maxRetries >= 0 && maxRetries <= 10) {
      console.log(`Environment override: implementation.maxRetries set to ${maxRetries}`);
      config.implementation.maxRetries = maxRetries;
      // If user sets maxRetries via env, raise upper bound to allow it
      config.implementation.maxRetriesUpperBound = Math.max(
        config.implementation.maxRetriesUpperBound,
        maxRetries
      );
    } else {
      console.warn(`Invalid AI_SDLC_IMPLEMENTATION_MAX_RETRIES value "${process.env.AI_SDLC_IMPLEMENTATION_MAX_RETRIES}" (must be 0-10), ignoring`);
    }
  }

  if (process.env.AI_SDLC_AUTO_COMPLETE) {
    const value = process.env.AI_SDLC_AUTO_COMPLETE;
    if (value === 'true' || value === 'false') {
      console.log(`Environment override: autoCompleteOnApproval set to ${value}`);
      config.reviewConfig.autoCompleteOnApproval = value === 'true';
    } else {
      console.warn(`Invalid AI_SDLC_AUTO_COMPLETE value "${value}" (must be "true" or "false"), ignoring`);
    }
  }

  if (process.env.AI_SDLC_AUTO_RESTART) {
    const value = process.env.AI_SDLC_AUTO_RESTART;
    if (value === 'true' || value === 'false') {
      console.log(`Environment override: autoRestartOnRejection set to ${value}`);
      config.reviewConfig.autoRestartOnRejection = value === 'true';
    } else {
      console.warn(`Invalid AI_SDLC_AUTO_RESTART value "${value}" (must be "true" or "false"), ignoring`);
    }
  }

  if (process.env.AI_SDLC_LOG_LEVEL) {
    const value = process.env.AI_SDLC_LOG_LEVEL.toLowerCase();
    const validLevels = ['debug', 'info', 'warn', 'error'];
    if (validLevels.includes(value)) {
      config.logging = config.logging || { ...DEFAULT_LOGGING_CONFIG };
      config.logging.level = value as 'debug' | 'info' | 'warn' | 'error';
    } else {
      console.warn(`Invalid AI_SDLC_LOG_LEVEL value "${process.env.AI_SDLC_LOG_LEVEL}" (must be debug, info, warn, or error), ignoring`);
    }
  }

  // Validate review config
  config.reviewConfig = validateReviewConfig(config.reviewConfig);

  // Validate implementation config
  config.implementation = validateImplementationConfig(config.implementation);

  // Validate retry config
  if (config.retry) {
    config.retry = validateRetryConfig(config.retry);
  }

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
 * Initialize configuration file with defaults
 */
export function initConfig(workingDir: string = process.cwd()): Config {
  const configPath = path.join(workingDir, CONFIG_FILENAME);

  if (!fs.existsSync(configPath)) {
    saveConfig(DEFAULT_CONFIG, workingDir);
  }

  return loadConfig(workingDir);
}
