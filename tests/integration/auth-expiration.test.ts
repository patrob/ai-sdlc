import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runAgentQuery, AuthenticationError } from '../../src/core/client.js';
import { homedir } from 'os';
import path from 'path';

// Mock dependencies
vi.mock('os');
vi.mock('fs');
vi.mock('@anthropic-ai/claude-agent-sdk');
vi.mock('../../src/core/config.js');

describe('Auth Expiration Integration Tests', () => {
  let mockFs: any;
  let mockSdk: any;
  let mockConfig: any;

  beforeEach(async () => {
    // Import mocked modules
    mockFs = await import('fs');
    mockSdk = await import('@anthropic-ai/claude-agent-sdk');
    mockConfig = await import('../../src/core/config.js');

    // Reset all mocks
    vi.resetAllMocks();

    // Clear environment variables
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.CLAUDE_CODE_OAUTH_TOKEN;

    // Mock homedir
    vi.mocked(homedir).mockReturnValue('/home/testuser');

    // Mock config loading
    vi.mocked(mockConfig.loadConfig).mockReturnValue({
      settingSources: ['project'],
      timeouts: { agentTimeout: 600000 },
    } as any);

    // Mock Agent SDK query to prevent actual API calls
    vi.mocked(mockSdk.query).mockReturnValue((async function* () {
      yield {
        type: 'system',
        subtype: 'init',
        session_id: 'test-session',
      };
      yield {
        type: 'assistant',
        content: 'Test response',
      };
      yield {
        type: 'system',
        subtype: 'completion',
      };
    })());

    // Use fake timers for date mocking
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  describe('Expired token handling', () => {
    it('should throw AuthenticationError when token is expired', async () => {
      vi.setSystemTime(new Date('2026-01-15T12:00:00Z'));

      // Mock credential file with expired token
      vi.mocked(mockFs.readFileSync).mockReturnValue(JSON.stringify({
        accessToken: 'sk-ant-oat-expired-token',
        expiresAt: '2026-01-15T11:00:00Z', // Expired 1 hour ago
      }));

      // Mock statSync for permission check
      vi.mocked(mockFs.statSync).mockReturnValue({
        mode: parseInt('100600', 8),
      } as any);

      // Attempt to run query
      await expect(
        runAgentQuery({
          prompt: 'test query',
          workingDirectory: process.cwd(),
        })
      ).rejects.toThrow(AuthenticationError);

      await expect(
        runAgentQuery({
          prompt: 'test query',
          workingDirectory: process.cwd(),
        })
      ).rejects.toThrow(/has expired/);

      await expect(
        runAgentQuery({
          prompt: 'test query',
          workingDirectory: process.cwd(),
        })
      ).rejects.toThrow(/claude login/);
    });

    it('should include credential source path in error message', async () => {
      vi.setSystemTime(new Date('2026-01-15T12:00:00Z'));

      vi.mocked(mockFs.readFileSync).mockReturnValue(JSON.stringify({
        accessToken: 'sk-ant-oat-expired-token',
        expiresAt: '2026-01-15T11:00:00Z',
      }));

      vi.mocked(mockFs.statSync).mockReturnValue({
        mode: parseInt('100600', 8),
      } as any);

      await expect(
        runAgentQuery({
          prompt: 'test query',
          workingDirectory: process.cwd(),
        })
      ).rejects.toThrow(/\.credentials\.json/);
    });

    it('should not throw error for API keys (only OAuth tokens checked)', async () => {
      // Set API key in environment
      process.env.ANTHROPIC_API_KEY = 'sk-ant-api-test-key';

      // Should proceed without checking expiration
      const result = await runAgentQuery({
        prompt: 'test query',
        workingDirectory: process.cwd(),
      });

      expect(result).toBe('Test response');
      expect(mockSdk.query).toHaveBeenCalled();
    });
  });

  describe('Expiring-soon token warning', () => {
    it('should show warning when token expires within 5 minutes', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.setSystemTime(new Date('2026-01-15T12:00:00Z'));

      // Token expires in 3 minutes
      vi.mocked(mockFs.readFileSync).mockReturnValue(JSON.stringify({
        accessToken: 'sk-ant-oat-expiring-soon-token',
        expiresAt: '2026-01-15T12:03:00Z',
      }));

      vi.mocked(mockFs.statSync).mockReturnValue({
        mode: parseInt('100600', 8),
      } as any);

      // Should proceed with warning
      const result = await runAgentQuery({
        prompt: 'test query',
        workingDirectory: process.cwd(),
      });

      expect(result).toBe('Test response');
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('⚠️')
      );
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('expires in less than 5 minutes')
      );
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('claude login')
      );
      expect(mockSdk.query).toHaveBeenCalled();
    });

    it('should not show warning when token has sufficient time remaining', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.setSystemTime(new Date('2026-01-15T12:00:00Z'));

      // Token expires in 10 minutes
      vi.mocked(mockFs.readFileSync).mockReturnValue(JSON.stringify({
        accessToken: 'sk-ant-oat-valid-token',
        expiresAt: '2026-01-15T12:10:00Z',
      }));

      vi.mocked(mockFs.statSync).mockReturnValue({
        mode: parseInt('100600', 8),
      } as any);

      // Should proceed without warning
      const result = await runAgentQuery({
        prompt: 'test query',
        workingDirectory: process.cwd(),
      });

      expect(result).toBe('Test response');
      expect(warnSpy).not.toHaveBeenCalled();
      expect(mockSdk.query).toHaveBeenCalled();
    });
  });

  describe('Edge cases', () => {
    it('should handle missing expiresAt field gracefully', async () => {
      vi.mocked(mockFs.readFileSync).mockReturnValue(JSON.stringify({
        accessToken: 'sk-ant-oat-token-no-expiry',
        // no expiresAt field
      }));

      vi.mocked(mockFs.statSync).mockReturnValue({
        mode: parseInt('100600', 8),
      } as any);

      // Should proceed without error or warning
      const result = await runAgentQuery({
        prompt: 'test query',
        workingDirectory: process.cwd(),
      });

      expect(result).toBe('Test response');
      expect(mockSdk.query).toHaveBeenCalled();
    });

    it('should handle malformed expiresAt date gracefully', async () => {
      const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

      vi.mocked(mockFs.readFileSync).mockReturnValue(JSON.stringify({
        accessToken: 'sk-ant-oat-token-invalid-date',
        expiresAt: 'not-a-valid-date',
      }));

      vi.mocked(mockFs.statSync).mockReturnValue({
        mode: parseInt('100600', 8),
      } as any);

      // Should proceed without throwing (skip expiration check)
      const result = await runAgentQuery({
        prompt: 'test query',
        workingDirectory: process.cwd(),
      });

      expect(result).toBe('Test response');
      expect(mockSdk.query).toHaveBeenCalled();
    });

    it('should handle credentials file not found', async () => {
      const enoentError = new Error('ENOENT') as NodeJS.ErrnoException;
      enoentError.code = 'ENOENT';
      vi.mocked(mockFs.readFileSync).mockImplementation(() => { throw enoentError; });

      // Should throw authentication error (no credentials found)
      await expect(
        runAgentQuery({
          prompt: 'test query',
          workingDirectory: process.cwd(),
        })
      ).rejects.toThrow(/No API key or OAuth token found/);
    });

    it('should handle tokens expiring within clock skew buffer', async () => {
      vi.setSystemTime(new Date('2026-01-15T12:00:00Z'));

      // Token expires in 15 seconds (within 30-second clock skew buffer)
      vi.mocked(mockFs.readFileSync).mockReturnValue(JSON.stringify({
        accessToken: 'sk-ant-oat-token',
        expiresAt: '2026-01-15T12:00:15Z',
      }));

      vi.mocked(mockFs.statSync).mockReturnValue({
        mode: parseInt('100600', 8),
      } as any);

      // Should be treated as expired due to clock skew buffer
      await expect(
        runAgentQuery({
          prompt: 'test query',
          workingDirectory: process.cwd(),
        })
      ).rejects.toThrow(AuthenticationError);
    });
  });

  describe('OAuth token environment variable', () => {
    it('should still check expiration from credential file when CLAUDE_CODE_OAUTH_TOKEN is set', async () => {
      vi.setSystemTime(new Date('2026-01-15T12:00:00Z'));

      // Set OAuth token in env var (takes precedence for authentication)
      process.env.CLAUDE_CODE_OAUTH_TOKEN = 'sk-ant-oat-env-token';

      // Mock credential file with expired token
      // Note: Expiration is always checked from credential file, even when env var is used
      vi.mocked(mockFs.readFileSync).mockReturnValue(JSON.stringify({
        accessToken: 'sk-ant-oat-file-token',
        expiresAt: '2026-01-15T11:00:00Z', // Expired
      }));

      vi.mocked(mockFs.statSync).mockReturnValue({
        mode: parseInt('100600', 8),
      } as any);

      // Should fail because expiration is checked from credential file regardless of env var
      await expect(
        runAgentQuery({
          prompt: 'test query',
          workingDirectory: process.cwd(),
        })
      ).rejects.toThrow(AuthenticationError);
    });
  });
});
