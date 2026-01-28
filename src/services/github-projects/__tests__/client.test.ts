import { describe, it, expect, vi, beforeEach } from 'vitest';
import { execSync } from 'child_process';
import { isGhAvailable, getProjectItems, getIssuePriorityFromProject } from '../client.js';
import type { GitHubProjectsConfig } from '../types.js';

// Mock child_process
vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

describe('github-projects/client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isGhAvailable', () => {
    it('should return true when gh CLI is available', () => {
      vi.mocked(execSync).mockReturnValue(Buffer.from('gh version 2.0.0'));
      expect(isGhAvailable()).toBe(true);
    });

    it('should return false when gh CLI is not available', () => {
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('Command not found');
      });
      expect(isGhAvailable()).toBe(false);
    });
  });

  describe('getProjectItems', () => {
    const config: GitHubProjectsConfig = {
      owner: 'test-org',
      repo: 'test-repo',
      projectNumber: 5,
      priorityField: 'Priority',
    };

    it('should fetch project items successfully', async () => {
      const mockResponse = {
        data: {
          org: {
            projectV2: {
              items: {
                nodes: [
                  {
                    content: { number: 123 },
                    priorityValue: { name: 'P0' },
                  },
                  {
                    content: { number: 456 },
                    priorityValue: { name: 'P1' },
                  },
                ],
              },
            },
          },
        },
      };

      vi.mocked(execSync).mockReturnValue(JSON.stringify(mockResponse));

      const items = await getProjectItems(config);

      expect(items).toHaveLength(2);
      expect(items[0]).toEqual({
        issueNumber: 123,
        position: 1,
        priorityValue: 'P0',
      });
      expect(items[1]).toEqual({
        issueNumber: 456,
        position: 2,
        priorityValue: 'P1',
      });
    });

    it('should handle user projects (fallback path)', async () => {
      const mockResponse = {
        data: {
          org: null,
          user: {
            projectV2: {
              items: {
                nodes: [
                  {
                    content: { number: 789 },
                    priorityValue: { name: 'P2' },
                  },
                ],
              },
            },
          },
        },
      };

      vi.mocked(execSync).mockReturnValue(JSON.stringify(mockResponse));

      const items = await getProjectItems(config);

      expect(items).toHaveLength(1);
      expect(items[0]).toEqual({
        issueNumber: 789,
        position: 1,
        priorityValue: 'P2',
      });
    });

    it('should throw error when gh CLI is not available', async () => {
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('Command not found');
      });

      await expect(getProjectItems(config)).rejects.toThrow('gh CLI is not available');
    });

    it('should throw error when project not found', async () => {
      const mockResponse = {
        data: {
          org: null,
          user: null,
        },
      };

      vi.mocked(execSync).mockReturnValue(JSON.stringify(mockResponse));

      await expect(getProjectItems(config)).rejects.toThrow(
        'Project #5 not found for owner "test-org"'
      );
    });

    it('should skip non-issue items', async () => {
      const mockResponse = {
        data: {
          org: {
            projectV2: {
              items: {
                nodes: [
                  { content: { number: 123 } },
                  { content: null }, // Draft issue or non-issue
                  { content: { number: 456 } },
                ],
              },
            },
          },
        },
      };

      vi.mocked(execSync).mockReturnValue(JSON.stringify(mockResponse));

      const items = await getProjectItems(config);

      expect(items).toHaveLength(2);
      expect(items[0].issueNumber).toBe(123);
      expect(items[1].issueNumber).toBe(456);
    });

    it('should handle text field priority values', async () => {
      const mockResponse = {
        data: {
          org: {
            projectV2: {
              items: {
                nodes: [
                  {
                    content: { number: 123 },
                    priorityValue: { text: 'High' },
                  },
                ],
              },
            },
          },
        },
      };

      vi.mocked(execSync).mockReturnValue(JSON.stringify(mockResponse));

      const items = await getProjectItems(config);

      expect(items[0].priorityValue).toBe('High');
    });

    it('should handle number field priority values', async () => {
      const mockResponse = {
        data: {
          org: {
            projectV2: {
              items: {
                nodes: [
                  {
                    content: { number: 123 },
                    priorityValue: { number: 1 },
                  },
                ],
              },
            },
          },
        },
      };

      vi.mocked(execSync).mockReturnValue(JSON.stringify(mockResponse));

      const items = await getProjectItems(config);

      expect(items[0].priorityValue).toBe('1');
    });
  });

  describe('getIssuePriorityFromProject', () => {
    const config: GitHubProjectsConfig = {
      owner: 'test-org',
      repo: 'test-repo',
      projectNumber: 5,
      priorityField: 'Priority',
      priorityMapping: {
        P0: 10,
        P1: 20,
        P2: 30,
      },
    };

    it('should return priority for issue in project with mapped field', async () => {
      const mockResponse = {
        data: {
          org: {
            projectV2: {
              items: {
                nodes: [
                  { content: { number: 123 }, priorityValue: { name: 'P0' } },
                  { content: { number: 456 }, priorityValue: { name: 'P1' } },
                ],
              },
            },
          },
        },
      };

      vi.mocked(execSync).mockReturnValue(JSON.stringify(mockResponse));

      const priority = await getIssuePriorityFromProject(config, 123);
      expect(priority).toBe(10);
    });

    it('should return position-based priority when field value not in mapping', async () => {
      const mockResponse = {
        data: {
          org: {
            projectV2: {
              items: {
                nodes: [
                  { content: { number: 123 }, priorityValue: { name: 'Unknown' } },
                ],
              },
            },
          },
        },
      };

      vi.mocked(execSync).mockReturnValue(JSON.stringify(mockResponse));

      const priority = await getIssuePriorityFromProject(config, 123);
      expect(priority).toBe(10); // Position 1 * 10
    });

    it('should return position-based priority when no priority field configured', async () => {
      const configNoField: GitHubProjectsConfig = {
        owner: 'test-org',
        repo: 'test-repo',
        projectNumber: 5,
      };

      const mockResponse = {
        data: {
          org: {
            projectV2: {
              items: {
                nodes: [
                  { content: { number: 123 } },
                  { content: { number: 456 } },
                ],
              },
            },
          },
        },
      };

      vi.mocked(execSync).mockReturnValue(JSON.stringify(mockResponse));

      const priority = await getIssuePriorityFromProject(configNoField, 456);
      expect(priority).toBe(20); // Position 2 * 10
    });

    it('should return null when issue not in project', async () => {
      const mockResponse = {
        data: {
          org: {
            projectV2: {
              items: {
                nodes: [
                  { content: { number: 123 } },
                ],
              },
            },
          },
        },
      };

      vi.mocked(execSync).mockReturnValue(JSON.stringify(mockResponse));

      const priority = await getIssuePriorityFromProject(config, 999);
      expect(priority).toBeNull();
    });
  });
});
