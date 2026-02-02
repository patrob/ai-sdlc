/**
 * Claude-specific configuration constants
 */

/**
 * Default Claude model (Sonnet 4.5)
 */
export const DEFAULT_MODEL = 'claude-sonnet-4-5-20250929';

/**
 * Claude Opus model
 */
export const OPUS_MODEL = 'claude-opus-4-5-20251101';

/**
 * List of all supported Claude models
 */
export const SUPPORTED_MODELS = [
  DEFAULT_MODEL,
  OPUS_MODEL,
] as const;

/**
 * Permission mode for Claude SDK
 * Controls how the SDK handles file edits and operations
 */
export const PERMISSION_MODE = 'acceptEdits' as const;

/**
 * Default setting sources for Claude SDK
 * Controls where the SDK looks for configuration (e.g., CLAUDE.md files)
 */
export const DEFAULT_SETTING_SOURCES = ['project'] as const;

/**
 * Maximum context window size in tokens for Claude models
 */
export const MAX_CONTEXT_TOKENS = 200000;
