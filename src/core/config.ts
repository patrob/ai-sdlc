import fs from 'fs';
import path from 'path';
import { Config, StageGateConfig } from '../types/index.js';

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

  if (!fs.existsSync(configPath)) {
    return { ...DEFAULT_CONFIG };
  }

  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    const userConfig = JSON.parse(content) as Partial<Config>;

    return {
      ...DEFAULT_CONFIG,
      ...userConfig,
      stageGates: {
        ...DEFAULT_CONFIG.stageGates,
        ...userConfig.stageGates,
      },
    };
  } catch (error) {
    console.warn(`Warning: Could not parse ${CONFIG_FILENAME}, using defaults`);
    return { ...DEFAULT_CONFIG };
  }
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
