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
  getKanbanColumnWidth,
  padColumnToHeight,
  isWorktreeStory,
  getWorktreeIndicator,
} from './formatting.js';
import { getStoryFlags, formatStatus } from './story-utils.js';
import stringWidth from 'string-width';

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

/**
 * Column definition for kanban board
 */
export interface KanbanColumn {
  name: string;
  stories: Story[];
  color: any; // Chalk function
}

/**
 * Determine if kanban layout should be used based on terminal width
 *
 * @param terminalWidth - Current terminal width (optional, uses process.stdout.columns)
 * @returns true if terminal is wide enough for kanban layout (>= 80 cols)
 */
export function shouldUseKanbanLayout(terminalWidth?: number): boolean {
  const width = terminalWidth ?? getTerminalWidth();
  const MIN_KANBAN_WIDTH = 80;
  return width >= MIN_KANBAN_WIDTH;
}

/**
 * Format a single story entry for kanban column display
 * Shows story ID, title, and flags in a compact format
 *
 * @param story - Story to format (or null for empty slot)
 * @param columnWidth - Width allocated to the column
 * @param themedChalk - Themed chalk instance for coloring
 * @returns Formatted story entry string
 */
export function formatKanbanStoryEntry(
  story: Story | null,
  columnWidth: number,
  themedChalk: ThemeColors
): string {
  if (!story) {
    return '';
  }

  try {
    // Sanitize inputs
    const id = sanitizeInput(story.frontmatter.id || '(no ID)');
    const title = sanitizeInput(story.frontmatter.title || '(No title)');
    const flags = getStoryFlags(story, themedChalk);

    // Format: "story-id | Title [FLAGS]"
    const divider = themedChalk.dim(' │ ');
    let content = `${id}${divider}${title}`;

    // Add flags if present
    if (flags) {
      content += ` ${flags}`;
    }

    // Add worktree indicator if story is from a worktree
    if (isWorktreeStory(story.path)) {
      content += ` ${getWorktreeIndicator()}`;
    }

    // Truncate to fit column width
    const truncated = truncateText(content, columnWidth);

    return truncated;
  } catch (error) {
    return themedChalk.error('(error)');
  }
}

/**
 * Pad a string to a specific width with spaces
 * Handles Unicode characters correctly
 *
 * @param text - Text to pad
 * @param width - Target width
 * @returns Padded string
 */
function padToWidth(text: string, width: number): string {
  const currentWidth = stringWidth(text);
  if (currentWidth >= width) {
    return text;
  }
  const padding = ' '.repeat(width - currentWidth);
  return text + padding;
}

/**
 * Render kanban board with columns side-by-side
 *
 * @param columns - Array of column definitions with stories
 * @param themedChalk - Themed chalk instance for coloring
 * @returns Formatted kanban board string
 */
export function renderKanbanBoard(
  columns: KanbanColumn[],
  themedChalk: ThemeColors
): string {
  if (columns.length === 0) {
    return themedChalk.dim('  (no columns)');
  }

  try {
    const termWidth = getTerminalWidth();
    const colWidth = getKanbanColumnWidth(termWidth, columns.length);
    const separator = '│';

    const lines: string[] = [];

    // Build header row with column names and counts
    const headerParts = columns.map(col => {
      const count = col.stories.length;
      const header = `${col.name} (${count})`;
      const coloredHeader = themedChalk.bold(col.color(header));
      return padToWidth(coloredHeader, colWidth);
    });
    lines.push(headerParts.join(separator));

    // Build separator row
    const separatorParts = columns.map(() => '─'.repeat(colWidth));
    lines.push(themedChalk.dim(separatorParts.join('┼')));

    // Get maximum column height
    const maxHeight = Math.max(...columns.map(col => col.stories.length), 1);

    // Build story rows
    for (let rowIndex = 0; rowIndex < maxHeight; rowIndex++) {
      const rowParts = columns.map(col => {
        const story = col.stories[rowIndex] || null;

        if (!story) {
          // Empty slot or placeholder for first row of empty column
          if (rowIndex === 0 && col.stories.length === 0) {
            const emptyText = themedChalk.dim('(empty)');
            return padToWidth(emptyText, colWidth);
          }
          return padToWidth('', colWidth);
        }

        const entry = formatKanbanStoryEntry(story, colWidth, themedChalk);
        return padToWidth(entry, colWidth);
      });

      lines.push(rowParts.join(separator));
    }

    return lines.join('\n');
  } catch (error) {
    return themedChalk.error('Error rendering kanban board. Please check data format.');
  }
}
