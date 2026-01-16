import { spawnSync } from 'child_process';
import path from 'path';
import {
  Story,
  ConflictAnalysis,
  ConflictDetectionResult,
  ConflictSeverity,
} from '../types/index.js';
import { sanitizeStoryId } from './story.js';

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
  ) {}

  /**
   * Detect conflicts between multiple stories by analyzing their git branches.
   * Performs O(n²) pairwise comparison - acceptable for small story counts (<20).
   *
   * @param stories - Array of stories to analyze
   * @returns Conflict analysis with severity classification and recommendations
   */
  async detectConflicts(stories: Story[]): Promise<ConflictDetectionResult> {
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
        const analysis = await this.analyzePair(stories[i], stories[j]);
        conflicts.push(analysis);
      }
    }

    // Determine if safe to run concurrently (false if ANY high-severity conflict)
    const hasHighSeverityConflict = conflicts.some(c => c.severity === 'high');
    const safeToRunConcurrently = !hasHighSeverityConflict;

    // Generate summary
    const highCount = conflicts.filter(c => c.severity === 'high').length;
    const mediumCount = conflicts.filter(c => c.severity === 'medium').length;
    const summary = this.generateSummary(conflicts.length, highCount, mediumCount, safeToRunConcurrently);

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
  private async analyzePair(storyA: Story, storyB: Story): Promise<ConflictAnalysis> {
    // Sanitize story IDs first to prevent path traversal attacks
    // This must happen BEFORE any other operations
    sanitizeStoryId(storyA.frontmatter.id);
    sanitizeStoryId(storyB.frontmatter.id);

    const filesA = await this.getModifiedFiles(storyA);
    const filesB = await this.getModifiedFiles(storyB);

    const sharedFiles = this.findSharedFiles(filesA, filesB);
    const sharedDirectories = this.findSharedDirectories(filesA, filesB);
    const severity = this.classifySeverity(sharedFiles, sharedDirectories);
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
  private async getModifiedFiles(story: Story): Promise<string[]> {
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
      return story.frontmatter.worktree_path;
    }

    // Otherwise, use the main project root
    return this.projectRoot;
  }

  /**
   * Get committed changes using git diff
   * @private
   */
  private getCommittedChanges(workingDir: string, branchName: string): string[] {
    const result = spawnSync(
      'git',
      ['diff', '--name-only', `${this.baseBranch}...${branchName}`],
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
    return output
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);
  }

  /**
   * Get uncommitted changes using git status --porcelain
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
        return line.substring(3).trim();
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
   * Classify conflict severity based on overlap
   * @private
   */
  private classifySeverity(sharedFiles: string[], sharedDirs: string[]): ConflictSeverity {
    if (sharedFiles.length > 0) {
      return 'high';
    }
    if (sharedDirs.length > 0) {
      return 'medium';
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
    safe: boolean
  ): string {
    if (highCount > 0) {
      return `Found ${highCount} high-severity conflict(s) - recommend sequential execution`;
    }
    if (mediumCount > 0) {
      return `Found ${mediumCount} medium-severity conflict(s) - proceed with caution`;
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
 * const result = await detectConflicts(stories, '/path/to/project');
 * console.log(result.summary);
 * ```
 */
export async function detectConflicts(
  stories: Story[],
  projectRoot: string,
  baseBranch: string = 'main'
): Promise<ConflictDetectionResult> {
  const detector = new ConflictDetectorService(projectRoot, baseBranch);
  return detector.detectConflicts(stories);
}
