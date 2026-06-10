import { type CostLimitConfig, type ImplementationConfig,type MergeConfig, type RetryConfig, type ReviewConfig } from '../../types/index.js';
import { DEFAULT_MERGE_CONFIG } from './defaults.js';
export { sanitizeUserConfig } from './sanitizers.js';

/**
 * Validate merge configuration values with bounds checking
 * @param config Partial merge configuration to validate
 * @returns Validated merge configuration
 * @throws Error if configuration values are out of bounds
 */
export function validateMergeConfig(config: Partial<MergeConfig>): MergeConfig {
  const merged = { ...DEFAULT_MERGE_CONFIG, ...config };

  // Validate strategy
  const validStrategies = ['squash', 'merge', 'rebase'];
  if (!validStrategies.includes(merged.strategy)) {
    throw new Error(`Invalid merge strategy "${merged.strategy}". Must be one of: ${validStrategies.join(', ')}`);
  }

  // Validate checksTimeout bounds (1 second to 1 hour)
  if (merged.checksTimeout < 1000 || merged.checksTimeout > 3600000) {
    throw new Error(`checksTimeout must be between 1000ms and 3600000ms (1 hour), got ${merged.checksTimeout}`);
  }

  // Validate checksPollingInterval bounds (1 second to 5 minutes)
  if (merged.checksPollingInterval < 1000 || merged.checksPollingInterval > 300000) {
    throw new Error(`checksPollingInterval must be between 1000ms and 300000ms (5 min), got ${merged.checksPollingInterval}`);
  }

  // Ensure polling interval is less than timeout
  if (merged.checksPollingInterval >= merged.checksTimeout) {
    throw new Error(`checksPollingInterval (${merged.checksPollingInterval}) must be less than checksTimeout (${merged.checksTimeout})`);
  }

  return merged;
}

/**
 * Validate cost limit configuration values
 * @param config Partial cost limit configuration to validate
 * @returns Validated cost limit configuration
 */
export function validateCostLimitConfig(config: Partial<CostLimitConfig>): CostLimitConfig {
  const validated: CostLimitConfig = {};

  if (config.perStoryMaxTokens !== undefined) {
    if (typeof config.perStoryMaxTokens !== 'number' || !Number.isFinite(config.perStoryMaxTokens) || config.perStoryMaxTokens <= 0) {
      console.warn('Warning: costLimits.perStoryMaxTokens must be a positive number, ignoring');
    } else {
      validated.perStoryMaxTokens = config.perStoryMaxTokens;
    }
  }

  if (config.perRunMaxTokens !== undefined) {
    if (typeof config.perRunMaxTokens !== 'number' || !Number.isFinite(config.perRunMaxTokens) || config.perRunMaxTokens <= 0) {
      console.warn('Warning: costLimits.perRunMaxTokens must be a positive number, ignoring');
    } else {
      validated.perRunMaxTokens = config.perRunMaxTokens;
    }
  }

  if (config.warningThresholdPercent !== undefined) {
    if (typeof config.warningThresholdPercent !== 'number' || config.warningThresholdPercent < 0 || config.warningThresholdPercent > 100) {
      console.warn('Warning: costLimits.warningThresholdPercent must be 0-100, using 80');
      validated.warningThresholdPercent = 80;
    } else {
      validated.warningThresholdPercent = config.warningThresholdPercent;
    }
  }

  return validated;
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
 * Validate retry configuration
 */
export function validateRetryConfig(retryConfig: RetryConfig): RetryConfig {
  const validated = { ...retryConfig };

  // Validate maxRetries
  if (typeof validated.maxRetries !== 'number' || validated.maxRetries < 0) {
    console.warn('Warning: retry.maxRetries must be non-negative number, using 3');
    validated.maxRetries = 3;
  }

  // Validate initialDelay
  if (typeof validated.initialDelay !== 'number' || validated.initialDelay < 0) {
    console.warn('Warning: retry.initialDelay must be non-negative number, using 2000');
    validated.initialDelay = 2000;
  }

  // Validate maxDelay
  if (typeof validated.maxDelay !== 'number' || validated.maxDelay < validated.initialDelay) {
    console.warn('Warning: retry.maxDelay must be >= initialDelay, using 32000');
    validated.maxDelay = 32000;
  }

  // Validate maxTotalDuration
  if (typeof validated.maxTotalDuration !== 'number' || validated.maxTotalDuration < 0) {
    console.warn('Warning: retry.maxTotalDuration must be non-negative number, using 60000');
    validated.maxTotalDuration = 60000;
  }

  return validated;
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
