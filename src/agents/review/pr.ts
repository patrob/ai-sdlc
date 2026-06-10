import { execFileSync, execSync } from 'child_process';
import path from 'path';

import { loadConfig } from '../../core/config.js';
import { parseStory,updateStoryField, updateStoryStatus } from '../../core/story.js';
import type { AgentResult,Story } from '../../types/index.js';
import { escapeShellArg, sanitizeErrorMessage,validateGitBranchName, validateWorkingDirectory } from './security.js';

/**
 * Parse story content into sections by level-2 headers (##)
 * Returns array of {title, content} objects
 */
export function parseContentSections(content: string): Array<{ title: string; content: string }> {
  const sections: Array<{ title: string; content: string }> = [];
  const lines = content.split('\n');
  let currentSection: { title: string; content: string } | null = null;

  for (const line of lines) {
    const headerMatch = line.match(/^##\s+(.+)$/);

    if (headerMatch) {
      if (currentSection) sections.push(currentSection);
      currentSection = { title: headerMatch[1], content: '' };
    } else if (currentSection) {
      currentSection.content += line + '\n';
    }
  }

  if (currentSection) sections.push(currentSection);
  return sections;
}

/**
 * Remove unfinished checkboxes from content (per CLAUDE.md requirement)
 * Removes lines with `- [ ]` or `* [ ]` patterns
 * Preserves completed checkboxes `- [x]` and `- [X]`
 */
export function removeUnfinishedCheckboxes(content: string): string {
  const lines = content.split('\n');
  const filteredLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Match unchecked boxes: - [ ] or * [ ] with optional leading whitespace
    const isUnchecked = /^\s*[-*] \[ \]/.test(line);

    if (!isUnchecked) {
      filteredLines.push(line);
    }
  }

  return filteredLines.join('\n');
}

/**
 * Generate GitHub blob URL for story file
 * Parses remote URL and constructs link to story in repository
 */
export function getStoryFileURL(storyPath: string, branch: string, workingDir: string): string {
  try {
    const remoteUrl = execSync('git remote get-url origin', { cwd: workingDir, encoding: 'utf-8', stdio: 'pipe' }).trim();

    // Parse owner/repo from URL
    // HTTPS: https://github.com/owner/repo.git
    // SSH: git@github.com:owner/repo.git
    const match = remoteUrl.match(/github\.com[:/]([^/]+)\/(.+?)(\.git)?$/);
    if (!match) return '';

    const [, owner, repo] = match;
    const relativePath = path.relative(workingDir, storyPath);

    return `https://github.com/${owner}/${repo}/blob/${branch}/${relativePath}`;
  } catch {
    return '';
  }
}

/**
 * Format PR description from story sections
 * Includes: Story ID, User Story, Summary, Acceptance Criteria, Implementation Summary
 * Removes unfinished checkboxes from all sections
 */
export function formatPRDescription(story: Story, storyFileUrl: string): string {
  const sections = parseContentSections(story.content);

  // Extract key sections
  const userStory = sections.find(s => s.title === 'User Story')?.content || '';
  const summary = sections.find(s => s.title === 'Summary')?.content || '';
  const acceptanceCriteria = sections.find(s => s.title === 'Acceptance Criteria')?.content || '';
  const implementationSummary = sections.find(s => s.title === 'Implementation Summary')?.content || '';

  // Remove unfinished checkboxes from all sections
  const cleanAcceptanceCriteria = removeUnfinishedCheckboxes(acceptanceCriteria);
  const cleanImplementationSummary = removeUnfinishedCheckboxes(implementationSummary);

  // Build PR body
  let prBody = `## Story ID\n\n${story.frontmatter.id}\n\n`;

  if (userStory.trim()) {
    prBody += `## User Story\n\n${userStory.trim()}\n\n`;
  }

  if (summary.trim()) {
    prBody += `## Summary\n\n${summary.trim()}\n\n`;
  }

  if (cleanAcceptanceCriteria.trim()) {
    prBody += `## Acceptance Criteria\n\n${cleanAcceptanceCriteria.trim()}\n\n`;
  }

  if (cleanImplementationSummary.trim()) {
    prBody += `## Implementation Summary\n\n${cleanImplementationSummary.trim()}\n\n`;
  }

  // Add story file link
  if (storyFileUrl) {
    prBody += `---\n\n📋 [View Full Story](${storyFileUrl})\n`;
  }

  return prBody;
}

/**
 * Truncate PR body to respect GitHub's 65K character limit
 * Truncates Implementation Summary first (most verbose section)
 * Adds clear truncation indicator with story link
 */
export function truncatePRBody(body: string, maxLength: number = 64000): string {
  // Check if truncation needed
  if (body.length <= maxLength) {
    return body;
  }

  // Find Implementation Summary section
  const implSummaryMatch = body.match(/(## Implementation Summary\n\n)([\s\S]*?)(\n\n##|\n\n---|\n\n📋|$)/);

  if (implSummaryMatch) {
    const [fullMatch, header, content, trailer] = implSummaryMatch;
    const beforeImpl = body.substring(0, body.indexOf(fullMatch));
    const afterImpl = body.substring(body.indexOf(fullMatch) + fullMatch.length);

    // Calculate how much we need to remove
    const overhead = beforeImpl.length + header.length + trailer.length + afterImpl.length;
    const truncationIndicator = '\n\n⚠️ Implementation Summary truncated due to length. See full story for complete details.\n';
    const availableForContent = maxLength - overhead - truncationIndicator.length;

    if (availableForContent > 100) {
      // Truncate Implementation Summary at paragraph boundary
      let truncatedContent = content.substring(0, availableForContent);
      const lastParagraph = truncatedContent.lastIndexOf('\n\n');
      if (lastParagraph > 0) {
        truncatedContent = truncatedContent.substring(0, lastParagraph);
      }

      return beforeImpl + header + truncatedContent + truncationIndicator + trailer + afterImpl;
    }
  }

  // Fallback: simple truncation if no Implementation Summary found
  const truncatedBody = body.substring(0, maxLength - 200);
  const lastParagraph = truncatedBody.lastIndexOf('\n\n');
  const finalBody = lastParagraph > 0 ? truncatedBody.substring(0, lastParagraph) : truncatedBody;

  return finalBody + '\n\n⚠️ Description truncated due to length. See full story for complete details.\n';
}

/**
 * Options for creating a pull request
 */
export interface CreatePROptions {
  /** Create as draft PR (if not specified, uses config github.createDraftPRs) */
  draft?: boolean;
}

/**
 * Create a pull request for the completed story
 */
export async function createPullRequest(
  storyPath: string,
  sdlcRoot: string,
  options?: CreatePROptions
): Promise<AgentResult> {
  let story = parseStory(storyPath);
  const changesMade: string[] = [];
  const workingDir = path.dirname(sdlcRoot);

  // Security: Validate working directory
  try {
    validateWorkingDirectory(workingDir);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      story,
      changesMade,
      error: errorMsg,
    };
  }

  try {
    const branchName = story.frontmatter.branch || `ai-sdlc/${story.slug}`;

    // Security: Validate branch name to prevent command injection
    if (!validateGitBranchName(branchName)) {
      const errorMsg = `Invalid branch name: ${branchName} (only alphanumeric, hyphens, underscores, and slashes allowed)`;
      changesMade.push(errorMsg);
      return {
        success: false,
        story,
        changesMade,
        error: errorMsg,
      };
    }

    // Check if gh CLI is available
    try {
      execSync('gh --version', { stdio: 'pipe' });
    } catch {
      changesMade.push('GitHub CLI not available - PR creation skipped');

      // FIX: Only set to done if completion flags are set (consistent with validation)
      if (story.frontmatter.implementation_complete && story.frontmatter.reviews_complete) {
        story = await updateStoryStatus(story, 'done');
        changesMade.push('Updated status to done');
      } else {
        changesMade.push('Status not updated: completion flags not set and gh CLI unavailable');
      }

      return {
        success: true,
        story,
        changesMade,
      };
    }

    // Create PR using gh CLI
    try {
      // First, ensure we're on the right branch and have changes committed
      // Security: Branch name is already validated above
      execSync(`git checkout ${branchName}`, { cwd: workingDir, stdio: 'pipe' });

      // Check for uncommitted changes and commit them
      const status = execSync('git status --porcelain', { cwd: workingDir, encoding: 'utf-8' });
      if (status.trim()) {
        execSync('git add -A', { cwd: workingDir, stdio: 'pipe' });
        // Security: Escape shell arguments for commit message
        const commitMsg = `feat: ${story.frontmatter.title}`;
        execSync(`git commit -m ${escapeShellArg(commitMsg)}`, { cwd: workingDir, stdio: 'pipe' });
        changesMade.push('Committed changes');
      }

      // Push branch (already validated)
      execSync(`git push -u origin ${branchName}`, { cwd: workingDir, stdio: 'pipe' });
      changesMade.push(`Pushed branch: ${branchName}`);

      // Check if PR already exists for this branch
      try {
        const existingPROutput = execSync('gh pr view --json url', { cwd: workingDir, encoding: 'utf-8', stdio: 'pipe' });
        const prData = JSON.parse(existingPROutput);
        if (prData.url) {
          changesMade.push(`PR already exists: ${prData.url}`);
          // Update story with PR URL if missing
          if (!story.frontmatter.pr_url) {
            await updateStoryField(story, 'pr_url', prData.url);
            changesMade.push('Updated story with existing PR URL');
          }
          // Don't create duplicate - skip to status update
          story = await updateStoryStatus(story, 'done');
          changesMade.push('Updated status to done');
          return {
            success: true,
            story,
            changesMade,
          };
        }
      } catch {
        // No existing PR - proceed with creation
      }

      // Create PR using gh CLI with rich formatted body
      // Security: Use escaped arguments and heredoc to prevent shell injection
      const prTitle = story.frontmatter.title;

      // Generate story file URL
      const storyFileUrl = getStoryFileURL(storyPath, branchName, workingDir);

      // Format rich PR description
      let prBody = formatPRDescription(story, storyFileUrl);

      // Truncate if needed to respect GitHub's 65K limit
      prBody = truncatePRBody(prBody);

      // Determine if draft PR should be created
      // Options parameter takes precedence, then config, default is false
      const config = loadConfig(workingDir);
      const createAsDraft = options?.draft ?? config.github?.createDraftPRs ?? false;
      const ghArgs = [
        'pr', 'create',
        '--title', prTitle,
        '--body', prBody,
        ...(createAsDraft ? ['--draft'] : []),
      ];

      const prOutput = execFileSync('gh', ghArgs, { cwd: workingDir, encoding: 'utf-8' });

      const prUrl = prOutput.trim();
      await updateStoryField(story, 'pr_url', prUrl);
      const prTypeLabel = createAsDraft ? 'draft PR' : 'PR';
      changesMade.push(`Created ${prTypeLabel}: ${prUrl}`);
    } catch (error) {
      const sanitizedError = sanitizeErrorMessage(
        error instanceof Error ? error.message : String(error),
        workingDir
      );

      // Provide actionable error messages for common issues
      let errorMessage = `PR creation failed: ${sanitizedError}`;

      if (sanitizedError.includes('authentication') || sanitizedError.includes('auth') || sanitizedError.includes('credentials')) {
        errorMessage = `GitHub authentication failed. Please authenticate using one of:
1. Set GITHUB_TOKEN env var: export GITHUB_TOKEN=ghp_xxx
2. Run: gh auth login
3. Check: gh auth status`;
      }

      changesMade.push(errorMessage);

      // FIX: Return failure when PR creation fails instead of continuing to set done
      return {
        success: false,
        story,
        changesMade,
        error: errorMessage,
      };
    }

    // FIX: Only update status to done if reviews_complete AND pr_url exist
    // This prevents marking stories done when PR creation hasn't actually succeeded
    if (story.frontmatter.reviews_complete && story.frontmatter.pr_url) {
      story = await updateStoryStatus(story, 'done');
      changesMade.push('Updated status to done');
    } else {
      changesMade.push('Status not updated to done: reviews_complete or pr_url missing');
    }

    return {
      success: true,
      story,
      changesMade,
    };
  } catch (error) {
    const sanitizedError = sanitizeErrorMessage(
      error instanceof Error ? error.message : String(error),
      workingDir
    );
    return {
      success: false,
      story,
      changesMade,
      error: sanitizedError,
    };
  }
}
