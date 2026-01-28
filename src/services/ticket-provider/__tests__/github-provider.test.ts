import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GitHubTicketProvider, GitHubConfig } from '../github-provider.js';

// Mock the gh-cli module
vi.mock('../../gh-cli.js', () => ({
  ghIssueView: vi.fn(),
  ghIssueList: vi.fn(),
  ghIssueEdit: vi.fn(),
  ghIssueClose: vi.fn(),
  ghIssueReopen: vi.fn(),
  ghIssueComment: vi.fn(),
  ghIssueCreate: vi.fn(),
}));

import {
  ghIssueView,
  ghIssueList,
  ghIssueEdit,
  ghIssueClose,
  ghIssueReopen,
  ghIssueComment,
  ghIssueCreate,
} from '../../gh-cli.js';

const mockGhIssueView = vi.mocked(ghIssueView);
const mockGhIssueList = vi.mocked(ghIssueList);
const mockGhIssueEdit = vi.mocked(ghIssueEdit);
const mockGhIssueClose = vi.mocked(ghIssueClose);
const mockGhIssueReopen = vi.mocked(ghIssueReopen);
const mockGhIssueComment = vi.mocked(ghIssueComment);
const mockGhIssueCreate = vi.mocked(ghIssueCreate);

describe('GitHubTicketProvider', () => {
  const defaultConfig: GitHubConfig = {
    repo: 'owner/repo',
  };

  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('name property', () => {
    it('should return "github"', () => {
      const provider = new GitHubTicketProvider(defaultConfig);
      expect(provider.name).toBe('github');
    });
  });

  describe('constructor', () => {
    it('should accept config with repo', () => {
      const provider = new GitHubTicketProvider({ repo: 'test/repo' });
      expect(provider.name).toBe('github');
    });

    it('should accept config with statusLabels', () => {
      const config: GitHubConfig = {
        repo: 'test/repo',
        statusLabels: {
          'ready': 'status:ready',
          'in-progress': 'status:wip',
          'done': 'status:done',
        },
      };
      const provider = new GitHubTicketProvider(config);
      expect(provider.name).toBe('github');
    });
  });

  describe('get()', () => {
    it('should return ticket from GitHub issue', async () => {
      const mockIssue = {
        number: 123,
        title: 'Test Issue',
        body: 'Issue body',
        state: 'open' as const,
        labels: [{ name: 'bug' }, { name: 'priority:high' }],
        assignees: [{ login: 'user1' }],
      };
      mockGhIssueView.mockResolvedValueOnce(mockIssue);

      const provider = new GitHubTicketProvider(defaultConfig);
      const ticket = await provider.get('123');

      expect(ticket).toEqual({
        id: '123',
        url: 'https://github.com/owner/repo/issues/123',
        title: 'Test Issue',
        description: 'Issue body',
        status: 'open',
        priority: 3,
        labels: ['bug', 'priority:high'],
        assignee: 'user1',
      });
      expect(mockGhIssueView).toHaveBeenCalledWith('owner', 'repo', 123);
    });

    it('should throw error for invalid issue number', async () => {
      const provider = new GitHubTicketProvider(defaultConfig);
      await expect(provider.get('invalid')).rejects.toThrow('Invalid GitHub issue number');
    });

    it('should throw error when repo is not configured', async () => {
      const provider = new GitHubTicketProvider({});
      await expect(provider.get('123')).rejects.toThrow('GitHub repository not configured');
    });
  });

  describe('list()', () => {
    it('should return list of tickets', async () => {
      const mockIssues = [
        { number: 1, title: 'Issue 1', body: '', state: 'open' as const, labels: [], assignees: [] },
        { number: 2, title: 'Issue 2', body: '', state: 'open' as const, labels: [], assignees: [] },
      ];
      mockGhIssueList.mockResolvedValueOnce(mockIssues);

      const provider = new GitHubTicketProvider(defaultConfig);
      const tickets = await provider.list();

      expect(tickets).toHaveLength(2);
      expect(tickets[0].id).toBe('1');
      expect(tickets[1].id).toBe('2');
    });

    it('should map status filter to GitHub state', async () => {
      mockGhIssueList.mockResolvedValueOnce([]);

      const provider = new GitHubTicketProvider(defaultConfig);
      await provider.list({ status: ['done'] });

      expect(mockGhIssueList).toHaveBeenCalledWith(
        'owner',
        'repo',
        expect.objectContaining({ state: 'closed' })
      );
    });

    it('should use state=all when filtering for both open and closed', async () => {
      mockGhIssueList.mockResolvedValueOnce([]);

      const provider = new GitHubTicketProvider(defaultConfig);
      await provider.list({ status: ['ready', 'done'] });

      expect(mockGhIssueList).toHaveBeenCalledWith(
        'owner',
        'repo',
        expect.objectContaining({ state: 'all' })
      );
    });
  });

  describe('create()', () => {
    it('should create a new GitHub issue', async () => {
      const mockCreatedIssue = {
        number: 456,
        title: 'New Feature',
        body: 'Feature description',
        state: 'open' as const,
        labels: [{ name: 'enhancement' }],
        assignees: [{ login: 'dev1' }],
      };
      mockGhIssueCreate.mockResolvedValueOnce(mockCreatedIssue);

      const provider = new GitHubTicketProvider(defaultConfig);
      const ticket = await provider.create({
        title: 'New Feature',
        description: 'Feature description',
        labels: ['enhancement'],
        assignee: 'dev1',
      });

      expect(ticket.id).toBe('456');
      expect(ticket.title).toBe('New Feature');
      expect(mockGhIssueCreate).toHaveBeenCalledWith('owner', 'repo', {
        title: 'New Feature',
        body: 'Feature description',
        labels: ['enhancement'],
        assignee: 'dev1',
      });
    });
  });

  describe('updateStatus()', () => {
    it('should update status label on issue', async () => {
      const mockIssue = {
        number: 123,
        title: 'Test',
        body: '',
        state: 'open' as const,
        labels: [{ name: 'status:ready' }],
        assignees: [],
      };
      mockGhIssueView.mockResolvedValueOnce(mockIssue);

      const provider = new GitHubTicketProvider(defaultConfig);
      await provider.updateStatus('123', 'in-progress');

      expect(mockGhIssueEdit).toHaveBeenCalledWith('owner', 'repo', 123, {
        removeLabels: ['status:ready'],
        addLabels: ['status:in-progress'],
      });
    });

    it('should remove multiple status labels', async () => {
      const mockIssue = {
        number: 123,
        title: 'Test',
        body: '',
        state: 'open' as const,
        labels: [{ name: 'status:ready' }, { name: 'status:blocked' }],
        assignees: [],
      };
      mockGhIssueView.mockResolvedValueOnce(mockIssue);

      const provider = new GitHubTicketProvider(defaultConfig);
      await provider.updateStatus('123', 'in-progress');

      expect(mockGhIssueEdit).toHaveBeenCalledWith('owner', 'repo', 123, {
        removeLabels: ['status:ready', 'status:blocked'],
        addLabels: ['status:in-progress'],
      });
    });

    it('should close issue when status is done', async () => {
      const mockIssue = {
        number: 123,
        title: 'Test',
        body: '',
        state: 'open' as const,
        labels: [{ name: 'status:in-progress' }],
        assignees: [],
      };
      mockGhIssueView.mockResolvedValueOnce(mockIssue);

      const provider = new GitHubTicketProvider(defaultConfig);
      await provider.updateStatus('123', 'done');

      expect(mockGhIssueEdit).toHaveBeenCalled();
      expect(mockGhIssueClose).toHaveBeenCalledWith('owner', 'repo', 123);
    });

    it('should not close issue if already closed', async () => {
      const mockIssue = {
        number: 123,
        title: 'Test',
        body: '',
        state: 'closed' as const,
        labels: [],
        assignees: [],
      };
      mockGhIssueView.mockResolvedValueOnce(mockIssue);

      const provider = new GitHubTicketProvider(defaultConfig);
      await provider.updateStatus('123', 'done');

      expect(mockGhIssueClose).not.toHaveBeenCalled();
    });

    it('should reopen issue when moving from done to active status', async () => {
      const mockIssue = {
        number: 123,
        title: 'Test',
        body: '',
        state: 'closed' as const,
        labels: [{ name: 'status:done' }],
        assignees: [],
      };
      mockGhIssueView.mockResolvedValueOnce(mockIssue);

      const provider = new GitHubTicketProvider(defaultConfig);
      await provider.updateStatus('123', 'in-progress');

      expect(mockGhIssueReopen).toHaveBeenCalledWith('owner', 'repo', 123);
    });

    it('should use custom status labels from config', async () => {
      const config: GitHubConfig = {
        repo: 'owner/repo',
        statusLabels: {
          'ready': 'kanban:ready',
          'in-progress': 'kanban:wip',
          'done': 'kanban:done',
        },
      };
      const mockIssue = {
        number: 123,
        title: 'Test',
        body: '',
        state: 'open' as const,
        labels: [{ name: 'kanban:ready' }],
        assignees: [],
      };
      mockGhIssueView.mockResolvedValueOnce(mockIssue);

      const provider = new GitHubTicketProvider(config);
      await provider.updateStatus('123', 'in-progress');

      expect(mockGhIssueEdit).toHaveBeenCalledWith('owner', 'repo', 123, {
        removeLabels: ['kanban:ready'],
        addLabels: ['kanban:wip'],
      });
    });

    it('should throw error for invalid issue number', async () => {
      const provider = new GitHubTicketProvider(defaultConfig);
      await expect(provider.updateStatus('invalid', 'done')).rejects.toThrow('Invalid GitHub issue number');
    });
  });

  describe('addComment()', () => {
    it('should add comment to issue', async () => {
      const provider = new GitHubTicketProvider(defaultConfig);
      await provider.addComment('123', 'Test comment');

      expect(mockGhIssueComment).toHaveBeenCalledWith('owner', 'repo', 123, 'Test comment');
    });

    it('should handle markdown comments', async () => {
      const provider = new GitHubTicketProvider(defaultConfig);
      const markdownComment = '## Status Update\n- [x] Done';
      await provider.addComment('123', markdownComment);

      expect(mockGhIssueComment).toHaveBeenCalledWith('owner', 'repo', 123, markdownComment);
    });

    it('should throw error for invalid issue number', async () => {
      const provider = new GitHubTicketProvider(defaultConfig);
      await expect(provider.addComment('invalid', 'comment')).rejects.toThrow('Invalid GitHub issue number');
    });
  });

  describe('linkPR()', () => {
    it('should add PR link comment to issue', async () => {
      const provider = new GitHubTicketProvider(defaultConfig);
      await provider.linkPR('123', 'https://github.com/owner/repo/pull/456');

      expect(mockGhIssueComment).toHaveBeenCalledWith(
        'owner',
        'repo',
        123,
        '🔗 Pull request created: https://github.com/owner/repo/pull/456'
      );
    });

    it('should throw error for invalid issue number', async () => {
      const provider = new GitHubTicketProvider(defaultConfig);
      await expect(provider.linkPR('invalid', 'http://example.com')).rejects.toThrow('Invalid GitHub issue number');
    });
  });

  describe('mapStatusToExternal()', () => {
    it('should map story status to GitHub state without custom labels', () => {
      const provider = new GitHubTicketProvider(defaultConfig);

      expect(provider.mapStatusToExternal('done')).toBe('closed');
      expect(provider.mapStatusToExternal('backlog')).toBe('open');
      expect(provider.mapStatusToExternal('ready')).toBe('open');
      expect(provider.mapStatusToExternal('in-progress')).toBe('open');
      expect(provider.mapStatusToExternal('blocked')).toBe('open');
    });

    it('should use custom status labels when configured', () => {
      const config: GitHubConfig = {
        repo: 'owner/repo',
        statusLabels: {
          'ready': 'status:ready',
          'in-progress': 'status:wip',
          'done': 'status:done',
        },
      };
      const provider = new GitHubTicketProvider(config);

      expect(provider.mapStatusToExternal('ready')).toBe('status:ready');
      expect(provider.mapStatusToExternal('in-progress')).toBe('status:wip');
      expect(provider.mapStatusToExternal('done')).toBe('status:done');
    });
  });

  describe('mapStatusFromExternal()', () => {
    it('should map GitHub state to story status', () => {
      const provider = new GitHubTicketProvider(defaultConfig);

      expect(provider.mapStatusFromExternal('open')).toBe('ready');
      expect(provider.mapStatusFromExternal('closed')).toBe('done');
      expect(provider.mapStatusFromExternal('OPEN')).toBe('ready');
      expect(provider.mapStatusFromExternal('CLOSED')).toBe('done');
    });

    it('should reverse map custom status labels', () => {
      const config: GitHubConfig = {
        repo: 'owner/repo',
        statusLabels: {
          'backlog': 'status:backlog',
          'ready': 'status:ready',
          'in-progress': 'status:wip',
          'done': 'status:done',
        },
      };
      const provider = new GitHubTicketProvider(config);

      expect(provider.mapStatusFromExternal('status:backlog')).toBe('backlog');
      expect(provider.mapStatusFromExternal('status:ready')).toBe('ready');
      expect(provider.mapStatusFromExternal('status:wip')).toBe('in-progress');
      expect(provider.mapStatusFromExternal('status:done')).toBe('done');
    });

    it('should default to ready for unknown status', () => {
      const provider = new GitHubTicketProvider(defaultConfig);
      expect(provider.mapStatusFromExternal('unknown')).toBe('ready');
    });
  });
});
