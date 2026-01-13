import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { DEFAULT_CONFIG, loadConfig, DEFAULT_DAEMON_CONFIG, DEFAULT_TIMEOUTS } from './config.js';
import { Config, TDDConfig } from '../types/index.js';

describe('config - TDD configuration', () => {
  describe('TDD config defaults', () => {
    it('should have tdd configuration in DEFAULT_CONFIG', () => {
      expect(DEFAULT_CONFIG.tdd).toBeDefined();
      expect(DEFAULT_CONFIG.tdd).toHaveProperty('enabled');
      expect(DEFAULT_CONFIG.tdd).toHaveProperty('strictMode');
      expect(DEFAULT_CONFIG.tdd).toHaveProperty('maxCycles');
      expect(DEFAULT_CONFIG.tdd).toHaveProperty('requireApprovalPerCycle');
    });

    it('should have tdd.enabled set to false by default (opt-in)', () => {
      expect(DEFAULT_CONFIG.tdd?.enabled).toBe(false);
    });

    it('should have tdd.strictMode set to true by default', () => {
      expect(DEFAULT_CONFIG.tdd?.strictMode).toBe(true);
    });

    it('should have tdd.maxCycles set to 50 by default', () => {
      expect(DEFAULT_CONFIG.tdd?.maxCycles).toBe(50);
    });

    it('should have tdd.requireApprovalPerCycle set to false by default', () => {
      expect(DEFAULT_CONFIG.tdd?.requireApprovalPerCycle).toBe(false);
    });
  });

  describe('TDD config validation', () => {
    const tempDir = '.test-tdd-config';

    beforeEach(() => {
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir);
      }
    });

    afterEach(() => {
      if (fs.existsSync(tempDir)) {
        const configFile = path.join(tempDir, '.ai-sdlc.json');
        if (fs.existsSync(configFile)) {
          fs.unlinkSync(configFile);
        }
        fs.rmdirSync(tempDir);
      }
    });

    it('should load default tdd config when no config file exists', () => {
      const config = loadConfig(tempDir);
      expect(config.tdd).toBeDefined();
      expect(config.tdd?.enabled).toBe(false);
      expect(config.tdd?.strictMode).toBe(true);
      expect(config.tdd?.maxCycles).toBe(50);
      expect(config.tdd?.requireApprovalPerCycle).toBe(false);
    });

    it('should merge user-provided tdd config with defaults', () => {
      const configPath = path.join(tempDir, '.ai-sdlc.json');
      const userConfig = {
        tdd: {
          enabled: true,
          strictMode: false,
        },
      };
      fs.writeFileSync(configPath, JSON.stringify(userConfig));

      const config = loadConfig(tempDir);
      expect(config.tdd?.enabled).toBe(true);
      expect(config.tdd?.strictMode).toBe(false);
      // Should keep defaults for unspecified properties
      expect(config.tdd?.maxCycles).toBe(50);
      expect(config.tdd?.requireApprovalPerCycle).toBe(false);
    });

    it('should validate that tdd.enabled is a boolean', () => {
      const configPath = path.join(tempDir, '.ai-sdlc.json');
      const userConfig = {
        tdd: {
          enabled: 'true' as any, // Invalid: string instead of boolean
          strictMode: true,
          maxCycles: 50,
          requireApprovalPerCycle: false,
        },
      };
      fs.writeFileSync(configPath, JSON.stringify(userConfig));

      const config = loadConfig(tempDir);
      // Invalid value should be replaced with default
      expect(typeof config.tdd?.enabled).toBe('boolean');
    });

    it('should validate that tdd.strictMode is a boolean', () => {
      const configPath = path.join(tempDir, '.ai-sdlc.json');
      const userConfig = {
        tdd: {
          enabled: false,
          strictMode: 1 as any, // Invalid: number instead of boolean
          maxCycles: 50,
          requireApprovalPerCycle: false,
        },
      };
      fs.writeFileSync(configPath, JSON.stringify(userConfig));

      const config = loadConfig(tempDir);
      // Invalid value should be replaced with default
      expect(typeof config.tdd?.strictMode).toBe('boolean');
    });

    it('should validate that tdd.maxCycles is a positive number', () => {
      const configPath = path.join(tempDir, '.ai-sdlc.json');
      const userConfig = {
        tdd: {
          enabled: false,
          strictMode: true,
          maxCycles: -5 as any, // Invalid: negative number
          requireApprovalPerCycle: false,
        },
      };
      fs.writeFileSync(configPath, JSON.stringify(userConfig));

      const config = loadConfig(tempDir);
      // Invalid value should be replaced with default
      expect(typeof config.tdd?.maxCycles).toBe('number');
      expect(config.tdd?.maxCycles).toBeGreaterThan(0);
    });

    it('should validate that tdd.requireApprovalPerCycle is a boolean', () => {
      const configPath = path.join(tempDir, '.ai-sdlc.json');
      const userConfig = {
        tdd: {
          enabled: false,
          strictMode: true,
          maxCycles: 50,
          requireApprovalPerCycle: 'false' as any, // Invalid: string instead of boolean
        },
      };
      fs.writeFileSync(configPath, JSON.stringify(userConfig));

      const config = loadConfig(tempDir);
      // Invalid value should be replaced with default
      expect(typeof config.tdd?.requireApprovalPerCycle).toBe('boolean');
    });

    it('should allow enabling TDD via config file', () => {
      const configPath = path.join(tempDir, '.ai-sdlc.json');
      const userConfig = {
        tdd: {
          enabled: true,
          strictMode: false,
          maxCycles: 100,
          requireApprovalPerCycle: true,
        },
      };
      fs.writeFileSync(configPath, JSON.stringify(userConfig));

      const config = loadConfig(tempDir);
      expect(config.tdd?.enabled).toBe(true);
      expect(config.tdd?.strictMode).toBe(false);
      expect(config.tdd?.maxCycles).toBe(100);
      expect(config.tdd?.requireApprovalPerCycle).toBe(true);
    });
  });
});

describe('config - Review configuration defaults', () => {
  describe('Review config defaults', () => {
    it('should have reviewConfig.maxRetries set to 3 by default', () => {
      expect(DEFAULT_CONFIG.reviewConfig.maxRetries).toBe(3);
    });

    it('should have reviewConfig.maxRetriesUpperBound set to 10 by default', () => {
      expect(DEFAULT_CONFIG.reviewConfig.maxRetriesUpperBound).toBe(10);
    });

    it('should have reviewConfig.autoCompleteOnApproval set to true by default', () => {
      expect(DEFAULT_CONFIG.reviewConfig.autoCompleteOnApproval).toBe(true);
    });

    it('should have reviewConfig.autoRestartOnRejection set to true by default', () => {
      expect(DEFAULT_CONFIG.reviewConfig.autoRestartOnRejection).toBe(true);
    });
  });

  describe('Daemon config defaults', () => {
    it('should have daemon.pollingInterval set to 5000 ms by default', () => {
      expect(DEFAULT_DAEMON_CONFIG.pollingInterval).toBe(5000);
    });

    it('should have daemon.enabled set to false by default', () => {
      expect(DEFAULT_DAEMON_CONFIG.enabled).toBe(false);
    });

    it('should have daemon configuration in DEFAULT_CONFIG', () => {
      expect(DEFAULT_CONFIG.daemon).toBeDefined();
      expect(DEFAULT_CONFIG.daemon?.pollingInterval).toBe(5000);
    });
  });

  describe('Review config with user overrides', () => {
    const tempDir = '.test-review-config';

    beforeEach(() => {
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir);
      }
    });

    afterEach(() => {
      if (fs.existsSync(tempDir)) {
        const configFile = path.join(tempDir, '.ai-sdlc.json');
        if (fs.existsSync(configFile)) {
          fs.unlinkSync(configFile);
        }
        fs.rmdirSync(tempDir);
      }
    });

    it('should load default review config when no config file exists', () => {
      const config = loadConfig(tempDir);
      expect(config.reviewConfig.maxRetries).toBe(3);
      expect(config.reviewConfig.maxRetriesUpperBound).toBe(10);
      expect(config.reviewConfig.autoCompleteOnApproval).toBe(true);
      expect(config.reviewConfig.autoRestartOnRejection).toBe(true);
    });

    it('should use user-provided maxRetries value when specified', () => {
      const configPath = path.join(tempDir, '.ai-sdlc.json');
      const userConfig = {
        reviewConfig: {
          maxRetries: 5,
        },
      };
      fs.writeFileSync(configPath, JSON.stringify(userConfig));

      const config = loadConfig(tempDir);
      expect(config.reviewConfig.maxRetries).toBe(5);
      // Other defaults should still apply
      expect(config.reviewConfig.maxRetriesUpperBound).toBe(10);
      expect(config.reviewConfig.autoCompleteOnApproval).toBe(true);
      expect(config.reviewConfig.autoRestartOnRejection).toBe(true);
    });

    it('should use user-provided maxRetriesUpperBound value when specified', () => {
      const configPath = path.join(tempDir, '.ai-sdlc.json');
      const userConfig = {
        reviewConfig: {
          maxRetriesUpperBound: 20,
        },
      };
      fs.writeFileSync(configPath, JSON.stringify(userConfig));

      const config = loadConfig(tempDir);
      expect(config.reviewConfig.maxRetriesUpperBound).toBe(20);
      // Other defaults should still apply
      expect(config.reviewConfig.maxRetries).toBe(3);
      expect(config.reviewConfig.autoCompleteOnApproval).toBe(true);
      expect(config.reviewConfig.autoRestartOnRejection).toBe(true);
    });

    it('should allow user to override multiple review config values', () => {
      const configPath = path.join(tempDir, '.ai-sdlc.json');
      const userConfig = {
        reviewConfig: {
          maxRetries: 7,
          maxRetriesUpperBound: 15,
          autoCompleteOnApproval: false,
          autoRestartOnRejection: false,
        },
      };
      fs.writeFileSync(configPath, JSON.stringify(userConfig));

      const config = loadConfig(tempDir);
      expect(config.reviewConfig.maxRetries).toBe(7);
      expect(config.reviewConfig.maxRetriesUpperBound).toBe(15);
      expect(config.reviewConfig.autoCompleteOnApproval).toBe(false);
      expect(config.reviewConfig.autoRestartOnRejection).toBe(false);
    });
  });
});
