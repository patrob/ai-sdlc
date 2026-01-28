import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GitHubTicketProvider } from '../github-provider.js';
import * as ghCli from '../../gh-cli.js';
import type { GitHubIssue } from '../../gh-cli.js';
import type { StoryStatus } from '../../../types/index.js';

vi.mock('../../gh-cli.js');

describe('GitHubTicketProvider', () => {
  const mockConfig = {
    repo: 'owner/repo',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor and config', () => {
    it('should create provider with config', () => {
      const provider = new GitHubTicketProvider(mockConfig);
      expect(provider.name).toBe('github');
    });

    it('should throw error when listing without repo config', async () => {
      const provider = new GitHubTicketProvider();
      await expect(provider.list()).rejects.toThrow('GitHub repository not configured');
    });

    it('should throw error with invalid repo format', async () => {
      const provider = new GitHubTicketProvider({ repo: 'invalid' });
      await expect(provider.list()).rejects.toThrow('Invalid GitHub repository format');
    });
  });

  describe('list', () => {
    const mockIssues: GitHubIssue[] = [
      {
        number: 123,
        title: 'Issue 1',
        body: 'Description 1',
        state: 'open',
        labels: [{ name: 'bug' }],
        assignees: [{ login: 'user1' }],
      },
      {
        number: 124,
        title: 'Issue 2',
        body: 'Description 2',
        state: 'closed',
        labels: [{ name: 'enhancement' }],
        assignees: [],
      },
    ];

    it('should list tickets successfully', async () => {
      vi.mocked(ghCli.ghIssueList).mockResolvedValueOnce(mockIssues);

      const provider = new GitHubTicketProvider(mockConfig);
      const tickets = await provider.list();

      expect(tickets).toHaveLength(2);
      expect(tickets[0]).toMatchObject({
        id: '123',
        title: 'Issue 1',
        description: 'Description 1',
        status: 'open',
        labels: ['bug'],
        assignee: 'user1',
        url: 'https://github.com/owner/repo/issues/123',
      });
      expect(tickets[1]).toMatchObject({
        id: '124',
        title: 'Issue 2',
        status: 'closed',
        url: 'https://github.com/owner/repo/issues/124',
      });
    });

    it('should filter by status', async () => {
      vi.mocked(ghCli.ghIssueList).mockResolvedValueOnce([]);

      const provider = new GitHubTicketProvider(mockConfig);
      await provider.list({ status: ['ready', 'in_progress'] });

      expect(ghCli.ghIssueList).toHaveBeenCalledWith(
        'owner',
        'repo',
        expect.objectContaining({ state: 'open' })
      );
    });

    it('should filter by labels', async () => {
      vi.mocked(ghCli.ghIssueList).mockResolvedValueOnce([]);

      const provider = new GitHubTicketProvider(mockConfig);
      await provider.list({ labels: ['bug', 'urgent'] });

      expect(ghCli.ghIssueList).toHaveBeenCalledWith(
        'owner',
        'repo',
        expect.objectContaining({ labels: ['bug', 'urgent'] })
      );
    });

    it('should filter by assignee', async () => {
      vi.mocked(ghCli.ghIssueList).mockResolvedValueOnce([]);

      const provider = new GitHubTicketProvider(mockConfig);
      await provider.list({ assignee: 'user1' });

      expect(ghCli.ghIssueList).toHaveBeenCalledWith(
        'owner',
        'repo',
        expect.objectContaining({ assignee: 'user1' })
      );
    });

    it('should apply limit', async () => {
      vi.mocked(ghCli.ghIssueList).mockResolvedValueOnce([]);

      const provider = new GitHubTicketProvider(mockConfig);
      await provider.list({ limit: 10 });

      expect(ghCli.ghIssueList).toHaveBeenCalledWith(
        'owner',
        'repo',
        expect.objectContaining({ limit: 10 })
      );
    });

    it('should handle issues with no body', async () => {
      const issuesWithNoBody: GitHubIssue[] = [
        {
          number: 123,
          title: 'Issue without body',
          body: '',
          state: 'open',
          labels: [],
          assignees: [],
        },
      ];
      vi.mocked(ghCli.ghIssueList).mockResolvedValueOnce(issuesWithNoBody);

      const provider = new GitHubTicketProvider(mockConfig);
      const tickets = await provider.list();

      expect(tickets[0].description).toBe('');
    });
  });

  describe('get', () => {
    const mockIssue: GitHubIssue = {
      number: 123,
      title: 'Test Issue',
      body: 'Issue description',
      state: 'open',
      labels: [{ name: 'bug' }, { name: 'urgent' }],
      assignees: [{ login: 'user1' }],
      projectItems: [
        {
          project: { title: 'Sprint 1' },
          status: { name: 'In Progress' },
          fieldValueByName: [
            {
              name: '1',
              field: { name: 'Priority' },
            },
          ],
        },
      ],
    };

    it('should get ticket by id', async () => {
      vi.mocked(ghCli.ghIssueView).mockResolvedValueOnce(mockIssue);

      const provider = new GitHubTicketProvider(mockConfig);
      const ticket = await provider.get('123');

      expect(ticket).toMatchObject({
        id: '123',
        title: 'Test Issue',
        description: 'Issue description',
        status: 'open',
        labels: ['bug', 'urgent'],
        assignee: 'user1',
        priority: 1,
        url: 'https://github.com/owner/repo/issues/123',
      });
      expect(ghCli.ghIssueView).toHaveBeenCalledWith('owner', 'repo', 123);
    });

    it('should throw error for invalid issue number', async () => {
      const provider = new GitHubTicketProvider(mockConfig);
      await expect(provider.get('invalid')).rejects.toThrow('Invalid GitHub issue number');
    });

    it('should use default priority when no project items', async () => {
      const issueWithoutProject: GitHubIssue = {
        ...mockIssue,
        projectItems: undefined,
      };
      vi.mocked(ghCli.ghIssueView).mockResolvedValueOnce(issueWithoutProject);

      const provider = new GitHubTicketProvider(mockConfig);
      const ticket = await provider.get('123');

      expect(ticket.priority).toBe(3);
    });
  });

  describe('create', () => {
    it('should throw error - not yet implemented', async () => {
      const provider = new GitHubTicketProvider(mockConfig);
      await expect(provider.create({ title: 'Test', description: 'Test' })).rejects.toThrow(
        'not yet implemented'
      );
    });
  });

  describe('write operations', () => {
    it('should be no-ops for updateStatus', async () => {
      const provider = new GitHubTicketProvider(mockConfig);
      await expect(provider.updateStatus('123', 'done')).resolves.not.toThrow();
    });

    it('should be no-ops for addComment', async () => {
      const provider = new GitHubTicketProvider(mockConfig);
      await expect(provider.addComment('123', 'comment')).resolves.not.toThrow();
    });

    it('should be no-ops for linkPR', async () => {
      const provider = new GitHubTicketProvider(mockConfig);
      await expect(provider.linkPR('123', 'https://github.com/owner/repo/pull/1')).resolves.not.toThrow();
    });
  });

  describe('status mapping', () => {
    it('should map internal status to external (default)', () => {
      const provider = new GitHubTicketProvider(mockConfig);

      expect(provider.mapStatusToExternal('backlog')).toBe('open');
      expect(provider.mapStatusToExternal('ready')).toBe('open');
      expect(provider.mapStatusToExternal('in_progress')).toBe('open');
      expect(provider.mapStatusToExternal('blocked')).toBe('open');
      expect(provider.mapStatusToExternal('done')).toBe('closed');
    });

    it('should map internal status to external (with custom labels)', () => {
      const provider = new GitHubTicketProvider({
        repo: 'owner/repo',
        statusLabels: {
          backlog: 'status:backlog',
          ready: 'status:ready',
          in_progress: 'status:in-progress',
          blocked: 'status:blocked',
          done: 'status:done',
        },
      });

      expect(provider.mapStatusToExternal('backlog')).toBe('status:backlog');
      expect(provider.mapStatusToExternal('ready')).toBe('status:ready');
      expect(provider.mapStatusToExternal('in_progress')).toBe('status:in-progress');
      expect(provider.mapStatusToExternal('blocked')).toBe('status:blocked');
      expect(provider.mapStatusToExternal('done')).toBe('status:done');
    });

    it('should map external status to internal (default)', () => {
      const provider = new GitHubTicketProvider(mockConfig);

      expect(provider.mapStatusFromExternal('open')).toBe('ready');
      expect(provider.mapStatusFromExternal('closed')).toBe('done');
      expect(provider.mapStatusFromExternal('OPEN')).toBe('ready'); // case insensitive
      expect(provider.mapStatusFromExternal('CLOSED')).toBe('done');
    });

    it('should map external status to internal (with custom labels)', () => {
      const provider = new GitHubTicketProvider({
        repo: 'owner/repo',
        statusLabels: {
          backlog: 'status:backlog',
          ready: 'status:ready',
          in_progress: 'status:in-progress',
          done: 'status:done',
        },
      });

      expect(provider.mapStatusFromExternal('status:backlog')).toBe('backlog');
      expect(provider.mapStatusFromExternal('status:ready')).toBe('ready');
      expect(provider.mapStatusFromExternal('status:in-progress')).toBe('in_progress');
      expect(provider.mapStatusFromExternal('status:done')).toBe('done');
    });
  });
});
