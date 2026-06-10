import path from 'path';
import * as readline from 'readline';
import { spawnSync } from 'child_process';
import { getSdlcRoot, DEFAULT_WORKTREE_CONFIG, validateWorktreeBasePath, saveConfig } from '../../core/config.js';
import { GitWorktreeService, getLastCompletedPhase, getNextPhase } from '../../core/worktree.js';
import { findStoryById, updateStoryField, writeStory, resetWorkflowState } from '../../core/story.js';
import { loadWorkflowState, clearWorkflowState, hasWorkflowState } from '../../core/workflow-state.js';
import { preFlightConflictCheck } from './pre-flight-check.js';
import { determineWorktreeMode, DIVERGENCE_WARNING_THRESHOLD } from './run-helpers.js';
import type { Story } from '../../types/index.js';
import { getLogger } from '../../core/logger.js';

const logger = getLogger();

/**
 * Result from worktree setup operation
 */
export interface WorktreeSetupResult {
  success: boolean;
  worktreePath?: string;
  originalCwd?: string;
  worktreeCreated: boolean;
  targetStory?: Story | null;
}

/**
 * Handle worktree creation/resumption based on flags and story state
 *
 * This function manages the complete lifecycle of worktree setup including:
 * - Determining if worktree mode should be used
 * - Validating pre-flight conflicts
 * - Resuming existing worktrees or creating new ones
 * - Syncing story state with worktree
 *
 * IMPORTANT: This must happen BEFORE git validation because:
 * 1. Worktree mode allows running from protected branches (main/master)
 * 2. The worktree will be created on a feature branch
 */
export async function setupWorktree(
  options: any,
  config: any,
  c: any,
  sdlcRoot: string,
  targetStory: Story | null,
): Promise<WorktreeSetupResult> {
  // Determine if worktree should be used
  // Priority: CLI flags > story frontmatter > config > default (disabled)
  const worktreeConfig = config.worktree ?? DEFAULT_WORKTREE_CONFIG;
  const shouldUseWorktree = determineWorktreeMode(options, worktreeConfig, targetStory);

  // Validate that worktree mode requires --story
  if (shouldUseWorktree && !options.story) {
    if (options.worktree === true) {
      console.log(c.error('Error: --worktree requires --story flag'));
      return { success: false, worktreeCreated: false };
    }
  }

  if (!shouldUseWorktree || !options.story || !targetStory) {
    return { success: true, worktreeCreated: false, targetStory };
  }

  // PRE-FLIGHT CHECK: Run conflict detection before creating worktree
  const preFlightResult = await preFlightConflictCheck(targetStory, sdlcRoot, options);

  if (!preFlightResult.proceed) {
    console.log(c.error('❌ Aborting. Complete active stories first or use --force.'));
    return { success: false, worktreeCreated: false };
  }

  // Log warnings if user proceeded despite conflicts (skip internal flag messages)
  if (preFlightResult.warnings.length > 0 && !preFlightResult.warnings.includes('Conflict check skipped')) {
    preFlightResult.warnings.forEach(w => console.log(c.dim(`  ⚠ ${w}`)));
    console.log();
  }

  const workingDir = path.dirname(sdlcRoot);
  let worktreePath: string | undefined;
  let originalCwd: string | undefined;
  let worktreeCreated = false;
  let updatedTargetStory = targetStory;

  // Check if story already has an existing worktree (resume scenario)
  // Note: We check only if existingWorktreePath is set, not if it exists.
  // The validation logic will handle missing directories/branches.
  const existingWorktreePath = targetStory.frontmatter.worktree_path;
  if (existingWorktreePath) {
    // Validate worktree before resuming
    const resolvedBasePath = validateWorktreeBasePath(worktreeConfig.basePath, workingDir);

    // Security validation: ensure worktree_path is within the configured base directory
    const absoluteWorktreePath = path.resolve(existingWorktreePath);
    const absoluteBasePath = path.resolve(resolvedBasePath);
    if (!absoluteWorktreePath.startsWith(absoluteBasePath)) {
      console.log(c.error('Security Error: worktree_path is outside configured base directory'));
      console.log(c.dim(`  Worktree path: ${absoluteWorktreePath}`));
      console.log(c.dim(`  Expected base: ${absoluteBasePath}`));
      return { success: false, worktreeCreated: false };
    }

    // Warn if story is marked as done but has an existing worktree
    if (targetStory.frontmatter.status === 'done') {
      console.log(c.warning('⚠ Story is marked as done but has an existing worktree'));
      console.log(c.dim('  This may be a stale worktree that should be cleaned up.'));
      console.log();

      // Prompt user for confirmation to proceed
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      const answer = await new Promise<string>((resolve) => {
        rl.question(c.dim('Continue with this worktree? (y/N): '), (ans) => {
          rl.close();
          resolve(ans.toLowerCase().trim());
        });
      });

      if (answer !== 'y' && answer !== 'yes') {
        console.log(c.dim('Aborted. Consider removing the worktree_path from the story frontmatter.'));
        return { success: false, worktreeCreated: false };
      }

      console.log();
    }

    const worktreeService = new GitWorktreeService(workingDir, resolvedBasePath);
    const branchName = worktreeService.getBranchName(targetStory.frontmatter.id, targetStory.slug);

    const validation = worktreeService.validateWorktreeForResume(existingWorktreePath, branchName);

    if (!validation.canResume) {
      console.log(c.error('Cannot resume worktree:'));
      validation.issues.forEach(issue => console.log(c.dim(`  ✗ ${issue}`)));

      if (validation.requiresRecreation) {
        const branchExists = !validation.issues.includes('Branch does not exist');
        const dirMissing = validation.issues.includes('Worktree directory does not exist');
        const dirExists = !dirMissing;

        // Case 1: Directory missing but branch exists - recreate worktree from existing branch
        // Case 2: Directory exists but branch missing - recreate with new branch
        if ((branchExists && dirMissing) || (!branchExists && dirExists)) {
          const reason = branchExists
            ? 'Branch exists - automatically recreating worktree directory'
            : 'Directory exists - automatically recreating worktree with new branch';
          console.log(c.dim(`\n✓ ${reason}`));

          try {
            // Remove the old worktree reference if it exists
            const removeResult = spawnSync('git', ['worktree', 'remove', existingWorktreePath, '--force'], {
              cwd: workingDir,
              encoding: 'utf-8',
              shell: false,
              stdio: ['ignore', 'pipe', 'pipe'],
            });

            // Create the worktree at the same path
            // If branch exists, checkout that branch; otherwise create a new branch
            const baseBranch = worktreeService.detectBaseBranch();
            const worktreeAddArgs = branchExists
              ? ['worktree', 'add', existingWorktreePath, branchName]
              : ['worktree', 'add', '-b', branchName, existingWorktreePath, baseBranch];
            const addResult = spawnSync('git', worktreeAddArgs, {
              cwd: workingDir,
              encoding: 'utf-8',
              shell: false,
              stdio: ['ignore', 'pipe', 'pipe'],
            });

            if (addResult.status !== 0) {
              throw new Error(`Failed to recreate worktree: ${addResult.stderr}`);
            }

            // Install dependencies in the recreated worktree
            worktreeService.installDependencies(existingWorktreePath);

            console.log(c.success(`✓ Worktree recreated at ${existingWorktreePath}`));
            logger.info('worktree', `Recreated worktree for ${targetStory.frontmatter.id} at ${existingWorktreePath}`);
          } catch (error) {
            console.log(c.error(`Failed to recreate worktree: ${error instanceof Error ? error.message : String(error)}`));
            console.log(c.dim('Please manually remove the worktree_path from the story frontmatter and try again.'));
            return { success: false, worktreeCreated: false };
          }
        } else {
          console.log(c.dim('\nWorktree needs manual intervention. Please remove the worktree_path from the story frontmatter and try again.'));
          return { success: false, worktreeCreated: false };
        }
      } else {
        return { success: false, worktreeCreated: false };
      }
    }

    // Reuse existing worktree
    originalCwd = process.cwd();
    worktreePath = existingWorktreePath;
    process.chdir(worktreePath);
    const newSdlcRoot = getSdlcRoot();
    worktreeCreated = true;

    // Re-load story from worktree context to get current state
    const worktreeStory = findStoryById(newSdlcRoot, targetStory.frontmatter.id);
    if (worktreeStory) {
      updatedTargetStory = worktreeStory;
    }

    // Get phase information for resume context
    const lastPhase = getLastCompletedPhase(updatedTargetStory);
    const nextPhase = getNextPhase(updatedTargetStory);

    // Get worktree status for uncommitted changes info
    const worktreeInfo = {
      path: existingWorktreePath,
      branch: branchName,
      storyId: updatedTargetStory.frontmatter.id,
      exists: true,
    };
    const worktreeStatus = worktreeService.getWorktreeStatus(worktreeInfo);

    // Check branch divergence
    const divergence = worktreeService.checkBranchDivergence(branchName);

    console.log(c.success(`✓ Resuming in existing worktree: ${worktreePath}`));
    console.log(c.dim(`  Branch: ${branchName}`));

    if (lastPhase) {
      console.log(c.dim(`  Last completed phase: ${lastPhase}`));
    }

    if (nextPhase) {
      console.log(c.dim(`  Next phase: ${nextPhase}`));
    }

    // Display uncommitted changes if present
    if (worktreeStatus.workingDirectoryStatus !== 'clean') {
      const totalChanges = worktreeStatus.modifiedFiles.length + worktreeStatus.untrackedFiles.length;
      console.log(c.dim(`  Uncommitted changes: ${totalChanges} file(s)`));

      if (worktreeStatus.modifiedFiles.length > 0) {
        console.log(c.dim(`    Modified: ${worktreeStatus.modifiedFiles.slice(0, 3).join(', ')}${worktreeStatus.modifiedFiles.length > 3 ? '...' : ''}`));
      }
      if (worktreeStatus.untrackedFiles.length > 0) {
        console.log(c.dim(`    Untracked: ${worktreeStatus.untrackedFiles.slice(0, 3).join(', ')}${worktreeStatus.untrackedFiles.length > 3 ? '...' : ''}`));
      }
    }

    // Warn if branch has diverged significantly
    if (divergence.diverged && (divergence.ahead > DIVERGENCE_WARNING_THRESHOLD || divergence.behind > DIVERGENCE_WARNING_THRESHOLD)) {
      console.log(c.warning(`  ⚠ Branch has diverged from base: ${divergence.ahead} ahead, ${divergence.behind} behind`));
      console.log(c.dim(`    Consider rebasing to sync with latest changes`));
    }

    console.log();

    // Log resume event
    logger.info('worktree', `Resumed worktree for ${targetStory.frontmatter.id} at ${worktreePath}`);
  } else {
    // Create new worktree
    // Resolve worktree base path from config
    let resolvedBasePath: string;
    try {
      resolvedBasePath = validateWorktreeBasePath(worktreeConfig.basePath, workingDir);
    } catch (error) {
      console.log(c.error(`Configuration Error: ${error instanceof Error ? error.message : String(error)}`));
      console.log(c.dim('Fix worktree.basePath in .ai-sdlc.json or remove it to use default location'));
      return { success: false, worktreeCreated: false };
    }

    const worktreeService = new GitWorktreeService(workingDir, resolvedBasePath);

    // Check for existing worktree NOT recorded in story frontmatter
    // This catches scenarios where workflow was interrupted after worktree creation
    // but before the story file was updated
    const existingWorktree = worktreeService.findByStoryId(targetStory.frontmatter.id);
    let shouldCreateNewWorktree = !existingWorktree || !existingWorktree.exists;

    if (existingWorktree && existingWorktree.exists) {
      // Handle --clean flag: cleanup and restart
      if (options.clean) {
        console.log(c.warning('Existing worktree found - cleaning up before restart...'));
        console.log();

        const worktreeStatus = worktreeService.getWorktreeStatus(existingWorktree);
        const unpushedResult = worktreeService.hasUnpushedCommits(existingWorktree.path);
        const commitCount = worktreeService.getCommitCount(existingWorktree.path);
        const branchOnRemote = worktreeService.branchExistsOnRemote(existingWorktree.branch);

        // Display summary of what will be deleted
        console.log(c.bold('Cleanup Summary:'));
        console.log(c.dim('─'.repeat(60)));
        console.log(`${c.dim('Worktree Path:')}    ${worktreeStatus.path}`);
        console.log(`${c.dim('Branch:')}          ${worktreeStatus.branch}`);
        console.log(`${c.dim('Total Commits:')}   ${commitCount}`);
        console.log(`${c.dim('Unpushed Commits:')} ${unpushedResult.hasUnpushed ? c.warning(unpushedResult.count.toString()) : c.success('0')}`);
        console.log(`${c.dim('Modified Files:')}  ${worktreeStatus.modifiedFiles.length > 0 ? c.warning(worktreeStatus.modifiedFiles.length.toString()) : c.success('0')}`);
        console.log(`${c.dim('Untracked Files:')} ${worktreeStatus.untrackedFiles.length > 0 ? c.warning(worktreeStatus.untrackedFiles.length.toString()) : c.success('0')}`);
        console.log(`${c.dim('Remote Branch:')}   ${branchOnRemote ? c.warning('EXISTS') : c.dim('none')}`);
        console.log();

        // Warn about data loss
        if (worktreeStatus.modifiedFiles.length > 0 || worktreeStatus.untrackedFiles.length > 0 || unpushedResult.hasUnpushed) {
          console.log(c.error('⚠ WARNING: This will DELETE all uncommitted and unpushed work!'));
          console.log();
        }

        // Check for --force flag to skip confirmation
        const forceCleanup = options.force;
        if (!forceCleanup) {
          // Prompt for confirmation
          const confirmed = await new Promise<boolean>((resolve) => {
            const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
            rl.question(c.warning('Are you sure you want to proceed? (y/N): '), (answer) => {
              rl.close();
              resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
            });
          });

          if (!confirmed) {
            console.log(c.info('Cleanup cancelled.'));
            return { success: false, worktreeCreated: false };
          }
        }

        console.log();
        const cleanupSpinner = (await import('ora')).default('Cleaning up worktree...').start();

        try {
          // Remove worktree (force remove to handle uncommitted changes)
          const forceRemove = worktreeStatus.modifiedFiles.length > 0 || worktreeStatus.untrackedFiles.length > 0;
          worktreeService.remove(existingWorktree.path, forceRemove);
          cleanupSpinner.text = 'Worktree removed, deleting branch...';

          // Delete local branch
          worktreeService.deleteBranch(existingWorktree.branch, true);

          // Optionally delete remote branch if it exists
          if (branchOnRemote) {
            if (!forceCleanup) {
              cleanupSpinner.stop();
              const deleteRemote = await new Promise<boolean>((resolve) => {
                const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
                rl.question(c.warning('Branch exists on remote. Delete it too? (y/N): '), (answer) => {
                  rl.close();
                  resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
                });
              });

              if (deleteRemote) {
                cleanupSpinner.start('Deleting remote branch...');
                worktreeService.deleteRemoteBranch(existingWorktree.branch);
              }
              cleanupSpinner.start();
            } else {
              // --force provided, skip remote deletion by default (safer)
              cleanupSpinner.text = 'Skipping remote branch deletion (use manual cleanup if needed)';
            }
          }

          // Reset story workflow state
          cleanupSpinner.text = 'Resetting story state...';
          updatedTargetStory = await resetWorkflowState(updatedTargetStory);

          // Clear workflow checkpoint if exists
          if (hasWorkflowState(sdlcRoot, updatedTargetStory.frontmatter.id)) {
            await clearWorkflowState(sdlcRoot, updatedTargetStory.frontmatter.id);
          }

          cleanupSpinner.succeed(c.success('✓ Cleanup complete - ready to create fresh worktree'));
          console.log();
        } catch (error) {
          cleanupSpinner.fail(c.error('Cleanup failed'));
          console.log(c.error(`Error: ${error instanceof Error ? error.message : String(error)}`));
          return { success: false, worktreeCreated: false };
        }

        // After cleanup, create a fresh worktree
        shouldCreateNewWorktree = true;
      } else {
        // Not cleaning - resume in existing worktree (S-0063 feature)
        logger.info('worktree', `Detected existing worktree for ${targetStory.frontmatter.id} at ${existingWorktree.path}`);

        // Validate the existing worktree before resuming
        const branchName = worktreeService.getBranchName(targetStory.frontmatter.id, targetStory.slug);
        const validation = worktreeService.validateWorktreeForResume(existingWorktree.path, branchName);

        if (!validation.canResume) {
          console.log(c.error('Detected existing worktree but cannot resume:'));
          validation.issues.forEach(issue => console.log(c.dim(`  ✗ ${issue}`)));

          if (validation.requiresRecreation) {
            const branchExists = !validation.issues.includes('Branch does not exist');
            const dirMissing = validation.issues.includes('Worktree directory does not exist');
            const dirExists = !dirMissing;

            // Case 1: Directory missing but branch exists - recreate worktree from existing branch
            // Case 2: Directory exists but branch missing - recreate with new branch
            if ((branchExists && dirMissing) || (!branchExists && dirExists)) {
              const reason = branchExists
                ? 'Branch exists - automatically recreating worktree directory'
                : 'Directory exists - automatically recreating worktree with new branch';
              console.log(c.dim(`\n✓ ${reason}`));

              try {
                // Remove the old worktree reference if it exists
                const removeResult = spawnSync('git', ['worktree', 'remove', existingWorktree.path, '--force'], {
                  cwd: workingDir,
                  encoding: 'utf-8',
                  shell: false,
                  stdio: ['ignore', 'pipe', 'pipe'],
                });

                // Create the worktree at the same path
                // If branch exists, checkout that branch; otherwise create a new branch
                const baseBranch = worktreeService.detectBaseBranch();
                const worktreeAddArgs = branchExists
                  ? ['worktree', 'add', existingWorktree.path, branchName]
                  : ['worktree', 'add', '-b', branchName, existingWorktree.path, baseBranch];
                const addResult = spawnSync('git', worktreeAddArgs, {
                  cwd: workingDir,
                  encoding: 'utf-8',
                  shell: false,
                  stdio: ['ignore', 'pipe', 'pipe'],
                });

                if (addResult.status !== 0) {
                  throw new Error(`Failed to recreate worktree: ${addResult.stderr}`);
                }

                // Install dependencies in the recreated worktree
                worktreeService.installDependencies(existingWorktree.path);

                console.log(c.success(`✓ Worktree recreated at ${existingWorktree.path}`));
                logger.info('worktree', `Recreated worktree for ${targetStory.frontmatter.id} at ${existingWorktree.path}`);
              } catch (error) {
                console.log(c.error(`Failed to recreate worktree: ${error instanceof Error ? error.message : String(error)}`));
                console.log(c.dim('Please manually remove it with:'));
                console.log(c.dim(`  git worktree remove ${existingWorktree.path}`));
                return { success: false, worktreeCreated: false };
              }
            } else {
              console.log(c.dim('\nWorktree needs manual intervention. Please remove it manually with:'));
              console.log(c.dim(`  git worktree remove ${existingWorktree.path}`));
              return { success: false, worktreeCreated: false };
            }
          } else {
            return { success: false, worktreeCreated: false };
          }
        }

        // Automatically resume in the existing worktree
        originalCwd = process.cwd();
        worktreePath = existingWorktree.path;
        process.chdir(worktreePath);
        const newSdlcRoot = getSdlcRoot();
        worktreeCreated = true;

        // Update story frontmatter with worktree path (sync state)
        const worktreeStory = findStoryById(newSdlcRoot, targetStory.frontmatter.id);
        if (worktreeStory) {
          const updatedStory = await updateStoryField(worktreeStory, 'worktree_path', worktreePath);
          await writeStory(updatedStory);
          updatedTargetStory = updatedStory;
        }

        // Get phase information for resume context
        const lastPhase = getLastCompletedPhase(updatedTargetStory);
        const nextPhase = getNextPhase(updatedTargetStory);

        // Get worktree status for uncommitted changes info
        const worktreeStatus = worktreeService.getWorktreeStatus(existingWorktree);

        // Check branch divergence
        const divergence = worktreeService.checkBranchDivergence(branchName);

        console.log(c.success(`✓ Resuming in existing worktree: ${worktreePath}`));
        console.log(c.dim(`  Branch: ${branchName}`));
        console.log(c.dim(`  (Worktree path synced to story frontmatter)`));

        if (lastPhase) {
          console.log(c.dim(`  Last completed phase: ${lastPhase}`));
        }

        if (nextPhase) {
          console.log(c.dim(`  Next phase: ${nextPhase}`));
        }

        // Display uncommitted changes if present
        if (worktreeStatus.workingDirectoryStatus !== 'clean') {
          const totalChanges = worktreeStatus.modifiedFiles.length + worktreeStatus.untrackedFiles.length;
          console.log(c.dim(`  Uncommitted changes: ${totalChanges} file(s)`));

          if (worktreeStatus.modifiedFiles.length > 0) {
            console.log(c.dim(`    Modified: ${worktreeStatus.modifiedFiles.slice(0, 3).join(', ')}${worktreeStatus.modifiedFiles.length > 3 ? '...' : ''}`));
          }
          if (worktreeStatus.untrackedFiles.length > 0) {
            console.log(c.dim(`    Untracked: ${worktreeStatus.untrackedFiles.slice(0, 3).join(', ')}${worktreeStatus.untrackedFiles.length > 3 ? '...' : ''}`));
          }
        }

        // Warn if branch has diverged significantly
        if (divergence.diverged && (divergence.ahead > DIVERGENCE_WARNING_THRESHOLD || divergence.behind > DIVERGENCE_WARNING_THRESHOLD)) {
          console.log(c.warning(`  ⚠ Branch has diverged from base: ${divergence.ahead} ahead, ${divergence.behind} behind`));
          console.log(c.dim(`    Consider rebasing to sync with latest changes`));
        }

        console.log();
      }
    }

    if (shouldCreateNewWorktree) {
      // Validate git state for worktree creation
      const validation = worktreeService.validateCanCreateWorktree();
      if (!validation.valid) {
        console.log(c.error(`Error: ${validation.error}`));
        return { success: false, worktreeCreated: false };
      }

      try {
        // Detect base branch
        const baseBranch = worktreeService.detectBaseBranch();

        // Create worktree
        originalCwd = process.cwd();
        worktreePath = worktreeService.create({
          storyId: targetStory.frontmatter.id,
          slug: targetStory.slug,
          baseBranch,
        });

        // Change to worktree directory BEFORE updating story
        // This ensures story updates happen in the worktree, not on main
        // (allows parallel story launches from clean main)
        process.chdir(worktreePath);

        // Recalculate sdlcRoot for the worktree context
        const newSdlcRoot = getSdlcRoot();
        worktreeCreated = true;

        // Now update story frontmatter with worktree path (writes to worktree copy)
        // Re-resolve target story in worktree context
        const worktreeStory = findStoryById(newSdlcRoot, targetStory.frontmatter.id);
        if (worktreeStory) {
          const updatedStory = await updateStoryField(worktreeStory, 'worktree_path', worktreePath);
          await writeStory(updatedStory);
          // Update targetStory reference for downstream use
          updatedTargetStory = updatedStory;
        }

        console.log(c.success(`✓ Created worktree at: ${worktreePath}`));
        console.log(c.dim(`  Branch: ai-sdlc/${targetStory.frontmatter.id}-${targetStory.slug}`));
        console.log();
      } catch (error) {
        // Restore directory on worktree creation failure
        if (originalCwd) {
          process.chdir(originalCwd);
        }
        console.log(c.error(`Failed to create worktree: ${error instanceof Error ? error.message : String(error)}`));
        return { success: false, worktreeCreated: false };
      }
    }
  }

  return {
    success: true,
    worktreePath,
    originalCwd,
    worktreeCreated,
    targetStory: updatedTargetStory,
  };
}
