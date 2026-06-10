/**
 * Test output processing and formatting utilities
 */

/**
 * Extracted test output with prioritized failure information
 */
export interface ExtractedTestOutput {
  /** Individual FAIL blocks with error details */
  failures: string[];
  /** Summary line (e.g., "Test Files: 1 failed | 2 passed") */
  summary: string;
  /** Truncated passing test output */
  truncatedPassing: string;
}

/**
 * Sanitize test output to remove ANSI escape sequences and potential injection patterns
 * @param output Test output string
 * @returns Sanitized output
 */
export function sanitizeTestOutput(output: string): string {
  if (!output) return '';

  let sanitized = output
    // Remove ANSI CSI sequences (SGR parameters - colors, styles)
    .replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '')
    // Remove ANSI DCS sequences (Device Control String)
    .replace(/\x1BP[^\x1B]*\x1B\\/g, '')
    // Remove ANSI PM sequences (Privacy Message)
    .replace(/\x1B\^[^\x1B]*\x1B\\/g, '')
    // Remove ANSI OSC sequences (Operating System Command) - terminated by BEL or ST
    .replace(/\x1B\][^\x07\x1B]*(\x07|\x1B\\)/g, '')
    // Remove any remaining standalone escape characters
    .replace(/\x1B/g, '')
    // Remove other control characters except newline, tab, carriage return
    .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F-\x9F]/g, '');

  return sanitized;
}

/**
 * Extract failure blocks and summary from vitest output
 * Vitest puts failures at the END of output, so naive truncation misses them.
 *
 * @param output Raw test output (already sanitized)
 * @returns Structured extraction with failures, summary, and passing tests
 */
export function extractTestFailures(output: string): ExtractedTestOutput {
  const result: ExtractedTestOutput = {
    failures: [],
    summary: '',
    truncatedPassing: '',
  };

  if (!output) return result;

  const lines = output.split('\n');

  // Extract summary line - appears near the end
  // Vitest format: "Test Files  1 failed | 2 passed (3)"
  // Also handle: "Tests  3 failed | 5 passed (8)"
  const summaryPatterns = [
    /^\s*Test Files?\s+\d+\s+failed.*$/i,
    /^\s*Tests?\s+\d+\s+failed.*$/i,
    /^\s*Test Suites?:\s+\d+\s+failed.*$/i, // Jest format
  ];

  for (let i = lines.length - 1; i >= 0; i--) {
    for (const pattern of summaryPatterns) {
      if (pattern.test(lines[i])) {
        result.summary = lines[i].trim();
        break;
      }
    }
    if (result.summary) break;
  }

  // Extract FAIL blocks
  // Vitest format: " FAIL  src/file.test.ts > Suite > test name"
  // Then indented error details follow until next test or blank lines
  const failBlockStarts: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    // Match FAIL markers - vitest uses " FAIL " prefix
    if (/^\s*(?:FAIL|✗|×|❌)\s+/.test(lines[i]) || /^\s*FAIL\s+/.test(lines[i])) {
      failBlockStarts.push(i);
    }
  }

  // Extract each fail block with context (error details, expected/received)
  for (const startIdx of failBlockStarts) {
    const blockLines: string[] = [lines[startIdx]];

    // Collect lines until we hit another test marker, double blank line, or summary
    for (let i = startIdx + 1; i < lines.length; i++) {
      const line = lines[i];

      // Stop at next test marker
      if (/^\s*(?:FAIL|PASS|✓|✗|×|❌|✔)\s+/.test(line)) {
        break;
      }

      // Stop at summary section
      if (summaryPatterns.some((p) => p.test(line))) {
        break;
      }

      // Stop at duration/timing line (indicates end of test output)
      if (/^\s*Duration\s+/i.test(line)) {
        break;
      }

      blockLines.push(line);
    }

    // Clean up trailing empty lines
    while (blockLines.length > 0 && blockLines[blockLines.length - 1].trim() === '') {
      blockLines.pop();
    }

    if (blockLines.length > 0) {
      result.failures.push(blockLines.join('\n'));
    }
  }

  // Extract passing test output (everything that's not a fail block or summary)
  // This is lower priority - truncate heavily
  const passingLines: string[] = [];
  const failBlockRanges = new Set<number>();

  // Mark lines that are part of fail blocks
  for (const startIdx of failBlockStarts) {
    for (let i = startIdx; i < lines.length; i++) {
      if (i > startIdx && /^\s*(?:FAIL|PASS|✓|✗|×|❌|✔)\s+/.test(lines[i])) {
        break;
      }
      failBlockRanges.add(i);
    }
  }

  // Collect non-fail, non-summary lines
  for (let i = 0; i < lines.length; i++) {
    if (failBlockRanges.has(i)) continue;
    if (summaryPatterns.some((p) => p.test(lines[i]))) continue;

    // Include passing test indicators and context
    const line = lines[i];
    if (line.trim()) {
      passingLines.push(line);
    }
  }

  result.truncatedPassing = passingLines.join('\n');

  return result;
}

/**
 * Truncate test output to prevent overwhelming the LLM
 * Prioritizes failure information over passing tests since vitest puts failures at the end.
 *
 * @param output Test output string
 * @param maxLength Maximum length (default 8000 chars, increased to show more failures)
 * @returns Truncated and sanitized output with failures prioritized
 */
export function truncateTestOutput(output: string, maxLength: number = 8000): string {
  if (!output) return '';

  // First sanitize to remove ANSI and control characters
  const sanitized = sanitizeTestOutput(output);

  // If output fits, return as-is
  if (sanitized.length <= maxLength) {
    return sanitized;
  }

  // Extract structured information
  const extracted = extractTestFailures(sanitized);

  // If no failures detected, fall back to showing end of output (where failures usually are)
  if (extracted.failures.length === 0) {
    // Show the END of output since that's where vitest puts failures
    const endContent = sanitized.slice(-maxLength);
    return `[Output truncated. Showing last ${maxLength} characters of ${sanitized.length} total.]\n\n${endContent}`;
  }

  // Build output prioritizing failures
  let result = '';

  // 1. Always include summary first if present
  if (extracted.summary) {
    result += `=== TEST SUMMARY ===\n${extracted.summary}\n\n`;
  }

  // 2. Include all failure blocks (these are what the agent needs)
  result += `=== FAILURE DETAILS ===\n`;
  for (const failure of extracted.failures) {
    result += failure + '\n\n';
  }

  // 3. If space remains, add truncated passing tests
  const remaining = maxLength - result.length - 100; // Leave room for notice
  if (remaining > 500 && extracted.truncatedPassing) {
    const truncatedPassing = extracted.truncatedPassing.substring(0, remaining);
    result += `\n=== PASSING TESTS (truncated) ===\n${truncatedPassing}`;
  }

  // Add truncation notice if we truncated
  if (result.length < sanitized.length) {
    result += `\n\n[Output restructured. Showing ${extracted.failures.length} failure(s) from ${sanitized.length} total characters.]`;
  }

  return result;
}

/**
 * Detect if errors are related to missing dependencies
 * Returns module names that are missing, if any
 */
export function detectMissingDependencies(output: string): string[] {
  if (!output) return [];

  const missingModules: string[] = [];

  // Pattern: Cannot find module 'package-name'
  const cannotFindPattern = /Cannot find module ['"]([^'"]+)['"]/g;
  let match;
  while ((match = cannotFindPattern.exec(output)) !== null) {
    const moduleName = match[1];
    // Only include external packages, not relative imports
    if (!moduleName.startsWith('.') && !moduleName.startsWith('/')) {
      // Extract base package name (handle scoped packages like @types/foo)
      const baseName = moduleName.startsWith('@')
        ? moduleName.split('/').slice(0, 2).join('/')
        : moduleName.split('/')[0];
      if (!missingModules.includes(baseName)) {
        missingModules.push(baseName);
      }
    }
  }

  // Pattern: Module not found: Error: Can't resolve 'package-name'
  const cantResolvePattern = /(?:Module not found|Can't resolve)[:\s]+['"]([^'"]+)['"]/g;
  while ((match = cantResolvePattern.exec(output)) !== null) {
    const moduleName = match[1];
    if (!moduleName.startsWith('.') && !moduleName.startsWith('/')) {
      const baseName = moduleName.startsWith('@')
        ? moduleName.split('/').slice(0, 2).join('/')
        : moduleName.split('/')[0];
      if (!missingModules.includes(baseName)) {
        missingModules.push(baseName);
      }
    }
  }

  return missingModules;
}
