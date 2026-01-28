import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'child_process';
import {
  parseGitHubIssueUrl,
  isGhAvailable,
  isGhAuthenticated,
  ghIssueView,
  ghIssueList,
  GhNotInstalledError,
  GhNotAuthenticatedError,
  GhIssueNotFoundError,
  GhNoAccessError,
  type GitHubIssue,
} from './gh-cli.js';

vi.mock('child_process');

describe('parseGitHubIssueUrl', () => {
  it('should parse full HTTPS URL', () => {
    const result = parseGitHubIssueUrl('https://github.com/owner/repo/issues/123');
    expect(result).toEqual({
      owner: 'owner',
      repo: 'repo',
      number: 123,
    });
  });

  it('should parse URL with comment anchor', () => {
    const result = parseGitHubIssueUrl('https://github.com/owner/repo/issues/123#issuecomment-456');
    expect(result).toEqual({
      owner: 'owner',
      repo: 'repo',
      number: 123,
    });
  });

  it('should parse URL without protocol', () => {
    const result = parseGitHubIssueUrl('github.com/owner/repo/issues/123');
    expect(result).toEqual({
      owner: 'owner',
      repo: 'repo',
      number: 123,
    });
  });

  it('should parse shorthand format', () => {
    const result = parseGitHubIssueUrl('owner/repo#123');
    expect(result).toEqual({
      owner: 'owner',
      repo: 'repo',
      number: 123,
    });
  });

  it('should return null for invalid URL', () => {
    expect(parseGitHubIssueUrl('invalid')).toBeNull();
    expect(parseGitHubIssueUrl('github.com/owner')).toBeNull();
    expect(parseGitHubIssueUrl('owner/repo')).toBeNull();
  });

  it('should handle URLs with www prefix', () => {
    const result = parseGitHubIssueUrl('https://www.github.com/owner/repo/issues/123');
    expect(result).toEqual({
      owner: 'owner',
      repo: 'repo',
      number: 123,
    });
  });
});

describe('isGhAvailable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return true when gh is installed and authenticated', async () => {
    vi.mocked(spawnSync).mockReturnValueOnce({
      status: 0,
      stdout: 'gh version 2.0.0',
      stderr: '',
      error: undefined,
    } as any);

    vi.mocked(spawnSync).mockReturnValueOnce({
      status: 0,
      stdout: 'Logged in to github.com',
      stderr: '',
      error: undefined,
    } as any);

    const result = await isGhAvailable();
    expect(result).toBe(true);
  });

  it('should return false when gh is not installed', async () => {
    vi.mocked(spawnSync).mockReturnValueOnce({
      status: 1,
      stdout: '',
      stderr: 'command not found',
      error: { code: 'ENOENT' } as any,
    } as any);

    const result = await isGhAvailable();
    expect(result).toBe(false);
  });

  it('should return false when gh is not authenticated', async () => {
    vi.mocked(spawnSync).mockReturnValueOnce({
      status: 0,
      stdout: 'gh version 2.0.0',
      stderr: '',
      error: undefined,
    } as any);

    vi.mocked(spawnSync).mockReturnValueOnce({
      status: 1,
      stdout: '',
      stderr: 'Not logged in',
      error: undefined,
    } as any);

    const result = await isGhAvailable();
    expect(result).toBe(false);
  });
});

describe('isGhAuthenticated', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return true when authenticated', async () => {
    vi.mocked(spawnSync).mockReturnValueOnce({
      status: 0,
      stdout: 'Logged in to github.com',
      stderr: '',
      error: undefined,
    } as any);

    const result = await isGhAuthenticated();
    expect(result).toBe(true);
  });

  it('should return false when not authenticated', async () => {
    vi.mocked(spawnSync).mockReturnValueOnce({
      status: 1,
      stdout: '',
      stderr: 'Not logged in',
      error: undefined,
    } as any);

    const result = await isGhAuthenticated();
    expect(result).toBe(false);
  });
});

describe('ghIssueView', () => {
  const mockIssue: GitHubIssue = {
    number: 123,
    title: 'Test Issue',
    body: 'Issue description',
    state: 'open',
    labels: [{ name: 'bug' }],
    assignees: [{ login: 'user1' }],
    projectItems: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch issue successfully', async () => {
    vi.mocked(spawnSync).mockReturnValueOnce({
      status: 0,
      stdout: JSON.stringify(mockIssue),
      stderr: '',
      error: undefined,
    } as any);

    const result = await ghIssueView('owner', 'repo', 123);
    expect(result).toEqual(mockIssue);
    expect(spawnSync).toHaveBeenCalledWith(
      'gh',
      [
        'issue',
        'view',
        '123',
        '-R',
        'owner/repo',
        '--json',
        'number,title,body,state,labels,assignees,projectItems',
      ],
      expect.objectContaining({
        encoding: 'utf-8',
        shell: false,
      })
    );
  });

  it('should throw GhNotInstalledError when gh is not installed', async () => {
    vi.mocked(spawnSync).mockReturnValueOnce({
      status: 1,
      stdout: '',
      stderr: '',
      error: { code: 'ENOENT' } as any,
    } as any);

    await expect(ghIssueView('owner', 'repo', 123)).rejects.toThrow(GhNotInstalledError);
  });

  it('should throw GhNotAuthenticatedError when not authenticated', async () => {
    vi.mocked(spawnSync).mockReturnValueOnce({
      status: 1,
      stdout: '',
      stderr: 'Not logged in to any GitHub hosts. Run gh auth login',
      error: undefined,
    } as any);

    await expect(ghIssueView('owner', 'repo', 123)).rejects.toThrow(GhNotAuthenticatedError);
  });

  it('should throw GhIssueNotFoundError when issue not found', async () => {
    vi.mocked(spawnSync).mockReturnValueOnce({
      status: 1,
      stdout: '',
      stderr: 'Issue not found',
      error: undefined,
    } as any);

    await expect(ghIssueView('owner', 'repo', 123)).rejects.toThrow(GhIssueNotFoundError);
  });

  it('should throw GhNoAccessError when access denied', async () => {
    vi.mocked(spawnSync).mockReturnValueOnce({
      status: 1,
      stdout: '',
      stderr: 'HTTP 403: Forbidden (permission denied)',
      error: undefined,
    } as any);

    await expect(ghIssueView('owner', 'repo', 123)).rejects.toThrow(GhNoAccessError);
  });

  it('should throw error when JSON parsing fails', async () => {
    vi.mocked(spawnSync).mockReturnValueOnce({
      status: 0,
      stdout: 'invalid json',
      stderr: '',
      error: undefined,
    } as any);

    await expect(ghIssueView('owner', 'repo', 123)).rejects.toThrow('Failed to parse gh CLI output');
  });
});

describe('ghIssueList', () => {
  const mockIssues: GitHubIssue[] = [
    {
      number: 123,
      title: 'Issue 1',
      body: 'Description 1',
      state: 'open',
      labels: [{ name: 'bug' }],
      assignees: [],
    },
    {
      number: 124,
      title: 'Issue 2',
      body: 'Description 2',
      state: 'open',
      labels: [{ name: 'enhancement' }],
      assignees: [{ login: 'user1' }],
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should list issues successfully', async () => {
    vi.mocked(spawnSync).mockReturnValueOnce({
      status: 0,
      stdout: JSON.stringify(mockIssues),
      stderr: '',
      error: undefined,
    } as any);

    const result = await ghIssueList('owner', 'repo');
    expect(result).toEqual(mockIssues);
    expect(spawnSync).toHaveBeenCalledWith(
      'gh',
      [
        'issue',
        'list',
        '-R',
        'owner/repo',
        '--json',
        'number,title,body,state,labels,assignees',
      ],
      expect.objectContaining({
        encoding: 'utf-8',
        shell: false,
      })
    );
  });

  it('should apply state filter', async () => {
    vi.mocked(spawnSync).mockReturnValueOnce({
      status: 0,
      stdout: JSON.stringify([]),
      stderr: '',
      error: undefined,
    } as any);

    await ghIssueList('owner', 'repo', { state: 'closed' });
    expect(spawnSync).toHaveBeenCalledWith(
      'gh',
      expect.arrayContaining(['--state', 'closed']),
      expect.any(Object)
    );
  });

  it('should apply label filter', async () => {
    vi.mocked(spawnSync).mockReturnValueOnce({
      status: 0,
      stdout: JSON.stringify([]),
      stderr: '',
      error: undefined,
    } as any);

    await ghIssueList('owner', 'repo', { labels: ['bug', 'urgent'] });
    expect(spawnSync).toHaveBeenCalledWith(
      'gh',
      expect.arrayContaining(['--label', 'bug,urgent']),
      expect.any(Object)
    );
  });

  it('should apply assignee filter', async () => {
    vi.mocked(spawnSync).mockReturnValueOnce({
      status: 0,
      stdout: JSON.stringify([]),
      stderr: '',
      error: undefined,
    } as any);

    await ghIssueList('owner', 'repo', { assignee: 'user1' });
    expect(spawnSync).toHaveBeenCalledWith(
      'gh',
      expect.arrayContaining(['--assignee', 'user1']),
      expect.any(Object)
    );
  });

  it('should apply limit filter', async () => {
    vi.mocked(spawnSync).mockReturnValueOnce({
      status: 0,
      stdout: JSON.stringify([]),
      stderr: '',
      error: undefined,
    } as any);

    await ghIssueList('owner', 'repo', { limit: 10 });
    expect(spawnSync).toHaveBeenCalledWith(
      'gh',
      expect.arrayContaining(['--limit', '10']),
      expect.any(Object)
    );
  });

  it('should throw GhNotInstalledError when gh is not installed', async () => {
    vi.mocked(spawnSync).mockReturnValueOnce({
      status: 1,
      stdout: '',
      stderr: '',
      error: { code: 'ENOENT' } as any,
    } as any);

    await expect(ghIssueList('owner', 'repo')).rejects.toThrow(GhNotInstalledError);
  });

  it('should throw GhNotAuthenticatedError when not authenticated', async () => {
    vi.mocked(spawnSync).mockReturnValueOnce({
      status: 1,
      stdout: '',
      stderr: 'authentication required',
      error: undefined,
    } as any);

    await expect(ghIssueList('owner', 'repo')).rejects.toThrow(GhNotAuthenticatedError);
  });

  it('should throw GhNoAccessError when access denied', async () => {
    vi.mocked(spawnSync).mockReturnValueOnce({
      status: 1,
      stdout: '',
      stderr: 'permission denied',
      error: undefined,
    } as any);

    await expect(ghIssueList('owner', 'repo')).rejects.toThrow(GhNoAccessError);
  });
});
