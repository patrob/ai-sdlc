import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { DEFAULT_CONFIG, loadConfig, DEFAULT_DAEMON_CONFIG, DEFAULT_TIMEOUTS, validateImplementationConfig, DEFAULT_WORKTREE_CONFIG, validateWorktreeBasePath, getWorktreeConfig } from './config.js';
import { Config, TDDConfig, WorktreeConfig } from '../types/index.js';

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

  describe('Implementation config validation', () => {
    describe('validateImplementationConfig', () => {
      it('should reject negative maxRetries', () => {
        const config = validateImplementationConfig({ maxRetries: -1, maxRetriesUpperBound: 10 });
        expect(config.maxRetries).toBe(0);
      });

      it('should cap maxRetries at upper bound', () => {
        const config = validateImplementationConfig({ maxRetries: 15, maxRetriesUpperBound: 10 });
        expect(config.maxRetries).toBe(10);
      });

      it('should handle Infinity as no limit', () => {
        const config = validateImplementationConfig({ maxRetries: Infinity, maxRetriesUpperBound: 10 });
        expect(config.maxRetries).toBe(Infinity);
      });

      it('should allow maxRetries of 0 (disables retries)', () => {
        const config = validateImplementationConfig({ maxRetries: 0, maxRetriesUpperBound: 10 });
        expect(config.maxRetries).toBe(0);
      });

      it('should allow maxRetries equal to upper bound', () => {
        const config = validateImplementationConfig({ maxRetries: 10, maxRetriesUpperBound: 10 });
        expect(config.maxRetries).toBe(10);
      });

      it('should preserve valid maxRetries within bounds', () => {
        const config = validateImplementationConfig({ maxRetries: 5, maxRetriesUpperBound: 10 });
        expect(config.maxRetries).toBe(5);
      });
    });

    describe('loadConfig with AI_SDLC_IMPLEMENTATION_MAX_RETRIES', () => {
      const tempDir = '.test-implementation-config-env';
      const originalEnv = process.env.AI_SDLC_IMPLEMENTATION_MAX_RETRIES;

      beforeEach(() => {
        // Clean env var BEFORE each test for isolation
        delete process.env.AI_SDLC_IMPLEMENTATION_MAX_RETRIES;
        // Clean up and recreate temp directory
        if (fs.existsSync(tempDir)) {
          const configFile = path.join(tempDir, '.ai-sdlc.json');
          if (fs.existsSync(configFile)) {
            fs.unlinkSync(configFile);
          }
          fs.rmdirSync(tempDir);
        }
        fs.mkdirSync(tempDir);
        // Write a minimal config to ensure deep merge path (avoids DEFAULT_CONFIG mutation bug)
        const configFile = path.join(tempDir, '.ai-sdlc.json');
        fs.writeFileSync(configFile, JSON.stringify({}));
      });

      afterEach(() => {
        if (fs.existsSync(tempDir)) {
          const configFile = path.join(tempDir, '.ai-sdlc.json');
          if (fs.existsSync(configFile)) {
            fs.unlinkSync(configFile);
          }
          fs.rmdirSync(tempDir);
        }
        // Restore original env var
        if (originalEnv !== undefined) {
          process.env.AI_SDLC_IMPLEMENTATION_MAX_RETRIES = originalEnv;
        } else {
          delete process.env.AI_SDLC_IMPLEMENTATION_MAX_RETRIES;
        }
      });

      it('should override config with env var', () => {
        process.env.AI_SDLC_IMPLEMENTATION_MAX_RETRIES = '5';
        const config = loadConfig(tempDir);
        expect(config.implementation.maxRetries).toBe(5);
      });

      it('should reject negative env var value', () => {
        process.env.AI_SDLC_IMPLEMENTATION_MAX_RETRIES = '-1';
        const config = loadConfig(tempDir);
        expect(config.implementation.maxRetries).toBe(3); // Default
      });

      it('should cap env var at 10', () => {
        process.env.AI_SDLC_IMPLEMENTATION_MAX_RETRIES = '15';
        const config = loadConfig(tempDir);
        expect(config.implementation.maxRetries).toBeLessThanOrEqual(10);
      });

      it('should reject non-numeric env var', () => {
        process.env.AI_SDLC_IMPLEMENTATION_MAX_RETRIES = 'invalid';
        const config = loadConfig(tempDir);
        expect(config.implementation.maxRetries).toBe(3); // Default
      });

      it('should allow zero via env var', () => {
        process.env.AI_SDLC_IMPLEMENTATION_MAX_RETRIES = '0';
        const config = loadConfig(tempDir);
        expect(config.implementation.maxRetries).toBe(0);
      });

      it('should validate and cap config file maxRetries at upper bound', () => {
        // Write config file with maxRetries exceeding upper bound
        const configFile = path.join(tempDir, '.ai-sdlc.json');
        fs.writeFileSync(
          configFile,
          JSON.stringify({
            implementation: {
              maxRetries: 15,
              maxRetriesUpperBound: 10,
            },
          })
        );

        const config = loadConfig(tempDir);

        // Verify validateImplementationConfig was applied and capped at upper bound
        expect(config.implementation.maxRetries).toBe(10);
      });
    });
  });
});

describe('config - Skills infrastructure defaults', () => {
  it('should have settingSources set to ["project"] by default', () => {
    expect(DEFAULT_CONFIG.settingSources).toBeDefined();
    expect(DEFAULT_CONFIG.settingSources).toEqual(['project']);
  });

  it('should load default settingSources when no config file exists', () => {
    const tempDir = '.test-skills-config';
    fs.mkdirSync(tempDir, { recursive: true });
    try {
      const config = loadConfig(tempDir);
      expect(config.settingSources).toEqual(['project']);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should allow user to override settingSources via config file', () => {
    const tempDir = '.test-skills-config-override';
    fs.mkdirSync(tempDir, { recursive: true });
    try {
      const configPath = path.join(tempDir, '.ai-sdlc.json');
      const userConfig = {
        settingSources: ['user', 'project'],
      };
      fs.writeFileSync(configPath, JSON.stringify(userConfig));

      const config = loadConfig(tempDir);
      expect(config.settingSources).toEqual(['user', 'project']);
    } finally {
      const configFile = path.join(tempDir, '.ai-sdlc.json');
      if (fs.existsSync(configFile)) {
        fs.unlinkSync(configFile);
      }
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should allow user to disable Skills by setting empty array', () => {
    const tempDir = '.test-skills-config-disabled';
    fs.mkdirSync(tempDir, { recursive: true });
    try {
      const configPath = path.join(tempDir, '.ai-sdlc.json');
      const userConfig = {
        settingSources: [],
      };
      fs.writeFileSync(configPath, JSON.stringify(userConfig));

      const config = loadConfig(tempDir);
      expect(config.settingSources).toEqual([]);
    } finally {
      const configFile = path.join(tempDir, '.ai-sdlc.json');
      if (fs.existsSync(configFile)) {
        fs.unlinkSync(configFile);
      }
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

describe('config - Worktree configuration', () => {
  describe('Worktree config defaults', () => {
    it('should have worktree configuration in DEFAULT_CONFIG', () => {
      expect(DEFAULT_CONFIG.worktree).toBeDefined();
      expect(DEFAULT_CONFIG.worktree).toHaveProperty('enabled');
      expect(DEFAULT_CONFIG.worktree).toHaveProperty('basePath');
    });

    it('should have worktree.enabled set to false by default (opt-in)', () => {
      expect(DEFAULT_CONFIG.worktree?.enabled).toBe(false);
    });

    it('should have worktree.basePath set to .ai-sdlc/worktrees by default', () => {
      expect(DEFAULT_CONFIG.worktree?.basePath).toBe('.ai-sdlc/worktrees');
    });

    it('should export DEFAULT_WORKTREE_CONFIG constant', () => {
      expect(DEFAULT_WORKTREE_CONFIG).toBeDefined();
      expect(DEFAULT_WORKTREE_CONFIG.enabled).toBe(false);
      expect(DEFAULT_WORKTREE_CONFIG.basePath).toBe('.ai-sdlc/worktrees');
    });
  });

  describe('Worktree config validation', () => {
    const tempDir = '.test-worktree-config';

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

    it('should load default worktree config when no config file exists', () => {
      const config = loadConfig(tempDir);
      expect(config.worktree).toBeDefined();
      expect(config.worktree?.enabled).toBe(false);
      expect(config.worktree?.basePath).toBe('.ai-sdlc/worktrees');
    });

    it('should merge user-provided worktree config with defaults', () => {
      const configPath = path.join(tempDir, '.ai-sdlc.json');
      const userConfig = {
        worktree: {
          enabled: true,
        },
      };
      fs.writeFileSync(configPath, JSON.stringify(userConfig));

      const config = loadConfig(tempDir);
      expect(config.worktree?.enabled).toBe(true);
      // Should keep default for unspecified properties
      expect(config.worktree?.basePath).toBe('.ai-sdlc/worktrees');
    });

    it('should validate that worktree.enabled is a boolean', () => {
      const configPath = path.join(tempDir, '.ai-sdlc.json');
      const userConfig = {
        worktree: {
          enabled: 'true' as any, // Invalid: string instead of boolean
        },
      };
      fs.writeFileSync(configPath, JSON.stringify(userConfig));

      const config = loadConfig(tempDir);
      // Invalid value should be replaced with default
      expect(typeof config.worktree?.enabled).toBe('boolean');
      expect(config.worktree?.enabled).toBe(false);
    });

    it('should validate that worktree.basePath is a string', () => {
      const configPath = path.join(tempDir, '.ai-sdlc.json');
      const userConfig = {
        worktree: {
          enabled: true,
          basePath: 123 as any, // Invalid: number instead of string
        },
      };
      fs.writeFileSync(configPath, JSON.stringify(userConfig));

      const config = loadConfig(tempDir);
      // Invalid value should be replaced with default
      expect(typeof config.worktree?.basePath).toBe('string');
      expect(config.worktree?.basePath).toBe('.ai-sdlc/worktrees');
    });

    it('should allow custom basePath when valid string', () => {
      const configPath = path.join(tempDir, '.ai-sdlc.json');
      const userConfig = {
        worktree: {
          enabled: true,
          basePath: 'custom/worktree/path',
        },
      };
      fs.writeFileSync(configPath, JSON.stringify(userConfig));

      const config = loadConfig(tempDir);
      expect(config.worktree?.basePath).toBe('custom/worktree/path');
    });

    it('should allow enabling worktrees via config file', () => {
      const configPath = path.join(tempDir, '.ai-sdlc.json');
      const userConfig = {
        worktree: {
          enabled: true,
          basePath: '.ai-sdlc/worktrees',
        },
      };
      fs.writeFileSync(configPath, JSON.stringify(userConfig));

      const config = loadConfig(tempDir);
      expect(config.worktree?.enabled).toBe(true);
    });
  });

  describe('validateWorktreeBasePath', () => {
    const tempDir = '.test-worktree-path-validation';

    beforeEach(() => {
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
    });

    afterEach(() => {
      if (fs.existsSync(tempDir)) {
        fs.rmdirSync(tempDir, { recursive: true });
      }
    });

    it('should resolve relative paths to project root', () => {
      // Create parent directory first
      fs.mkdirSync(path.join(tempDir, '.ai-sdlc'), { recursive: true });
      const result = validateWorktreeBasePath('.ai-sdlc/worktrees', tempDir);
      expect(result).toBe(path.resolve(tempDir, '.ai-sdlc/worktrees'));
    });

    it('should keep absolute paths unchanged', () => {
      const absolutePath = path.resolve(tempDir, 'custom/worktrees');
      // Create parent directory to avoid validation error
      fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
      const result = validateWorktreeBasePath(absolutePath, tempDir);
      expect(result).toBe(absolutePath);
    });

    it('should throw error when parent directory does not exist', () => {
      expect(() => {
        validateWorktreeBasePath('/non/existent/path/worktrees', tempDir);
      }).toThrow('Worktree basePath parent directory does not exist');
    });

    it('should accept path when parent directory exists', () => {
      // tempDir exists, so .ai-sdlc/worktrees parent (.ai-sdlc which is tempDir's child) needs to exist
      const parentDir = path.join(tempDir, '.ai-sdlc');
      fs.mkdirSync(parentDir, { recursive: true });

      const result = validateWorktreeBasePath('.ai-sdlc/worktrees', tempDir);
      expect(result).toBe(path.resolve(tempDir, '.ai-sdlc/worktrees'));
    });
  });

  describe('getWorktreeConfig', () => {
    const tempDir = '.test-get-worktree-config';

    beforeEach(() => {
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      // Create the .ai-sdlc parent directory for path validation
      const sdlcDir = path.join(tempDir, '.ai-sdlc');
      if (!fs.existsSync(sdlcDir)) {
        fs.mkdirSync(sdlcDir, { recursive: true });
      }
    });

    afterEach(() => {
      if (fs.existsSync(tempDir)) {
        fs.rmdirSync(tempDir, { recursive: true });
      }
    });

    it('should return default config when worktree not set in config', () => {
      const config: Config = { ...DEFAULT_CONFIG, worktree: undefined };
      const result = getWorktreeConfig(config, tempDir);
      expect(result.enabled).toBe(false);
      expect(result.basePath).toBe(path.resolve(tempDir, '.ai-sdlc/worktrees'));
    });

    it('should return user config with resolved path', () => {
      const config: Config = {
        ...DEFAULT_CONFIG,
        worktree: { enabled: true, basePath: '.ai-sdlc/worktrees' },
      };
      const result = getWorktreeConfig(config, tempDir);
      expect(result.enabled).toBe(true);
      expect(result.basePath).toBe(path.resolve(tempDir, '.ai-sdlc/worktrees'));
    });

    it('should throw error if basePath parent does not exist', () => {
      const config: Config = {
        ...DEFAULT_CONFIG,
        worktree: { enabled: true, basePath: '/nonexistent/path/worktrees' },
      };
      expect(() => getWorktreeConfig(config, tempDir)).toThrow(
        'Worktree basePath parent directory does not exist'
      );
    });
  });
});
