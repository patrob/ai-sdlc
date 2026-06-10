import type { TDDTestCycle, ReviewIssue, ReviewIssueSeverity } from '../../types/index.js';

/**
 * Validate TDD cycles for completeness
 *
 * Checks that each TDD cycle has completed all three phases:
 * RED (failing test) → GREEN (passing test) → REFACTOR (improved code)
 *
 * @param cycles - Array of TDD test cycles to validate
 * @returns Array of violation messages (empty if all cycles are valid)
 */
export function validateTDDCycles(cycles: TDDTestCycle[]): string[] {
  const violations: string[] = [];

  for (const cycle of cycles) {
    // Check RED phase (must always have red_timestamp since that's when cycle starts)
    if (!cycle.red_timestamp) {
      violations.push(`TDD cycle ${cycle.cycle_number}: Missing RED phase timestamp`);
    }

    // Check GREEN phase
    if (!cycle.green_timestamp) {
      violations.push(`TDD cycle ${cycle.cycle_number}: Missing GREEN phase timestamp - implementation not completed`);
    }

    // Check REFACTOR phase
    if (!cycle.refactor_timestamp) {
      violations.push(`TDD cycle ${cycle.cycle_number}: Missing REFACTOR phase timestamp - refactoring step skipped`);
    }

    // Check for regression (all tests should be green after cycle completes)
    if (!cycle.all_tests_green) {
      violations.push(`TDD cycle ${cycle.cycle_number}: Tests not all green - regression detected`);
    }
  }

  return violations;
}

/**
 * Generate review issues from TDD violations
 *
 * Converts TDD validation violations into structured ReviewIssue objects
 * that can be included in the review results.
 *
 * @param violations - Array of violation messages from validateTDDCycles
 * @returns Array of ReviewIssue objects for the violations
 */
export function generateTDDIssues(violations: string[]): ReviewIssue[] {
  return violations.map((violation) => ({
    severity: 'critical' as ReviewIssueSeverity,
    category: 'tdd_violation',
    description: violation,
    suggestedFix: 'Complete the TDD cycle by ensuring all phases (RED → GREEN → REFACTOR) are executed and all tests pass.',
  }));
}
