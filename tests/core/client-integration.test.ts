import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { runAgentQuery } from '../../src/core/client.js';
import { saveConfig } from '../../src/core/config.js';
import type { Config } from '../../src/types/index.js';

// Mock the Agent SDK
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: vi.fn(),
}));

// Import after mock to get the mocked version
import { query } from '@anthropic-ai/claude-agent-sdk';

// Mock auth module
vi.mock('../../src/core/auth.js', () => ({
  configureAgentSdkAuth: vi.fn(() => ({ configured: true })),
  getApiKey: vi.fn(() => 'test-key'),
  getCredentialType: vi.fn(() => 'api_key'),
}));

describe('Agent SDK Integration Tests', () => {
  let tempDir: string;
  let originalCwd: string;
  let consoleDebugSpy: any;
  let consoleWarnSpy: any;

  beforeEach(() => {
    // Create temporary directory for testing
    // Use realpathSync to resolve symlinks (macOS /var -> /private/var)
    tempDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'agentic-sdlc-integration-test-')));
    originalCwd = process.cwd();
    process.chdir(tempDir);

    // Spy on console methods
    consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Set up test environment with API key
    process.env.ANTHROPIC_API_KEY = 'test-api-key';

    // Mock the query function to return a simple async generator
    vi.mocked(query).mockImplementation(async function* () {
      yield { type: 'assistant', content: 'Test response' };
      yield { type: 'result', subtype: 'success', result: 'Done' };
    });
  });

  afterEach(() => {
    // Clean up
    process.chdir(originalCwd);
    consoleDebugSpy.mockRestore();
    consoleWarnSpy.mockRestore();

    // Remove temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }

    // Clean up env
    delete process.env.ANTHROPIC_API_KEY;

    // Clear all mocks
    vi.clearAllMocks();
  });

  describe('runAgentQuery with settingSources', () => {
    it('should pass settingSources to SDK when configured', async () => {
      // Configure settingSources
      const config: Partial<Config> = {
        settingSources: ['project'],
      };
      saveConfig(config as Config, tempDir);

      // Run query
      await runAgentQuery({
        prompt: 'Test prompt',
        workingDirectory: tempDir,
      });

      // Verify SDK received correct settingSources
      expect(query).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({
            settingSources: ['project'],
          }),
        })
      );
    });

    it('should pass empty array to SDK when settingSources not configured', async () => {
      // Run query without configuring settingSources
      await runAgentQuery({
        prompt: 'Test prompt',
        workingDirectory: tempDir,
      });

      // Verify SDK received empty array (SDK isolation mode)
      expect(query).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({
            settingSources: [],
          }),
        })
      );
    });

    it('should pass multiple settingSources to SDK', async () => {
      // Configure multiple sources
      const config: Partial<Config> = {
        settingSources: ['user', 'project', 'local'],
      };
      saveConfig(config as Config, tempDir);

      // Run query
      await runAgentQuery({
        prompt: 'Test prompt',
        workingDirectory: tempDir,
      });

      // Verify SDK received all sources
      expect(query).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({
            settingSources: ['user', 'project', 'local'],
          }),
        })
      );
    });
  });

  describe('CLAUDE.md discovery logging', () => {
    beforeEach(() => {
      // Create .claude directory
      const claudeDir = path.join(tempDir, '.claude');
      fs.mkdirSync(claudeDir, { recursive: true });
    });

    it('should log debug message when CLAUDE.md exists with project settings', async () => {
      // Create CLAUDE.md
      const claudeMdPath = path.join(tempDir, '.claude', 'CLAUDE.md');
      fs.writeFileSync(claudeMdPath, 'You are a helpful assistant.');

      // Configure settingSources
      const config: Partial<Config> = {
        settingSources: ['project'],
      };
      saveConfig(config as Config, tempDir);

      // Run query
      await runAgentQuery({
        prompt: 'Test prompt',
        workingDirectory: tempDir,
      });

      // Verify debug message logged
      expect(consoleDebugSpy).toHaveBeenCalledWith('Debug: Found CLAUDE.md in project settings');
    });

    it('should log debug message when CLAUDE.md missing', async () => {
      // Don't create CLAUDE.md

      // Configure settingSources
      const config: Partial<Config> = {
        settingSources: ['project'],
      };
      saveConfig(config as Config, tempDir);

      // Run query
      await runAgentQuery({
        prompt: 'Test prompt',
        workingDirectory: tempDir,
      });

      // Verify debug message logged
      expect(consoleDebugSpy).toHaveBeenCalledWith('Debug: CLAUDE.md not found in project settings');
    });

    it('should not log about CLAUDE.md when project not in settingSources', async () => {
      // Create CLAUDE.md
      const claudeMdPath = path.join(tempDir, '.claude', 'CLAUDE.md');
      fs.writeFileSync(claudeMdPath, 'You are a helpful assistant.');

      // Configure settingSources without 'project'
      const config: Partial<Config> = {
        settingSources: ['user'],
      };
      saveConfig(config as Config, tempDir);

      // Run query
      await runAgentQuery({
        prompt: 'Test prompt',
        workingDirectory: tempDir,
      });

      // Verify no CLAUDE.md-related logs
      expect(consoleDebugSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('CLAUDE.md')
      );
    });

    it('should warn when CLAUDE.md file is very large', async () => {
      // Create large CLAUDE.md (>1MB)
      const claudeMdPath = path.join(tempDir, '.claude', 'CLAUDE.md');
      const largeContent = 'A'.repeat(1024 * 1024 + 1); // 1MB + 1 byte
      fs.writeFileSync(claudeMdPath, largeContent);

      // Configure settingSources
      const config: Partial<Config> = {
        settingSources: ['project'],
      };
      saveConfig(config as Config, tempDir);

      // Run query
      await runAgentQuery({
        prompt: 'Test prompt',
        workingDirectory: tempDir,
      });

      // Verify warning logged
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('CLAUDE.md is large')
      );
    });

    it('should reject CLAUDE.md that exceeds hard limit', async () => {
      // Create extremely large CLAUDE.md (>10MB)
      const claudeMdPath = path.join(tempDir, '.claude', 'CLAUDE.md');
      const hugeContent = 'A'.repeat(11 * 1024 * 1024); // 11MB
      fs.writeFileSync(claudeMdPath, hugeContent);

      // Configure settingSources
      const config: Partial<Config> = {
        settingSources: ['project'],
      };
      saveConfig(config as Config, tempDir);

      // Run query
      await runAgentQuery({
        prompt: 'Test prompt',
        workingDirectory: tempDir,
      });

      // Verify error logged
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('CLAUDE.md file is too large')
      );
    });
  });

  describe('explicit systemPrompt override', () => {
    it('should pass explicit systemPrompt to SDK', async () => {
      // Create CLAUDE.md
      const claudeDir = path.join(tempDir, '.claude');
      fs.mkdirSync(claudeDir, { recursive: true });
      const claudeMdPath = path.join(tempDir, '.claude', 'CLAUDE.md');
      fs.writeFileSync(claudeMdPath, 'Project instructions');

      // Configure settingSources
      const config: Partial<Config> = {
        settingSources: ['project'],
      };
      saveConfig(config as Config, tempDir);

      const explicitPrompt = 'Explicit system prompt';

      // Run query with explicit systemPrompt
      await runAgentQuery({
        prompt: 'Test prompt',
        systemPrompt: explicitPrompt,
        workingDirectory: tempDir,
      });

      // Verify SDK receives explicit systemPrompt
      expect(query).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({
            systemPrompt: explicitPrompt,
          }),
        })
      );
    });
  });

  describe('security validations', () => {
    it('should reject path traversal attempts', async () => {
      const maliciousPath = path.join(tempDir, '..', '..', '..', 'etc');

      // Expect error when trying to use path outside project
      await expect(
        runAgentQuery({
          prompt: 'Test prompt',
          workingDirectory: maliciousPath,
        })
      ).rejects.toThrow('Invalid working directory');
    });

    it('should reject symlinks pointing outside project', async () => {
      // Create .claude directory
      const claudeDir = path.join(tempDir, '.claude');
      fs.mkdirSync(claudeDir, { recursive: true });

      // Create a file outside the project
      const outsideFile = path.join(os.tmpdir(), 'outside-claude.md');
      fs.writeFileSync(outsideFile, 'Outside content');

      // Create symlink to outside file
      const claudeMdPath = path.join(tempDir, '.claude', 'CLAUDE.md');
      try {
        fs.symlinkSync(outsideFile, claudeMdPath);

        // Configure settingSources
        const config: Partial<Config> = {
          settingSources: ['project'],
        };
        saveConfig(config as Config, tempDir);

        // Run query
        await runAgentQuery({
          prompt: 'Test prompt',
          workingDirectory: tempDir,
        });

        // Verify warning logged
        expect(consoleWarnSpy).toHaveBeenCalledWith(
          expect.stringContaining('symlink points outside project directory')
        );
      } catch (error: any) {
        // Skip on platforms that don't support symlinks
        if (error.code !== 'EPERM' && error.code !== 'ENOENT') {
          throw error;
        }
      } finally {
        // Clean up
        if (fs.existsSync(outsideFile)) {
          fs.unlinkSync(outsideFile);
        }
      }
    });

    it('should handle symlinks within project', async () => {
      // Create .claude directory
      const claudeDir = path.join(tempDir, '.claude');
      fs.mkdirSync(claudeDir, { recursive: true });

      // Create a file within project
      const insideFile = path.join(tempDir, 'inside-claude.md');
      fs.writeFileSync(insideFile, 'Inside content');

      // Create symlink to inside file
      const claudeMdPath = path.join(tempDir, '.claude', 'CLAUDE.md');
      try {
        fs.symlinkSync(insideFile, claudeMdPath);

        // Configure settingSources
        const config: Partial<Config> = {
          settingSources: ['project'],
        };
        saveConfig(config as Config, tempDir);

        // Run query
        await runAgentQuery({
          prompt: 'Test prompt',
          workingDirectory: tempDir,
        });

        // Verify no warning logged for valid symlink
        expect(consoleDebugSpy).toHaveBeenCalledWith(
          'Debug: Found CLAUDE.md in project settings'
        );
        expect(consoleWarnSpy).not.toHaveBeenCalledWith(
          expect.stringContaining('symlink')
        );
      } catch (error: any) {
        // Skip on platforms that don't support symlinks
        if (error.code !== 'EPERM' && error.code !== 'ENOENT') {
          throw error;
        }
      }
    });

    it('should warn about CLAUDE.md with control characters', async () => {
      // Create .claude directory
      const claudeDir = path.join(tempDir, '.claude');
      fs.mkdirSync(claudeDir, { recursive: true });

      // Create CLAUDE.md with control characters
      const claudeMdPath = path.join(tempDir, '.claude', 'CLAUDE.md');
      fs.writeFileSync(claudeMdPath, 'Content with \x00 null byte');

      // Configure settingSources
      const config: Partial<Config> = {
        settingSources: ['project'],
      };
      saveConfig(config as Config, tempDir);

      // Run query
      await runAgentQuery({
        prompt: 'Test prompt',
        workingDirectory: tempDir,
      });

      // Verify warning logged
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('unexpected control characters')
      );
    });
  });

  describe('edge cases', () => {
    it('should handle missing .claude directory gracefully', async () => {
      // Don't create .claude directory

      // Configure settingSources
      const config: Partial<Config> = {
        settingSources: ['project'],
      };
      saveConfig(config as Config, tempDir);

      // Should not throw
      await expect(
        runAgentQuery({
          prompt: 'Test prompt',
          workingDirectory: tempDir,
        })
      ).resolves.toBeDefined();

      // Verify debug message
      expect(consoleDebugSpy).toHaveBeenCalledWith(
        'Debug: CLAUDE.md not found in project settings'
      );
    });

    it('should handle empty CLAUDE.md', async () => {
      // Create .claude directory
      const claudeDir = path.join(tempDir, '.claude');
      fs.mkdirSync(claudeDir, { recursive: true });

      // Create empty CLAUDE.md
      const claudeMdPath = path.join(tempDir, '.claude', 'CLAUDE.md');
      fs.writeFileSync(claudeMdPath, '');

      // Configure settingSources
      const config: Partial<Config> = {
        settingSources: ['project'],
      };
      saveConfig(config as Config, tempDir);

      // Should not throw
      await expect(
        runAgentQuery({
          prompt: 'Test prompt',
          workingDirectory: tempDir,
        })
      ).resolves.toBeDefined();

      // Verify debug message
      expect(consoleDebugSpy).toHaveBeenCalledWith(
        'Debug: Found CLAUDE.md in project settings'
      );
    });
  });
});
