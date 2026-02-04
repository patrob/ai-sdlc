import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Create mock functions using vi.hoisted() so they're available during vi.mock hoisting
const { mockSpawnSync, mockExecSync } = vi.hoisted(() => ({
  mockSpawnSync: vi.fn(),
  mockExecSync: vi.fn(),
}));

// Mock the agent query function
vi.mock('../../src/core/client.js', () => ({
  runAgentQuery: vi.fn().mockResolvedValue('Implementation complete'),
  AgentProgressEvent: {},
}));

// Mock verification
vi.mock('../../src/agents/verification.js', () => ({
  verifyImplementation: vi.fn(),
}));

// Mock git operations - use the hoisted mock functions
vi.mock('child_process', () => ({
  execSync: mockExecSync,
  spawnSync: mockSpawnSync,
}));

// Import the functions we need to test after setting up mocks
import { runImplementationAgent } from '../../src/agents/implementation.js';
import { parseStory } from '../../src/core/story.js';
import { loadConfig } from '../../src/core/config.js';

describe('Implementation Retry Integration Tests', () => {
  let tempDir: string;
  let sdlcRoot: string;
  let storyPath: string;
  let diffCallCount: number;

  beforeEach(() => {
    vi.clearAllMocks();
    diffCallCount = 0;

    // Set up default mock return values
    mockExecSync.mockReturnValue('');

    // Set up default spawnSync mock that returns different diffs each time
    mockSpawnSync.mockImplementation((cmd: string, args?: string[]) => {
      if (cmd === 'git' && args?.[0] === 'diff') {
        diffCallCount++;
        return { status: 0, stdout: `default-diff-${diffCallCount}`, stderr: '', output: [], pid: 1, signal: null };
      }
      return { status: 0, stdout: '', stderr: '', output: [], pid: 1, signal: null };
    });

    // Create temp directory structure
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'impl-retry-test-'));
    sdlcRoot = path.join(tempDir, '.ai-sdlc');
    const storiesDir = path.join(sdlcRoot, 'stories', 'S-TEST');
    fs.mkdirSync(storiesDir, { recursive: true });

    // Create test story
    storyPath = path.join(storiesDir, 'story.md');
    fs.writeFileSync(storyPath, `---
id: S-TEST
title: Test Story
priority: 1
status: in-progress
created: '2026-01-14'
research_complete: true
plan_complete: true
implementation_complete: false
reviews_complete: false
slug: test-story
---

# Test Story

## Acceptance Criteria
- [ ] Test criteria
`);

    // Create config file
    const configPath = path.join(sdlcRoot, 'config.yaml');
    fs.writeFileSync(configPath, `
implementation:
  maxRetries: 3
  maxRetriesUpperBound: 10
`);
  });

  afterEach(() => {
    // Clean up temp directory
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('retry count during internal iterations', () => {
    it('should NOT increment implementation_retry_count during internal iterations', async () => {
      const { verifyImplementation } = await import('../../src/agents/verification.js');
      const mockVerify = verifyImplementation as Mock;

      // First attempt fails, second attempt fails, third succeeds
      mockVerify
        .mockResolvedValueOnce({
          passed: false,
          failures: 2,
          timestamp: new Date().toISOString(),
          testsOutput: 'Test 1 failed\nTest 2 failed',
          buildOutput: 'Build succeeded',
        })
        .mockResolvedValueOnce({
          passed: false,
          failures: 1,
          timestamp: new Date().toISOString(),
          testsOutput: 'Test 1 failed',
          buildOutput: 'Build succeeded',
        })
        .mockResolvedValueOnce({
          passed: true,
          failures: 0,
          timestamp: new Date().toISOString(),
          testsOutput: 'All tests passed',
          buildOutput: 'Build succeeded',
        });

      await runImplementationAgent(storyPath, sdlcRoot, {});

      // Read the story file to verify retry count was NOT incremented during internal iterations
      // Retry counting only happens in runner.ts when REVIEW returns RECOVERY decision
      const updatedStory = parseStory(storyPath);
      expect(updatedStory.frontmatter.implementation_retry_count).toBeUndefined();
    });

    it('should iterate until tests pass without artificial limits', async () => {
      const { verifyImplementation } = await import('../../src/agents/verification.js');
      const mockVerify = verifyImplementation as Mock;

      // Fail 5 times (more than old maxRetries of 3), then succeed on 6th attempt
      mockVerify
        .mockResolvedValueOnce({ passed: false, failures: 1, timestamp: new Date().toISOString(), testsOutput: 'Error 1', buildOutput: '' })
        .mockResolvedValueOnce({ passed: false, failures: 1, timestamp: new Date().toISOString(), testsOutput: 'Error 2', buildOutput: '' })
        .mockResolvedValueOnce({ passed: false, failures: 1, timestamp: new Date().toISOString(), testsOutput: 'Error 3', buildOutput: '' })
        .mockResolvedValueOnce({ passed: false, failures: 1, timestamp: new Date().toISOString(), testsOutput: 'Error 4', buildOutput: '' })
        .mockResolvedValueOnce({ passed: false, failures: 1, timestamp: new Date().toISOString(), testsOutput: 'Error 5', buildOutput: '' })
        .mockResolvedValueOnce({ passed: true, failures: 0, timestamp: new Date().toISOString(), testsOutput: 'All tests passed', buildOutput: '' });

      const result = await runImplementationAgent(storyPath, sdlcRoot, {});

      // Should succeed on attempt 6 (more than old maxRetries would have allowed)
      expect(result.success).toBe(true);
      expect(mockVerify).toHaveBeenCalledTimes(6);

      // No retry count should be set (only set by runner.ts on RECOVERY)
      const updatedStory = parseStory(storyPath);
      expect(updatedStory.frontmatter.implementation_retry_count).toBeUndefined();
    });
  });

  describe('changes array tracking', () => {
    it('should include retry entries in changes array', async () => {
      const { verifyImplementation } = await import('../../src/agents/verification.js');
      const mockVerify = verifyImplementation as Mock;

      // First fails, second succeeds
      mockVerify
        .mockResolvedValueOnce({
          passed: false,
          failures: 2,
          timestamp: new Date().toISOString(),
          testsOutput: 'Test failed',
          buildOutput: 'Build succeeded',
        })
        .mockResolvedValueOnce({
          passed: true,
          failures: 0,
          timestamp: new Date().toISOString(),
          testsOutput: 'All tests passed',
          buildOutput: 'Build succeeded',
        });

      const result = await runImplementationAgent(storyPath, sdlcRoot, {});

      expect(result.success).toBe(true);
      expect(result.changesMade).toContain('Attempt 1: 2 test(s) failing');
    });
  });

  describe('safety mechanisms', () => {
    it('should iterate indefinitely with different errors (no artificial limit)', async () => {
      const { verifyImplementation } = await import('../../src/agents/verification.js');
      const mockVerify = verifyImplementation as Mock;

      // Return DIFFERENT errors each time to avoid triggering identical error detection
      // After 8 different errors, finally succeed
      let verifyCallCount = 0;
      mockVerify.mockImplementation(() => {
        verifyCallCount++;
        if (verifyCallCount >= 8) {
          return Promise.resolve({
            passed: true,
            failures: 0,
            timestamp: new Date().toISOString(),
            testsOutput: 'All tests passed',
            buildOutput: 'Build succeeded',
          });
        }
        return Promise.resolve({
          passed: false,
          failures: verifyCallCount,
          timestamp: new Date().toISOString(),
          testsOutput: `Error ${verifyCallCount}: Test failure with unique message ${Date.now()}`,
          buildOutput: 'Build succeeded',
        });
      });

      // Default beforeEach mock returns different diffs each time

      const result = await runImplementationAgent(storyPath, sdlcRoot, {});

      // Should eventually succeed without being blocked by an artificial max retries limit
      expect(result.success).toBe(true);
      expect(mockVerify).toHaveBeenCalledTimes(8);
    });
  });

  describe('no-change detection', () => {
    it('should exit early when no changes detected between retries', async () => {
      const { verifyImplementation } = await import('../../src/agents/verification.js');
      const mockVerify = verifyImplementation as Mock;

      mockVerify.mockResolvedValue({
        passed: false,
        failures: 1,
        timestamp: new Date().toISOString(),
        testsOutput: 'Test failed',
        buildOutput: 'Build succeeded',
      });

      // Override default mock: Return same diff hash every time (no changes)
      mockSpawnSync.mockImplementation((cmd: string, args?: string[]) => {
        if (cmd === 'git' && args?.[0] === 'diff') {
          return { status: 0, stdout: 'same diff content', stderr: '', output: [], pid: 1, signal: null };
        }
        return { status: 0, stdout: '', stderr: '', output: [], pid: 1, signal: null };
      });

      const result = await runImplementationAgent(storyPath, sdlcRoot, {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('No progress detected');

      // Retry count should NOT be set (only set by runner.ts on RECOVERY)
      const story = parseStory(storyPath);
      expect(story.frontmatter.implementation_retry_count).toBeUndefined();

      // Should exit after detecting no changes (may be 1 or 2 calls depending on when detection happens)
      expect(mockVerify).toHaveBeenCalled();
    });
  });

  describe('identical error detection', () => {
    it('should block early when same error occurs 3 consecutive times', async () => {
      const { verifyImplementation } = await import('../../src/agents/verification.js');
      const mockVerify = verifyImplementation as Mock;

      // Return the SAME error every time to trigger identical error detection
      const sameError = 'TypeError: Cannot find module ./missing-mock';
      mockVerify.mockResolvedValue({
        passed: false,
        failures: 1,
        timestamp: new Date().toISOString(),
        testsOutput: sameError,
        buildOutput: 'Build succeeded',
      });

      const result = await runImplementationAgent(storyPath, sdlcRoot, {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('Identical error');
      expect(result.error).toContain('consecutive');
      expect(result.error).toContain('stuck retry loop');

      // Verify error history was populated
      const story = parseStory(storyPath);
      expect(story.frontmatter.error_history).toBeDefined();
      expect(story.frontmatter.error_history!.length).toBeGreaterThan(0);

      // Should block at 3 consecutive identical errors (threshold)
      const lastError = story.frontmatter.error_history![story.frontmatter.error_history!.length - 1];
      expect(lastError.consecutiveCount).toBeGreaterThanOrEqual(3);
    });
  });

  describe('per-story config overrides', () => {
    it('should still calculate effective max retries for retry prompt context', async () => {
      // Update story with per-story override
      const storyContent = fs.readFileSync(storyPath, 'utf-8');
      const updatedContent = storyContent.replace(
        'implementation_complete: false',
        'implementation_complete: false\nmax_implementation_retries: 5'
      );
      fs.writeFileSync(storyPath, updatedContent);

      const story = parseStory(storyPath);
      const config = loadConfig(tempDir);

      // The effective max is still calculated for retry prompt context
      const { getEffectiveMaxImplementationRetries } = await import('../../src/core/story.js');
      const effectiveMax = getEffectiveMaxImplementationRetries(story, config);

      // Should use per-story override (5)
      expect(effectiveMax).toBe(5);
    });

    it('should cap per-story override at maxRetriesUpperBound', async () => {
      // Update story with override exceeding upper bound
      const storyContent = fs.readFileSync(storyPath, 'utf-8');
      const updatedContent = storyContent.replace(
        'implementation_complete: false',
        'implementation_complete: false\nmax_implementation_retries: 15'
      );
      fs.writeFileSync(storyPath, updatedContent);

      const story = parseStory(storyPath);
      const config = loadConfig(tempDir);

      // The effective max should be capped at 10 (maxRetriesUpperBound)
      const { getEffectiveMaxImplementationRetries } = await import('../../src/core/story.js');
      const effectiveMax = getEffectiveMaxImplementationRetries(story, config);

      // Should be capped at upper bound
      expect(effectiveMax).toBeLessThanOrEqual(10);
    });
  });
});
