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

  describe('retry count persistence to frontmatter', () => {
    it('should increment implementation_retry_count on each failed attempt', async () => {
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

      // Read the story file to verify retry count was tracked
      const updatedStory = parseStory(storyPath);
      // After verification passes, retry count should persist (not be reset)
      // It will only be reset by review agent on APPROVED decision
      expect(updatedStory.frontmatter.implementation_retry_count).toBe(2);
    });

    it('should preserve retry count in frontmatter after max retries exhausted', async () => {
      const { verifyImplementation } = await import('../../src/agents/verification.js');
      const mockVerify = verifyImplementation as Mock;

      // All attempts fail
      mockVerify.mockResolvedValue({
        passed: false,
        failures: 1,
        timestamp: new Date().toISOString(),
        testsOutput: 'Test failed',
        buildOutput: 'Build succeeded',
      });

      // Default beforeEach mock returns different diffs each time, avoiding no-change detection

      const result = await runImplementationAgent(storyPath, sdlcRoot, {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('Implementation blocked');

      // Verify retry count was incremented
      const updatedStory = parseStory(storyPath);
      expect(updatedStory.frontmatter.implementation_retry_count).toBeGreaterThan(0);
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

  describe('max retries exhausted scenario', () => {
    it('should return error with attempt summary when all retries fail', async () => {
      const { verifyImplementation } = await import('../../src/agents/verification.js');
      const mockVerify = verifyImplementation as Mock;

      mockVerify.mockResolvedValue({
        passed: false,
        failures: 3,
        timestamp: new Date().toISOString(),
        testsOutput: 'TypeError: Cannot read property',
        buildOutput: 'Build succeeded',
      });

      // Default beforeEach mock returns different diffs each time

      const result = await runImplementationAgent(storyPath, sdlcRoot, {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('Implementation blocked');
      expect(result.error).toContain('attempts');
      // Should include test output snippet
      expect(result.error).toContain('test');
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

      // Verify retry count was tracked before early exit
      const story = parseStory(storyPath);
      expect(story.frontmatter.implementation_retry_count).toBeGreaterThanOrEqual(1);

      // Should exit after detecting no changes (may be 1 or 2 calls depending on when detection happens)
      expect(mockVerify).toHaveBeenCalled();
    });
  });

  describe('per-story config overrides', () => {
    it('should respect per-story max_implementation_retries', async () => {
      // Update story with per-story override
      const storyContent = fs.readFileSync(storyPath, 'utf-8');
      const updatedContent = storyContent.replace(
        'implementation_complete: false',
        'implementation_complete: false\nmax_implementation_retries: 1'
      );
      fs.writeFileSync(storyPath, updatedContent);

      const { verifyImplementation } = await import('../../src/agents/verification.js');
      const mockVerify = verifyImplementation as Mock;

      mockVerify.mockResolvedValue({
        passed: false,
        failures: 1,
        timestamp: new Date().toISOString(),
        testsOutput: 'Test failed',
        buildOutput: 'Build succeeded',
      });

      // Default beforeEach mock returns different diffs each time

      const result = await runImplementationAgent(storyPath, sdlcRoot, {});

      expect(result.success).toBe(false);
      // With max_implementation_retries: 1, should only do 2 attempts (1 + 1 retry)
      expect(mockVerify).toHaveBeenCalledTimes(2);
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
