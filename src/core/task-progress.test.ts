/**
 * Unit tests for task progress tracking
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  parseProgressTable,
  generateProgressTable,
  readStoryFile,
  writeStoryFile,
  getTaskProgress,
  initializeTaskProgress,
  updateTaskProgress,
  getPendingTasks,
  getCurrentTask,
} from './task-progress.js';
import { TaskProgress, TaskStatus } from '../types/index.js';

// Mock fs and write-file-atomic
vi.mock('fs', () => ({
  default: {
    promises: {
      readFile: vi.fn(),
      writeFile: vi.fn(),
      mkdir: vi.fn(),
    },
  },
}));

vi.mock('write-file-atomic', () => ({
  default: vi.fn(),
}));

// Import mocked modules
import fs from 'fs';
import writeFileAtomic from 'write-file-atomic';

describe('task-progress', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('parseProgressTable', () => {
    it('should parse valid progress table', () => {
      const content = `
# Story Title

## Task Progress

| Task | Status | Started | Completed |
|------|--------|---------|-----------|
| T1 | completed | 2026-01-16T10:00:00Z | 2026-01-16T10:05:00Z |
| T2 | in_progress | 2026-01-16T10:05:30Z | - |
| T3 | pending | - | - |

## Next Section
`;

      const result = parseProgressTable(content);

      expect(result).toEqual([
        {
          taskId: 'T1',
          status: 'completed',
          startedAt: '2026-01-16T10:00:00Z',
          completedAt: '2026-01-16T10:05:00Z',
        },
        {
          taskId: 'T2',
          status: 'in_progress',
          startedAt: '2026-01-16T10:05:30Z',
        },
        {
          taskId: 'T3',
          status: 'pending',
        },
      ]);
    });

    it('should return empty array when section is missing', () => {
      const content = `
# Story Title

## Some Other Section
Content here
`;

      const result = parseProgressTable(content);
      expect(result).toEqual([]);
    });

    it('should handle all status types', () => {
      const content = `
## Task Progress

| Task | Status | Started | Completed |
|------|--------|---------|-----------|
| T1 | pending | - | - |
| T2 | in_progress | 2026-01-16T10:00:00Z | - |
| T3 | completed | 2026-01-16T10:00:00Z | 2026-01-16T10:05:00Z |
| T4 | failed | 2026-01-16T10:00:00Z | 2026-01-16T10:03:00Z |
`;

      const result = parseProgressTable(content);

      expect(result).toHaveLength(4);
      expect(result[0].status).toBe('pending');
      expect(result[1].status).toBe('in_progress');
      expect(result[2].status).toBe('completed');
      expect(result[3].status).toBe('failed');
    });

    it('should skip malformed table rows', () => {
      const content = `
## Task Progress

| Task | Status | Started | Completed |
|------|--------|---------|-----------|
| T1 | completed | 2026-01-16T10:00:00Z | 2026-01-16T10:05:00Z |
| T2 | invalid_status | 2026-01-16T10:05:30Z | - |
| T3 | pending | - | - |
`;

      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = parseProgressTable(content);

      expect(result).toHaveLength(2);
      expect(result[0].taskId).toBe('T1');
      expect(result[1].taskId).toBe('T3');
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Invalid status 'invalid_status'")
      );

      consoleWarnSpy.mockRestore();
    });

    it('should handle missing timestamps', () => {
      const content = `
## Task Progress

| Task | Status | Started | Completed |
|------|--------|---------|-----------|
| T1 | pending | - | - |
`;

      const result = parseProgressTable(content);

      expect(result).toEqual([
        {
          taskId: 'T1',
          status: 'pending',
        },
      ]);
      expect(result[0].startedAt).toBeUndefined();
      expect(result[0].completedAt).toBeUndefined();
    });

    it('should warn on corrupted table with no valid rows', () => {
      const content = `
## Task Progress

| Task | Status | Started | Completed |
|------|--------|---------|-----------|
| Invalid | Row |
`;

      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = parseProgressTable(content);

      expect(result).toEqual([]);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Found progress table but no valid task rows')
      );

      consoleWarnSpy.mockRestore();
    });
  });

  describe('generateProgressTable', () => {
    it('should generate valid markdown table', () => {
      const progress: TaskProgress[] = [
        {
          taskId: 'T1',
          status: 'completed',
          startedAt: '2026-01-16T10:00:00Z',
          completedAt: '2026-01-16T10:05:00Z',
        },
        {
          taskId: 'T2',
          status: 'in_progress',
          startedAt: '2026-01-16T10:05:30Z',
        },
        {
          taskId: 'T3',
          status: 'pending',
        },
      ];

      const result = generateProgressTable(progress);

      expect(result).toContain('| Task | Status | Started | Completed |');
      expect(result).toContain('|------|--------|---------|-----------|');
      expect(result).toContain('| T1 | completed | 2026-01-16T10:00:00Z | 2026-01-16T10:05:00Z |');
      expect(result).toContain('| T2 | in_progress | 2026-01-16T10:05:30Z | - |');
      expect(result).toContain('| T3 | pending | - | - |');
    });

    it('should use "-" for missing timestamps', () => {
      const progress: TaskProgress[] = [
        {
          taskId: 'T1',
          status: 'pending',
        },
      ];

      const result = generateProgressTable(progress);

      expect(result).toContain('| T1 | pending | - | - |');
    });
  });

  describe('readStoryFile', () => {
    it('should read file content successfully', async () => {
      const mockContent = '# Story\n\nContent here';
      vi.mocked(fs.promises.readFile).mockResolvedValue(mockContent);

      const result = await readStoryFile('/path/to/story.md');

      expect(result).toBe(mockContent);
      expect(fs.promises.readFile).toHaveBeenCalledWith('/path/to/story.md', 'utf-8');
    });

    it('should throw descriptive error on ENOENT', async () => {
      const error: any = new Error('File not found');
      error.code = 'ENOENT';
      vi.mocked(fs.promises.readFile).mockRejectedValue(error);

      await expect(readStoryFile('/path/to/story.md')).rejects.toThrow(
        'Story file not found: story.md'
      );
    });

    it('should throw descriptive error on EACCES', async () => {
      const error: any = new Error('Permission denied');
      error.code = 'EACCES';
      vi.mocked(fs.promises.readFile).mockRejectedValue(error);

      await expect(readStoryFile('/path/to/story.md')).rejects.toThrow(
        'Permission denied reading story file: story.md'
      );
    });

    it('should throw descriptive error on EPERM', async () => {
      const error: any = new Error('Operation not permitted');
      error.code = 'EPERM';
      vi.mocked(fs.promises.readFile).mockRejectedValue(error);

      await expect(readStoryFile('/path/to/story.md')).rejects.toThrow(
        'Permission denied reading story file: story.md'
      );
    });
  });

  describe('writeStoryFile', () => {
    it('should write file atomically', async () => {
      vi.mocked(fs.promises.mkdir).mockResolvedValue(undefined);
      vi.mocked(writeFileAtomic).mockResolvedValue(undefined);

      await writeStoryFile('/path/to/story.md', 'New content');

      expect(fs.promises.mkdir).toHaveBeenCalledWith('/path/to', { recursive: true });
      expect(writeFileAtomic).toHaveBeenCalledWith(
        '/path/to/story.md',
        'New content',
        { encoding: 'utf-8' }
      );
    });

    it('should retry on transient errors', async () => {
      // Use real timers for this test as retry logic uses setTimeout
      vi.useRealTimers();

      vi.mocked(fs.promises.mkdir).mockResolvedValue(undefined);

      // Fail twice, succeed on third attempt
      vi.mocked(writeFileAtomic)
        .mockRejectedValueOnce(new Error('Temporary error'))
        .mockRejectedValueOnce(new Error('Temporary error'))
        .mockResolvedValueOnce(undefined);

      await writeStoryFile('/path/to/story.md', 'Content');

      expect(writeFileAtomic).toHaveBeenCalledTimes(3);

      // Restore fake timers for subsequent tests
      vi.useFakeTimers();
    });

    it('should not retry on permission errors', async () => {
      // Use real timers for this test since permission errors should throw immediately
      vi.useRealTimers();

      vi.mocked(fs.promises.mkdir).mockResolvedValue(undefined);

      const error: any = new Error('Permission denied');
      error.code = 'EACCES';
      vi.mocked(writeFileAtomic).mockRejectedValue(error);

      await expect(writeStoryFile('/path/to/story.md', 'Content')).rejects.toThrow(
        'Permission denied writing story file: story.md'
      );

      expect(writeFileAtomic).toHaveBeenCalledTimes(1); // No retry

      // Restore fake timers for subsequent tests
      vi.useFakeTimers();
    });

    it('should fail after 3 retry attempts', async () => {
      // Use real timers for this test as retry logic uses setTimeout
      vi.useRealTimers();

      vi.mocked(fs.promises.mkdir).mockResolvedValue(undefined);
      vi.mocked(writeFileAtomic).mockRejectedValue(new Error('Persistent error'));

      await expect(writeStoryFile('/path/to/story.md', 'Content')).rejects.toThrow(
        'Failed to write story file after 3 attempts'
      );

      expect(writeFileAtomic).toHaveBeenCalledTimes(3);

      // Restore fake timers for subsequent tests
      vi.useFakeTimers();
    });
  });

  describe('initializeTaskProgress', () => {
    it('should create progress section with all tasks pending', async () => {
      const mockContent = '# Story Title\n\n## Implementation Plan\n\nContent here';
      vi.mocked(fs.promises.readFile).mockResolvedValue(mockContent);
      vi.mocked(fs.promises.mkdir).mockResolvedValue(undefined);
      vi.mocked(writeFileAtomic).mockResolvedValue(undefined);

      await initializeTaskProgress('/path/to/story.md', ['T1', 'T2', 'T3']);

      expect(writeFileAtomic).toHaveBeenCalledWith(
        '/path/to/story.md',
        expect.stringContaining('## Task Progress'),
        { encoding: 'utf-8' }
      );

      const writtenContent = vi.mocked(writeFileAtomic).mock.calls[0][1] as string;
      expect(writtenContent).toContain('| T1 | pending | - | - |');
      expect(writtenContent).toContain('| T2 | pending | - | - |');
      expect(writtenContent).toContain('| T3 | pending | - | - |');
    });

    it('should skip initialization if section already exists', async () => {
      const mockContent = `
# Story Title

## Task Progress

| Task | Status | Started | Completed |
|------|--------|---------|-----------|
| T1 | pending | - | - |
`;
      vi.mocked(fs.promises.readFile).mockResolvedValue(mockContent);

      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await initializeTaskProgress('/path/to/story.md', ['T1', 'T2']);

      expect(writeFileAtomic).not.toHaveBeenCalled();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Progress section already exists')
      );

      consoleWarnSpy.mockRestore();
    });
  });

  describe('updateTaskProgress', () => {
    beforeEach(() => {
      vi.setSystemTime(new Date('2026-01-16T12:00:00Z'));
    });

    it('should update task status and set startedAt for in_progress', async () => {
      const mockContent = `
# Story

## Task Progress

| Task | Status | Started | Completed |
|------|--------|---------|-----------|
| T1 | pending | - | - |
| T2 | pending | - | - |

## Next Section
`;
      vi.mocked(fs.promises.readFile).mockResolvedValue(mockContent);
      vi.mocked(fs.promises.mkdir).mockResolvedValue(undefined);
      vi.mocked(writeFileAtomic).mockResolvedValue(undefined);

      await updateTaskProgress('/path/to/story.md', 'T1', 'in_progress');

      const writtenContent = vi.mocked(writeFileAtomic).mock.calls[0][1] as string;
      expect(writtenContent).toContain('| T1 | in_progress | 2026-01-16T12:00:00.000Z | - |');
      expect(writtenContent).toContain('| T2 | pending | - | - |');
    });

    it('should set completedAt for completed status', async () => {
      const mockContent = `
## Task Progress

| Task | Status | Started | Completed |
|------|--------|---------|-----------|
| T1 | in_progress | 2026-01-16T10:00:00Z | - |
`;
      vi.mocked(fs.promises.readFile).mockResolvedValue(mockContent);
      vi.mocked(fs.promises.mkdir).mockResolvedValue(undefined);
      vi.mocked(writeFileAtomic).mockResolvedValue(undefined);

      await updateTaskProgress('/path/to/story.md', 'T1', 'completed');

      const writtenContent = vi.mocked(writeFileAtomic).mock.calls[0][1] as string;
      expect(writtenContent).toContain('| T1 | completed | 2026-01-16T10:00:00Z | 2026-01-16T12:00:00.000Z |');
    });

    it('should set completedAt for failed status', async () => {
      const mockContent = `
## Task Progress

| Task | Status | Started | Completed |
|------|--------|---------|-----------|
| T1 | in_progress | 2026-01-16T10:00:00Z | - |
`;
      vi.mocked(fs.promises.readFile).mockResolvedValue(mockContent);
      vi.mocked(fs.promises.mkdir).mockResolvedValue(undefined);
      vi.mocked(writeFileAtomic).mockResolvedValue(undefined);

      await updateTaskProgress('/path/to/story.md', 'T1', 'failed', 'Test error');

      const writtenContent = vi.mocked(writeFileAtomic).mock.calls[0][1] as string;
      expect(writtenContent).toContain('| T1 | failed | 2026-01-16T10:00:00Z | 2026-01-16T12:00:00.000Z |');
    });

    it('should not overwrite existing startedAt', async () => {
      const mockContent = `
## Task Progress

| Task | Status | Started | Completed |
|------|--------|---------|-----------|
| T1 | in_progress | 2026-01-16T10:00:00Z | - |
`;
      vi.mocked(fs.promises.readFile).mockResolvedValue(mockContent);
      vi.mocked(fs.promises.mkdir).mockResolvedValue(undefined);
      vi.mocked(writeFileAtomic).mockResolvedValue(undefined);

      await updateTaskProgress('/path/to/story.md', 'T1', 'in_progress');

      const writtenContent = vi.mocked(writeFileAtomic).mock.calls[0][1] as string;
      expect(writtenContent).toContain('| T1 | in_progress | 2026-01-16T10:00:00Z | - |');
      expect(writtenContent).not.toContain('2026-01-16T12:00:00.000Z');
    });

    it('should preserve other tasks when updating one task', async () => {
      const mockContent = `
## Task Progress

| Task | Status | Started | Completed |
|------|--------|---------|-----------|
| T1 | pending | - | - |
| T2 | completed | 2026-01-16T10:00:00Z | 2026-01-16T10:05:00Z |
| T3 | pending | - | - |
`;
      vi.mocked(fs.promises.readFile).mockResolvedValue(mockContent);
      vi.mocked(fs.promises.mkdir).mockResolvedValue(undefined);
      vi.mocked(writeFileAtomic).mockResolvedValue(undefined);

      await updateTaskProgress('/path/to/story.md', 'T1', 'in_progress');

      const writtenContent = vi.mocked(writeFileAtomic).mock.calls[0][1] as string;
      expect(writtenContent).toContain('| T1 | in_progress | 2026-01-16T12:00:00.000Z | - |');
      expect(writtenContent).toContain('| T2 | completed | 2026-01-16T10:00:00Z | 2026-01-16T10:05:00Z |');
      expect(writtenContent).toContain('| T3 | pending | - | - |');
    });

    it('should throw error if task not found', async () => {
      const mockContent = `
## Task Progress

| Task | Status | Started | Completed |
|------|--------|---------|-----------|
| T1 | pending | - | - |
`;
      vi.mocked(fs.promises.readFile).mockResolvedValue(mockContent);

      await expect(updateTaskProgress('/path/to/story.md', 'T999', 'in_progress')).rejects.toThrow(
        'Task T999 not found in progress table'
      );
    });

    it('should preserve content after progress section', async () => {
      const mockContent = `
# Story

## Task Progress

| Task | Status | Started | Completed |
|------|--------|---------|-----------|
| T1 | pending | - | - |

## Next Section

Important content here
`;
      vi.mocked(fs.promises.readFile).mockResolvedValue(mockContent);
      vi.mocked(fs.promises.mkdir).mockResolvedValue(undefined);
      vi.mocked(writeFileAtomic).mockResolvedValue(undefined);

      await updateTaskProgress('/path/to/story.md', 'T1', 'in_progress');

      const writtenContent = vi.mocked(writeFileAtomic).mock.calls[0][1] as string;
      expect(writtenContent).toContain('## Next Section');
      expect(writtenContent).toContain('Important content here');
    });
  });

  describe('getPendingTasks', () => {
    it('should return task IDs with pending status', async () => {
      const mockContent = `
## Task Progress

| Task | Status | Started | Completed |
|------|--------|---------|-----------|
| T1 | completed | 2026-01-16T10:00:00Z | 2026-01-16T10:05:00Z |
| T2 | pending | - | - |
| T3 | in_progress | 2026-01-16T10:05:30Z | - |
| T4 | pending | - | - |
`;
      vi.mocked(fs.promises.readFile).mockResolvedValue(mockContent);

      const result = await getPendingTasks('/path/to/story.md');

      expect(result).toEqual(['T2', 'T4']);
    });

    it('should return empty array when no pending tasks', async () => {
      const mockContent = `
## Task Progress

| Task | Status | Started | Completed |
|------|--------|---------|-----------|
| T1 | completed | 2026-01-16T10:00:00Z | 2026-01-16T10:05:00Z |
| T2 | completed | 2026-01-16T10:00:00Z | 2026-01-16T10:05:00Z |
`;
      vi.mocked(fs.promises.readFile).mockResolvedValue(mockContent);

      const result = await getPendingTasks('/path/to/story.md');

      expect(result).toEqual([]);
    });
  });

  describe('getCurrentTask', () => {
    it('should return task ID with in_progress status', async () => {
      const mockContent = `
## Task Progress

| Task | Status | Started | Completed |
|------|--------|---------|-----------|
| T1 | completed | 2026-01-16T10:00:00Z | 2026-01-16T10:05:00Z |
| T2 | in_progress | 2026-01-16T10:05:30Z | - |
| T3 | pending | - | - |
`;
      vi.mocked(fs.promises.readFile).mockResolvedValue(mockContent);

      const result = await getCurrentTask('/path/to/story.md');

      expect(result).toBe('T2');
    });

    it('should return null when no task is in progress', async () => {
      const mockContent = `
## Task Progress

| Task | Status | Started | Completed |
|------|--------|---------|-----------|
| T1 | completed | 2026-01-16T10:00:00Z | 2026-01-16T10:05:00Z |
| T2 | pending | - | - |
`;
      vi.mocked(fs.promises.readFile).mockResolvedValue(mockContent);

      const result = await getCurrentTask('/path/to/story.md');

      expect(result).toBeNull();
    });

    it('should return first task if multiple are in progress', async () => {
      const mockContent = `
## Task Progress

| Task | Status | Started | Completed |
|------|--------|---------|-----------|
| T1 | in_progress | 2026-01-16T10:00:00Z | - |
| T2 | in_progress | 2026-01-16T10:05:30Z | - |
`;
      vi.mocked(fs.promises.readFile).mockResolvedValue(mockContent);

      const result = await getCurrentTask('/path/to/story.md');

      expect(result).toBe('T1');
    });
  });

  describe('getTaskProgress', () => {
    it('should return all task progress entries', async () => {
      const mockContent = `
## Task Progress

| Task | Status | Started | Completed |
|------|--------|---------|-----------|
| T1 | completed | 2026-01-16T10:00:00Z | 2026-01-16T10:05:00Z |
| T2 | in_progress | 2026-01-16T10:05:30Z | - |
`;
      vi.mocked(fs.promises.readFile).mockResolvedValue(mockContent);

      const result = await getTaskProgress('/path/to/story.md');

      expect(result).toHaveLength(2);
      expect(result[0].taskId).toBe('T1');
      expect(result[1].taskId).toBe('T2');
    });

    it('should return empty array when section is missing', async () => {
      const mockContent = '# Story\n\nNo progress section';
      vi.mocked(fs.promises.readFile).mockResolvedValue(mockContent);

      const result = await getTaskProgress('/path/to/story.md');

      expect(result).toEqual([]);
    });
  });
});
