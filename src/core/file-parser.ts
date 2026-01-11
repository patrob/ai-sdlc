/**
 * File parser utilities for story file attachment
 * Parses markdown and plaintext files into structured story content
 */

import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { StoryFrontmatter } from '../types/index.js';
import { validateStoryFile } from './file-validators.js';

/**
 * Extracted sections from a story file
 */
export interface StorySection {
  /** Summary/description of the story */
  summary?: string;
  /** Acceptance criteria for the story */
  acceptanceCriteria?: string;
}

/**
 * Parsed content from a story file
 */
export interface ParsedStoryContent {
  /** Title extracted from the file (from frontmatter, H1, or filename) */
  title?: string;
  /** Frontmatter fields if present */
  frontmatter?: Partial<StoryFrontmatter>;
  /** Main content of the file (body text) */
  content: string;
  /** Extracted sections from the content */
  sections?: StorySection;
}

/**
 * Extracts the title from an H1 heading in markdown content
 * @param content - Markdown content to search
 * @returns The title text or undefined if no H1 found
 */
function extractH1Title(content: string): string | undefined {
  // Match # at start of line (or start of string) followed by space and title
  const h1Match = content.match(/^#\s+(.+?)(?:\n|$)/m);
  if (h1Match) {
    return h1Match[1].trim();
  }
  return undefined;
}

/**
 * Extracts a specific section from markdown content
 * @param content - Markdown content to search
 * @param sectionName - Name of the section (without ##)
 * @returns The section content or undefined if not found
 */
function extractSection(content: string, sectionName: string): string | undefined {
  // Case-insensitive search for section header
  const sectionRegex = new RegExp(
    `^##\\s+${escapeRegExp(sectionName)}\\s*\\n([\\s\\S]*?)(?=^##\\s|$)`,
    'mi'
  );
  const match = content.match(sectionRegex);

  if (match) {
    const sectionContent = match[1].trim();
    // Return undefined for placeholder content
    if (isPlaceholderContent(sectionContent)) {
      return undefined;
    }
    return sectionContent;
  }

  return undefined;
}

/**
 * Escapes special regex characters in a string
 */
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Checks if content is just a placeholder
 */
function isPlaceholderContent(content: string): boolean {
  const placeholders = [
    /^\(.*\)$/s, // Content wrapped in parentheses like (Describe here)
    /^<!--.*-->$/s, // HTML comment
    /^-\s*\[\s*\]\s*\(.*\)$/m, // Unchecked checkbox with placeholder
  ];

  const trimmed = content.trim();
  return placeholders.some((pattern) => pattern.test(trimmed));
}

/**
 * Extracts sections from markdown content
 * @param content - Markdown body content
 * @returns Extracted sections
 */
function extractSections(content: string): StorySection {
  const sections: StorySection = {};

  // Try to extract Summary section
  const summary = extractSection(content, 'Summary');
  if (summary) {
    sections.summary = summary;
  }

  // Try to extract Acceptance Criteria section
  const acceptanceCriteria = extractSection(content, 'Acceptance Criteria');
  if (acceptanceCriteria) {
    sections.acceptanceCriteria = acceptanceCriteria;
  }

  return sections;
}

/**
 * Derives a title from a filename
 * Removes extension and converts kebab-case/snake_case to Title Case
 * @param filename - The filename (with or without path)
 * @returns A human-readable title
 */
function titleFromFilename(filename: string): string {
  // Get basename without extension
  const basename = path.basename(filename, path.extname(filename));

  // Remove priority prefix if present (e.g., "01-" or "1-")
  const withoutPriority = basename.replace(/^\d+-/, '');

  // Convert kebab-case and snake_case to spaces, then title case
  return withoutPriority
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();
}

/**
 * Parses a markdown file into structured story content
 * Handles frontmatter, extracts title from H1 if not in frontmatter,
 * and parses common sections (Summary, Acceptance Criteria)
 *
 * @param content - Raw file content
 * @param filename - Optional filename for title fallback
 * @returns Parsed story content
 */
export function parseMarkdownFile(content: string, filename?: string): ParsedStoryContent {
  // Parse frontmatter
  const { data: frontmatter, content: body } = matter(content);

  // Determine title: frontmatter > H1 > filename
  let title: string | undefined = frontmatter.title;

  if (!title) {
    title = extractH1Title(body);
  }

  if (!title && filename) {
    title = titleFromFilename(filename);
  }

  // Extract sections from body
  const sections = extractSections(body);

  // Build result
  const result: ParsedStoryContent = {
    content: body.trim(),
  };

  if (title) {
    result.title = title;
  }

  // Only include frontmatter if it has any properties
  if (Object.keys(frontmatter).length > 0) {
    result.frontmatter = frontmatter as Partial<StoryFrontmatter>;
  }

  // Only include sections if any were found
  if (Object.keys(sections).length > 0) {
    result.sections = sections;
  }

  return result;
}

/**
 * Parses a plaintext file into structured story content
 * Uses the filename as the title and the entire content as the summary
 *
 * @param content - Raw file content
 * @param filename - Filename to derive title from
 * @returns Parsed story content
 */
export function parsePlaintextFile(content: string, filename: string): ParsedStoryContent {
  const title = titleFromFilename(filename);
  const trimmedContent = content.trim();

  const result: ParsedStoryContent = {
    title,
    content: trimmedContent,
    sections: {
      summary: trimmedContent,
    },
  };

  return result;
}

/**
 * Determines the file type and parses a story file
 * Validates the file before parsing
 *
 * @param filePath - Absolute path to the file
 * @returns Parsed story content
 * @throws {FileValidationError} If file validation fails
 */
export function parseStoryFile(filePath: string): ParsedStoryContent {
  // Validate the file first
  validateStoryFile(filePath);

  // Read file content
  const content = fs.readFileSync(filePath, 'utf-8');
  const ext = path.extname(filePath).toLowerCase();
  const filename = path.basename(filePath);

  // Dispatch to appropriate parser based on extension
  if (ext === '.md') {
    return parseMarkdownFile(content, filename);
  } else if (ext === '.txt') {
    return parsePlaintextFile(content, filename);
  }

  // This shouldn't happen due to validateFileExtension, but handle it anyway
  return parsePlaintextFile(content, filename);
}
