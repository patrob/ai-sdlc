import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createTicketProvider, NullTicketProvider, GitHubTicketProvider } from '../index.js';
import { Config } from '../../../types/index.js';
import { execSync } from 'child_process';

// Mock child_process to prevent actual git commands from running
vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

describe('createTicketProvider', () => {
  let consoleWarnSpy: any;

  beforeEach(() => {
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.clearAllMocks();
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
  });

  describe('when provider is "none"', () => {
    it('should return NullTicketProvider', () => {
      const config = {
        ticketing: { provider: 'none' as const },
      } as Config;

      const provider = createTicketProvider(config);

      expect(provider).toBeInstanceOf(NullTicketProvider);
      expect(provider.name).toBe('none');
    });
  });

  describe('when ticketing config is absent', () => {
    it('should return NullTicketProvider', () => {
      const config = {} as Config;

      const provider = createTicketProvider(config);

      expect(provider).toBeInstanceOf(NullTicketProvider);
      expect(provider.name).toBe('none');
    });
  });

  describe('when ticketing config is undefined', () => {
    it('should return NullTicketProvider', () => {
      const config = {
        ticketing: undefined,
      } as Config;

      const provider = createTicketProvider(config);

      expect(provider).toBeInstanceOf(NullTicketProvider);
      expect(provider.name).toBe('none');
    });
  });

  describe('when provider is "github"', () => {
    it('should return GitHubTicketProvider', () => {
      const config = {
        ticketing: {
          provider: 'github' as const,
          github: {
            repo: 'owner/repo',
          },
        },
      } as Config;

      const provider = createTicketProvider(config);

      expect(provider.name).toBe('github');
    });

    it('should throw error if repo cannot be determined', () => {
      const config = {
        ticketing: { provider: 'github' as const },
      } as Config;

      // Mock git command to throw error (no git remote configured)
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('fatal: No remote configured to list refs from');
      });

      // This will fail in the constructor when trying to get repo info
      expect(() => createTicketProvider(config)).toThrow('Could not determine GitHub repository');
    });
  });

  describe('when provider is "jira"', () => {
    it('should throw "not yet implemented" error', () => {
      const config = {
        ticketing: { provider: 'jira' as const },
      } as Config;

      expect(() => createTicketProvider(config)).toThrow('Jira provider not yet implemented');
    });
  });

  describe('when provider is unknown', () => {
    it('should return NullTicketProvider and log warning', () => {
      const config = {
        ticketing: { provider: 'unknown-provider' as any },
      } as Config;

      const provider = createTicketProvider(config);

      expect(provider).toBeInstanceOf(NullTicketProvider);
      expect(provider.name).toBe('none');
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Unknown ticket provider "unknown-provider", falling back to \'none\''
      );
    });

    it('should handle empty string provider', () => {
      const config = {
        ticketing: { provider: '' as any },
      } as Config;

      const provider = createTicketProvider(config);

      expect(provider).toBeInstanceOf(NullTicketProvider);
      expect(consoleWarnSpy).toHaveBeenCalled();
    });
  });
});
