import { StoryStatus } from '../../types/index.js';
import { Ticket, TicketFilter, NewTicket, TicketProvider } from './types.js';
import {
  ghIssueView,
  ghIssueList,
  ghIssueEdit,
  ghIssueClose,
  ghIssueReopen,
  ghIssueComment,
  ghIssueCreate,
  type GitHubIssue,
  type IssueFilter,
} from '../gh-cli.js';

/**
 * GitHub-specific configuration for the ticket provider.
 */
export interface GitHubConfig {
  /** Repository in format 'owner/repo' */
  repo?: string;
  /** GitHub Projects v2 project number for priority sync */
  projectNumber?: number;
  /** Map story statuses to GitHub labels */
  statusLabels?: Record<string, string>;
}

/**
 * Ticket provider implementation for GitHub Issues.
 *
 * Integrates with GitHub Issues via the gh CLI. Supports:
 * - Listing issues with filters
 * - Fetching individual issues
 * - Creating new issues
 * - Updating issue status (via labels and state)
 * - Adding comments
 * - Linking pull requests
 * - Status mapping between GitHub and ai-sdlc
 */
export class GitHubTicketProvider implements TicketProvider {
  readonly name = 'github';

  constructor(private config?: GitHubConfig) {}

  /**
   * Get owner and repo from config.
   * @throws Error if repo is not configured
   */
  private getOwnerRepo(): { owner: string; repo: string } {
    if (!this.config?.repo) {
      throw new Error('GitHub repository not configured. Set ticketing.github.repo in config.');
    }

    const [owner, repo] = this.config.repo.split('/');
    if (!owner || !repo) {
      throw new Error(`Invalid GitHub repository format: "${this.config.repo}". Expected "owner/repo".`);
    }

    return { owner, repo };
  }

  /**
   * Map GitHub Issue to Ticket.
   */
  private mapIssueToTicket(issue: GitHubIssue): Ticket {
    const { owner, repo } = this.getOwnerRepo();
    const url = `https://github.com/${owner}/${repo}/issues/${issue.number}`;
    const labels = issue.labels.map((l) => l.name);
    const assignee = issue.assignees[0]?.login;

    // Extract priority from project if available
    let priority = 3; // Default priority
    if (issue.projectItems && issue.projectItems.length > 0) {
      for (const item of issue.projectItems) {
        // Look for priority field in project
        if (item.fieldValueByName) {
          const priorityField = item.fieldValueByName.find(
            (f) => f.field.name.toLowerCase() === 'priority'
          );
          if (priorityField) {
            // Try to parse priority as number
            const priorityValue = parseInt(priorityField.name, 10);
            if (!isNaN(priorityValue)) {
              priority = priorityValue;
            }
          }
        }
      }
    }

    return {
      id: issue.number.toString(),
      url,
      title: issue.title,
      description: issue.body || '',
      status: issue.state,
      priority,
      labels,
      assignee,
    };
  }

  /**
   * List tickets matching the given filter criteria.
   */
  async list(filter?: TicketFilter): Promise<Ticket[]> {
    const { owner, repo } = this.getOwnerRepo();

    // Convert TicketFilter to IssueFilter
    const issueFilter: IssueFilter = {};

    if (filter?.status && filter.status.length > 0) {
      // Map internal statuses to GitHub state
      const hasOpen = filter.status.some((s) =>
        ['backlog', 'ready', 'in-progress', 'blocked'].includes(s)
      );
      const hasClosed = filter.status.includes('done');

      if (hasOpen && hasClosed) {
        issueFilter.state = 'all';
      } else if (hasOpen) {
        issueFilter.state = 'open';
      } else if (hasClosed) {
        issueFilter.state = 'closed';
      }
    }

    if (filter?.labels) {
      issueFilter.labels = filter.labels;
    }

    if (filter?.assignee) {
      issueFilter.assignee = filter.assignee;
    }

    if (filter?.limit) {
      issueFilter.limit = filter.limit;
    }

    const issues = await ghIssueList(owner, repo, issueFilter);
    return issues.map((issue) => this.mapIssueToTicket(issue));
  }

  /**
   * Get a single ticket by its ID.
   */
  async get(id: string): Promise<Ticket> {
    const { owner, repo } = this.getOwnerRepo();
    const issueNumber = parseInt(id, 10);

    if (isNaN(issueNumber)) {
      throw new Error(`Invalid GitHub issue number: "${id}"`);
    }

    const issue = await ghIssueView(owner, repo, issueNumber);
    return this.mapIssueToTicket(issue);
  }

  /**
   * Create a new ticket.
   */
  async create(ticket: NewTicket): Promise<Ticket> {
    const { owner, repo } = this.getOwnerRepo();

    const issue = await ghIssueCreate(owner, repo, {
      title: ticket.title,
      body: ticket.description,
      labels: ticket.labels,
      assignee: ticket.assignee,
    });

    return this.mapIssueToTicket(issue);
  }

  /**
   * Update the status of a ticket.
   *
   * GitHub doesn't have a native "status" field, so we use labels:
   * 1. Remove old status labels (matching configured statusLabels or status:*)
   * 2. Add new status label (from config or status:{status})
   * 3. Close issue if status is 'done', reopen if moving from done to active
   */
  async updateStatus(id: string, status: string): Promise<void> {
    const { owner, repo } = this.getOwnerRepo();
    const issueNumber = parseInt(id, 10);

    if (isNaN(issueNumber)) {
      throw new Error(`Invalid GitHub issue number: "${id}"`);
    }

    // Get current issue to read existing labels
    const issue = await ghIssueView(owner, repo, issueNumber);

    // Find status labels to remove
    const currentLabels = issue.labels.map((l) => l.name);
    const statusLabelsToRemove: string[] = [];

    // Check for configured status labels
    if (this.config?.statusLabels) {
      for (const label of Object.values(this.config.statusLabels)) {
        if (currentLabels.includes(label)) {
          statusLabelsToRemove.push(label);
        }
      }
    }

    // Also check for any label starting with "status:"
    for (const label of currentLabels) {
      if (label.startsWith('status:') && !statusLabelsToRemove.includes(label)) {
        statusLabelsToRemove.push(label);
      }
    }

    // Determine new status label
    const newStatusLabel = this.config?.statusLabels?.[status] ?? `status:${status}`;

    // Update labels
    await ghIssueEdit(owner, repo, issueNumber, {
      removeLabels: statusLabelsToRemove,
      addLabels: [newStatusLabel],
    });

    // Handle issue state (open/closed)
    if (status === 'done') {
      // Close the issue if it's not already closed
      if (issue.state === 'open') {
        await ghIssueClose(owner, repo, issueNumber);
      }
    } else {
      // Reopen the issue if it was closed
      if (issue.state === 'closed') {
        await ghIssueReopen(owner, repo, issueNumber);
      }
    }
  }

  /**
   * Add a comment to a ticket.
   */
  async addComment(id: string, body: string): Promise<void> {
    const { owner, repo } = this.getOwnerRepo();
    const issueNumber = parseInt(id, 10);

    if (isNaN(issueNumber)) {
      throw new Error(`Invalid GitHub issue number: "${id}"`);
    }

    await ghIssueComment(owner, repo, issueNumber, body);
  }

  /**
   * Link a pull request to a ticket.
   *
   * Adds a comment with the PR URL. The actual GitHub PR-Issue linking
   * happens via the PR body containing "Closes #123".
   */
  async linkPR(id: string, prUrl: string): Promise<void> {
    const { owner, repo } = this.getOwnerRepo();
    const issueNumber = parseInt(id, 10);

    if (isNaN(issueNumber)) {
      throw new Error(`Invalid GitHub issue number: "${id}"`);
    }

    const body = `🔗 Pull request created: ${prUrl}`;
    await ghIssueComment(owner, repo, issueNumber, body);
  }

  /**
   * Map internal story status to external GitHub status.
   *
   * Uses label-based mapping if configured, otherwise uses state:
   * - backlog, ready, in_progress, blocked → 'open'
   * - done → 'closed'
   */
  mapStatusToExternal(status: StoryStatus): string {
    // Check for custom label mapping
    if (this.config?.statusLabels && this.config.statusLabels[status]) {
      return this.config.statusLabels[status];
    }

    // Default mapping to GitHub issue state
    switch (status) {
      case 'done':
        return 'closed';
      case 'backlog':
      case 'ready':
      case 'in-progress':
      case 'blocked':
      default:
        return 'open';
    }
  }

  /**
   * Map external GitHub status to internal story status.
   *
   * If status labels are configured, tries to match label to status.
   * Otherwise uses issue state:
   * - open → ready
   * - closed → done
   */
  mapStatusFromExternal(externalStatus: string): StoryStatus {
    // Check for custom label mapping (reverse lookup)
    if (this.config?.statusLabels) {
      for (const [status, label] of Object.entries(this.config.statusLabels)) {
        if (label === externalStatus) {
          return status as StoryStatus;
        }
      }
    }

    // Default mapping from GitHub issue state
    const statusLower = externalStatus.toLowerCase();
    switch (statusLower) {
      case 'closed':
        return 'done';
      case 'open':
      default:
        return 'ready';
    }
  }
}
