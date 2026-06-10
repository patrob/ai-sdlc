import path from 'path';
import * as readline from 'readline';
import { getSdlcRoot, loadConfig } from '../../core/config.js';
import { findStoriesByStatus } from '../../core/kanban.js';
import { getThemedChalk } from '../../core/theme.js';
import { detectConflicts } from '../../core/conflict-detector.js';
import { sanitizeForDisplay } from './run-helpers.js';
import { sanitizeStoryId } from '../../core/story.js';
import type { Story, PreFlightResult } from '../../types/index.js';

/**
 * Perform pre-flight conflict check before starting work on a story in a worktree.
 * Warns about potential file conflicts with active stories and prompts for confirmation.
 *
 * **Race Condition (TOCTOU):** Multiple users can pass this check simultaneously
 * before branches are created. This is an accepted risk - the window is small
 * (~100ms) and git will catch conflicts during merge/PR creation. Adding file
 * locks would significantly increase complexity for minimal security gain.
 *
 * **Security Notes:**
 * - sdlcRoot is normalized and validated (absolute path, no null bytes, max 1024 chars)
 * - All display output is sanitized to prevent terminal injection attacks
 * - Story IDs are validated with sanitizeStoryId() then stripped with sanitizeForDisplay()
 * - Error messages are generic to prevent information leakage
 *
 * @param targetStory - The story to check for conflicts
 * @param sdlcRoot - Root directory of the .ai-sdlc folder (must be absolute, validated)
 * @param options - Command options (force flag)
 * @param options.force - Skip conflict check if true
 * @returns PreFlightResult indicating whether to proceed and any warnings
 * @throws Error if sdlcRoot is invalid (not absolute, null bytes, too long)
 */
export async function preFlightConflictCheck(
  targetStory: Story,
  sdlcRoot: string,
  options: { force?: boolean }
): Promise<PreFlightResult> {
  const config = loadConfig();
  const c = getThemedChalk(config);

  // Helper to prompt for removal confirmation
  async function confirmRemoval(message: string): Promise<boolean> {
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

  // Skip if --force flag
  if (options.force) {
    console.log(c.warning('⚠️  Skipping conflict check (--force)'));
    return { proceed: true, warnings: ['Conflict check skipped'] };
  }

  // Validate sdlcRoot parameter (normalize first to prevent bypass attacks)
  const normalizedPath = path.normalize(sdlcRoot);

  if (!path.isAbsolute(normalizedPath)) {
    throw new Error('Invalid project path');
  }
  if (normalizedPath.includes('\0')) {
    throw new Error('Invalid project path');
  }
  if (normalizedPath.length > 1024) {
    throw new Error('Invalid project path');
  }

  // Check if target story is already in-progress (allow if resuming existing worktree)
  if (targetStory.frontmatter.status === 'in-progress' && !targetStory.frontmatter.worktree_path) {
    console.log(c.error('❌ Story is already in-progress'));
    return { proceed: false, warnings: ['Story already in progress'] };
  }

  try {
    // Query for all in-progress stories (excluding target)
    // Use normalizedPath for all subsequent operations
    const activeStories = findStoriesByStatus(normalizedPath, 'in-progress')
      .filter(s => s.frontmatter.id !== targetStory.frontmatter.id);

    if (activeStories.length === 0) {
      console.log(c.success('✓ Conflict check: No overlapping files with active stories'));
      return { proceed: true, warnings: [] };
    }

    // Run conflict detection (use normalizedPath)
    const workingDir = path.dirname(normalizedPath);
    const result = detectConflicts([targetStory, ...activeStories], workingDir, 'main');

    // Filter conflicts involving target story
    const relevantConflicts = result.conflicts.filter(
      conflict => conflict.storyA === targetStory.frontmatter.id || conflict.storyB === targetStory.frontmatter.id
    );

    // Filter out 'none' severity conflicts (keep all displayable conflicts including low)
    const displayableConflicts = relevantConflicts.filter(conflict => conflict.severity !== 'none');

    if (displayableConflicts.length === 0) {
      console.log(c.success('✓ Conflict check: No overlapping files with active stories'));
      return { proceed: true, warnings: [] };
    }

    // Sort conflicts by severity (high -> medium -> low)
    const severityOrder = { high: 0, medium: 1, low: 2, none: 3 };
    const sortedConflicts = displayableConflicts.sort((a, b) =>
      severityOrder[a.severity] - severityOrder[b.severity]
    );

    // Display conflicts
    console.log();
    console.log(c.warning('⚠️  Potential conflicts detected:'));
    console.log();

    for (const conflict of sortedConflicts) {
      const otherStoryId = conflict.storyA === targetStory.frontmatter.id ? conflict.storyB : conflict.storyA;

      // Two-stage sanitization: validate structure, then strip for display
      try {
        const validatedTargetId = sanitizeStoryId(targetStory.frontmatter.id);
        const validatedOtherId = sanitizeStoryId(otherStoryId);
        const sanitizedTargetId = sanitizeForDisplay(validatedTargetId);
        const sanitizedOtherId = sanitizeForDisplay(validatedOtherId);
        console.log(c.warning(`   ${sanitizedTargetId} may conflict with ${sanitizedOtherId}:`));
      } catch (error) {
        // If validation fails, show generic error (defensive)
        console.log(c.warning(`   Story may have conflicting changes (invalid ID format)`));
      }

      // Display shared files
      for (const file of conflict.sharedFiles) {
        const severityLabel = conflict.severity === 'high' ? c.error('High') :
                              conflict.severity === 'medium' ? c.warning('Medium') :
                              c.info('Low');
        const sanitizedFile = sanitizeForDisplay(file);
        console.log(`   - ${severityLabel}: ${sanitizedFile} (both stories modify this file)`);
      }

      // Display shared directories
      for (const dir of conflict.sharedDirectories) {
        const severityLabel = conflict.severity === 'high' ? c.error('High') :
                              conflict.severity === 'medium' ? c.warning('Medium') :
                              c.info('Low');
        const sanitizedDir = sanitizeForDisplay(dir);
        console.log(`   - ${severityLabel}: ${sanitizedDir} (both stories modify files in this directory)`);
      }

      console.log();
      const sanitizedRecommendation = sanitizeForDisplay(conflict.recommendation);
      console.log(c.dim(`   Recommendation: ${sanitizedRecommendation}`));
      console.log();
    }

    // Non-interactive mode: default to declining
    if (!process.stdin.isTTY) {
      console.log(c.dim('Non-interactive mode: conflicts require --force to proceed'));
      return { proceed: false, warnings: ['Conflicts detected'] };
    }

    // Interactive mode: prompt user
    const shouldContinue = await confirmRemoval('Continue anyway?');
    return {
      proceed: shouldContinue,
      warnings: shouldContinue ? ['User confirmed with conflicts'] : ['Conflicts detected']
    };

  } catch (error) {
    // Fail-open: allow proceeding if conflict detection fails
    console.log(c.warning('⚠️  Conflict detection unavailable'));
    console.log(c.dim('Proceeding without conflict check...'));
    return { proceed: true, warnings: ['Conflict detection failed'] };
  }
}
