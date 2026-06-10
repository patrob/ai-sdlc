/**
 * Maximum allowed pattern length to prevent ReDoS attacks
 */
const MAX_PATTERN_LENGTH = 100;

/**
 * Check if a label matches a glob pattern.
 * Supports wildcard (*) for pattern matching with proper regex escaping.
 *
 * @param label - The label to test
 * @param pattern - The glob pattern (e.g., 'epic-*', '*-test')
 * @returns true if label matches pattern
 * @throws Error if pattern exceeds maximum length
 *
 * @example
 * labelMatchesPattern('epic-ticketing', 'epic-*') // true
 * labelMatchesPattern('sprint-2024-q1', 'epic-*') // false
 * labelMatchesPattern('test.label', 'test.label') // true (special chars escaped)
 */
export function labelMatchesPattern(label: string, pattern: string): boolean {
  // Security: Prevent ReDoS by limiting pattern length
  if (pattern.length > MAX_PATTERN_LENGTH) {
    throw new Error(`Pattern exceeds maximum length of ${MAX_PATTERN_LENGTH} characters`);
  }

  // Handle empty pattern edge case
  if (pattern === '') {
    return label === '';
  }

  // Escape special regex characters except *
  // Characters that need escaping: . + ? ^ $ { } ( ) | [ ] \
  const escapedPattern = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');

  // Convert glob wildcard (*) to regex (.*)
  const regexPattern = escapedPattern.replace(/\*/g, '.*');

  // Create anchored regex (exact match from start to end)
  const regex = new RegExp(`^${regexPattern}$`);

  return regex.test(label);
}
