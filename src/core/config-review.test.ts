import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { validateReviewConfig, loadConfig } from './config.js';
import { ReviewConfig } from '../types/index.js';

describe('review config validation', () => {
  // Store original env vars
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    // Clean up env vars
    delete process.env.AGENTIC_SDLC_MAX_RETRIES;
    delete process.env.AGENTIC_SDLC_AUTO_COMPLETE;
    delete process.env.AGENTIC_SDLC_AUTO_RESTART;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('validateReviewConfig', () => {
    it('should accept valid config', () => {
      const config: ReviewConfig = {
        maxRetries: 3,
        maxRetriesUpperBound: 10,
        autoCompleteOnApproval: true,
        autoRestartOnRejection: true,
      };
      const result = validateReviewConfig(config);
      expect(result).toEqual(config);
    });

    it('should reject negative maxRetries', () => {
      const config: ReviewConfig = {
        maxRetries: -1,
        maxRetriesUpperBound: 10,
        autoCompleteOnApproval: true,
        autoRestartOnRejection: true,
      };
      const result = validateReviewConfig(config);
      expect(result.maxRetries).toBe(0);
    });

    it('should cap maxRetries at maxRetriesUpperBound', () => {
      const config: ReviewConfig = {
        maxRetries: 15,
        maxRetriesUpperBound: 10,
        autoCompleteOnApproval: true,
        autoRestartOnRejection: true,
      };
      const result = validateReviewConfig(config);
      expect(result.maxRetries).toBe(10);
    });

    it('should allow maxRetries of 0', () => {
      const config: ReviewConfig = {
        maxRetries: 0,
        maxRetriesUpperBound: 10,
        autoCompleteOnApproval: true,
        autoRestartOnRejection: true,
      };
      const result = validateReviewConfig(config);
      expect(result.maxRetries).toBe(0);
    });

    it('should allow maxRetries within bounds', () => {
      const config: ReviewConfig = {
        maxRetries: 5,
        maxRetriesUpperBound: 10,
        autoCompleteOnApproval: true,
        autoRestartOnRejection: true,
      };
      const result = validateReviewConfig(config);
      expect(result.maxRetries).toBe(5);
    });
  });

  describe('loadConfig with environment variables', () => {
    it('should override maxRetries with AGENTIC_SDLC_MAX_RETRIES', () => {
      process.env.AGENTIC_SDLC_MAX_RETRIES = '7';
      const config = loadConfig();
      expect(config.reviewConfig.maxRetries).toBe(7);
    });

    it('should override autoCompleteOnApproval with AGENTIC_SDLC_AUTO_COMPLETE', () => {
      process.env.AGENTIC_SDLC_AUTO_COMPLETE = 'false';
      const config = loadConfig();
      expect(config.reviewConfig.autoCompleteOnApproval).toBe(false);
    });

    it('should override autoRestartOnRejection with AGENTIC_SDLC_AUTO_RESTART', () => {
      process.env.AGENTIC_SDLC_AUTO_RESTART = 'false';
      const config = loadConfig();
      expect(config.reviewConfig.autoRestartOnRejection).toBe(false);
    });

    it('should ignore invalid AGENTIC_SDLC_MAX_RETRIES values', () => {
      process.env.AGENTIC_SDLC_MAX_RETRIES = 'invalid';
      const config = loadConfig();
      expect(config.reviewConfig.maxRetries).toBe(3); // default
    });

    it('should apply all environment variable overrides together', () => {
      process.env.AGENTIC_SDLC_MAX_RETRIES = '5';
      process.env.AGENTIC_SDLC_AUTO_COMPLETE = 'false';
      process.env.AGENTIC_SDLC_AUTO_RESTART = 'false';
      const config = loadConfig();
      expect(config.reviewConfig.maxRetries).toBe(5);
      expect(config.reviewConfig.autoCompleteOnApproval).toBe(false);
      expect(config.reviewConfig.autoRestartOnRejection).toBe(false);
    });

    it('should ignore invalid negative environment variable values', () => {
      process.env.AGENTIC_SDLC_MAX_RETRIES = '-5';
      const config = loadConfig();
      expect(config.reviewConfig.maxRetries).toBe(3); // invalid, uses default
    });

    it('should allow environment variable maxRetries up to 100', () => {
      process.env.AGENTIC_SDLC_MAX_RETRIES = '20';
      const config = loadConfig();
      expect(config.reviewConfig.maxRetries).toBe(20); // env var raises upper bound
    });
  });

  describe('default reviewConfig', () => {
    it('should have default values when no config file exists', () => {
      const config = loadConfig();
      expect(config.reviewConfig).toBeDefined();
      expect(config.reviewConfig.maxRetries).toBe(3);
      expect(config.reviewConfig.maxRetriesUpperBound).toBe(10);
      expect(config.reviewConfig.autoCompleteOnApproval).toBe(true);
      expect(config.reviewConfig.autoRestartOnRejection).toBe(true);
    });
  });
});
