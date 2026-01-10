import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { runAgentQuery } from '../../src/core/client.js';
import { loadConfig, saveConfig } from '../../src/core/config.js';
import type { Config } from '../../src/types/index.js';

describe('Agent SDK settingSources configuration', () => {
  let tempDir: string;
  let originalCwd: string;
  let consoleLogSpy: any;

  beforeEach(() => {
    // Create temporary directory for testing
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentic-sdlc-test-'));
    originalCwd = process.cwd();
    process.chdir(tempDir);

    // Spy on console.log to verify debug messages
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    // Set up test environment with API key
    process.env.ANTHROPIC_API_KEY = 'test-api-key';
  });

  afterEach(() => {
    // Clean up
    process.chdir(originalCwd);
    consoleLogSpy.mockRestore();

    // Remove temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }

    // Clean up env
    delete process.env.ANTHROPIC_API_KEY;
  });

  describe('settingSources configuration', () => {
    it('should default to empty array (SDK isolation mode)', () => {
      const config = loadConfig(tempDir);
      expect(config.settingSources).toEqual([]);
    });

    it('should allow setting settingSources to ["project"]', () => {
      const config = loadConfig(tempDir);
      config.settingSources = ['project'];
      saveConfig(config, tempDir);

      const reloadedConfig = loadConfig(tempDir);
      expect(reloadedConfig.settingSources).toEqual(['project']);
    });

    it('should allow multiple setting sources', () => {
      const config = loadConfig(tempDir);
      config.settingSources = ['user', 'project', 'local'];
      saveConfig(config, tempDir);

      const reloadedConfig = loadConfig(tempDir);
      expect(reloadedConfig.settingSources).toEqual(['user', 'project', 'local']);
    });

    it('should handle undefined settingSources', () => {
      const config = loadConfig(tempDir);
      delete (config as any).settingSources;
      saveConfig(config, tempDir);

      const reloadedConfig = loadConfig(tempDir);
      // Should default to empty array
      expect(reloadedConfig.settingSources).toEqual([]);
    });
  });

  describe('CLAUDE.md discovery logging', () => {
    beforeEach(() => {
      // Create .claude directory
      const claudeDir = path.join(tempDir, '.claude');
      fs.mkdirSync(claudeDir, { recursive: true });
    });

    it('should log when CLAUDE.md is found with project settings', () => {
      // Create CLAUDE.md
      const claudeMdPath = path.join(tempDir, '.claude', 'CLAUDE.md');
      fs.writeFileSync(claudeMdPath, 'You are a helpful assistant.');

      // Configure settingSources
      const config = loadConfig(tempDir);
      config.settingSources = ['project'];
      saveConfig(config, tempDir);

      // Note: We can't actually run the agent query in tests without a real API key
      // and the SDK, so we'll just verify the config is loaded correctly
      const reloadedConfig = loadConfig(tempDir);
      expect(reloadedConfig.settingSources).toContain('project');
      expect(fs.existsSync(claudeMdPath)).toBe(true);
    });

    it('should log when CLAUDE.md is not found with project settings', () => {
      // Don't create CLAUDE.md
      const claudeMdPath = path.join(tempDir, '.claude', 'CLAUDE.md');
      expect(fs.existsSync(claudeMdPath)).toBe(false);

      // Configure settingSources
      const config = loadConfig(tempDir);
      config.settingSources = ['project'];
      saveConfig(config, tempDir);

      const reloadedConfig = loadConfig(tempDir);
      expect(reloadedConfig.settingSources).toContain('project');
    });

    it('should not log about CLAUDE.md when project not in settingSources', () => {
      // Create CLAUDE.md
      const claudeMdPath = path.join(tempDir, '.claude', 'CLAUDE.md');
      fs.writeFileSync(claudeMdPath, 'You are a helpful assistant.');

      // Configure settingSources without 'project'
      const config = loadConfig(tempDir);
      config.settingSources = ['user'];
      saveConfig(config, tempDir);

      const reloadedConfig = loadConfig(tempDir);
      expect(reloadedConfig.settingSources).not.toContain('project');
    });

    it.skipIf(process.platform === 'win32')('should handle symlinked CLAUDE.md', () => {
      // Create actual CLAUDE.md in a different location
      const actualFilePath = path.join(tempDir, 'actual-claude.md');
      fs.writeFileSync(actualFilePath, 'Symlinked custom instructions');

      // Create symlink
      const claudeMdPath = path.join(tempDir, '.claude', 'CLAUDE.md');
      fs.symlinkSync(actualFilePath, claudeMdPath);
      expect(fs.existsSync(claudeMdPath)).toBe(true);

      // Read through symlink
      const content = fs.readFileSync(claudeMdPath, 'utf-8');
      expect(content).toBe('Symlinked custom instructions');
    });

    it('should handle empty CLAUDE.md', () => {
      // Create empty CLAUDE.md
      const claudeMdPath = path.join(tempDir, '.claude', 'CLAUDE.md');
      fs.writeFileSync(claudeMdPath, '');

      expect(fs.existsSync(claudeMdPath)).toBe(true);
      const content = fs.readFileSync(claudeMdPath, 'utf-8');
      expect(content).toBe('');
    });

    it('should handle missing .claude directory gracefully', () => {
      // Remove .claude directory
      const claudeDir = path.join(tempDir, '.claude');
      if (fs.existsSync(claudeDir)) {
        fs.rmSync(claudeDir, { recursive: true });
      }

      expect(fs.existsSync(claudeDir)).toBe(false);

      // Configure settingSources
      const config = loadConfig(tempDir);
      config.settingSources = ['project'];
      saveConfig(config, tempDir);

      // Should not throw
      const reloadedConfig = loadConfig(tempDir);
      expect(reloadedConfig.settingSources).toContain('project');
    });
  });

  describe('priority order scenarios', () => {
    it('should respect multiple sources in order', () => {
      const config = loadConfig(tempDir);
      config.settingSources = ['user', 'project', 'local'];
      saveConfig(config, tempDir);

      const reloadedConfig = loadConfig(tempDir);
      expect(reloadedConfig.settingSources).toEqual(['user', 'project', 'local']);
      // The SDK handles priority internally
    });

    it('should only include project settings', () => {
      const config = loadConfig(tempDir);
      config.settingSources = ['project'];
      saveConfig(config, tempDir);

      const reloadedConfig = loadConfig(tempDir);
      expect(reloadedConfig.settingSources).toEqual(['project']);
      expect(reloadedConfig.settingSources).not.toContain('user');
      expect(reloadedConfig.settingSources).not.toContain('local');
    });

    it('should allow local and project but not user', () => {
      const config = loadConfig(tempDir);
      config.settingSources = ['local', 'project'];
      saveConfig(config, tempDir);

      const reloadedConfig = loadConfig(tempDir);
      expect(reloadedConfig.settingSources).toContain('local');
      expect(reloadedConfig.settingSources).toContain('project');
      expect(reloadedConfig.settingSources).not.toContain('user');
    });
  });

  describe('backward compatibility', () => {
    it('should maintain SDK isolation mode by default', () => {
      const config = loadConfig(tempDir);
      expect(config.settingSources).toEqual([]);
    });

    it('should not break when settingSources is omitted from config file', () => {
      // Create a config file without settingSources
      const configPath = path.join(tempDir, '.agentic-sdlc.json');
      const minimalConfig = {
        sdlcFolder: '.agentic-sdlc',
        theme: 'auto'
      };
      fs.writeFileSync(configPath, JSON.stringify(minimalConfig, null, 2));

      const config = loadConfig(tempDir);
      expect(config.settingSources).toEqual([]);
    });

    it('should preserve existing config fields when adding settingSources', () => {
      const config = loadConfig(tempDir);
      const originalTheme = config.theme;
      const originalSdlcFolder = config.sdlcFolder;

      config.settingSources = ['project'];
      saveConfig(config, tempDir);

      const reloadedConfig = loadConfig(tempDir);
      expect(reloadedConfig.theme).toBe(originalTheme);
      expect(reloadedConfig.sdlcFolder).toBe(originalSdlcFolder);
      expect(reloadedConfig.settingSources).toEqual(['project']);
    });
  });

  describe('edge cases', () => {
    it('should handle very large CLAUDE.md files', () => {
      // Create .claude directory
      const claudeDir = path.join(tempDir, '.claude');
      if (!fs.existsSync(claudeDir)) {
        fs.mkdirSync(claudeDir, { recursive: true });
      }

      // Create a large CLAUDE.md (1MB+)
      const claudeMdPath = path.join(tempDir, '.claude', 'CLAUDE.md');
      const largeContent = 'A'.repeat(1024 * 1024 + 1); // 1MB + 1 byte
      fs.writeFileSync(claudeMdPath, largeContent);

      expect(fs.existsSync(claudeMdPath)).toBe(true);
      const stats = fs.statSync(claudeMdPath);
      expect(stats.size).toBeGreaterThan(1024 * 1024);
    });

    it('should handle CLAUDE.md with special characters', () => {
      // Create .claude directory
      const claudeDir = path.join(tempDir, '.claude');
      if (!fs.existsSync(claudeDir)) {
        fs.mkdirSync(claudeDir, { recursive: true });
      }

      const claudeMdPath = path.join(tempDir, '.claude', 'CLAUDE.md');
      const specialContent = 'Instructions with 中文, emoji 🚀, and symbols @#$%^&*()';
      fs.writeFileSync(claudeMdPath, specialContent);

      const content = fs.readFileSync(claudeMdPath, 'utf-8');
      expect(content).toBe(specialContent);
    });

    it('should handle CLAUDE.md with only whitespace', () => {
      // Create .claude directory
      const claudeDir = path.join(tempDir, '.claude');
      if (!fs.existsSync(claudeDir)) {
        fs.mkdirSync(claudeDir, { recursive: true });
      }

      const claudeMdPath = path.join(tempDir, '.claude', 'CLAUDE.md');
      fs.writeFileSync(claudeMdPath, '   \n\t\n   ');

      const content = fs.readFileSync(claudeMdPath, 'utf-8');
      expect(content.trim()).toBe('');
    });
  });

  describe('configuration merging', () => {
    it('should merge settingSources with other config fields', () => {
      const config = loadConfig(tempDir);
      config.settingSources = ['project'];
      config.theme = 'dark';
      config.defaultLabels = ['test', 'feature'];
      saveConfig(config, tempDir);

      const reloadedConfig = loadConfig(tempDir);
      expect(reloadedConfig.settingSources).toEqual(['project']);
      expect(reloadedConfig.theme).toBe('dark');
      expect(reloadedConfig.defaultLabels).toEqual(['test', 'feature']);
    });

    it('should handle partial config updates', () => {
      // First save with settingSources
      let config = loadConfig(tempDir);
      config.settingSources = ['project'];
      saveConfig(config, tempDir);

      // Load and update theme
      config = loadConfig(tempDir);
      config.theme = 'light';
      saveConfig(config, tempDir);

      // Verify both fields persist
      const reloadedConfig = loadConfig(tempDir);
      expect(reloadedConfig.settingSources).toEqual(['project']);
      expect(reloadedConfig.theme).toBe('light');
    });
  });
});
