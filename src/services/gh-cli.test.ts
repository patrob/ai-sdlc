import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { spawnSync, SpawnSyncReturns } from 'child_process';
import {
  parseGitHubIssueUrl,
  isGhAvailable,
  isGhAuthenticated,
  ghIssueView,
  ghIssueList,
  ghIssueEdit,
  ghIssueClose,
  ghIssueReopen,
  ghIssueComment,
  ghIssueCreate,
  GhNotInstalledError,
  GhNotAuthenticatedError,
  GhIssueNotFoundError,
  GhNoAccessError,
} from './gh-cli.js';

vi.mock('child_process', () => ({
  spawnSync: vi.fn(),
}));

const mockSpawnSync = vi.mocked(spawnSync);

describe('gh-cli', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('parseGitHubIssueUrl', () => {
    it('should parse full GitHub issue URL', () => {
      const result = parseGitHubIssueUrl('https://github.com/owner/repo/issues/123');
      expect(result).toEqual({ owner: 'owner', repo: 'repo', number: 123 });
    });

    it('should parse URL with comment hash', () => {
      const result = parseGitHubIssueUrl('https://github.com/owner/repo/issues/123#issuecomment-456');
      expect(result).toEqual({ owner: 'owner', repo: 'repo', number: 123 });
    });

    it('should parse URL without https prefix', () => {
      const result = parseGitHubIssueUrl('github.com/owner/repo/issues/123');
      expect(result).toEqual({ owner: 'owner', repo: 'repo', number: 123 });
    });

    it('should parse short format owner/repo#123', () => {
      const result = parseGitHubIssueUrl('owner/repo#123');
      expect(result).toEqual({ owner: 'owner', repo: 'repo', number: 123 });
    });

    it('should return null for invalid URLs', () => {
      expect(parseGitHubIssueUrl('not-a-url')).toBeNull();
      expect(parseGitHubIssueUrl('https://gitlab.com/owner/repo/issues/123')).toBeNull();
      expect(parseGitHubIssueUrl('')).toBeNull();
    });
  });

  describe('isGhAvailable', () => {
    it('should return true when gh is installed and authenticated', async () => {
      mockSpawnSync
        .mockReturnValueOnce({ status: 0, stdout: 'gh version 2.0.0', stderr: '' } as SpawnSyncReturns<string>)
        .mockReturnValueOnce({ status: 0, stdout: '', stderr: '' } as SpawnSyncReturns<string>);

      const result = await isGhAvailable();
      expect(result).toBe(true);
    });

    it('should return false when gh is not installed', async () => {
      mockSpawnSync.mockReturnValueOnce({
        status: 1,
        error: { code: 'ENOENT' } as NodeJS.ErrnoException,
      } as SpawnSyncReturns<string>);

      const result = await isGhAvailable();
      expect(result).toBe(false);
    });

    it('should return false when gh is not authenticated', async () => {
      mockSpawnSync
        .mockReturnValueOnce({ status: 0, stdout: 'gh version 2.0.0', stderr: '' } as SpawnSyncReturns<string>)
        .mockReturnValueOnce({ status: 1, stderr: 'not logged in' } as SpawnSyncReturns<string>);

      const result = await isGhAvailable();
      expect(result).toBe(false);
    });
  });

  describe('isGhAuthenticated', () => {
    it('should return true when authenticated', async () => {
      mockSpawnSync.mockReturnValueOnce({ status: 0, stdout: '', stderr: '' } as SpawnSyncReturns<string>);

      const result = await isGhAuthenticated();
      expect(result).toBe(true);
    });

    it('should return false when not authenticated', async () => {
      mockSpawnSync.mockReturnValueOnce({ status: 1, stderr: 'not logged in' } as SpawnSyncReturns<string>);

      const result = await isGhAuthenticated();
      expect(result).toBe(false);
    });
  });

  describe('ghIssueView', () => {
    const mockIssue = {
      number: 123,
      title: 'Test Issue',
      body: 'Issue body',
      state: 'open',
      labels: [{ name: 'bug' }],
      assignees: [{ login: 'user1' }],
    };

    it('should return parsed issue', async () => {
      mockSpawnSync.mockReturnValueOnce({
        status: 0,
        stdout: JSON.stringify(mockIssue),
        stderr: '',
      } as SpawnSyncReturns<string>);

      const result = await ghIssueView('owner', 'repo', 123);
      expect(result).toEqual(mockIssue);
      expect(mockSpawnSync).toHaveBeenCalledWith(
        'gh',
        ['issue', 'view', '123', '-R', 'owner/repo', '--json', 'number,title,body,state,labels,assignees,projectItems'],
        expect.any(Object)
      );
    });

    it('should throw GhNotInstalledError when gh is not installed', async () => {
      mockSpawnSync.mockReturnValueOnce({
        status: 1,
        error: { code: 'ENOENT' } as NodeJS.ErrnoException,
      } as SpawnSyncReturns<string>);

      await expect(ghIssueView('owner', 'repo', 123)).rejects.toThrow(GhNotInstalledError);
    });

    it('should throw GhNotAuthenticatedError when not logged in', async () => {
      mockSpawnSync.mockReturnValueOnce({
        status: 1,
        stderr: 'not logged in to any GitHub hosts',
        stdout: '',
      } as SpawnSyncReturns<string>);

      await expect(ghIssueView('owner', 'repo', 123)).rejects.toThrow(GhNotAuthenticatedError);
    });

    it('should throw GhIssueNotFoundError when issue not found', async () => {
      mockSpawnSync.mockReturnValueOnce({
        status: 1,
        stderr: 'could not resolve to an Issue',
        stdout: '',
      } as SpawnSyncReturns<string>);

      await expect(ghIssueView('owner', 'repo', 999)).rejects.toThrow(GhIssueNotFoundError);
    });

    it('should throw GhNoAccessError when access denied', async () => {
      mockSpawnSync.mockReturnValueOnce({
        status: 1,
        stderr: 'permission denied',
        stdout: '',
      } as SpawnSyncReturns<string>);

      await expect(ghIssueView('owner', 'repo', 123)).rejects.toThrow(GhNoAccessError);
    });
  });

  describe('ghIssueList', () => {
    const mockIssues = [
      { number: 1, title: 'Issue 1', body: '', state: 'open', labels: [], assignees: [] },
      { number: 2, title: 'Issue 2', body: '', state: 'open', labels: [], assignees: [] },
    ];

    it('should return list of issues', async () => {
      mockSpawnSync.mockReturnValueOnce({
        status: 0,
        stdout: JSON.stringify(mockIssues),
        stderr: '',
      } as SpawnSyncReturns<string>);

      const result = await ghIssueList('owner', 'repo');
      expect(result).toEqual(mockIssues);
    });

    it('should pass filter options to gh command', async () => {
      mockSpawnSync.mockReturnValueOnce({
        status: 0,
        stdout: '[]',
        stderr: '',
      } as SpawnSyncReturns<string>);

      await ghIssueList('owner', 'repo', {
        state: 'closed',
        labels: ['bug', 'urgent'],
        assignee: 'user1',
        limit: 10,
      });

      expect(mockSpawnSync).toHaveBeenCalledWith(
        'gh',
        [
          'issue', 'list', '-R', 'owner/repo',
          '--json', 'number,title,body,state,labels,assignees',
          '--state', 'closed',
          '--label', 'bug,urgent',
          '--assignee', 'user1',
          '--limit', '10',
        ],
        expect.any(Object)
      );
    });

    it('should throw GhNoAccessError when access denied', async () => {
      mockSpawnSync.mockReturnValueOnce({
        status: 1,
        stderr: '403 Forbidden',
        stdout: '',
      } as SpawnSyncReturns<string>);

      await expect(ghIssueList('owner', 'repo')).rejects.toThrow(GhNoAccessError);
    });
  });

  describe('ghIssueEdit', () => {
    it('should add and remove labels', async () => {
      mockSpawnSync.mockReturnValueOnce({
        status: 0,
        stdout: '',
        stderr: '',
      } as SpawnSyncReturns<string>);

      await ghIssueEdit('owner', 'repo', 123, {
        addLabels: ['status:in-progress'],
        removeLabels: ['status:ready'],
      });

      expect(mockSpawnSync).toHaveBeenCalledWith(
        'gh',
        [
          'issue', 'edit', '123', '-R', 'owner/repo',
          '--add-label', 'status:in-progress',
          '--remove-label', 'status:ready',
        ],
        expect.any(Object)
      );
    });

    it('should handle multiple labels', async () => {
      mockSpawnSync.mockReturnValueOnce({
        status: 0,
        stdout: '',
        stderr: '',
      } as SpawnSyncReturns<string>);

      await ghIssueEdit('owner', 'repo', 123, {
        addLabels: ['label1', 'label2'],
        removeLabels: ['old1', 'old2'],
      });

      expect(mockSpawnSync).toHaveBeenCalledWith(
        'gh',
        [
          'issue', 'edit', '123', '-R', 'owner/repo',
          '--add-label', 'label1',
          '--add-label', 'label2',
          '--remove-label', 'old1',
          '--remove-label', 'old2',
        ],
        expect.any(Object)
      );
    });

    it('should throw GhIssueNotFoundError when issue not found', async () => {
      mockSpawnSync.mockReturnValueOnce({
        status: 1,
        stderr: 'issue not found',
        stdout: '',
      } as SpawnSyncReturns<string>);

      await expect(ghIssueEdit('owner', 'repo', 999, { addLabels: ['test'] }))
        .rejects.toThrow(GhIssueNotFoundError);
    });
  });

  describe('ghIssueClose', () => {
    it('should close an issue', async () => {
      mockSpawnSync.mockReturnValueOnce({
        status: 0,
        stdout: '',
        stderr: '',
      } as SpawnSyncReturns<string>);

      await ghIssueClose('owner', 'repo', 123);

      expect(mockSpawnSync).toHaveBeenCalledWith(
        'gh',
        ['issue', 'close', '123', '-R', 'owner/repo'],
        expect.any(Object)
      );
    });

    it('should throw GhNotInstalledError when gh not installed', async () => {
      mockSpawnSync.mockReturnValueOnce({
        status: 1,
        error: { code: 'ENOENT' } as NodeJS.ErrnoException,
      } as SpawnSyncReturns<string>);

      await expect(ghIssueClose('owner', 'repo', 123)).rejects.toThrow(GhNotInstalledError);
    });
  });

  describe('ghIssueReopen', () => {
    it('should reopen a closed issue', async () => {
      mockSpawnSync.mockReturnValueOnce({
        status: 0,
        stdout: '',
        stderr: '',
      } as SpawnSyncReturns<string>);

      await ghIssueReopen('owner', 'repo', 123);

      expect(mockSpawnSync).toHaveBeenCalledWith(
        'gh',
        ['issue', 'reopen', '123', '-R', 'owner/repo'],
        expect.any(Object)
      );
    });

    it('should throw GhIssueNotFoundError when issue not found', async () => {
      mockSpawnSync.mockReturnValueOnce({
        status: 1,
        stderr: 'could not resolve to an Issue',
        stdout: '',
      } as SpawnSyncReturns<string>);

      await expect(ghIssueReopen('owner', 'repo', 999)).rejects.toThrow(GhIssueNotFoundError);
    });
  });

  describe('ghIssueComment', () => {
    it('should add a comment to an issue', async () => {
      mockSpawnSync.mockReturnValueOnce({
        status: 0,
        stdout: '',
        stderr: '',
      } as SpawnSyncReturns<string>);

      await ghIssueComment('owner', 'repo', 123, 'Test comment');

      expect(mockSpawnSync).toHaveBeenCalledWith(
        'gh',
        ['issue', 'comment', '123', '-R', 'owner/repo', '--body', 'Test comment'],
        expect.any(Object)
      );
    });

    it('should handle markdown in comment body', async () => {
      mockSpawnSync.mockReturnValueOnce({
        status: 0,
        stdout: '',
        stderr: '',
      } as SpawnSyncReturns<string>);

      const markdownBody = '## Status Update\n- [x] Done\n- [ ] Pending';
      await ghIssueComment('owner', 'repo', 123, markdownBody);

      expect(mockSpawnSync).toHaveBeenCalledWith(
        'gh',
        ['issue', 'comment', '123', '-R', 'owner/repo', '--body', markdownBody],
        expect.any(Object)
      );
    });

    it('should throw GhNoAccessError when permission denied', async () => {
      mockSpawnSync.mockReturnValueOnce({
        status: 1,
        stderr: '403 permission denied',
        stdout: '',
      } as SpawnSyncReturns<string>);

      await expect(ghIssueComment('owner', 'repo', 123, 'test'))
        .rejects.toThrow(GhNoAccessError);
    });
  });

  describe('ghIssueCreate', () => {
    const mockCreatedIssue = {
      number: 456,
      title: 'New Issue',
      body: 'Issue description',
      state: 'open',
      labels: [{ name: 'bug' }],
      assignees: [{ login: 'user1' }],
    };

    it('should create a new issue', async () => {
      mockSpawnSync.mockReturnValueOnce({
        status: 0,
        stdout: JSON.stringify(mockCreatedIssue),
        stderr: '',
      } as SpawnSyncReturns<string>);

      const result = await ghIssueCreate('owner', 'repo', {
        title: 'New Issue',
        body: 'Issue description',
        labels: ['bug'],
        assignee: 'user1',
      });

      expect(result).toEqual(mockCreatedIssue);
      expect(mockSpawnSync).toHaveBeenCalledWith(
        'gh',
        [
          'issue', 'create', '-R', 'owner/repo',
          '--title', 'New Issue',
          '--body', 'Issue description',
          '--label', 'bug',
          '--assignee', 'user1',
          '--json', 'number,title,body,state,labels,assignees',
        ],
        expect.any(Object)
      );
    });

    it('should create issue with minimal options', async () => {
      mockSpawnSync.mockReturnValueOnce({
        status: 0,
        stdout: JSON.stringify({ number: 1, title: 'Test', body: '', state: 'open', labels: [], assignees: [] }),
        stderr: '',
      } as SpawnSyncReturns<string>);

      await ghIssueCreate('owner', 'repo', { title: 'Test' });

      expect(mockSpawnSync).toHaveBeenCalledWith(
        'gh',
        [
          'issue', 'create', '-R', 'owner/repo',
          '--title', 'Test',
          '--json', 'number,title,body,state,labels,assignees',
        ],
        expect.any(Object)
      );
    });

    it('should throw GhNotAuthenticatedError when not logged in', async () => {
      mockSpawnSync.mockReturnValueOnce({
        status: 1,
        stderr: 'gh auth login required',
        stdout: '',
      } as SpawnSyncReturns<string>);

      await expect(ghIssueCreate('owner', 'repo', { title: 'Test' }))
        .rejects.toThrow(GhNotAuthenticatedError);
    });

    it('should throw GhNoAccessError when access denied', async () => {
      mockSpawnSync.mockReturnValueOnce({
        status: 1,
        stderr: '403 Forbidden',
        stdout: '',
      } as SpawnSyncReturns<string>);

      await expect(ghIssueCreate('owner', 'repo', { title: 'Test' }))
        .rejects.toThrow(GhNoAccessError);
    });
  });
});
