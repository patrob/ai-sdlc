import * as fs from 'fs';
import path from 'path';
import { Config, StageGateConfig, RefinementConfig, ReviewConfig, ImplementationConfig, TimeoutConfig, DaemonConfig, TDDConfig, WorktreeConfig, LogConfig } from '../types/index.js';

const CONFIG_FILENAME = '.ai-sdlc.json';

/**
 * Default timeout configuration
 */
export const DEFAULT_TIMEOUTS: TimeoutConfig = {
  agentTimeout: 600000,   // 10 minutes
  buildTimeout: 120000,   // 2 minutes
  testTimeout: 300000,    // 5 minutes
};

/**
 * Default daemon configuration
 */
export const DEFAULT_DAEMON_CONFIG: DaemonConfig = {
  enabled: false,
  pollingInterval: 5000,              // 5 seconds
  watchPatterns: ['stories/*/story.md'],
  processDelay: 500,                  // 500ms debounce
  shutdownTimeout: 30000,             // 30 seconds
  enableEscShutdown: false,           // MVP: Ctrl+C only
  escTimeout: 500,                    // 500ms for Esc+Esc
};

/**
 * Default TDD configuration
 */
export const DEFAULT_TDD_CONFIG: TDDConfig = {
  enabled: false,
  strictMode: true,
  maxCycles: 50,
  requireApprovalPerCycle: false,
  requirePassingTestsForComplete: true,
};

/**
 * Default worktree configuration
 */
export const DEFAULT_WORKTREE_CONFIG: WorktreeConfig = {
  enabled: false,
  basePath: '.ai-sdlc/worktrees',
};

/**
 * Default implementation configuration
 */
export const DEFAULT_IMPLEMENTATION_CONFIG: ImplementationConfig = {
  maxRetries: 3,
  maxRetriesUpperBound: 10,
};

/**
 * Default logging configuration
 */
export const DEFAULT_LOGGING_CONFIG: LogConfig = {
  enabled: true,
  level: 'info',
  maxFileSizeMb: 10,
  maxFiles: 5,
};

export const DEFAULT_CONFIG: Config = {
  sdlcFolder: '.ai-sdlc',
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
    /** Maximum retry attempts before blocking. @default 3 */
    maxRetries: 3,
    /** Hard upper bound for maxRetries. @default 10 */
    maxRetriesUpperBound: 10,
    autoCompleteOnApproval: true,
    autoRestartOnRejection: true,
    detectTestAntipatterns: true,
  },
  implementation: { ...DEFAULT_IMPLEMENTATION_CONFIG },
  defaultLabels: [],
  theme: 'auto',
  // Test and build commands - auto-detected from package.json if present
  testCommand: 'npm test',
  buildCommand: 'npm run build',
  // Agent SDK settings sources - enables Skills discovery from .claude/skills/
  settingSources: ['project'],
  // Timeout configuration
  timeouts: { ...DEFAULT_TIMEOUTS },
  // Daemon configuration
  daemon: { ...DEFAULT_DAEMON_CONFIG },
  // TDD configuration
  tdd: { ...DEFAULT_TDD_CONFIG },
  // Worktree configuration
  worktree: { ...DEFAULT_WORKTREE_CONFIG },
  // Logging configuration
  logging: { ...DEFAULT_LOGGING_CONFIG },
  // Orchestrator configuration
  useOrchestrator: false,
};

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

  // Validate TDD configuration if present
  if (userConfig.tdd !== undefined) {
    if (typeof userConfig.tdd !== 'object' || userConfig.tdd === null) {
      console.warn('Invalid tdd in config (must be object), ignoring');
      delete userConfig.tdd;
    } else {
      // Validate tdd.enabled (must be boolean)
      if (userConfig.tdd.enabled !== undefined) {
        if (typeof userConfig.tdd.enabled !== 'boolean') {
          console.warn('Invalid tdd.enabled in config (must be boolean), using default');
          delete userConfig.tdd.enabled;
        }
      }

      // Validate tdd.strictMode (must be boolean)
      if (userConfig.tdd.strictMode !== undefined) {
        if (typeof userConfig.tdd.strictMode !== 'boolean') {
          console.warn('Invalid tdd.strictMode in config (must be boolean), using default');
          delete userConfig.tdd.strictMode;
        }
      }

      // Validate tdd.maxCycles (must be positive number)
      if (userConfig.tdd.maxCycles !== undefined) {
        if (typeof userConfig.tdd.maxCycles !== 'number' || !Number.isFinite(userConfig.tdd.maxCycles) || userConfig.tdd.maxCycles <= 0) {
          console.warn('Invalid tdd.maxCycles in config (must be positive number), using default');
          delete userConfig.tdd.maxCycles;
        }
      }

      // Validate tdd.requireApprovalPerCycle (must be boolean)
      if (userConfig.tdd.requireApprovalPerCycle !== undefined) {
        if (typeof userConfig.tdd.requireApprovalPerCycle !== 'boolean') {
          console.warn('Invalid tdd.requireApprovalPerCycle in config (must be boolean), using default');
          delete userConfig.tdd.requireApprovalPerCycle;
        }
      }

      // Validate tdd.requirePassingTestsForComplete (must be boolean)
      if (userConfig.tdd.requirePassingTestsForComplete !== undefined) {
        if (typeof userConfig.tdd.requirePassingTestsForComplete !== 'boolean') {
          console.warn('Invalid tdd.requirePassingTestsForComplete in config (must be boolean), using default');
          delete userConfig.tdd.requirePassingTestsForComplete;
        }
      }
    }
  }

  // Validate worktree configuration if present
  if (userConfig.worktree !== undefined) {
    if (typeof userConfig.worktree !== 'object' || userConfig.worktree === null) {
      console.warn('Invalid worktree in config (must be object), ignoring');
      delete userConfig.worktree;
    } else {
      // Validate worktree.enabled (must be boolean)
      if (userConfig.worktree.enabled !== undefined) {
        if (typeof userConfig.worktree.enabled !== 'boolean') {
          console.warn('Invalid worktree.enabled in config (must be boolean), using default');
          delete userConfig.worktree.enabled;
        }
      }

      // Validate worktree.basePath (must be string)
      if (userConfig.worktree.basePath !== undefined) {
        if (typeof userConfig.worktree.basePath !== 'string') {
          console.warn('Invalid worktree.basePath in config (must be string), using default');
          delete userConfig.worktree.basePath;
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
        implementation: {
          ...DEFAULT_IMPLEMENTATION_CONFIG,
          ...userConfig.implementation,
        },
        timeouts: {
          ...DEFAULT_TIMEOUTS,
          ...userConfig.timeouts,
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

/**
 * Validate implementation configuration
 */
export function validateImplementationConfig(implementationConfig: ImplementationConfig): ImplementationConfig {
  const validated = { ...implementationConfig };

  // Handle Infinity as valid "no limit" value
  if (validated.maxRetries === Infinity) {
    return validated;
  }

  // Ensure maxRetries is within valid bounds
  if (validated.maxRetries < 0) {
    console.warn(`Warning: implementation.maxRetries cannot be negative, using 0`);
    validated.maxRetries = 0;
  }

  // Only apply upper bound check for finite values
  if (Number.isFinite(validated.maxRetries) && Number.isFinite(validated.maxRetriesUpperBound)) {
    if (validated.maxRetries > validated.maxRetriesUpperBound) {
      console.warn(
        `Warning: implementation.maxRetries (${validated.maxRetries}) exceeds upper bound (${validated.maxRetriesUpperBound}), capping at ${validated.maxRetriesUpperBound}`
      );
      validated.maxRetries = validated.maxRetriesUpperBound;
    }
  }

  // Log unusual values
  if (validated.maxRetries === 0) {
    console.warn('Warning: implementation.maxRetries is set to 0 - implementation retry is disabled');
  }

  return validated;
}

/**
 * Update implementation configuration
 */
export function updateImplementationConfig(
  implementationConfig: Partial<ImplementationConfig>,
  workingDir: string = process.cwd()
): Config {
  const config = loadConfig(workingDir);
  config.implementation = {
    ...config.implementation,
    ...implementationConfig,
  };
  config.implementation = validateImplementationConfig(config.implementation);
  saveConfig(config, workingDir);
  return config;
}

/**
 * Validate and resolve worktree basePath
 * @param basePath - The configured base path (may be relative)
 * @param projectRoot - The project root directory
 * @returns The resolved absolute path
 * @throws Error if the parent directory does not exist
 */
export function validateWorktreeBasePath(basePath: string, projectRoot: string): string {
  const resolvedPath = path.isAbsolute(basePath)
    ? basePath
    : path.resolve(projectRoot, basePath);

  // Check parent directory exists (worktree dir itself may not exist yet)
  const parentDir = path.dirname(resolvedPath);
  if (!fs.existsSync(parentDir)) {
    throw new Error(`Worktree basePath parent directory does not exist: ${parentDir}`);
  }

  return resolvedPath;
}

/**
 * Get resolved worktree configuration with validated paths
 * @param config - The loaded configuration
 * @param projectRoot - The project root directory
 * @returns Resolved worktree config with absolute basePath
 */
export function getWorktreeConfig(config: Config, projectRoot: string): WorktreeConfig {
  const worktreeConfig = config.worktree ?? DEFAULT_WORKTREE_CONFIG;

  return {
    enabled: worktreeConfig.enabled,
    basePath: validateWorktreeBasePath(worktreeConfig.basePath, projectRoot),
  };
}
