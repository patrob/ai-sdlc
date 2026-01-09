import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { Story, StoryFrontmatter, StoryStatus, FOLDER_TO_STATUS } from '../types/index.js';

/**
 * Parse a story markdown file into a Story object
 */
export function parseStory(filePath: string): Story {
  const content = fs.readFileSync(filePath, 'utf-8');
  const { data, content: body } = matter(content);

  // Extract slug from filename (remove priority prefix and .md extension)
  const filename = path.basename(filePath, '.md');
  const slug = filename.replace(/^\d+-/, '');

  return {
    path: filePath,
    slug,
    frontmatter: data as StoryFrontmatter,
    content: body.trim(),
  };
}

/**
 * Write a story back to disk
 */
export function writeStory(story: Story): void {
  const content = matter.stringify(story.content, story.frontmatter);
  fs.writeFileSync(story.path, content);
}

/**
 * Move a story to a different kanban folder
 */
export function moveStory(story: Story, toFolder: string, sdlcRoot: string): Story {
  const targetFolder = path.join(sdlcRoot, toFolder);

  // Ensure target folder exists
  if (!fs.existsSync(targetFolder)) {
    fs.mkdirSync(targetFolder, { recursive: true });
  }

  // Get existing stories in target folder to determine priority
  const existingFiles = fs.readdirSync(targetFolder).filter(f => f.endsWith('.md'));
  const newPriority = existingFiles.length + 1;

  // Create new filename with priority
  const newFilename = `${String(newPriority).padStart(2, '0')}-${story.slug}.md`;
  const newPath = path.join(targetFolder, newFilename);

  // Update frontmatter
  story.frontmatter.priority = newPriority;
  story.frontmatter.status = FOLDER_TO_STATUS[toFolder as keyof typeof FOLDER_TO_STATUS];
  story.frontmatter.updated = new Date().toISOString().split('T')[0];

  // Write to new location
  const oldPath = story.path;
  story.path = newPath;
  writeStory(story);

  // Remove old file
  if (fs.existsSync(oldPath) && oldPath !== newPath) {
    fs.unlinkSync(oldPath);
  }

  return story;
}

/**
 * Generate a unique story ID
 */
export function generateStoryId(): string {
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
 * Create a new story in the backlog
 */
export function createStory(
  title: string,
  sdlcRoot: string,
  options: Partial<StoryFrontmatter> = {}
): Story {
  const backlogFolder = path.join(sdlcRoot, 'backlog');

  // Ensure backlog folder exists
  if (!fs.existsSync(backlogFolder)) {
    fs.mkdirSync(backlogFolder, { recursive: true });
  }

  // Get existing stories to determine priority
  const existingFiles = fs.readdirSync(backlogFolder).filter(f => f.endsWith('.md'));
  const priority = existingFiles.length + 1;

  const slug = slugify(title);
  const filename = `${String(priority).padStart(2, '0')}-${slug}.md`;
  const filePath = path.join(backlogFolder, filename);

  const frontmatter: StoryFrontmatter = {
    id: generateStoryId(),
    title,
    priority,
    status: 'backlog',
    type: options.type || 'feature',
    created: new Date().toISOString().split('T')[0],
    labels: options.labels || [],
    research_complete: false,
    plan_complete: false,
    implementation_complete: false,
    reviews_complete: false,
    ...options,
  };

  const content = `# ${title}

## Summary

(Describe the feature, bug, or task here)

## Acceptance Criteria

- [ ] (Define acceptance criteria)

## Research

<!-- Populated by research agent -->

## Implementation Plan

<!-- Populated by planning agent -->

## Review Notes

<!-- Populated by review agents -->`;

  const story: Story = {
    path: filePath,
    slug,
    frontmatter,
    content,
  };

  writeStory(story);
  return story;
}

/**
 * Update story frontmatter field
 */
export function updateStoryField<K extends keyof StoryFrontmatter>(
  story: Story,
  field: K,
  value: StoryFrontmatter[K]
): Story {
  story.frontmatter[field] = value;
  story.frontmatter.updated = new Date().toISOString().split('T')[0];
  writeStory(story);
  return story;
}

/**
 * Append content to a section in the story
 */
export function appendToSection(story: Story, section: string, content: string): Story {
  const sectionHeader = `## ${section}`;
  const sectionIndex = story.content.indexOf(sectionHeader);

  if (sectionIndex === -1) {
    // Section doesn't exist, add it at the end
    story.content += `\n\n${sectionHeader}\n\n${content}`;
  } else {
    // Find the next section or end of content
    const afterHeader = sectionIndex + sectionHeader.length;
    const nextSectionMatch = story.content.substring(afterHeader).match(/\n## /);
    const insertPoint = nextSectionMatch
      ? afterHeader + nextSectionMatch.index!
      : story.content.length;

    // Insert content before next section
    story.content =
      story.content.substring(0, insertPoint).trimEnd() +
      '\n\n' +
      content +
      '\n' +
      story.content.substring(insertPoint);
  }

  story.frontmatter.updated = new Date().toISOString().split('T')[0];
  writeStory(story);
  return story;
}
