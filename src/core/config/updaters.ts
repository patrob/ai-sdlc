import * as fs from 'fs';
import path from 'path';

import { type Config, type ImplementationConfig, type RefinementConfig, type ReviewConfig, type StageGateConfig, type WorktreeConfig } from '../../types/index.js';
import { DEFAULT_WORKTREE_CONFIG } from './defaults.js';
import { loadConfig, saveConfig } from './loader.js';
import { validateImplementationConfig,validateReviewConfig } from './validators.js';

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
