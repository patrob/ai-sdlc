/**
 * GitHub Issues ticket provider implementation.
 */

import { execSync } from 'child_process';
import { Config, StoryStatus } from '../../types/index.js';
import { Ticket, TicketFilter, NewTicket, TicketProvider } from './types.js';
import { getIssuePriorityFromProject, GitHubProjectsConfig } from '../github-projects/index.js';

/**
 * Extract owner and repo from a GitHub URL or repo string.
 * Supports formats:
 * - "owner/repo"
 * - "https://github.com/owner/repo"
 * - "git@github.com:owner/repo.git"
 */
function parseRepoString(repoString: string): { owner: string; repo: string } {
  // Direct format: owner/repo
  if (!repoString.includes('/') || repoString.split('/').length === 2) {
    const [owner, repo] = repoString.split('/');
    if (owner && repo) {
      return { owner, repo: repo.replace(/\.git$/, '') };
    }
  }

  // HTTPS URL
  const httpsMatch = repoString.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/);
  if (httpsMatch) {
    return { owner: httpsMatch[1], repo: httpsMatch[2] };
  }

  // SSH URL
  const sshMatch = repoString.match(/github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/);
  if (sshMatch) {
    return { owner: sshMatch[1], repo: sshMatch[2] };
  }

  throw new Error(`Invalid GitHub repo format: ${repoString}`);
}

/**
 * Get owner and repo from config or git remote.
 */
function getRepoInfo(config: Config): { owner: string; repo: string } {
  // Try config first
  if (config.ticketing?.github?.repo) {
    return parseRepoString(config.ticketing.github.repo);
  }

  // Fall back to git remote
  try {
    const remote = execSync('git remote get-url origin', { encoding: 'utf-8' }).trim();
    return parseRepoString(remote);
  } catch (error) {
    throw new Error('Could not determine GitHub repository. Set ticketing.github.repo in config or ensure git remote is configured.');
  }
}

/**
 * Extract issue number from various ID formats.
 * Supports:
 * - "123" (plain number)
 * - "#123" (with hash)
 * - "https://github.com/owner/repo/issues/123" (URL)
 */
function extractIssueNumber(ticketId: string): number {
  // Plain number or with hash
  const plainMatch = ticketId.match(/^#?(\d+)$/);
  if (plainMatch) {
    return parseInt(plainMatch[1], 10);
  }

  // URL format
  const urlMatch = ticketId.match(/\/issues\/(\d+)/);
  if (urlMatch) {
    return parseInt(urlMatch[1], 10);
  }

  throw new Error(`Invalid GitHub issue ID format: ${ticketId}`);
}

/**
 * GitHub Issues ticket provider.
 */
export class GitHubTicketProvider implements TicketProvider {
  readonly name = 'github';
  private config: Config;
  private repoInfo: { owner: string; repo: string };

  constructor(config: Config) {
    this.config = config;
    this.repoInfo = getRepoInfo(config);
  }

  /**
   * List GitHub issues matching filter criteria.
   */
  async list(filter?: TicketFilter): Promise<Ticket[]> {
    const args: string[] = ['issue', 'list', '--repo', `${this.repoInfo.owner}/${this.repoInfo.repo}`, '--json', 'number,title,body,state,labels,assignees,url'];

    // Apply filters
    if (filter?.status && filter.status.length > 0) {
      // Map status to GitHub state (open/closed)
      const states = new Set<string>();
      for (const status of filter.status) {
        const mapped = this.mapStatusToExternal(status as StoryStatus);
        states.add(mapped);
      }
      args.push('--state', Array.from(states).join(','));
    }

    if (filter?.labels && filter.labels.length > 0) {
      args.push('--label', filter.labels.join(','));
    }

    if (filter?.assignee) {
      args.push('--assignee', filter.assignee);
    }

    if (filter?.limit) {
      args.push('--limit', String(filter.limit));
    }

    try {
      const result = execSync(`gh ${args.join(' ')}`, { encoding: 'utf-8' });
      const issues = JSON.parse(result);

      return issues.map((issue: any) => this.mapIssueToTicket(issue));
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to list GitHub issues: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Get a single GitHub issue by ID.
   */
  async get(id: string): Promise<Ticket> {
    const issueNumber = extractIssueNumber(id);

    try {
      const result = execSync(`gh issue view ${issueNumber} --repo ${this.repoInfo.owner}/${this.repoInfo.repo} --json number,title,body,state,labels,assignees,url`, {
        encoding: 'utf-8',
      });
      const issue = JSON.parse(result);

      return this.mapIssueToTicket(issue);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to get GitHub issue #${issueNumber}: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Create a new GitHub issue.
   */
  async create(ticket: NewTicket): Promise<Ticket> {
    const args: string[] = ['issue', 'create', '--repo', `${this.repoInfo.owner}/${this.repoInfo.repo}`, '--title', ticket.title, '--body', ticket.description || ''];

    if (ticket.labels && ticket.labels.length > 0) {
      args.push('--label', ticket.labels.join(','));
    }

    if (ticket.assignee) {
      args.push('--assignee', ticket.assignee);
    }

    try {
      const url = execSync(`gh ${args.join(' ')}`, { encoding: 'utf-8' }).trim();
      const issueNumber = extractIssueNumber(url);

      return await this.get(String(issueNumber));
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to create GitHub issue: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Update GitHub issue status (using labels).
   */
  async updateStatus(id: string, status: string): Promise<void> {
    const issueNumber = extractIssueNumber(id);
    const statusLabels = this.config.ticketing?.github?.statusLabels || {};

    // Remove old status labels
    for (const label of Object.values(statusLabels)) {
      try {
        execSync(`gh issue edit ${issueNumber} --repo ${this.repoInfo.owner}/${this.repoInfo.repo} --remove-label "${label}"`, {
          stdio: 'ignore',
        });
      } catch {
        // Label might not exist, ignore
      }
    }

    // Add new status label
    try {
      execSync(`gh issue edit ${issueNumber} --repo ${this.repoInfo.owner}/${this.repoInfo.repo} --add-label "${status}"`, {
        stdio: 'pipe',
      });
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to update status for GitHub issue #${issueNumber}: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Add a comment to a GitHub issue.
   */
  async addComment(id: string, body: string): Promise<void> {
    const issueNumber = extractIssueNumber(id);

    try {
      execSync(`gh issue comment ${issueNumber} --repo ${this.repoInfo.owner}/${this.repoInfo.repo} --body "${body.replace(/"/g, '\\"')}"`, {
        stdio: 'pipe',
      });
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to add comment to GitHub issue #${issueNumber}: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Link a pull request to a GitHub issue (via comment).
   */
  async linkPR(id: string, prUrl: string): Promise<void> {
    const issueNumber = extractIssueNumber(id);
    const comment = `Linked pull request: ${prUrl}`;

    await this.addComment(String(issueNumber), comment);
  }

  /**
   * Map internal story status to GitHub label.
   */
  mapStatusToExternal(status: StoryStatus): string {
    const statusLabels = this.config.ticketing?.github?.statusLabels || {};
    return statusLabels[status] || status;
  }

  /**
   * Map GitHub label to internal story status.
   */
  mapStatusFromExternal(externalStatus: string): StoryStatus {
    const statusLabels = this.config.ticketing?.github?.statusLabels || {};

    // Reverse lookup
    for (const [internalStatus, externalLabel] of Object.entries(statusLabels)) {
      if (externalLabel === externalStatus) {
        return internalStatus as StoryStatus;
      }
    }

    // Default mapping
    return externalStatus as StoryStatus;
  }

  /**
   * Sync priority from GitHub Projects.
   * Returns normalized priority value from project board, or null if not in project.
   */
  async syncPriority(ticketId: string): Promise<number | null> {
    const projectNumber = this.config.ticketing?.github?.projectNumber;

    // If no project configured, can't sync priority
    if (!projectNumber) {
      return null;
    }

    try {
      const issueNumber = extractIssueNumber(ticketId);

      const projectConfig: GitHubProjectsConfig = {
        owner: this.repoInfo.owner,
        repo: this.repoInfo.repo,
        projectNumber,
        priorityField: this.config.ticketing?.github?.priorityField,
        priorityMapping: this.config.ticketing?.github?.priorityMapping,
      };

      const priority = await getIssuePriorityFromProject(projectConfig, issueNumber);
      return priority;
    } catch (error) {
      // Log error but don't throw - gracefully fall back to local priority
      console.warn(`Failed to sync priority from GitHub Projects: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  /**
   * Map GitHub issue JSON to Ticket interface.
   */
  private mapIssueToTicket(issue: any): Ticket {
    return {
      id: String(issue.number),
      url: issue.url,
      title: issue.title,
      description: issue.body || '',
      status: issue.state,
      priority: 50, // Default priority (GitHub doesn't have native priority)
      labels: issue.labels?.map((l: any) => l.name) || [],
      assignee: issue.assignees?.[0]?.login,
    };
  }
}
