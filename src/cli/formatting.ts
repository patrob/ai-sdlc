import stringWidth from 'string-width';

/**
 * Column width configuration for table display
 */
export interface ColumnWidths {
  id: number;
  title: number;
  status: number;
  labels: number;
  flags: number;
}

/**
 * Truncate text to a maximum length with ellipsis
 * Uses word boundary detection for better readability
 * Properly handles Unicode characters with iterative width adjustment
 *
 * @param text - The text to truncate
 * @param maxLength - Maximum length including ellipsis
 * @returns Truncated text with "..." if it exceeds maxLength
 */
export function truncateText(text: string, maxLength: number): string {
  if (!text) {
    return '';
  }

  // Sanitize input
  text = sanitizeInput(text);

  // Handle edge case: maxLength too small for ellipsis
  if (maxLength < 4) {
    return text.substring(0, maxLength);
  }

  // Use string-width for Unicode-aware width calculation
  const actualWidth = stringWidth(text);

  if (actualWidth <= maxLength) {
    return text;
  }

  // Truncate at character level first
  let truncated = text.substring(0, maxLength - 3);

  // Iteratively adjust for multi-byte characters
  // This ensures the visual width (not character count) is correct
  while (stringWidth(truncated) > maxLength - 3 && truncated.length > 0) {
    truncated = truncated.substring(0, truncated.length - 1);
  }

  // Try to truncate at last word boundary for better readability
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace >= maxLength * 0.7 && lastSpace > 0) {
    // Only use word boundary if it's not too far back (>=70% of maxLength)
    truncated = truncated.substring(0, lastSpace);
  }

  return truncated + '...';
}

/**
 * Format labels array for display with truncation
 * Shows first few labels and indicates if there are more
 * Filters out dangerous keys to prevent prototype pollution
 *
 * @param labels - Array of label strings
 * @param maxLength - Maximum total length for the label display
 * @returns Formatted label string (e.g., "label1, label2 +2 more")
 */
export function formatLabels(labels: string[], maxLength: number): string {
  if (!labels || labels.length === 0) {
    return '';
  }

  // Filter out prototype pollution keys (case-insensitive with trim) and sanitize labels
  const safeLabels = labels
    .filter(label => {
      if (!label) return false;
      const normalizedLabel = label.trim().toLowerCase();
      return !FORBIDDEN_KEYS.includes(normalizedLabel);
    })
    .map(label => sanitizeInput(label))
    .filter(label => label.length > 0);

  if (safeLabels.length === 0) {
    return '';
  }

  // Handle single label case
  if (safeLabels.length === 1) {
    return truncateText(safeLabels[0], maxLength);
  }

  // Build comma-separated list with truncation
  let result = '';
  let displayedCount = 0;

  for (let i = 0; i < safeLabels.length; i++) {
    const label = safeLabels[i];
    const separator = i === 0 ? '' : ', ';
    const testString = result + separator + label;

    // Check if adding this label would exceed max length
    const remainingCount = safeLabels.length - i;
    const moreText = remainingCount > 1 ? ` +${remainingCount} more` : '';

    if (stringWidth(testString + moreText) > maxLength) {
      // Adding this label would exceed limit
      if (displayedCount > 0) {
        // Show "more" indicator
        const moreCount = safeLabels.length - displayedCount;
        result += ` +${moreCount} more`;
      } else {
        // Can't even fit one label, truncate it
        result = truncateText(label, maxLength);
      }
      break;
    }

    result = testString;
    displayedCount++;
  }

  return result;
}

/**
 * Get terminal width with fallback to default
 *
 * @returns Terminal width in columns (defaults to 80 if not available)
 */
export function getTerminalWidth(): number {
  return process.stdout.columns || 80;
}

/**
 * Determine if compact view should be used based on terminal width
 *
 * @param terminalWidth - Current terminal width
 * @returns true if terminal is too narrow for full table view
 */
export function shouldUseCompactView(terminalWidth: number): boolean {
  const MIN_TABLE_WIDTH = 100;
  return terminalWidth < MIN_TABLE_WIDTH;
}

/**
 * Calculate responsive column widths based on terminal width
 * Uses fixed widths for smaller columns and distributes remaining space to title
 *
 * @param terminalWidth - Current terminal width
 * @returns Column width configuration
 */
export function getColumnWidths(terminalWidth: number): ColumnWidths {
  // Fixed widths for non-title columns (documented rationale):
  const FIXED_ID_WIDTH = 10;        // Fits 'S-0001' format (6 chars) + padding
  const FIXED_STATUS_WIDTH = 14;    // Longest status 'in-progress' (11 chars) + padding
  const FIXED_LABELS_WIDTH = 30;    // Space for ~3-4 typical labels with commas
  const FIXED_FLAGS_WIDTH = 8;      // Fits '[RPIV!]' (7 chars max) + padding
  const TABLE_BORDER_OVERHEAD = 10; // Approximate space for borders and padding

  // Calculate remaining space for title
  const fixedWidthsTotal = FIXED_ID_WIDTH + FIXED_STATUS_WIDTH + FIXED_LABELS_WIDTH + FIXED_FLAGS_WIDTH;
  const availableForTitle = Math.max(
    30, // Minimum title width
    terminalWidth - fixedWidthsTotal - TABLE_BORDER_OVERHEAD
  );

  // Cap title width at reasonable maximum
  const titleWidth = Math.min(60, availableForTitle);

  return {
    id: FIXED_ID_WIDTH,
    title: titleWidth,
    status: FIXED_STATUS_WIDTH,
    labels: FIXED_LABELS_WIDTH,
    flags: FIXED_FLAGS_WIDTH,
  };
}

/**
 * Maximum input length to prevent DoS attacks.
 * Set to 10,000 chars to accommodate long story descriptions
 * while preventing memory exhaustion from malicious inputs.
 */
const MAX_INPUT_LENGTH = 10000;

/**
 * Forbidden label names that could cause prototype pollution
 */
const FORBIDDEN_KEYS = ['__proto__', 'constructor', 'prototype'];

/**
 * Strip ANSI color codes and terminal control sequences from text
 * Uses bounded quantifiers to prevent ReDoS attacks
 *
 * @param text - Text potentially containing ANSI codes and control sequences
 * @returns Sanitized text with control sequences removed
 */
export function stripAnsiCodes(text: string): string {
  if (!text) return '';

  // Remove all terminal control sequences:
  // - CSI sequences (ANSI escape codes starting with \x1B[)
  //   Pattern: \x1B\[[^a-zA-Z\x1B]*[a-zA-Z]? matches intro + params + optional terminator
  //   Safe from ReDoS because [^a-zA-Z\x1B]* has no ambiguity with surrounding patterns
  // - OSC sequences (operating system commands, hyperlinks)
  //   Pattern: \x1B\][^\x1B]* handles both valid and malformed OSC sequences
  // - Standalone ESC and other control codes
  // eslint-disable-next-line no-control-regex
  return text.replace(
    /\x1B\[[^a-zA-Z\x1B]*[a-zA-Z]?|\x1B\][^\x1B]*|\x1B|[\x00-\x08\x0B-\x0C\x0E-\x1A\x1C-\x1F\x7F-\x9F]/g,
    ''
  );
}

/**
 * Sanitize input text to prevent security issues
 * Removes dangerous characters and limits length
 *
 * @param text - Raw input text
 * @returns Sanitized text safe for display
 */
export function sanitizeInput(text: string): string {
  if (!text) return '';

  // Enforce maximum length to prevent DoS
  if (text.length > MAX_INPUT_LENGTH) {
    text = text.substring(0, MAX_INPUT_LENGTH);
  }

  // Strip terminal control sequences and normalize Unicode
  text = stripAnsiCodes(text);
  text = text.normalize('NFC');

  return text;
}

/**
 * Format daemon summary status line
 * Shows counts of done, active, queued, and blocked stories
 *
 * @param stats - Daemon statistics object with done, active, queued, blocked counts
 * @returns Formatted status string (e.g., "1 done | 0 active | 2 queued")
 */
export function formatSummaryStatus(stats: { done: number; active: number; queued: number; blocked: number }): string {
  const parts: string[] = [];
  if (stats.done > 0) parts.push(`${stats.done} done`);
  if (stats.active > 0) parts.push(`${stats.active} active`);
  if (stats.queued > 0) parts.push(`${stats.queued} queued`);
  if (stats.blocked > 0) parts.push(`${stats.blocked} blocked`);
  return parts.join(' | ') || 'idle';
}

/**
 * Format elapsed time for display
 * Converts milliseconds to human-readable format (e.g., "42s" or "2m 30s")
 *
 * @param ms - Elapsed time in milliseconds
 * @returns Formatted time string
 */
export function formatElapsedTime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

/**
 * Format compact story completion message
 * Shows story ID, action count, and elapsed time on a single line
 *
 * @param storyId - The story identifier
 * @param actionsCount - Number of actions completed
 * @param elapsedMs - Elapsed time in milliseconds
 * @returns Formatted completion message (e.g., "✓ story-123 [5 actions · 42s]")
 */
export function formatCompactStoryCompletion(storyId: string, actionsCount: number, elapsedMs: number): string {
  const truncatedId = truncateText(storyId, 30);
  return `✓ ${truncatedId} [${actionsCount} actions · ${formatElapsedTime(elapsedMs)}]`;
}

/**
 * Calculate width per column for kanban board layout
 * Takes into account terminal width, number of columns, borders, and padding
 *
 * @param termWidth - Terminal width in columns
 * @param numCols - Number of kanban columns to display
 * @returns Width allocated to each column
 */
export function getKanbanColumnWidth(termWidth: number, numCols: number): number {
  const BORDER_WIDTH = 1;  // '│' separator between columns
  const PADDING = 2;       // 1 char padding on each side of content

  const borders = (numCols - 1) * BORDER_WIDTH;
  const totalPadding = numCols * PADDING;
  const availableWidth = termWidth - borders - totalPadding;

  return Math.floor(availableWidth / numCols);
}

/**
 * Pad an array to a specified height with empty strings
 * Used to align kanban columns of uneven heights
 *
 * @param items - Array of items to pad
 * @param maxHeight - Target height for the column
 * @returns New array padded to maxHeight (or original length if longer)
 */
export function padColumnToHeight(items: string[], maxHeight: number): string[] {
  if (items.length >= maxHeight) {
    return [...items]; // Return copy without truncating
  }

  const padded = [...items];
  while (padded.length < maxHeight) {
    padded.push('');
  }

  return padded;
}
