import * as fs from 'fs';

export type SDLCEventType =
  | 'agent_start' | 'agent_complete' | 'agent_error'
  | 'story_phase_change' | 'cost_threshold' | 'circuit_breaker_trip';

export type SDLCEvent =
  | { type: 'agent_start'; storyId: string; phase: string; agentId: string; timestamp: string }
  | { type: 'agent_complete'; storyId: string; phase: string; agentId: string; durationMs: number; success: boolean; timestamp: string }
  | { type: 'agent_error'; storyId: string; phase: string; agentId: string; error: string; timestamp: string }
  | { type: 'story_phase_change'; storyId: string; fromPhase: string; toPhase: string; timestamp: string }
  | { type: 'cost_threshold'; storyId: string; currentTokens: number; limitTokens: number; percentUsed: number; timestamp: string }
  | { type: 'circuit_breaker_trip'; storyId: string; phase: string; reason: string; retryCount: number; timestamp: string };

export type EventHandler = (event: SDLCEvent) => void;

export interface EventSubscriber {
  onEvent(event: SDLCEvent): void;
}

export class EventBus {
  private handlers = new Map<string, Set<EventHandler>>();
  private globalHandlers = new Set<EventHandler>();

  subscribe(eventType: SDLCEventType, handler: EventHandler): () => void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set());
    }
    this.handlers.get(eventType)!.add(handler);

    return () => {
      this.handlers.get(eventType)?.delete(handler);
    };
  }

  subscribeAll(handler: EventHandler): () => void {
    this.globalHandlers.add(handler);

    return () => {
      this.globalHandlers.delete(handler);
    };
  }

  emit(event: SDLCEvent): void {
    const typeHandlers = this.handlers.get(event.type);
    if (typeHandlers) {
      for (const handler of typeHandlers) {
        handler(event);
      }
    }

    for (const handler of this.globalHandlers) {
      handler(event);
    }
  }

  removeAllListeners(): void {
    this.handlers.clear();
    this.globalHandlers.clear();
  }
}

const CONSOLE_EVENT_TYPES: Set<SDLCEventType> = new Set([
  'agent_error',
  'story_phase_change',
  'cost_threshold',
  'circuit_breaker_trip',
]);

export class ConsoleEventSubscriber implements EventSubscriber {
  onEvent(event: SDLCEvent): void {
    if (!CONSOLE_EVENT_TYPES.has(event.type)) {
      return;
    }

    const prefix = `[${event.type}]`;
    switch (event.type) {
      case 'agent_error':
        console.error(`${prefix} ${event.agentId} failed in ${event.phase}: ${event.error}`);
        break;
      case 'story_phase_change':
        console.log(`${prefix} ${event.storyId}: ${event.fromPhase} -> ${event.toPhase}`);
        break;
      case 'cost_threshold':
        console.warn(`${prefix} ${event.storyId}: ${event.percentUsed}% token budget used`);
        break;
      case 'circuit_breaker_trip':
        console.error(`${prefix} ${event.storyId}/${event.phase}: ${event.reason} (retry ${event.retryCount})`);
        break;
    }
  }
}

export class FileEventSubscriber implements EventSubscriber {
  private filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  onEvent(event: SDLCEvent): void {
    const line = JSON.stringify(event) + '\n';
    fs.appendFileSync(this.filePath, line, 'utf-8');
  }
}

let instance: EventBus | undefined;

export function getEventBus(): EventBus {
  if (!instance) {
    instance = new EventBus();
  }
  return instance;
}

export function initEventBus(): EventBus {
  instance = new EventBus();
  return instance;
}

export function resetEventBus(): void {
  instance?.removeAllListeners();
  instance = undefined;
}
