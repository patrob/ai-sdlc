import fs from 'fs';
import ora from 'ora';
import path from 'path';

import { getSdlcRoot, loadConfig } from '../../core/config.js';
import { kanbanExists } from '../../core/kanban.js';
import { findAllStories } from '../../core/kanban.js';
import { createStory } from '../../core/story.js';
import { getThemedChalk } from '../../core/theme.js';
import { createStoryFromFeatureRequest } from '../feature-request.js';

/**
 * Validate file path for security (path traversal, symlinks, allowed directories)
 */
function validateFilePath(filePath: string): void {
  const resolvedPath = path.resolve(filePath);
  const allowedDir = path.resolve(process.cwd());

  // Check path traversal: resolved path must be within current directory
  if (!resolvedPath.startsWith(allowedDir + path.sep) && resolvedPath !== allowedDir) {
    throw new Error('Security: File path must be within current directory (path traversal detected)');
  }

  // Check if file exists before checking if it's a symlink
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`File not found: ${path.basename(filePath)}`);
  }

  // Check for symbolic links (security risk)
  const stats = fs.lstatSync(resolvedPath);
  if (stats.isSymbolicLink()) {
    throw new Error('Security: Symbolic links are not allowed');
  }
}

/**
 * Validate file extension against whitelist
 */
function validateFileExtension(filePath: string): void {
  const allowedExtensions = ['.md', '.txt', '.markdown'];
  const ext = path.extname(filePath).toLowerCase();

  if (!allowedExtensions.includes(ext)) {
    throw new Error(`Invalid file type: only ${allowedExtensions.join(', ')} files are allowed`);
  }
}

/**
 * Validate file size (10MB maximum)
 */
function validateFileSize(filePath: string): void {
  const maxSize = 10 * 1024 * 1024; // 10MB
  const stats = fs.statSync(filePath);

  if (stats.size > maxSize) {
    const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
    throw new Error(`File too large: ${sizeMB}MB (maximum 10MB)`);
  }
}

/**
 * Sanitize file content (strip null bytes, validate UTF-8)
 */
function sanitizeFileContent(content: string): string {
  // Strip null bytes that could truncate strings
  return content.replace(/\0/g, '');
}

/**
 * Add a new story to the backlog
 */
export async function add(title?: string, options?: { file?: string; ai?: boolean; grillMe?: boolean }): Promise<void> {
  const spinner = ora('Creating story...').start();

  try {
    const config = loadConfig();
    const sdlcRoot = getSdlcRoot();
    const c = getThemedChalk(config);

    if (!kanbanExists(sdlcRoot)) {
      spinner.fail('ai-sdlc not initialized. Run `ai-sdlc init` first.');
      return;
    }

    // Validate that either title or file is provided (not both, not neither)
    if (!title && !options?.file) {
      spinner.fail('Error: Must provide either a title or --file option');
      console.log(c.dim('Usage:'));
      console.log(c.dim('  ai-sdlc add "Story Title"'));
      console.log(c.dim('  ai-sdlc add --file story.md'));
      process.exit(1);
    }

    if (title && options?.file) {
      spinner.fail('Error: Cannot provide both title and --file option');
      console.log(c.dim('Use either:'));
      console.log(c.dim('  ai-sdlc add "Story Title"'));
      console.log(c.dim('  ai-sdlc add --file story.md'));
      process.exit(1);
    }

    let storyTitle: string;
    let storyContent: string | undefined;

    // Handle file input with security validation
    if (options?.file) {
      spinner.text = 'Reading file...';

      const filePath = options.file;

      try {
        // Security validations
        validateFilePath(filePath);
        validateFileExtension(filePath);

        // Read file (includes existence check via fs.readFileSync)
        const resolvedPath = path.resolve(filePath);

        // Validate file size before reading
        validateFileSize(resolvedPath);

        // Read and sanitize content
        const rawContent = fs.readFileSync(resolvedPath, 'utf-8');
        storyContent = sanitizeFileContent(rawContent);

        // Extract title from content or use filename
        const { extractTitleFromContent } = await import('../../core/story.js');
        const extractedTitle = extractTitleFromContent(storyContent);

        if (extractedTitle) {
          storyTitle = extractedTitle;
        } else {
          // Fall back to filename without extension
          storyTitle = path.basename(filePath, path.extname(filePath));
        }

        spinner.text = `Creating story from ${path.basename(filePath)}...`;
      } catch (error) {
        spinner.fail('Failed to read file');

        if (error instanceof Error) {
          // Sanitize error messages to avoid leaking system paths
          if (error.message.startsWith('Security:') || error.message.startsWith('Invalid file type:') || error.message.startsWith('File too large:')) {
            console.log(c.error(error.message));
          } else if (error.message.includes('ENOENT')) {
            console.log(c.error(`File not found: ${path.basename(filePath)}`));
          } else if (error.message.includes('EACCES') || error.message.includes('EPERM')) {
            console.log(c.error(`Permission denied: ${path.basename(filePath)}`));
          } else {
            console.log(c.error(`Unable to read file: ${path.basename(filePath)}`));
          }
        }
        process.exit(1);
      }
    } else {
      // Traditional title-only input
      storyTitle = title!;
    }

    if (options?.grillMe) {
      spinner.text = 'Clarifying feature request with /grill-me...';
      const requestText = storyContent
        ? `# ${storyTitle}\n\n${storyContent}`
        : storyTitle;

      const story = await createStoryFromFeatureRequest(requestText, sdlcRoot, { grillMe: true });

      spinner.succeed(c.success(`Created: ${story.path}`));
      console.log(c.dim(`  ID: ${story.frontmatter.id}`));
      console.log(c.dim(`  Title: ${story.frontmatter.title}`));
      console.log(c.dim(`  Slug: ${story.slug}`));
      if (options.file) {
        console.log(c.dim(`  Source: ${path.basename(options.file)}`));
      }
      console.log(c.dim(`  /grill-me: yes`));
      console.log();
      console.log(c.info('Next step:'), `ai-sdlc run`);
      return;
    }

    // AI-assisted ideation (--ai flag)
    if (options?.ai) {
      spinner.text = 'Running AI ideation...';
      try {
        const { runIdeation, findPotentialDuplicates } = await import('../../agents/ideation.js');

        // Check for duplicates first (fast, local-only)
        const existingStories = findAllStories(sdlcRoot);
        const duplicates = findPotentialDuplicates(storyTitle, existingStories);

        if (duplicates.length > 0) {
          spinner.warn(c.warning('Potential duplicates found:'));
          for (const dup of duplicates.slice(0, 3)) {
            const pct = Math.round(dup.similarity * 100);
            console.log(c.dim(`  - [${dup.story.frontmatter.id}] ${dup.story.frontmatter.title} (${pct}% similar)`));
          }
        }

        // Run AI ideation
        const ideation = await runIdeation(storyTitle, sdlcRoot);

        // Append AI-generated acceptance criteria to story content
        if (ideation.acceptanceCriteria.length > 0) {
          const acContent = ideation.acceptanceCriteria
            .map(ac => `- [ ] ${ac}`)
            .join('\n');
          storyContent = (storyContent || '') + `\n\n## Acceptance Criteria\n\n${acContent}\n`;
        }

        // Show decomposition suggestions
        if (ideation.suggestedDecomposition) {
          console.log(c.warning('\nDecomposition suggested:'));
          for (const sub of ideation.suggestedDecomposition) {
            console.log(c.dim(`  - ${sub}`));
          }
        }

        spinner.text = 'Creating story with AI enrichment...';
      } catch (error) {
        // AI ideation is best-effort; continue without it
        const msg = error instanceof Error ? error.message : String(error);
        spinner.text = `AI ideation unavailable (${msg}), creating story...`;
      }
    }

    // Create the story
    const story = await createStory(storyTitle, sdlcRoot, {}, storyContent);

    spinner.succeed(c.success(`Created: ${story.path}`));
    console.log(c.dim(`  ID: ${story.frontmatter.id}`));
    console.log(c.dim(`  Title: ${story.frontmatter.title}`));
    console.log(c.dim(`  Slug: ${story.slug}`));
    if (options?.file) {
      console.log(c.dim(`  Source: ${path.basename(options.file)}`));
    }
    if (options?.ai) {
      console.log(c.dim(`  AI-assisted: yes`));
    }
    console.log();
    console.log(c.info('Next step:'), `ai-sdlc run`);
  } catch (error) {
    spinner.fail('Failed to create story');
    console.error(error);
    process.exit(1);
  }
}
