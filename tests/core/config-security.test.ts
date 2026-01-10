import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { loadConfig, saveConfig } from '../../src/core/config.js';

describe('Configuration Security Tests', () => {
  let tempDir: string;
  let originalCwd: string;
  let consoleWarnSpy: any;

  beforeEach(() => {
    // Create temporary directory for testing
    // Use realpathSync to resolve symlinks (macOS /var -> /private/var)
    tempDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'agentic-sdlc-security-test-')));
    originalCwd = process.cwd();
    process.chdir(tempDir);

    // Spy on console.warn
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    // Clean up
    process.chdir(originalCwd);
    consoleWarnSpy.mockRestore();

    // Remove temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('JSON injection protection', () => {
    it('should reject config with __proto__ property', () => {
      const configPath = path.join(tempDir, '.agentic-sdlc.json');
      // Write raw JSON string - object literals with __proto__ get special treatment in JS
      fs.writeFileSync(configPath, '{"__proto__": {"isAdmin": true}, "theme": "dark"}');

      // Should throw error
      expect(() => loadConfig(tempDir)).toThrow('prototype pollution attempt detected');
    });

    it('should reject config with constructor property', () => {
      const configPath = path.join(tempDir, '.agentic-sdlc.json');
      // Write raw JSON string to ensure constructor property is preserved
      fs.writeFileSync(configPath, '{"constructor": {"prototype": {"isAdmin": true}}, "theme": "dark"}');

      // Should throw error
      expect(() => loadConfig(tempDir)).toThrow('prototype pollution attempt detected');
    });

    it('should reject config with prototype property', () => {
      const configPath = path.join(tempDir, '.agentic-sdlc.json');
      // Write raw JSON string to ensure prototype property is preserved
      fs.writeFileSync(configPath, '{"prototype": {"isAdmin": true}, "theme": "dark"}');

      // Should throw error
      expect(() => loadConfig(tempDir)).toThrow('prototype pollution attempt detected');
    });

    it('should accept valid config without malicious properties', () => {
      const configPath = path.join(tempDir, '.agentic-sdlc.json');
      const validConfig = {
        theme: 'dark',
        settingSources: ['project'],
      };
      fs.writeFileSync(configPath, JSON.stringify(validConfig));

      // Should not throw
      expect(() => loadConfig(tempDir)).not.toThrow();
      const config = loadConfig(tempDir);
      expect(config.theme).toBe('dark');
      expect(config.settingSources).toEqual(['project']);
    });
  });

  describe('settingSources validation', () => {
    it('should reject non-array settingSources', () => {
      const configPath = path.join(tempDir, '.agentic-sdlc.json');
      const invalidConfig = {
        settingSources: 'project', // Should be array
      };
      fs.writeFileSync(configPath, JSON.stringify(invalidConfig));

      const config = loadConfig(tempDir);

      // Should warn and use default
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid settingSources in config (must be array)')
      );
      expect(config.settingSources).toEqual([]); // Default
    });

    it('should filter invalid settingSources values', () => {
      const configPath = path.join(tempDir, '.agentic-sdlc.json');
      const invalidConfig = {
        settingSources: ['project', 'invalid', 'user'],
      };
      fs.writeFileSync(configPath, JSON.stringify(invalidConfig));

      const config = loadConfig(tempDir);

      // Should warn about invalid value
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid settingSources values in config: invalid')
      );

      // Should filter out invalid values
      expect(config.settingSources).toEqual(['project', 'user']);
    });

    it('should accept valid settingSources values', () => {
      const configPath = path.join(tempDir, '.agentic-sdlc.json');
      const validConfig = {
        settingSources: ['user', 'project', 'local'],
      };
      fs.writeFileSync(configPath, JSON.stringify(validConfig));

      const config = loadConfig(tempDir);

      // Should not warn
      expect(consoleWarnSpy).not.toHaveBeenCalled();

      // Should keep all valid values
      expect(config.settingSources).toEqual(['user', 'project', 'local']);
    });

    it('should handle mixed valid and invalid values', () => {
      const configPath = path.join(tempDir, '.agentic-sdlc.json');
      const invalidConfig = {
        settingSources: ['invalid1', 'project', 'invalid2', 'user'],
      };
      fs.writeFileSync(configPath, JSON.stringify(invalidConfig));

      const config = loadConfig(tempDir);

      // Should warn about invalid values
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid settingSources values in config: invalid1, invalid2')
      );

      // Should keep only valid values
      expect(config.settingSources).toEqual(['project', 'user']);
    });

    it('should handle settingSources with non-string values', () => {
      const configPath = path.join(tempDir, '.agentic-sdlc.json');
      const invalidConfig = {
        settingSources: ['project', 123, true, 'user'],
      };
      fs.writeFileSync(configPath, JSON.stringify(invalidConfig));

      const config = loadConfig(tempDir);

      // Should filter out non-string values
      expect(config.settingSources).toEqual(['project', 'user']);
    });
  });

  describe('environment variable validation', () => {
    afterEach(() => {
      delete process.env.AGENTIC_SDLC_MAX_RETRIES;
    });

    it('should validate AGENTIC_SDLC_MAX_RETRIES is a number', () => {
      process.env.AGENTIC_SDLC_MAX_RETRIES = 'not-a-number';

      const config = loadConfig(tempDir);

      // Should warn and ignore invalid value
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid AGENTIC_SDLC_MAX_RETRIES value')
      );
      expect(config.reviewConfig.maxRetries).toBe(3); // Default
    });

    it('should reject negative AGENTIC_SDLC_MAX_RETRIES', () => {
      process.env.AGENTIC_SDLC_MAX_RETRIES = '-5';

      const config = loadConfig(tempDir);

      // Should warn and ignore invalid value
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid AGENTIC_SDLC_MAX_RETRIES value')
      );
      expect(config.reviewConfig.maxRetries).toBe(3); // Default
    });

    it('should reject AGENTIC_SDLC_MAX_RETRIES above 100', () => {
      process.env.AGENTIC_SDLC_MAX_RETRIES = '150';

      const config = loadConfig(tempDir);

      // Should warn and ignore invalid value
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid AGENTIC_SDLC_MAX_RETRIES value')
      );
      expect(config.reviewConfig.maxRetries).toBe(3); // Default
    });

    it('should accept valid AGENTIC_SDLC_MAX_RETRIES', () => {
      process.env.AGENTIC_SDLC_MAX_RETRIES = '5';

      const config = loadConfig(tempDir);

      // Should not warn
      expect(consoleWarnSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('Invalid AGENTIC_SDLC_MAX_RETRIES')
      );
      expect(config.reviewConfig.maxRetries).toBe(5);
    });

    it('should accept 0 as valid AGENTIC_SDLC_MAX_RETRIES', () => {
      process.env.AGENTIC_SDLC_MAX_RETRIES = '0';

      const config = loadConfig(tempDir);

      expect(config.reviewConfig.maxRetries).toBe(0);
    });

    it('should accept 100 as valid AGENTIC_SDLC_MAX_RETRIES', () => {
      process.env.AGENTIC_SDLC_MAX_RETRIES = '100';

      const config = loadConfig(tempDir);

      expect(config.reviewConfig.maxRetries).toBe(100);
    });
  });
});
