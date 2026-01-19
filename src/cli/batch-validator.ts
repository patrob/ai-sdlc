import { findStoryById } from '../core/story.js';
import { Story } from '../types/index.js';

/**
 * Validation error detail
 */
export interface ValidationError {
  /** Story ID that failed validation */
  storyId: string;
  /** Error message describing the issue */
  message: string;
}

/**
 * Result of batch validation
 */
export interface BatchValidationResult {
  /** Whether all validations passed */
  valid: boolean;
  /** List of valid story IDs that passed validation */
  validStoryIds: string[];
  /** List of validation errors */
  errors: ValidationError[];
}

/**
 * Parse comma-separated story ID list
 * Handles whitespace and filters empty strings
 *
 * @param input - Raw comma-separated string (e.g., "S-001, S-002 , S-003")
 * @returns Array of trimmed story IDs
 *
 * @example
 * parseStoryIdList("S-001,S-002,S-003") // => ["S-001", "S-002", "S-003"]
 * parseStoryIdList("S-001, S-002 , S-003") // => ["S-001", "S-002", "S-003"]
 * parseStoryIdList("") // => []
 */
export function parseStoryIdList(input: string): string[] {
  if (!input || input.trim() === '') {
    return [];
  }

  return input
    .split(',')
    .map(id => id.trim())
    .filter(id => id.length > 0);
}

/**
 * Deduplicate story IDs while preserving order
 * First occurrence is kept, subsequent duplicates are removed
 *
 * @param storyIds - Array of story IDs (may contain duplicates)
 * @returns Array with duplicates removed
 *
 * @example
 * deduplicateStoryIds(["S-001", "S-002", "S-001"]) // => ["S-001", "S-002"]
 * deduplicateStoryIds(["S-001", "S-001", "S-001"]) // => ["S-001"]
 */
export function deduplicateStoryIds(storyIds: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const id of storyIds) {
    const normalized = id.toUpperCase(); // Case-insensitive deduplication
    if (!seen.has(normalized)) {
      seen.add(normalized);
      result.push(id);
    }
  }

  return result;
}

/**
 * Validate story ID format
 * Story IDs must match pattern: S-\d+ (e.g., S-001, S-123)
 *
 * @param storyId - Story ID to validate
 * @returns true if format is valid, false otherwise
 *
 * @example
 * validateStoryIdFormat("S-001") // => true
 * validateStoryIdFormat("S-123") // => true
 * validateStoryIdFormat("s-001") // => true (case-insensitive)
 * validateStoryIdFormat("INVALID") // => false
 * validateStoryIdFormat("S-") // => false
 */
export function validateStoryIdFormat(storyId: string): boolean {
  return /^S-\d+$/i.test(storyId);
}

/**
 * Validate all story IDs in a batch
 * Checks format and existence for each story
 *
 * @param storyIds - Array of story IDs to validate
 * @param sdlcRoot - Root directory of .ai-sdlc
 * @returns BatchValidationResult with valid IDs and errors
 *
 * @example
 * const result = validateStoryIds(["S-001", "S-002", "INVALID"], sdlcRoot);
 * if (result.valid) {
 *   // All stories exist and are valid
 *   processStories(result.validStoryIds);
 * } else {
 *   // Show errors
 *   result.errors.forEach(err => console.log(err.message));
 * }
 */
export function validateStoryIds(
  storyIds: string[],
  sdlcRoot: string
): BatchValidationResult {
  const result: BatchValidationResult = {
    valid: true,
    validStoryIds: [],
    errors: [],
  };

  for (const storyId of storyIds) {
    // Check format
    if (!validateStoryIdFormat(storyId)) {
      result.valid = false;
      result.errors.push({
        storyId,
        message: `Invalid story ID format: ${storyId} (expected format: S-001, S-123, etc.)`,
      });
      continue;
    }

    // Check existence
    try {
      const story = findStoryById(sdlcRoot, storyId);
      if (!story) {
        result.valid = false;
        result.errors.push({
          storyId,
          message: `Story not found: ${storyId}`,
        });
      } else {
        result.validStoryIds.push(storyId);
      }
    } catch (error) {
      result.valid = false;
      result.errors.push({
        storyId,
        message: `Error validating story ${storyId}: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  return result;
}
