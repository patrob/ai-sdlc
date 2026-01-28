import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GitHubTicketProvider } from '../github-provider.js';
import { Config } from '../../../types/index.js';
import * as githubProjects from '../../github-projects/index.js';

// Mock github-projects module
vi.mock('../../github-projects/index.js', () => ({
  getIssuePriorityFromProject: vi.fn(),
}));

// Mock child_process for gh CLI calls
vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

describe('GitHubTicketProvider', () => {
  const baseConfig: Config = {
    sdlcRoot: '/test/.ai-sdlc',
    projectRoot: '/test',
    refinement: {
      maxIterations: 3,
      iterationTimeoutMs: 300000,
    },
    stageGates: {
      requireReviewApproval: true,
      blockOnFailedTests: true,
      requireTestsPass: true,
    },
    ticketing: {
      provider: 'github',
      syncOnRun: true,
      postProgressComments: true,
      github: {
        repo: 'test-org/test-repo',
        projectNumber: 5,
        priorityField: 'Priority',
        priorityMapping: {
          P0: 10,
          P1: 20,
          P2: 30,
        },
        statusLabels: {
          ready: 'status:ready',
          'in-progress': 'status:in-progress',
          done: 'status:done',
        },
      },
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should parse repo from config', () => {
      const provider = new GitHubTicketProvider(baseConfig);
      expect(provider.name).toBe('github');
    });

    it('should parse repo from HTTPS URL', () => {
      const config = {
        ...baseConfig,
        ticketing: {
          ...baseConfig.ticketing,
          github: {
            ...baseConfig.ticketing!.github,
            repo: 'https://github.com/test-org/test-repo',
          },
        },
      };

      const provider = new GitHubTicketProvider(config);
      expect(provider.name).toBe('github');
    });

    it('should parse repo from SSH URL', () => {
      const config = {
        ...baseConfig,
        ticketing: {
          ...baseConfig.ticketing,
          github: {
            ...baseConfig.ticketing!.github,
            repo: 'git@github.com:test-org/test-repo.git',
          },
        },
      };

      const provider = new GitHubTicketProvider(config);
      expect(provider.name).toBe('github');
    });
  });

  describe('syncPriority', () => {
    it('should return null when projectNumber not configured', async () => {
      const config = {
        ...baseConfig,
        ticketing: {
          ...baseConfig.ticketing,
          github: {
            repo: 'test-org/test-repo',
          },
        },
      };

      const provider = new GitHubTicketProvider(config);
      const priority = await provider.syncPriority('123');

      expect(priority).toBeNull();
    });

    it('should sync priority from GitHub Projects', async () => {
      vi.mocked(githubProjects.getIssuePriorityFromProject).mockResolvedValue(10);

      const provider = new GitHubTicketProvider(baseConfig);
      const priority = await provider.syncPriority('123');

      expect(priority).toBe(10);
      expect(githubProjects.getIssuePriorityFromProject).toHaveBeenCalledWith(
        expect.objectContaining({
          owner: 'test-org',
          repo: 'test-repo',
          projectNumber: 5,
          priorityField: 'Priority',
          priorityMapping: {
            P0: 10,
            P1: 20,
            P2: 30,
          },
        }),
        123
      );
    });

    it('should handle issue IDs with hash prefix', async () => {
      vi.mocked(githubProjects.getIssuePriorityFromProject).mockResolvedValue(20);

      const provider = new GitHubTicketProvider(baseConfig);
      const priority = await provider.syncPriority('#456');

      expect(priority).toBe(20);
      expect(githubProjects.getIssuePriorityFromProject).toHaveBeenCalledWith(
        expect.anything(),
        456
      );
    });

    it('should handle issue URLs', async () => {
      vi.mocked(githubProjects.getIssuePriorityFromProject).mockResolvedValue(30);

      const provider = new GitHubTicketProvider(baseConfig);
      const priority = await provider.syncPriority('https://github.com/test-org/test-repo/issues/789');

      expect(priority).toBe(30);
      expect(githubProjects.getIssuePriorityFromProject).toHaveBeenCalledWith(
        expect.anything(),
        789
      );
    });

    it('should return null when issue not in project', async () => {
      vi.mocked(githubProjects.getIssuePriorityFromProject).mockResolvedValue(null);

      const provider = new GitHubTicketProvider(baseConfig);
      const priority = await provider.syncPriority('999');

      expect(priority).toBeNull();
    });

    it('should return null on error (graceful fallback)', async () => {
      vi.mocked(githubProjects.getIssuePriorityFromProject).mockRejectedValue(
        new Error('API error')
      );

      const provider = new GitHubTicketProvider(baseConfig);
      const priority = await provider.syncPriority('123');

      expect(priority).toBeNull();
    });
  });

  describe('mapStatusToExternal', () => {
    it('should map status to GitHub label from config', () => {
      const provider = new GitHubTicketProvider(baseConfig);

      expect(provider.mapStatusToExternal('ready')).toBe('status:ready');
      expect(provider.mapStatusToExternal('in-progress')).toBe('status:in-progress');
      expect(provider.mapStatusToExternal('done')).toBe('status:done');
    });

    it('should return status unchanged when no mapping defined', () => {
      const config = {
        ...baseConfig,
        ticketing: {
          ...baseConfig.ticketing,
          github: {
            repo: 'test-org/test-repo',
          },
        },
      };

      const provider = new GitHubTicketProvider(config);
      expect(provider.mapStatusToExternal('ready')).toBe('ready');
    });
  });

  describe('mapStatusFromExternal', () => {
    it('should reverse map GitHub label to status', () => {
      const provider = new GitHubTicketProvider(baseConfig);

      expect(provider.mapStatusFromExternal('status:ready')).toBe('ready');
      expect(provider.mapStatusFromExternal('status:in-progress')).toBe('in-progress');
      expect(provider.mapStatusFromExternal('status:done')).toBe('done');
    });

    it('should return label unchanged when no mapping found', () => {
      const provider = new GitHubTicketProvider(baseConfig);
      expect(provider.mapStatusFromExternal('unknown-label')).toBe('unknown-label');
    });
  });
});
