import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import {
  EventBus,
  ConsoleEventSubscriber,
  FileEventSubscriber,
  SDLCEvent,
  getEventBus,
  initEventBus,
  resetEventBus,
} from './event-bus.js';

vi.mock('fs');

describe('EventBus', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new EventBus();
  });

  const makeEvent = (type: SDLCEvent['type'], overrides: Partial<SDLCEvent> = {}): SDLCEvent => {
    const base = { storyId: 'S-001', timestamp: '2024-01-01T00:00:00Z' };
    switch (type) {
      case 'agent_start':
        return { type, ...base, phase: 'refine', agentId: 'agent-1', ...overrides } as SDLCEvent;
      case 'agent_complete':
        return { type, ...base, phase: 'refine', agentId: 'agent-1', durationMs: 100, success: true, ...overrides } as SDLCEvent;
      case 'agent_error':
        return { type, ...base, phase: 'refine', agentId: 'agent-1', error: 'boom', ...overrides } as SDLCEvent;
      case 'story_phase_change':
        return { type, ...base, fromPhase: 'refine', toPhase: 'research', ...overrides } as SDLCEvent;
      case 'cost_threshold':
        return { type, ...base, currentTokens: 8000, limitTokens: 10000, percentUsed: 80, ...overrides } as SDLCEvent;
      case 'circuit_breaker_trip':
        return { type, ...base, phase: 'implement', reason: 'max retries', retryCount: 3, ...overrides } as SDLCEvent;
      default:
        throw new Error(`Unknown event type: ${type}`);
    }
  };

  describe('subscribe', () => {
    it('should deliver events to type-specific handlers', () => {
      const handler = vi.fn();
      bus.subscribe('agent_start', handler);

      const event = makeEvent('agent_start');
      bus.emit(event);

      expect(handler).toHaveBeenCalledWith(event);
    });

    it('should not deliver events of other types', () => {
      const handler = vi.fn();
      bus.subscribe('agent_start', handler);

      bus.emit(makeEvent('agent_error'));

      expect(handler).not.toHaveBeenCalled();
    });

    it('should support multiple handlers for the same type', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      bus.subscribe('agent_start', handler1);
      bus.subscribe('agent_start', handler2);

      const event = makeEvent('agent_start');
      bus.emit(event);

      expect(handler1).toHaveBeenCalledWith(event);
      expect(handler2).toHaveBeenCalledWith(event);
    });
  });

  describe('unsubscribe', () => {
    it('should stop delivering events after unsubscribe', () => {
      const handler = vi.fn();
      const unsub = bus.subscribe('agent_start', handler);

      unsub();
      bus.emit(makeEvent('agent_start'));

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('subscribeAll', () => {
    it('should receive all event types', () => {
      const handler = vi.fn();
      bus.subscribeAll(handler);

      const types: SDLCEvent['type'][] = [
        'agent_start', 'agent_complete', 'agent_error',
        'story_phase_change', 'cost_threshold', 'circuit_breaker_trip',
      ];

      for (const type of types) {
        bus.emit(makeEvent(type));
      }

      expect(handler).toHaveBeenCalledTimes(types.length);
    });

    it('should stop receiving after unsubscribe', () => {
      const handler = vi.fn();
      const unsub = bus.subscribeAll(handler);

      unsub();
      bus.emit(makeEvent('agent_start'));

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('emit', () => {
    it('should deliver to both type-specific and global handlers', () => {
      const specificHandler = vi.fn();
      const globalHandler = vi.fn();
      bus.subscribe('agent_start', specificHandler);
      bus.subscribeAll(globalHandler);

      const event = makeEvent('agent_start');
      bus.emit(event);

      expect(specificHandler).toHaveBeenCalledWith(event);
      expect(globalHandler).toHaveBeenCalledWith(event);
    });
  });

  describe('removeAllListeners', () => {
    it('should clear all handlers', () => {
      const specific = vi.fn();
      const global = vi.fn();
      bus.subscribe('agent_start', specific);
      bus.subscribeAll(global);

      bus.removeAllListeners();
      bus.emit(makeEvent('agent_start'));

      expect(specific).not.toHaveBeenCalled();
      expect(global).not.toHaveBeenCalled();
    });
  });
});

describe('ConsoleEventSubscriber', () => {
  let subscriber: ConsoleEventSubscriber;

  beforeEach(() => {
    subscriber = new ConsoleEventSubscriber();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should log agent_error to console.error', () => {
    subscriber.onEvent({
      type: 'agent_error',
      storyId: 'S-001',
      phase: 'refine',
      agentId: 'agent-1',
      error: 'boom',
      timestamp: '2024-01-01T00:00:00Z',
    });

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('agent-1 failed in refine: boom')
    );
  });

  it('should log story_phase_change to console.log', () => {
    subscriber.onEvent({
      type: 'story_phase_change',
      storyId: 'S-001',
      fromPhase: 'refine',
      toPhase: 'research',
      timestamp: '2024-01-01T00:00:00Z',
    });

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('S-001: refine -> research')
    );
  });

  it('should log cost_threshold to console.warn', () => {
    subscriber.onEvent({
      type: 'cost_threshold',
      storyId: 'S-001',
      currentTokens: 8000,
      limitTokens: 10000,
      percentUsed: 80,
      timestamp: '2024-01-01T00:00:00Z',
    });

    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('80% token budget used')
    );
  });

  it('should not log agent_start events', () => {
    subscriber.onEvent({
      type: 'agent_start',
      storyId: 'S-001',
      phase: 'refine',
      agentId: 'agent-1',
      timestamp: '2024-01-01T00:00:00Z',
    });

    expect(console.log).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
    expect(console.warn).not.toHaveBeenCalled();
  });
});

describe('FileEventSubscriber', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should append JSON lines to file', () => {
    const subscriber = new FileEventSubscriber('/tmp/events.jsonl');

    const event: SDLCEvent = {
      type: 'agent_start',
      storyId: 'S-001',
      phase: 'refine',
      agentId: 'agent-1',
      timestamp: '2024-01-01T00:00:00Z',
    };

    subscriber.onEvent(event);

    expect(fs.appendFileSync).toHaveBeenCalledWith(
      '/tmp/events.jsonl',
      JSON.stringify(event) + '\n',
      'utf-8'
    );
  });
});

describe('singleton accessors', () => {
  afterEach(() => {
    resetEventBus();
  });

  it('getEventBus should return the same instance', () => {
    const bus1 = getEventBus();
    const bus2 = getEventBus();
    expect(bus1).toBe(bus2);
  });

  it('initEventBus should create a fresh instance', () => {
    const bus1 = getEventBus();
    const bus2 = initEventBus();
    expect(bus1).not.toBe(bus2);
  });

  it('resetEventBus should clear the instance', () => {
    const bus1 = getEventBus();
    resetEventBus();
    const bus2 = getEventBus();
    expect(bus1).not.toBe(bus2);
  });
});
