import { spawnSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import {
  Story,
  ConflictAnalysis,
  ConflictDetectionResult,
  ConflictSeverity,
} from '../types/index.js';
import { sanitizeStoryId } from './story.js';

/**
 * Validate branch name to prevent command injection attacks.
 * Rejects branch names containing shell metacharacters.
 *
 * @param branchName - Branch name to validate
 * @throws Error if branch name contains dangerous characters
 */
function validateBranchName(branchName: string): void {
  if (!branchName) {
    throw new Error('Branch name cannot be empty');
  }

  // Reject shell metacharacters that could be used for command injection
  const dangerousChars = [';', '|', '&', '$', '`', '\n', '\r'];
  for (const char of dangerousChars) {
    if (branchName.includes(char)) {
      throw new Error(`Invalid branch name: contains dangerous character '${char}'`);
    }
  }

  // Reject path traversal sequences
  if (branchName.includes('..')) {
    throw new Error('Invalid branch name: contains path traversal sequence (..)');
  }
}

/**
 * Validate worktree path to prevent path traversal attacks.
 * Ensures the path is an absolute path.
 * Note: Worktrees can legitimately exist outside the project root.
 *
 * @param worktreePath - Worktree path to validate
 * @param projectRoot - Project root directory (unused but kept for API consistency)
 * @throws Error if worktree path is invalid
 */
function validateWorktreePath(worktreePath: string, projectRoot: string): void {
  if (!worktreePath) {
    throw new Error('Worktree path cannot be empty');
  }

  // Validate that path doesn't contain suspicious patterns
  // Reject path traversal patterns in the original path
  if (worktreePath.includes('..')) {
    throw new Error('Invalid worktree path: contains path traversal sequence (..)');
  }

  // Ensure it's an absolute path (starts with / on Unix or drive letter on Windows)
  // Check the original path, not the resolved one
  if (!path.isAbsolute(worktreePath)) {
    throw new Error('Invalid worktree path: must be an absolute path');
  }
}

/**
 * Validate base branch name format.
 * Only allows alphanumeric characters, dots, slashes, underscores, and hyphens.
 *
 * @param baseBranch - Base branch name to validate
 * @throws Error if base branch name contains invalid characters
 */
function validateBaseBranch(baseBranch: string): void {
  if (!baseBranch) {
    throw new Error('Base branch name cannot be empty');
  }

  if (!/^[a-zA-Z0-9._\/-]+$/.test(baseBranch)) {
    throw new Error(`Invalid base branch name: contains invalid characters (only alphanumeric, dots, slashes, underscores, and hyphens allowed)`);
  }
}

/**
 * Validate project root directory.
 * Ensures it's an absolute path, exists, and contains a .git directory.
 *
 * @param projectRoot - Project root directory to validate
 * @throws Error if project root is invalid
 */
function validateProjectRoot(projectRoot: string): void {
  if (!projectRoot) {
    throw new Error('Project root cannot be empty');
  }

  if (!path.isAbsolute(projectRoot)) {
    throw new Error('Project root must be an absolute path');
  }

  if (!fs.existsSync(projectRoot)) {
    throw new Error(`Project root does not exist: ${projectRoot}`);
  }

  const gitDir = path.join(projectRoot, '.git');
  if (!fs.existsSync(gitDir)) {
    throw new Error(`Project root is not a git repository: ${projectRoot} (no .git directory found)`);
  }
}

/**
 * Service for detecting conflicts between multiple stories by analyzing their git branches.
 * Performs pairwise comparison of modified files to identify overlapping changes.
 *
 * @example
 * ```typescript
 * const detector = new ConflictDetectorService('/path/to/project', 'main');
 * const result = await detector.detectConflicts([storyA, storyB]);
 * if (!result.safeToRunConcurrently) {
 *   console.log('Conflicts detected:', result.summary);
 * }
 * ```
 */
export class ConflictDetectorService {
  constructor(
    private projectRoot: string,
    private baseBranch: string = 'main'
  ) {
    // Validate constructor parameters for security
    validateProjectRoot(projectRoot);
    validateBaseBranch(baseBranch);
  }

  /**
   * Detect conflicts between multiple stories by analyzing their git branches.
   * Performs O(n²) pairwise comparison - acceptable for small story counts (<20).
   *
   * @param stories - Array of stories to analyze
   * @returns Conflict analysis with severity classification and recommendations
   */
  detectConflicts(stories: Story[]): ConflictDetectionResult {
    // Handle edge cases: empty array or single story
    if (stories.length === 0 || stories.length === 1) {
      return {
        conflicts: [],
        safeToRunConcurrently: true,
        summary: stories.length === 0
          ? 'No stories to analyze'
          : 'Single story - no conflicts possible',
      };
    }

    const conflicts: ConflictAnalysis[] = [];

    // Perform pairwise comparison (O(n²))
    for (let i = 0; i < stories.length; i++) {
      for (let j = i + 1; j < stories.length; j++) {
        const analysis = this.analyzePair(stories[i], stories[j]);
        conflicts.push(analysis);
      }
    }

    // Determine if safe to run concurrently (false if ANY high-severity conflict)
    const hasHighSeverityConflict = conflicts.some(c => c.severity === 'high');
    const safeToRunConcurrently = !hasHighSeverityConflict;

    // Generate summary
    const highCount = conflicts.filter(c => c.severity === 'high').length;
    const mediumCount = conflicts.filter(c => c.severity === 'medium').length;
    const lowCount = conflicts.filter(c => c.severity === 'low').length;
    const summary = this.generateSummary(conflicts.length, highCount, mediumCount, lowCount, safeToRunConcurrently);

    return {
      conflicts,
      safeToRunConcurrently,
      summary,
    };
  }

  /**
   * Analyze potential conflicts between two stories
   * @private
   */
  private analyzePair(storyA: Story, storyB: Story): ConflictAnalysis {
    // Sanitize story IDs first to prevent path traversal attacks
    // This must happen BEFORE any other operations
    sanitizeStoryId(storyA.frontmatter.id);
    sanitizeStoryId(storyB.frontmatter.id);

    const filesA = this.getModifiedFiles(storyA);
    const filesB = this.getModifiedFiles(storyB);

    const sharedFiles = this.findSharedFiles(filesA, filesB);
    const sharedDirectories = this.findSharedDirectories(filesA, filesB);
    const severity = this.classifySeverity(sharedFiles, sharedDirectories, filesA, filesB);
    const recommendation = this.generateRecommendation(sharedFiles, sharedDirectories, severity);

    return {
      storyA: storyA.frontmatter.id,
      storyB: storyB.frontmatter.id,
      sharedFiles,
      sharedDirectories,
      severity,
      recommendation,
    };
  }

  /**
   * Get all modified files for a story (committed and uncommitted changes)
   * @private
   */
  private getModifiedFiles(story: Story): string[] {
    // Find the branch for this story
    const branchName = this.getBranchName(story);
    if (!branchName) {
      // No branch yet - return empty array
      return [];
    }

    // Determine working directory (worktree or main repo)
    const workingDir = this.getBranchWorkingDirectory(story);

    // Get committed changes
    const committedFiles = this.getCommittedChanges(workingDir, branchName);

    // Get uncommitted changes
    const uncommittedFiles = this.getUncommittedChanges(workingDir);

    // Combine and deduplicate
    const allFiles = [...new Set([...committedFiles, ...uncommittedFiles])];

    return allFiles;
  }

  /**
   * Find the branch name for a story using pattern ai-sdlc/{storyId}-*
   * @private
   */
  private getBranchName(story: Story): string | null {
    // Sanitize story ID first to prevent injection (defense in depth)
    // This validates the story ID regardless of whether branch is set
    const storyId = sanitizeStoryId(story.frontmatter.id);

    // First, check if branch is explicitly set in frontmatter
    if (story.frontmatter.branch) {
      // SECURITY: Validate branch name to prevent command injection
      validateBranchName(story.frontmatter.branch);
      return story.frontmatter.branch;
    }

    // Use git branch --list to find matching branch
    const pattern = `ai-sdlc/${storyId}-*`;
    const result = spawnSync('git', ['branch', '--list', pattern], {
      cwd: this.projectRoot,
      encoding: 'utf-8',
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    if (result.status !== 0) {
      return null;
    }

    const output = result.stdout?.toString().trim() || '';
    if (!output) {
      return null;
    }

    // Parse branch name (remove leading * and whitespace)
    const branchName = output.split('\n')[0].replace(/^\*?\s*/, '');
    return branchName || null;
  }

  /**
   * Determine the working directory for a story (worktree or main repo)
   * @private
   */
  private getBranchWorkingDirectory(story: Story): string {
    // If story has a worktree path, use that
    if (story.frontmatter.worktree_path) {
      // SECURITY: Validate worktree path to prevent path traversal attacks
      validateWorktreePath(story.frontmatter.worktree_path, this.projectRoot);
      return story.frontmatter.worktree_path;
    }

    // Otherwise, use the main project root
    return this.projectRoot;
  }

  /**
   * Get committed changes using git diff --name-status.
   * Handles renamed and deleted files by including both old and new paths.
   * @private
   */
  private getCommittedChanges(workingDir: string, branchName: string): string[] {
    const result = spawnSync(
      'git',
      ['diff', '--name-status', `${this.baseBranch}...${branchName}`],
      {
        cwd: workingDir,
        encoding: 'utf-8',
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );

    if (result.status !== 0) {
      // Git command failed - return empty array
      return [];
    }

    const output = result.stdout?.toString() || '';
    const files: string[] = [];

    for (const line of output.split('\n')) {
      if (!line.trim()) continue;

      // Parse git diff --name-status format: "STATUS\tFILE" or "RXXX\tOLD\tNEW"
      const parts = line.split('\t');
      if (parts.length < 2) continue;

      const status = parts[0].trim();

      // Handle renames (R or R100 or similar)
      if (status.startsWith('R')) {
        if (parts.length >= 3) {
          // Format: R100\told-file\tnew-file
          // Include both old and new paths for comprehensive conflict detection
          files.push(parts[1].trim()); // old path
          files.push(parts[2].trim()); // new path
        }
      } else {
        // Modified (M), Added (A), Deleted (D), etc.
        files.push(parts[1].trim());
      }
    }

    return files;
  }

  /**
   * Get uncommitted changes using git status --porcelain.
   * Handles quoted filenames with spaces or special characters.
   * @private
   */
  private getUncommittedChanges(workingDir: string): string[] {
    const result = spawnSync('git', ['status', '--porcelain'], {
      cwd: workingDir,
      encoding: 'utf-8',
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    if (result.status !== 0) {
      // Git command failed - return empty array
      return [];
    }

    const output = result.stdout?.toString() || '';
    return output
      .split('\n')
      .map(line => {
        // Parse porcelain format: "XY filename"
        // XY are status codes, filename starts at column 4
        if (line.length < 4) return '';

        let filename = line.substring(3).trim();

        // Handle quoted filenames (filenames with spaces or special chars are wrapped in quotes)
        // Format: 'XY "filename with spaces.txt"'
        if (filename.startsWith('"') && filename.endsWith('"')) {
          filename = filename.slice(1, -1);
        }

        return filename;
      })
      .filter(line => line.length > 0);
  }

  /**
   * Find files that appear in both arrays (exact path match)
   * @private
   */
  private findSharedFiles(filesA: string[], filesB: string[]): string[] {
    const setB = new Set(filesB);
    return filesA.filter(file => setB.has(file));
  }

  /**
   * Find directories that contain files from both arrays
   * @private
   */
  private findSharedDirectories(filesA: string[], filesB: string[]): string[] {
    const dirsA = new Set(filesA.map(f => path.dirname(f)));
    const dirsB = new Set(filesB.map(f => path.dirname(f)));
    return Array.from(dirsA).filter(d => dirsB.has(d));
  }

  /**
   * Classify conflict severity based on overlap.
   *
   * Severity levels:
   * - high: Same file modified in both stories (direct conflict)
   * - medium: Same directory, different files (potential merge issues)
   * - low: Different directories, but both stories have changes (cross-cutting concerns)
   * - none: No overlap or one story has no changes
   *
   * @private
   */
  private classifySeverity(
    sharedFiles: string[],
    sharedDirs: string[],
    filesA: string[],
    filesB: string[]
  ): ConflictSeverity {
    if (sharedFiles.length > 0) {
      return 'high';
    }
    if (sharedDirs.length > 0) {
      return 'medium';
    }
    // Low severity: both stories have changes, but in different areas
    if (filesA.length > 0 && filesB.length > 0) {
      return 'low';
    }
    return 'none';
  }

  /**
   * Generate human-readable recommendation based on conflict analysis
   * @private
   */
  private generateRecommendation(
    sharedFiles: string[],
    sharedDirs: string[],
    severity: ConflictSeverity
  ): string {
    if (severity === 'high') {
      return `Run sequentially - ${sharedFiles.length} shared file(s) detected`;
    }
    if (severity === 'medium') {
      return `Proceed with caution - ${sharedDirs.length} shared directory(ies)`;
    }
    if (severity === 'low') {
      return 'Safe to run concurrently - changes in different areas';
    }
    return 'Safe to run concurrently - no conflicts detected';
  }

  /**
   * Generate overall summary of conflict detection results
   * @private
   */
  private generateSummary(
    totalPairs: number,
    highCount: number,
    mediumCount: number,
    lowCount: number,
    safe: boolean
  ): string {
    if (highCount > 0) {
      return `Found ${highCount} high-severity conflict(s) - recommend sequential execution`;
    }
    if (mediumCount > 0) {
      return `Found ${mediumCount} medium-severity conflict(s) - proceed with caution`;
    }
    if (lowCount > 0) {
      return `Found ${lowCount} low-severity conflict(s) - safe to run concurrently but monitor closely`;
    }
    return `No conflicts detected across ${totalPairs} story pair(s) - safe for concurrent execution`;
  }
}

/**
 * Convenience function to detect conflicts between stories.
 * Creates a ConflictDetectorService instance and runs conflict detection.
 *
 * @param stories - Array of stories to analyze
 * @param projectRoot - Root directory of the git repository
 * @param baseBranch - Base branch to compare against (default: 'main')
 * @returns Conflict detection result
 *
 * @example
 * ```typescript
 * const result = detectConflicts(stories, '/path/to/project');
 * console.log(result.summary);
 * ```
 */
export function detectConflicts(
  stories: Story[],
  projectRoot: string,
  baseBranch: string = 'main'
): ConflictDetectionResult {
  const detector = new ConflictDetectorService(projectRoot, baseBranch);
  return detector.detectConflicts(stories);
}
