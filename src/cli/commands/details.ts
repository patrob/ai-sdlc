import { getSdlcRoot, loadConfig } from '../../core/config.js';
import { kanbanExists } from '../../core/kanban.js';
import { findStoryBySlug } from '../../core/kanban.js';
import { findStoryById } from '../../core/story.js';
import { getThemedChalk } from '../../core/theme.js';
import type { Story } from '../../types/index.js';
import { formatStatus as formatStatusUtil } from '../story-utils.js';

/**
 * Format status with appropriate color (wrapper for shared utility)
 */
function formatStatus(status: string, c: any): string {
  return formatStatusUtil(status, c);
}

/**
 * Format date for display
 */
function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  } catch {
    return dateStr;
  }
}

/**
 * Format checkbox (completed/not completed)
 */
function formatCheckbox(completed: boolean, c: any): string {
  return completed ? c.success('✓ Complete') : c.dim('○ Pending');
}

/**
 * Display content sections from the story
 */
function displayContentSections(story: Story, c: any): void {
  const content = story.content;

  // Parse sections from markdown
  const sections = parseContentSections(content);

  // Display each section if it has content
  for (const section of sections) {
    if (section.content && !isEmptySection(section.content)) {
      console.log(c.info(section.title.toUpperCase()));
      console.log(c.dim('─'.repeat(60)));
      console.log(section.content);
      console.log();
    }
  }
}

/**
 * Parse markdown content into sections
 */
function parseContentSections(content: string): Array<{ title: string; content: string }> {
  const sections: Array<{ title: string; content: string }> = [];
  const lines = content.split('\n');

  let currentSection: { title: string; content: string } | null = null;

  for (const line of lines) {
    // Check if this is a section header (## Header)
    const headerMatch = line.match(/^##\s+(.+)$/);

    if (headerMatch) {
      // Save previous section if exists
      if (currentSection) {
        sections.push(currentSection);
      }

      // Start new section
      currentSection = {
        title: headerMatch[1],
        content: '',
      };
    } else if (currentSection) {
      // Add line to current section
      currentSection.content += line + '\n';
    }
  }

  // Don't forget the last section
  if (currentSection) {
    sections.push(currentSection);
  }

  return sections;
}

/**
 * Check if a section is empty (contains only placeholder comments or whitespace)
 */
function isEmptySection(content: string): boolean {
  const trimmed = content.trim();

  // Empty or only whitespace
  if (!trimmed) {
    return true;
  }

  // Only contains placeholder HTML comments
  const withoutComments = trimmed.replace(/<!--[\s\S]*?-->/g, '').trim();
  if (!withoutComments) {
    return true;
  }

  return false;
}

/**
 * Show detailed information about a story by ID or slug
 */
export async function details(idOrSlug: string): Promise<void> {
  const config = loadConfig();
  const sdlcRoot = getSdlcRoot();
  const c = getThemedChalk(config);

  // Check if SDLC is initialized
  if (!kanbanExists(sdlcRoot)) {
    console.log(c.warning('ai-sdlc not initialized. Run `ai-sdlc init` first.'));
    return;
  }

  // Validate input
  if (!idOrSlug || idOrSlug.trim() === '') {
    console.log(c.error('Error: Please provide a story ID or slug.'));
    console.log(c.dim('Usage: ai-sdlc details <id|slug>'));
    return;
  }

  // Normalize input (case-insensitive)
  const normalizedInput = idOrSlug.toLowerCase().trim();

  // Try to find story by ID first, then by slug
  let story = findStoryById(sdlcRoot, normalizedInput);

  if (!story) {
    story = findStoryBySlug(sdlcRoot, normalizedInput);
  }

  // Handle not found
  if (!story) {
    console.log(c.error(`Error: Story not found: "${idOrSlug}"`));
    console.log();
    console.log(c.dim('Searched for:'));
    console.log(c.dim(`  ID: ${normalizedInput}`));
    console.log(c.dim(`  Slug: ${normalizedInput}`));
    console.log();
    console.log(c.info('Tip: Use `ai-sdlc status` to see all available stories.'));
    return;
  }

  // Display story details
  console.log();
  console.log(c.bold('═'.repeat(60)));
  console.log(c.bold(story.frontmatter.title));
  console.log(c.bold('═'.repeat(60)));
  console.log();

  // Metadata section
  console.log(c.info('METADATA'));
  console.log(c.dim('─'.repeat(60)));
  console.log(`${c.dim('ID:')}          ${story.frontmatter.id}`);
  console.log(`${c.dim('Slug:')}        ${story.slug}`);
  console.log(`${c.dim('Status:')}      ${formatStatus(story.frontmatter.status, c)}`);
  console.log(`${c.dim('Priority:')}    ${story.frontmatter.priority}`);
  console.log(`${c.dim('Type:')}        ${story.frontmatter.type}`);

  if (story.frontmatter.estimated_effort) {
    console.log(`${c.dim('Effort:')}      ${story.frontmatter.estimated_effort}`);
  }

  if (story.frontmatter.assignee) {
    console.log(`${c.dim('Assignee:')}    ${story.frontmatter.assignee}`);
  }

  if (story.frontmatter.labels && story.frontmatter.labels.length > 0) {
    console.log(`${c.dim('Labels:')}      ${story.frontmatter.labels.join(', ')}`);
  }

  console.log(`${c.dim('Created:')}     ${formatDate(story.frontmatter.created)}`);

  if (story.frontmatter.updated) {
    console.log(`${c.dim('Updated:')}     ${formatDate(story.frontmatter.updated)}`);
  }

  console.log();

  // Workflow status section
  console.log(c.info('WORKFLOW STATUS'));
  console.log(c.dim('─'.repeat(60)));
  console.log(`${c.dim('Research:')}         ${formatCheckbox(story.frontmatter.research_complete, c)}`);
  console.log(`${c.dim('Planning:')}         ${formatCheckbox(story.frontmatter.plan_complete, c)}`);
  console.log(`${c.dim('Implementation:')}   ${formatCheckbox(story.frontmatter.implementation_complete, c)}`);
  console.log(`${c.dim('Reviews:')}          ${formatCheckbox(story.frontmatter.reviews_complete, c)}`);
  console.log();

  // PR information (if present)
  if (story.frontmatter.pr_url || story.frontmatter.branch) {
    console.log(c.info('PULL REQUEST'));
    console.log(c.dim('─'.repeat(60)));

    if (story.frontmatter.branch) {
      console.log(`${c.dim('Branch:')}    ${story.frontmatter.branch}`);
    }

    if (story.frontmatter.pr_url) {
      console.log(`${c.dim('PR URL:')}    ${story.frontmatter.pr_url}`);
    }

    console.log();
  }

  // Error information (if present)
  if (story.frontmatter.last_error) {
    console.log(c.error('LAST ERROR'));
    console.log(c.dim('─'.repeat(60)));
    console.log(c.error(story.frontmatter.last_error));
    console.log();
  }

  // Content sections
  displayContentSections(story, c);

  console.log(c.bold('═'.repeat(60)));
  console.log();
}
