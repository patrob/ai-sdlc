import Table from 'cli-table3';
import type { TableConstructorOptions } from 'cli-table3';
import { Story } from '../types/index.js';
import { ThemeColors } from '../types/index.js';
import {
  truncateText,
  formatLabels,
  getTerminalWidth,
  shouldUseCompactView as shouldUseCompact,
  getColumnWidths,
  sanitizeInput,
  ColumnWidths,
} from './formatting.js';
import { getStoryFlags, formatStatus } from './story-utils.js';

/**
 * Create table configuration with themed colors
 */
function createTableConfig(themedChalk: ThemeColors): TableConstructorOptions {
  return {
    head: ['Story ID', 'Title', 'Status', 'Labels', 'Flags'],
    style: {
      head: [], // We'll apply colors manually
      border: [], // Use default Unicode borders
      compact: false,
    },
    chars: {
      'top': '─',
      'top-mid': '┬',
      'top-left': '┌',
      'top-right': '┐',
      'bottom': '─',
      'bottom-mid': '┴',
      'bottom-left': '└',
      'bottom-right': '┘',
      'left': '│',
      'left-mid': '├',
      'mid': '─',
      'mid-mid': '┼',
      'right': '│',
      'right-mid': '┤',
      'middle': '│'
    },
    colWidths: [], // Will be set dynamically
    wordWrap: false, // We handle truncation manually
  };
}

/**
 * Format a story row for table display
 * Sanitizes all user input to prevent security issues
 */
function formatStoryRow(story: Story, columnWidths: ColumnWidths, themedChalk: ThemeColors): string[] {
  // Sanitize and handle missing/empty values
  const id = sanitizeInput(story.frontmatter.id || '(no ID)');
  const title = sanitizeInput(story.frontmatter.title || '(No title)');
  const status = formatStatus(story.frontmatter.status, themedChalk);
  const labels = formatLabels(story.frontmatter.labels || [], columnWidths.labels - 2); // -2 for padding
  const flags = getStoryFlags(story, themedChalk);

  // Truncate title based on column width
  const truncatedTitle = truncateText(title, columnWidths.title - 2); // -2 for padding

  return [
    id,
    truncatedTitle,
    status,
    labels,
    flags,
  ];
}

/**
 * Render stories as a formatted table
 * Includes error handling to prevent crashes from malformed data
 */
export function renderStoryTable(stories: Story[], themedChalk: ThemeColors): string {
  if (stories.length === 0) {
    return themedChalk.dim('  (empty)');
  }

  try {
    const termWidth = getTerminalWidth();
    const columnWidths = getColumnWidths(termWidth);

    // Create table with configuration
    const config = createTableConfig(themedChalk);

    // Set column widths
    config.colWidths = [
      columnWidths.id,
      columnWidths.title,
      columnWidths.status,
      columnWidths.labels,
      columnWidths.flags,
    ];

    // Apply theme colors to headers
    if (config.head) {
      config.head = config.head.map((header: string) => themedChalk.bold(themedChalk.info(header)));
    }

    const table = new Table(config);

    // Add story rows with error handling for each story
    for (const story of stories) {
      try {
        const row = formatStoryRow(story, columnWidths, themedChalk);
        table.push(row);
      } catch (error) {
        // Log error but continue rendering other stories
        console.error(themedChalk.error('Error rendering story, skipping...'));
      }
    }

    return table.toString();
  } catch (error) {
    // Fallback to error message if table rendering fails completely
    return themedChalk.error('Error rendering stories. Please check story data format.');
  }
}

/**
 * Render stories in compact view for narrow terminals
 * Uses responsive separator width and sanitized input
 */
export function renderCompactView(stories: Story[], themedChalk: ThemeColors): string {
  if (stories.length === 0) {
    return themedChalk.dim('  (empty)');
  }

  const lines: string[] = [];
  const termWidth = getTerminalWidth();
  const separatorWidth = Math.min(60, termWidth - 4);
  const separator = themedChalk.dim('─'.repeat(separatorWidth));

  for (const story of stories) {
    // Sanitize all user input (use || to handle empty strings as well)
    const id = sanitizeInput(story.frontmatter.id || '(no ID)');
    const title = sanitizeInput(story.frontmatter.title || '(No title)');
    const status = formatStatus(story.frontmatter.status, themedChalk);
    const labels = formatLabels(story.frontmatter.labels || [], 40);
    const flags = getStoryFlags(story, themedChalk);

    // Truncate title for compact view
    const truncatedTitle = truncateText(title, 60);

    // Format compact display
    lines.push(`${themedChalk.dim('ID:')} ${id} ${themedChalk.dim('|')} ${themedChalk.dim('Status:')} ${status}`);
    lines.push(`${themedChalk.dim('Title:')} ${truncatedTitle}`);

    if (labels || flags) {
      const labelPart = labels ? `${themedChalk.dim('Labels:')} ${labels}` : '';
      const flagPart = flags ? `${themedChalk.dim('Flags:')} ${flags}` : '';
      const divider = labelPart && flagPart ? ` ${themedChalk.dim('|')} ` : '';
      lines.push(labelPart + divider + flagPart);
    }

    lines.push(separator);
  }

  // Indent all lines for consistency with status output
  return lines.map(line => `  ${line}`).join('\n');
}

/**
 * Export the shouldUseCompactView function for use in commands
 */
export function shouldUseCompactView(terminalWidth?: number): boolean {
  const width = terminalWidth ?? getTerminalWidth();
  return shouldUseCompact(width);
}

/**
 * Main render function that chooses between table and compact view
 * Optionally shows a hint when using compact view (can be disabled with env var)
 */
export function renderStories(stories: Story[], themedChalk: ThemeColors): string {
  const termWidth = getTerminalWidth();

  if (shouldUseCompact(termWidth)) {
    // Optional: Add subtle hint about compact view (can be disabled with env var)
    const showHint = process.env.AI_SDLC_NO_HINTS !== '1';
    const hint = showHint
      ? themedChalk.dim(`  (Compact view: terminal width ${termWidth} < 100 cols)\n\n`)
      : '';
    return hint + renderCompactView(stories, themedChalk);
  }

  return renderStoryTable(stories, themedChalk);
}
