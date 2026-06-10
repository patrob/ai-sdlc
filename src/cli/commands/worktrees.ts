import fs from 'fs';
import path from 'path';
import ora from 'ora';
import * as readline from 'readline';
import { getSdlcRoot, loadConfig, validateWorktreeBasePath, DEFAULT_WORKTREE_CONFIG, saveConfig } from '../../core/config.js';
import { kanbanExists } from '../../core/kanban.js';
import { findStoryById, updateStoryField, writeStory } from '../../core/story.js';
import { findStoryBySlug } from '../../core/kanban.js';
import { getThemedChalk } from '../../core/theme.js';
import { GitWorktreeService } from '../../core/worktree.js';
import type { Story } from '../../types/index.js';

/**
 * Helper function to prompt for removal confirmation
 */
async function confirmRemoval(message: string): Promise<boolean> {
  // Sanitize message to prevent terminal injection attacks
  // Use consistent sanitizeForDisplay() for all terminal output
  const { sanitizeForDisplay } = await import('./run-helpers.js');
  const sanitizedMessage = sanitizeForDisplay(message);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(sanitizedMessage + ' (y/N): ', (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

/**
 * Handle worktree cleanup when story moves to done
 * Prompts user in interactive mode to remove worktree
 */
async function handleWorktreeCleanup(
  story: Story,
  config: ReturnType<typeof loadConfig>,
  c: ReturnType<typeof getThemedChalk>
): Promise<void> {
  const worktreePath = story.frontmatter.worktree_path;
  if (!worktreePath) return;

  const sdlcRoot = getSdlcRoot();
  const workingDir = path.dirname(sdlcRoot);
  const worktreeConfig = config.worktree ?? DEFAULT_WORKTREE_CONFIG;

  // Check if worktree exists
  if (!fs.existsSync(worktreePath)) {
    console.log(c.warning(`  Note: Worktree path no longer exists: ${worktreePath}`));
    const updated = await updateStoryField(story, 'worktree_path', undefined);
    await writeStory(updated);
    console.log(c.dim('  Cleared worktree_path from frontmatter'));
    return;
  }

  // Only prompt in interactive mode
  if (!process.stdin.isTTY) {
    console.log(c.dim(`  Worktree preserved (non-interactive mode): ${worktreePath}`));
    return;
  }

  // Prompt for cleanup
  console.log();
  console.log(c.info(`  Story has a worktree at: ${worktreePath}`));
  const shouldRemove = await confirmRemoval('  Remove worktree?');

  if (!shouldRemove) {
    console.log(c.dim('  Worktree preserved'));
    return;
  }

  // Remove worktree
  try {
    let resolvedBasePath: string;
    try {
      resolvedBasePath = validateWorktreeBasePath(worktreeConfig.basePath, workingDir);
    } catch {
      resolvedBasePath = path.dirname(worktreePath);
    }
    const service = new GitWorktreeService(workingDir, resolvedBasePath);
    service.remove(worktreePath);

    const updated = await updateStoryField(story, 'worktree_path', undefined);
    await writeStory(updated);
    console.log(c.success('  ✓ Worktree removed'));
  } catch (error) {
    console.log(c.warning(`  Failed to remove worktree: ${error instanceof Error ? error.message : String(error)}`));
    // Clear frontmatter anyway (user may have manually deleted)
    const updated = await updateStoryField(story, 'worktree_path', undefined);
    await writeStory(updated);
  }
}

/**
 * Security: Escape shell arguments for safe use in commands
 * For use with execSync when shell execution is required
 * @internal Exported for testing
 */
export function escapeShellArg(arg: string): string {
  // Replace single quotes with '\'' and wrap in single quotes
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

/**
 * List all ai-sdlc managed worktrees
 */
export async function listWorktrees(): Promise<void> {
  const config = loadConfig();
  const c = getThemedChalk(config);

  try {
    const sdlcRoot = getSdlcRoot();
    const workingDir = path.dirname(sdlcRoot);
    const worktreeConfig = config.worktree ?? DEFAULT_WORKTREE_CONFIG;

    // Resolve worktree base path
    let resolvedBasePath: string;
    try {
      resolvedBasePath = validateWorktreeBasePath(worktreeConfig.basePath, workingDir);
    } catch (error) {
      // If basePath doesn't exist yet, create an empty list response
      console.log();
      console.log(c.bold('═══ Worktrees ═══'));
      console.log();
      console.log(c.dim('No worktrees found.'));
      console.log(c.dim('Use `ai-sdlc worktrees add <story-id>` to create one.'));
      console.log();
      return;
    }

    const service = new GitWorktreeService(workingDir, resolvedBasePath);
    const worktrees = service.list();

    console.log();
    console.log(c.bold('═══ Worktrees ═══'));
    console.log();

    if (worktrees.length === 0) {
      console.log(c.dim('No worktrees found.'));
      console.log(c.dim('Use `ai-sdlc worktrees add <story-id>` to create one.'));
    } else {
      // Table header
      console.log(c.dim('Story ID'.padEnd(12) + 'Branch'.padEnd(40) + 'Status'.padEnd(10) + 'Path'));
      console.log(c.dim('─'.repeat(80)));

      for (const wt of worktrees) {
        const storyId = wt.storyId || 'unknown';
        const branch = wt.branch.length > 38 ? wt.branch.substring(0, 35) + '...' : wt.branch;
        const status = wt.exists ? c.success('exists') : c.error('missing');
        const displayPath = wt.path.length > 50 ? '...' + wt.path.slice(-47) : wt.path;

        console.log(
          storyId.padEnd(12) +
          branch.padEnd(40) +
          (wt.exists ? 'exists    ' : 'missing   ') +
          displayPath
        );
      }

      console.log();
      console.log(c.dim(`Total: ${worktrees.length} worktree(s)`));
    }

    console.log();
  } catch (error) {
    console.log(c.error(`Error listing worktrees: ${error instanceof Error ? error.message : String(error)}`));
    process.exit(1);
  }
}

/**
 * Create a worktree for a specific story
 */
export async function addWorktree(storyId: string): Promise<void> {
  const spinner = ora('Creating worktree...').start();
  const config = loadConfig();
  const c = getThemedChalk(config);

  try {
    const sdlcRoot = getSdlcRoot();
    const workingDir = path.dirname(sdlcRoot);

    if (!kanbanExists(sdlcRoot)) {
      spinner.fail('ai-sdlc not initialized. Run `ai-sdlc init` first.');
      return;
    }

    // Find the story
    const story = findStoryById(sdlcRoot, storyId) || findStoryBySlug(sdlcRoot, storyId);
    if (!story) {
      spinner.fail(c.error(`Story not found: "${storyId}"`));
      console.log(c.dim('Use `ai-sdlc status` to see available stories.'));
      return;
    }

    // Check if story already has a worktree
    if (story.frontmatter.worktree_path) {
      spinner.fail(c.error(`Story already has a worktree: ${story.frontmatter.worktree_path}`));
      return;
    }

    // Resolve worktree base path
    const worktreeConfig = config.worktree ?? DEFAULT_WORKTREE_CONFIG;
    let resolvedBasePath: string;
    try {
      resolvedBasePath = validateWorktreeBasePath(worktreeConfig.basePath, workingDir);
    } catch (error) {
      spinner.fail(c.error(`Configuration Error: ${error instanceof Error ? error.message : String(error)}`));
      console.log(c.dim('Fix worktree.basePath in .ai-sdlc.json or remove it to use default location'));
      return;
    }

    const service = new GitWorktreeService(workingDir, resolvedBasePath);

    // Validate git state
    const validation = service.validateCanCreateWorktree();
    if (!validation.valid) {
      spinner.fail(c.error(validation.error || 'Cannot create worktree'));
      return;
    }

    // Detect base branch
    const baseBranch = service.detectBaseBranch();

    // Create the worktree
    const worktreePath = service.create({
      storyId: story.frontmatter.id,
      slug: story.slug,
      baseBranch,
    });

    // Update story frontmatter
    const updatedStory = await updateStoryField(story, 'worktree_path', worktreePath);
    const branchName = service.getBranchName(story.frontmatter.id, story.slug);
    const storyWithBranch = await updateStoryField(updatedStory, 'branch', branchName);
    await writeStory(storyWithBranch);

    spinner.succeed(c.success(`Created worktree for ${story.frontmatter.id}`));
    console.log(c.dim(`  Path: ${worktreePath}`));
    console.log(c.dim(`  Branch: ${branchName}`));
    console.log(c.dim(`  Base: ${baseBranch}`));
  } catch (error) {
    spinner.fail(c.error('Failed to create worktree'));
    console.error(c.error(`  ${error instanceof Error ? error.message : String(error)}`));
    process.exit(1);
  }
}

/**
 * Remove a worktree for a specific story
 */
export async function removeWorktree(storyId: string, options?: { force?: boolean }): Promise<void> {
  const config = loadConfig();
  const c = getThemedChalk(config);

  try {
    const sdlcRoot = getSdlcRoot();
    const workingDir = path.dirname(sdlcRoot);

    if (!kanbanExists(sdlcRoot)) {
      console.log(c.warning('ai-sdlc not initialized. Run `ai-sdlc init` first.'));
      return;
    }

    // Find the story
    const story = findStoryById(sdlcRoot, storyId) || findStoryBySlug(sdlcRoot, storyId);
    if (!story) {
      console.log(c.error(`Story not found: "${storyId}"`));
      console.log(c.dim('Use `ai-sdlc status` to see available stories.'));
      return;
    }

    // Check if story has a worktree
    if (!story.frontmatter.worktree_path) {
      console.log(c.warning(`Story ${storyId} does not have a worktree.`));
      return;
    }

    const worktreePath = story.frontmatter.worktree_path;

    // Confirm removal (unless --force)
    if (!options?.force) {
      console.log();
      console.log(c.warning('About to remove worktree:'));
      console.log(c.dim(`  Story: ${story.frontmatter.title}`));
      console.log(c.dim(`  Path: ${worktreePath}`));
      console.log();

      const confirmed = await confirmRemoval('Are you sure you want to remove this worktree?');
      if (!confirmed) {
        console.log(c.dim('Cancelled.'));
        return;
      }
    }

    const spinner = ora('Removing worktree...').start();

    // Resolve worktree base path
    const worktreeConfig = config.worktree ?? DEFAULT_WORKTREE_CONFIG;
    let resolvedBasePath: string;
    try {
      resolvedBasePath = validateWorktreeBasePath(worktreeConfig.basePath, workingDir);
    } catch {
      // If basePath doesn't exist, use the worktree path's parent
      resolvedBasePath = path.dirname(worktreePath);
    }

    const service = new GitWorktreeService(workingDir, resolvedBasePath);

    // Remove the worktree
    service.remove(worktreePath);

    // Clear worktree_path from frontmatter
    const updatedStory = await updateStoryField(story, 'worktree_path', undefined);
    await writeStory(updatedStory);

    spinner.succeed(c.success(`Removed worktree for ${story.frontmatter.id}`));
    console.log(c.dim(`  Path: ${worktreePath}`));
  } catch (error) {
    console.log(c.error(`Failed to remove worktree: ${error instanceof Error ? error.message : String(error)}`));
    process.exit(1);
  }
}

// Export handler for use in run.ts
export { handleWorktreeCleanup };
