import fs from 'fs';
import path from 'path';

import { DEFAULT_PRIORITY_GAP,STORIES_FOLDER, type Story, STORY_FILENAME, type StoryFrontmatter } from '../../types/index.js';
import { parseStory, writeStory } from './io.js';

/**
 * Generate a unique story ID in sequential format (S-0001, S-0002, etc.)
 * Scans the stories folder to find the highest existing number.
 *
 * @param storiesFolder - Path to the stories directory
 * @returns Sequential story ID like "S-0001"
 */
export function generateStoryId(storiesFolder?: string): string {
  let maxNum = 0;

  if (storiesFolder && fs.existsSync(storiesFolder)) {
    try {
      const dirs = fs.readdirSync(storiesFolder, { withFileTypes: true });
      for (const dir of dirs) {
        if (!dir.isDirectory()) continue;
        // Match both S-XXXX format (new) and fall back to checking for any existing
        const match = dir.name.match(/^S-(\d+)$/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxNum) maxNum = num;
        }
      }
    } catch {
      // If we can't read, start from 0
    }
  }

  // Generate next ID with zero-padded 4 digits
  const nextId = `S-${String(maxNum + 1).padStart(4, '0')}`;
  return nextId;
}

/**
 * Generate a legacy story ID (for backwards compatibility/fallback)
 * @deprecated Use generateStoryId() instead
 */
export function generateLegacyStoryId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 6);
  return `story-${timestamp}-${random}`;
}

/**
 * Create a slug from a title
 */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50);
}

/**
 * Sanitize a title string for safe use in file paths and display.
 * Removes dangerous characters that could be used for injection attacks.
 *
 * SECURITY: This function prevents command injection and path traversal through titles.
 *
 * @param title - Title string to sanitize
 * @returns Sanitized title safe for use in paths and commands
 */
export function sanitizeTitle(title: string): string {
  if (!title) return '';

  let sanitized = title
    // Remove shell metacharacters that could be used for command injection
    .replace(/[`$()\\|&;<>]/g, '')
    // Remove ANSI escape codes (colors, cursor control)
    .replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '')
    // Remove OSC sequences (hyperlinks, window titles)
    .replace(/\x1B\][^\x07]*\x07/g, '')
    .replace(/\x1B\][^\x1B]*\x1B\\/g, '')
    // Remove null bytes and control characters
    .replace(/[\x00-\x1F\x7F-\x9F]/g, '');

  // Normalize Unicode to prevent homograph attacks
  sanitized = sanitized.normalize('NFC');

  // Limit length to prevent storage issues
  if (sanitized.length > 200) {
    sanitized = sanitized.substring(0, 200);
  }

  return sanitized.trim();
}

/**
 * Extract title from file content using safe parsing.
 * Priority: YAML frontmatter > H1 heading > null
 *
 * SECURITY: Uses regex-only approach to avoid YAML parser vulnerabilities.
 *
 * @param content - File content to extract title from
 * @returns Extracted title or null if not found
 */
export function extractTitleFromContent(content: string): string | null {
  if (!content || content.trim().length === 0) {
    return null;
  }

  // Try to extract from YAML frontmatter using safe regex (no full YAML parsing)
  // Match: --- at start, then look for title: field, then --- to close
  const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/m);
  if (frontmatterMatch) {
    // Look for title: field in the frontmatter block
    const titleMatch = frontmatterMatch[1].match(/^title:\s*['"]?([^'"\n]+?)['"]?\s*$/m);
    if (titleMatch && titleMatch[1]) {
      const title = titleMatch[1].trim();
      if (title.length > 0) {
        return sanitizeTitle(title);
      }
    }
  }

  // Fall back to first H1 heading (# Title)
  // Use non-greedy matching with length limit to prevent ReDoS
  const h1Match = content.match(/^#\s+(.{1,200}?)$/m);
  if (h1Match && h1Match[1]) {
    const title = h1Match[1].trim();
    if (title.length > 0) {
      return sanitizeTitle(title);
    }
  }

  // No title found
  return null;
}

/**
 * Create a new story in the folder-per-story structure
 *
 * Creates stories/{id}/story.md with slug and priority in frontmatter.
 * Priority uses gaps (10, 20, 30...) for easy insertion without renumbering.
 *
 * @param title - Story title
 * @param sdlcRoot - Root path of .ai-sdlc folder
 * @param options - Optional frontmatter fields
 * @param content - Optional custom story content (if not provided, uses default template)
 */
export async function createStory(
  title: string,
  sdlcRoot: string,
  options: Partial<StoryFrontmatter> = {},
  content?: string
): Promise<Story> {
  const storiesFolder = path.join(sdlcRoot, STORIES_FOLDER);

  // Validate parent stories/ directory exists
  if (!fs.existsSync(storiesFolder)) {
    throw new Error(`Stories folder does not exist: ${storiesFolder}. Run 'ai-sdlc init' first.`);
  }

  // Generate unique ID and slug
  const id = generateStoryId(storiesFolder);
  const slug = slugify(title);

  // Create story folder: stories/{id}/
  const storyFolder = path.join(storiesFolder, id);
  fs.mkdirSync(storyFolder, { recursive: true });

  // Create story file path: stories/{id}/story.md
  const filePath = path.join(storyFolder, STORY_FILENAME);

  // Calculate priority using gaps - find max priority and add DEFAULT_PRIORITY_GAP
  let priority = DEFAULT_PRIORITY_GAP; // Start at 10 for first story
  try {
    const existingDirs = fs.readdirSync(storiesFolder, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory());

    if (existingDirs.length > 0) {
      let maxPriority = 0;
      for (const dir of existingDirs) {
        const storyPath = path.join(storiesFolder, dir.name, STORY_FILENAME);
        if (fs.existsSync(storyPath)) {
          try {
            const existingStory = parseStory(storyPath);
            if (existingStory.frontmatter.priority > maxPriority) {
              maxPriority = existingStory.frontmatter.priority;
            }
          } catch (_err) {
            // Skip malformed stories
            continue;
          }
        }
      }
      priority = maxPriority + DEFAULT_PRIORITY_GAP;
    }
  } catch (_err) {
    // If we can't read existing stories, start at DEFAULT_PRIORITY_GAP
    priority = DEFAULT_PRIORITY_GAP;
  }

  const frontmatter: StoryFrontmatter = {
    id,
    title,
    slug,
    priority,
    status: 'backlog',
    type: options.type || 'feature',
    created: new Date().toISOString().split('T')[0],
    labels: options.labels || [],
    research_complete: false,
    plan_complete: false,
    implementation_complete: false,
    reviews_complete: false,
    // Default content_type to 'code' for backward compatibility
    // Stories that don't modify src/ should explicitly set content_type: 'configuration' or 'documentation'
    content_type: 'code',
    ...options,
  };

  // Use custom content if provided, otherwise use default template
  let storyContent: string;
  if (content) {
    // Security: strip dangerous <script>/<iframe> tags from custom content.
    // Index-based scan (no tag-matching regex) looping until stable fully removes
    // tag bodies without the regex pitfalls flagged by static analysis.
    storyContent = content;
    for (const tag of ['script', 'iframe']) {
      const open = '<' + tag;
      const close = '</' + tag;
      let lower = storyContent.toLowerCase();
      let start = lower.indexOf(open);
      while (start !== -1) {
        const closeStart = lower.indexOf(close, start);
        if (closeStart === -1) {
          // No closing tag - drop everything from the opening tag onward
          storyContent = storyContent.slice(0, start);
          break;
        }
        const gt = storyContent.indexOf('>', closeStart);
        const end = gt === -1 ? storyContent.length : gt + 1;
        storyContent = storyContent.slice(0, start) + storyContent.slice(end);
        lower = storyContent.toLowerCase();
        start = lower.indexOf(open);
      }
    }
  } else {
    // Default template - lean story.md without section placeholders
    // Agent outputs (research, plan, review) go to separate files in the story folder
    storyContent = `# ${title}

## Summary

(Describe the feature, bug, or task here)

## Acceptance Criteria

- [ ] (Define acceptance criteria)`;
  }

  const story: Story = {
    path: filePath,
    slug,
    frontmatter,
    content: storyContent,
  };

  await writeStory(story);

  // Return story with canonical path for consistency
  const canonicalPath = fs.realpathSync(filePath);
  return { ...story, path: canonicalPath };
}
