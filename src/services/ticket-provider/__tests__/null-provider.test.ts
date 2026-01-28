import { describe, it, expect } from 'vitest';
import { NullTicketProvider } from '../null-provider.js';

describe('NullTicketProvider', () => {
  const provider = new NullTicketProvider();

  describe('name property', () => {
    it('should return "none"', () => {
      expect(provider.name).toBe('none');
    });
  });

  describe('list()', () => {
    it('should return empty array', async () => {
      const result = await provider.list();
      expect(result).toEqual([]);
      expect(Array.isArray(result)).toBe(true);
    });

    it('should return empty array with filter', async () => {
      const result = await provider.list({ status: ['open'], labels: ['bug'] });
      expect(result).toEqual([]);
    });
  });

  describe('get()', () => {
    it('should throw "No ticket provider configured" error', async () => {
      await expect(provider.get('123')).rejects.toThrow('No ticket provider configured');
    });

    it('should throw error for any ticket ID', async () => {
      await expect(provider.get('any-id')).rejects.toThrow('No ticket provider configured');
      await expect(provider.get('')).rejects.toThrow('No ticket provider configured');
    });
  });

  describe('create()', () => {
    it('should throw "No ticket provider configured" error', async () => {
      await expect(
        provider.create({ title: 'Test', description: 'Test description' })
      ).rejects.toThrow('No ticket provider configured');
    });

    it('should throw error for any ticket data', async () => {
      await expect(
        provider.create({
          title: 'Bug fix',
          description: 'Fix the bug',
          labels: ['bug'],
          priority: 1,
        })
      ).rejects.toThrow('No ticket provider configured');
    });
  });

  describe('updateStatus()', () => {
    it('should complete without error (no-op)', async () => {
      await expect(provider.updateStatus('123', 'closed')).resolves.toBeUndefined();
    });

    it('should not throw for any status value', async () => {
      await expect(provider.updateStatus('123', 'open')).resolves.toBeUndefined();
      await expect(provider.updateStatus('456', 'in-progress')).resolves.toBeUndefined();
      await expect(provider.updateStatus('789', 'done')).resolves.toBeUndefined();
    });
  });

  describe('addComment()', () => {
    it('should complete without error (no-op)', async () => {
      await expect(provider.addComment('123', 'Test comment')).resolves.toBeUndefined();
    });

    it('should not throw for any comment body', async () => {
      await expect(provider.addComment('123', '')).resolves.toBeUndefined();
      await expect(provider.addComment('123', 'Long comment with **markdown**')).resolves.toBeUndefined();
    });
  });

  describe('linkPR()', () => {
    it('should complete without error (no-op)', async () => {
      await expect(provider.linkPR('123', 'https://github.com/owner/repo/pull/1')).resolves.toBeUndefined();
    });

    it('should not throw for any PR URL', async () => {
      await expect(provider.linkPR('123', '')).resolves.toBeUndefined();
      await expect(provider.linkPR('456', 'https://github.com/owner/repo/pull/999')).resolves.toBeUndefined();
    });
  });

  describe('mapStatusToExternal()', () => {
    it('should return input unchanged for all story statuses', () => {
      expect(provider.mapStatusToExternal('backlog')).toBe('backlog');
      expect(provider.mapStatusToExternal('ready')).toBe('ready');
      expect(provider.mapStatusToExternal('in-progress')).toBe('in-progress');
      expect(provider.mapStatusToExternal('done')).toBe('done');
      expect(provider.mapStatusToExternal('blocked')).toBe('blocked');
    });
  });

  describe('mapStatusFromExternal()', () => {
    it('should return input unchanged for valid story statuses', () => {
      expect(provider.mapStatusFromExternal('backlog')).toBe('backlog');
      expect(provider.mapStatusFromExternal('ready')).toBe('ready');
      expect(provider.mapStatusFromExternal('in-progress')).toBe('in-progress');
      expect(provider.mapStatusFromExternal('done')).toBe('done');
      expect(provider.mapStatusFromExternal('blocked')).toBe('blocked');
    });

    it('should cast any string to StoryStatus (no validation)', () => {
      // NullProvider doesn't validate - it's a pass-through
      expect(provider.mapStatusFromExternal('custom-status')).toBe('custom-status');
      expect(provider.mapStatusFromExternal('open')).toBe('open');
    });
  });

  describe('syncPriority()', () => {
    it('should return null (no external priority to sync)', async () => {
      const result = await provider.syncPriority('123');
      expect(result).toBeNull();
    });

    it('should not throw for any ticket ID', async () => {
      await expect(provider.syncPriority('')).resolves.toBeNull();
      await expect(provider.syncPriority('any-id')).resolves.toBeNull();
      await expect(provider.syncPriority('999')).resolves.toBeNull();
    });
  });
});
