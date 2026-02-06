import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    default: {
      ...actual,
      appendFileSync: vi.fn(),
      existsSync: vi.fn().mockReturnValue(true),
      mkdirSync: vi.fn(),
    },
    appendFileSync: vi.fn(),
    existsSync: vi.fn().mockReturnValue(true),
    mkdirSync: vi.fn(),
  };
});

import * as fs from 'fs';
import {
  ConsoleNotificationChannel,
  FileNotificationChannel,
  NotificationService,
  validateNotificationConfig,
  getNotificationService,
  initNotificationService,
  resetNotificationService,
  Notification,
} from './notification.js';

describe('ConsoleNotificationChannel', () => {
  it('prints action-required notifications with prefix', () => {
    const channel = new ConsoleNotificationChannel();
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const notification: Notification = {
      type: 'approval_required',
      storyId: 'S-001',
      title: 'Plan Review',
      message: 'Please review the plan',
      timestamp: '2026-01-01T00:00:00Z',
      actionRequired: true,
    };

    channel.send(notification);

    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('[ACTION REQUIRED]')
    );
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('S-001')
    );

    spy.mockRestore();
  });

  it('prints info notifications without action prefix', () => {
    const channel = new ConsoleNotificationChannel();
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const notification: Notification = {
      type: 'review_complete',
      storyId: 'S-002',
      title: 'Review Done',
      message: 'Review passed',
      timestamp: '2026-01-01T00:00:00Z',
      actionRequired: false,
    };

    channel.send(notification);

    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('[INFO]')
    );

    spy.mockRestore();
  });
});

describe('FileNotificationChannel', () => {
  beforeEach(() => {
    vi.mocked(fs.appendFileSync).mockClear();
    vi.mocked(fs.existsSync).mockReturnValue(true);
  });

  it('appends JSON line to file', () => {
    const channel = new FileNotificationChannel('/tmp/test-notifications.log');

    const notification: Notification = {
      type: 'story_blocked',
      storyId: 'S-003',
      title: 'Blocked',
      message: 'Max retries exceeded',
      timestamp: '2026-01-01T00:00:00Z',
      actionRequired: false,
    };

    channel.send(notification);

    expect(fs.appendFileSync).toHaveBeenCalledWith(
      '/tmp/test-notifications.log',
      expect.stringContaining('"storyId":"S-003"'),
      'utf-8'
    );
  });
});

describe('NotificationService', () => {
  beforeEach(() => {
    resetNotificationService();
    vi.mocked(fs.appendFileSync).mockClear();
    vi.mocked(fs.existsSync).mockReturnValue(true);
  });

  it('sends to all configured channels', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const service = new NotificationService({
      enabled: true,
      channels: ['console', 'file'],
      filePath: '/tmp/test.log',
    });

    service.notify({
      type: 'merge_ready',
      storyId: 'S-004',
      title: 'Merge Ready',
      message: 'All checks passed',
      timestamp: '2026-01-01T00:00:00Z',
      actionRequired: false,
    });

    expect(consoleSpy).toHaveBeenCalled();
    expect(fs.appendFileSync).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it('does nothing when disabled', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const service = new NotificationService({
      enabled: false,
      channels: ['console'],
    });

    service.notify({
      type: 'approval_required',
      storyId: 'S-005',
      title: 'Test',
      message: 'Test',
      timestamp: '2026-01-01T00:00:00Z',
      actionRequired: true,
    });

    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('requestApproval sends action-required notification', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const service = new NotificationService({
      enabled: true,
      channels: ['console'],
    });

    service.requestApproval('S-006', 'Plan Review', 'Please approve');

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[ACTION REQUIRED]')
    );
    consoleSpy.mockRestore();
  });

  it('requestFeedback sends action-required notification', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const service = new NotificationService({
      enabled: true,
      channels: ['console'],
    });

    service.requestFeedback('S-007', 'Review', 'Please provide feedback');

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[ACTION REQUIRED]')
    );
    consoleSpy.mockRestore();
  });
});

describe('validateNotificationConfig', () => {
  it('returns defaults for empty config', () => {
    const result = validateNotificationConfig({});
    expect(result.enabled).toBe(true);
    expect(result.channels).toEqual(['console']);
  });

  it('filters invalid channels', () => {
    const result = validateNotificationConfig({
      channels: ['console', 'invalid' as any],
    });
    expect(result.channels).toEqual(['console']);
  });

  it('defaults to console when all channels invalid', () => {
    const result = validateNotificationConfig({
      channels: ['invalid' as any],
    });
    expect(result.channels).toEqual(['console']);
  });
});

describe('singleton management', () => {
  afterEach(() => {
    resetNotificationService();
  });

  it('getNotificationService returns default instance', () => {
    const service = getNotificationService();
    expect(service).toBeDefined();
    expect(service.getChannels().length).toBe(1);
  });

  it('initNotificationService creates configured instance', () => {
    const service = initNotificationService({
      enabled: true,
      channels: ['console', 'file'],
      filePath: '/tmp/test.log',
    });
    expect(service.getChannels().length).toBe(2);
  });

  it('resetNotificationService clears instance', () => {
    initNotificationService({ enabled: true, channels: ['console'] });
    resetNotificationService();
    const service = getNotificationService();
    expect(service).toBeDefined();
  });
});
