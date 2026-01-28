/**
 * Utilities for normalizing priority values from GitHub Projects.
 */

/**
 * Normalize position-based priority.
 * Converts project position (1, 2, 3, ...) to priority value (10, 20, 30, ...).
 *
 * @param position - Position in the project (1-indexed)
 * @returns Normalized priority value (position * 10)
 */
export function normalizePositionPriority(position: number): number {
  if (position <= 0) {
    throw new Error(`Invalid position: ${position} (must be positive)`);
  }
  return position * 10;
}

/**
 * Normalize priority using a field value mapping.
 * Maps priority field values (e.g., 'P0', 'P1', 'High') to numeric priorities.
 *
 * @param value - Priority field value from GitHub Projects
 * @param mapping - Mapping from field values to numeric priorities
 * @returns Normalized priority value, or null if value not in mapping
 */
export function normalizeMappedPriority(
  value: string,
  mapping: Record<string, number>
): number | null {
  const priority = mapping[value];
  if (priority === undefined) {
    return null;
  }

  // Validate that the mapped value is a valid number
  if (typeof priority !== 'number' || !Number.isFinite(priority) || priority <= 0) {
    throw new Error(`Invalid priority mapping for "${value}": ${priority} (must be positive finite number)`);
  }

  return priority;
}
