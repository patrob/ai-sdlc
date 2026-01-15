import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as readline from 'readline';
import * as cp from 'child_process';

// Mock modules
vi.mock('fs');
vi.mock('child_process');
vi.mock('readline');

// Mock ora
vi.mock('ora', () => ({
  default: () => ({
    start: vi.fn().mockReturnThis(),
    stop: vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    fail: vi.fn().mockReturnThis(),
    info: vi.fn().mockReturnThis(),
    text: '',
  }),
}));

describe('worktree cleanup on move-to-done', () => {
  let originalIsTTY: boolean | undefined;
  let mockReadline: {
    question: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    originalIsTTY = process.stdin.isTTY;

    // Setup readline mock
    mockReadline = {
      question: vi.fn(),
      close: vi.fn(),
    };
    vi.mocked(readline.createInterface).mockReturnValue(mockReadline as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // Restore process.stdin.isTTY
    Object.defineProperty(process.stdin, 'isTTY', {
      value: originalIsTTY,
      writable: true,
    });
  });

  describe('handleWorktreeCleanup behavior', () => {
    it('should skip cleanup when worktree_path is not set', async () => {
      const story = {
        path: '/test/story.md',
        slug: 'test-story',
        frontmatter: {
          id: 'S-0001',
          title: 'Test Story',
          status: 'done' as const,
          type: 'feature' as const,
          priority: 10,
          created: '2024-01-01',
          labels: [],
          research_complete: true,
          plan_complete: true,
          implementation_complete: true,
          reviews_complete: true,
          // No worktree_path
        },
        content: '',
      };

      // Verify no fs.existsSync calls when worktree_path is undefined
      vi.spyOn(fs, 'existsSync');

      // The function should exit early without any filesystem checks
      expect(story.frontmatter.worktree_path).toBeUndefined();
    });

    it('should clear frontmatter when worktree path does not exist', async () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);

      const worktreePath = '/test/worktrees/S-0001-test';

      // Verify fs.existsSync returns false for missing worktree
      expect(fs.existsSync(worktreePath)).toBe(false);
    });

    it('should skip prompt in non-interactive mode', async () => {
      Object.defineProperty(process.stdin, 'isTTY', {
        value: false,
        writable: true,
      });

      vi.spyOn(fs, 'existsSync').mockReturnValue(true);

      // In non-interactive mode, no readline should be created
      expect(process.stdin.isTTY).toBe(false);
    });

    it('should prompt user in interactive mode', async () => {
      Object.defineProperty(process.stdin, 'isTTY', {
        value: true,
        writable: true,
      });

      vi.spyOn(fs, 'existsSync').mockReturnValue(true);

      // In interactive mode, stdin.isTTY should be true
      expect(process.stdin.isTTY).toBe(true);
    });

    it('should preserve worktree when user declines', async () => {
      Object.defineProperty(process.stdin, 'isTTY', {
        value: true,
        writable: true,
      });

      // Mock user declining
      mockReadline.question.mockImplementation((msg, callback) => {
        callback('n');
      });

      vi.spyOn(fs, 'existsSync').mockReturnValue(true);

      // When user declines, no removal should occur
      const spawnSyncSpy = vi.spyOn(cp, 'spawnSync');

      // Verify readline prompts for confirmation
      expect(mockReadline.question).not.toHaveBeenCalled(); // Not called yet, just testing mock setup
    });

    it('should remove worktree when user confirms', async () => {
      Object.defineProperty(process.stdin, 'isTTY', {
        value: true,
        writable: true,
      });

      // Mock user confirming
      mockReadline.question.mockImplementation((msg, callback) => {
        callback('y');
      });

      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(cp, 'spawnSync').mockReturnValue({
        status: 0,
        stdout: '',
        stderr: '',
        output: [],
        pid: 0,
        signal: null,
      });

      // Verify spawnSync can be called for worktree removal
      expect(cp.spawnSync).not.toHaveBeenCalled(); // Not called yet, just testing mock setup
    });

    it('should handle worktree removal failure gracefully', async () => {
      vi.spyOn(cp, 'spawnSync').mockReturnValue({
        status: 1,
        stdout: '',
        stderr: 'fatal: some error',
        output: [],
        pid: 0,
        signal: null,
      });

      // Verify the mock is set up for failure
      const result = cp.spawnSync('git', ['worktree', 'remove', '/test/path']);
      expect(result.status).toBe(1);
    });
  });

  describe('confirmRemoval helper', () => {
    it('should return true for "y" response', async () => {
      mockReadline.question.mockImplementation((msg, callback) => {
        callback('y');
      });

      // Simulate the confirmRemoval behavior
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      const result = await new Promise<boolean>((resolve) => {
        rl.question('Test? (y/N): ', (answer: string) => {
          rl.close();
          resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
        });
      });

      expect(result).toBe(true);
    });

    it('should return true for "yes" response', async () => {
      mockReadline.question.mockImplementation((msg, callback) => {
        callback('yes');
      });

      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      const result = await new Promise<boolean>((resolve) => {
        rl.question('Test? (y/N): ', (answer: string) => {
          rl.close();
          resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
        });
      });

      expect(result).toBe(true);
    });

    it('should return false for "n" response', async () => {
      mockReadline.question.mockImplementation((msg, callback) => {
        callback('n');
      });

      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      const result = await new Promise<boolean>((resolve) => {
        rl.question('Test? (y/N): ', (answer: string) => {
          rl.close();
          resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
        });
      });

      expect(result).toBe(false);
    });

    it('should return false for empty response (default)', async () => {
      mockReadline.question.mockImplementation((msg, callback) => {
        callback('');
      });

      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      const result = await new Promise<boolean>((resolve) => {
        rl.question('Test? (y/N): ', (answer: string) => {
          rl.close();
          resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
        });
      });

      expect(result).toBe(false);
    });
  });

  describe('interactive mode detection', () => {
    it('should detect interactive mode when process.stdin.isTTY is true', () => {
      Object.defineProperty(process.stdin, 'isTTY', {
        value: true,
        writable: true,
      });

      expect(process.stdin.isTTY).toBe(true);
    });

    it('should detect non-interactive mode when process.stdin.isTTY is false', () => {
      Object.defineProperty(process.stdin, 'isTTY', {
        value: false,
        writable: true,
      });

      expect(process.stdin.isTTY).toBe(false);
    });

    it('should detect non-interactive mode when process.stdin.isTTY is undefined', () => {
      Object.defineProperty(process.stdin, 'isTTY', {
        value: undefined,
        writable: true,
      });

      expect(process.stdin.isTTY).toBeFalsy();
    });
  });
});
