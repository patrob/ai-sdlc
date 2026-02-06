import * as fs from 'fs';
import * as path from 'path';
import { NotificationConfig, NotificationChannelType } from '../types/index.js';
import { getEventBus, SDLCEvent } from './event-bus.js';

/**
 * Notification event types for human-in-the-loop workflows
 */
export type NotificationType =
  | 'approval_required'
  | 'feedback_requested'
  | 'story_blocked'
  | 'merge_ready'
  | 'review_complete';

export interface Notification {
  type: NotificationType;
  storyId: string;
  title: string;
  message: string;
  timestamp: string;
  /** Whether this notification requires a human response */
  actionRequired: boolean;
}

/**
 * Interface for notification delivery channels
 */
export interface NotificationChannel {
  /** Channel identifier */
  readonly name: string;
  /** Send a notification through this channel */
  send(notification: Notification): void;
}

/**
 * Console-based notification channel.
 * Prints notifications to stdout with formatting.
 */
export class ConsoleNotificationChannel implements NotificationChannel {
  readonly name = 'console';

  send(notification: Notification): void {
    const prefix = notification.actionRequired ? '[ACTION REQUIRED]' : '[INFO]';
    const line = `${prefix} [${notification.type}] ${notification.storyId}: ${notification.title} - ${notification.message}`;
    console.log(line);
  }
}

/**
 * File-based notification channel.
 * Appends notifications as JSON lines to a log file.
 */
export class FileNotificationChannel implements NotificationChannel {
  readonly name = 'file';
  private filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  send(notification: Notification): void {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const line = JSON.stringify(notification) + '\n';
    fs.appendFileSync(this.filePath, line, 'utf-8');
  }
}

/**
 * Default notification configuration
 */
export const DEFAULT_NOTIFICATION_CONFIG: NotificationConfig = {
  enabled: true,
  channels: ['console'],
  filePath: 'notifications.log',
};

/**
 * Validate notification configuration
 */
export function validateNotificationConfig(config: Partial<NotificationConfig>): NotificationConfig {
  const validated = { ...DEFAULT_NOTIFICATION_CONFIG, ...config };

  if (typeof validated.enabled !== 'boolean') {
    validated.enabled = true;
  }

  if (!Array.isArray(validated.channels)) {
    validated.channels = ['console'];
  }

  const validChannels: NotificationChannelType[] = ['console', 'file'];
  validated.channels = validated.channels.filter(ch => validChannels.includes(ch));

  if (validated.channels.length === 0) {
    validated.channels = ['console'];
  }

  return validated;
}

/**
 * Notification service managing multiple channels.
 * Singleton pattern matching project conventions.
 */
export class NotificationService {
  private channels: NotificationChannel[] = [];
  private config: NotificationConfig;

  constructor(config: NotificationConfig, sdlcRoot?: string) {
    this.config = config;

    if (!config.enabled) {
      return;
    }

    for (const channelType of config.channels) {
      switch (channelType) {
        case 'console':
          this.channels.push(new ConsoleNotificationChannel());
          break;
        case 'file': {
          const filePath = sdlcRoot && config.filePath
            ? path.join(sdlcRoot, config.filePath)
            : config.filePath || 'notifications.log';
          this.channels.push(new FileNotificationChannel(filePath));
          break;
        }
      }
    }
  }

  /**
   * Send a notification through all configured channels
   */
  notify(notification: Notification): void {
    if (!this.config.enabled) {
      return;
    }

    for (const channel of this.channels) {
      channel.send(notification);
    }
  }

  /**
   * Send an approval-required notification
   */
  requestApproval(storyId: string, title: string, message: string): void {
    this.notify({
      type: 'approval_required',
      storyId,
      title,
      message,
      timestamp: new Date().toISOString(),
      actionRequired: true,
    });
  }

  /**
   * Send a feedback-requested notification
   */
  requestFeedback(storyId: string, title: string, message: string): void {
    this.notify({
      type: 'feedback_requested',
      storyId,
      title,
      message,
      timestamp: new Date().toISOString(),
      actionRequired: true,
    });
  }

  /**
   * Get the list of active channels
   */
  getChannels(): NotificationChannel[] {
    return [...this.channels];
  }
}

// Singleton management
let instance: NotificationService | undefined;

export function getNotificationService(): NotificationService {
  if (!instance) {
    instance = new NotificationService(DEFAULT_NOTIFICATION_CONFIG);
  }
  return instance;
}

export function initNotificationService(config: NotificationConfig, sdlcRoot?: string): NotificationService {
  instance = new NotificationService(config, sdlcRoot);
  return instance;
}

export function resetNotificationService(): void {
  instance = undefined;
}
