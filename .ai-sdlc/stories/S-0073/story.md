---
id: S-0073
title: Create TicketProvider abstraction with NullProvider
priority: 30
status: backlog
type: feature
created: '2026-01-19'
labels:
  - architecture
  - abstraction
  - ticketing
  - epic-ticketing-integration
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
slug: create-ticketprovider-abstraction
dependencies:
  - S-0072
---
# Create TicketProvider abstraction with NullProvider

## User Story

**As a** developer maintaining ai-sdlc
**I want** a TicketProvider interface with a NullProvider default
**So that** ticketing can be added without changing existing code paths and local-only mode continues to work

## Summary

This story creates the core abstraction layer for ticketing integration. The `TicketProvider` interface defines operations for interacting with external ticketing systems. The `NullTicketProvider` implements this interface with no-ops, ensuring that when no ticketing is configured, the system behaves exactly as it does today.

This is the architectural foundation that protects all 40+ existing `parseStory()` call sites from any regression.

## Context

### Architecture Principle

The Story type stays unchanged. We add an abstraction layer ABOVE it:

```
Before:  CLI/Agents → parseStory() → Story → writeStory()
After:   CLI/Agents → StoryService → parseStory() → Story → writeStory()
                         ↓                              ↓
                    TicketProvider.sync()         TicketProvider.sync()
```

### Key Design Decisions

1. **NullProvider is default**: When `ticketing.provider` is not configured or is `"none"`, `NullTicketProvider` is used
2. **Write operations are no-ops**: `NullTicketProvider.updateStatus()` does nothing, not throw
3. **Agents remain unchanged**: They receive Story objects and don't know about ticketing
4. **Graceful degradation**: If ticket sync fails, local operations still succeed

## Acceptance Criteria

### TicketProvider Interface

- [ ] Create `src/services/ticket-provider/types.ts` with:
  ```typescript
  export interface Ticket {
    id: string;
    url: string;
    title: string;
    description: string;
    status: string;
    priority: number;
    labels: string[];
    assignee?: string;
  }

  export interface TicketProvider {
    readonly name: string;

    // Read operations
    list(filter?: TicketFilter): Promise<Ticket[]>;
    get(id: string): Promise<Ticket>;

    // Write operations
    create(ticket: NewTicket): Promise<Ticket>;
    updateStatus(id: string, status: string): Promise<void>;
    addComment(id: string, body: string): Promise<void>;
    linkPR(id: string, prUrl: string): Promise<void>;

    // Mapping
    mapStatusToExternal(status: StoryStatus): string;
    mapStatusFromExternal(externalStatus: string): StoryStatus;
  }
  ```

### NullTicketProvider Implementation

- [ ] Create `src/services/ticket-provider/null-provider.ts`:
  ```typescript
  export class NullTicketProvider implements TicketProvider {
    readonly name = 'none';

    async list(): Promise<Ticket[]> { return []; }
    async get(id: string): Promise<Ticket> {
      throw new Error('No ticket provider configured');
    }
    async create(): Promise<Ticket> {
      throw new Error('No ticket provider configured');
    }
    async updateStatus(): Promise<void> { /* no-op */ }
    async addComment(): Promise<void> { /* no-op */ }
    async linkPR(): Promise<void> { /* no-op */ }

    mapStatusToExternal(status: StoryStatus): string { return status; }
    mapStatusFromExternal(status: string): StoryStatus {
      return status as StoryStatus;
    }
  }
  ```

### Configuration Schema

- [ ] Add `ticketing` section to config schema in `src/core/config.ts`:
  ```typescript
  ticketing?: {
    provider: 'none' | 'github' | 'jira';
    syncOnRun?: boolean;           // default: true
    postProgressComments?: boolean; // default: true

    github?: {
      repo?: string;
      projectNumber?: number;
      statusLabels?: Record<string, string>;
    };
  }
  ```

- [ ] Default to `provider: 'none'` when ticketing section is absent

### Provider Factory

- [ ] Create `src/services/ticket-provider/index.ts` with factory:
  ```typescript
  export function createTicketProvider(config: Config): TicketProvider {
    const provider = config.ticketing?.provider ?? 'none';

    switch (provider) {
      case 'none':
        return new NullTicketProvider();
      case 'github':
        // Placeholder for S-0074
        throw new Error('GitHub provider not yet implemented');
      case 'jira':
        // Placeholder for future
        throw new Error('Jira provider not yet implemented');
      default:
        return new NullTicketProvider();
    }
  }
  ```

### Testing

- [ ] Unit tests for NullTicketProvider:
  - [ ] `list()` returns empty array
  - [ ] `get()` throws "No ticket provider configured"
  - [ ] `create()` throws "No ticket provider configured"
  - [ ] `updateStatus()` completes without error (no-op)
  - [ ] `addComment()` completes without error (no-op)
  - [ ] `linkPR()` completes without error (no-op)
  - [ ] `mapStatusToExternal()` returns input unchanged
  - [ ] `mapStatusFromExternal()` returns input unchanged

- [ ] Unit tests for createTicketProvider factory:
  - [ ] Returns NullTicketProvider when provider is 'none'
  - [ ] Returns NullTicketProvider when ticketing config is absent
  - [ ] Throws for unimplemented providers (github, jira)

- [ ] All existing tests continue to pass (no regression)

### Documentation

- [ ] Update `docs/configuration.md` with ticketing configuration section
- [ ] Document that `provider: 'none'` is default (local-only mode)
- [ ] Note that GitHub/Jira providers are coming in future stories

## Technical Details

### File Structure

```
src/services/ticket-provider/
├── index.ts           # Factory and exports
├── types.ts           # Interfaces and types
├── null-provider.ts   # NullTicketProvider implementation
└── __tests__/
    └── null-provider.test.ts
```

### Config Validation

Add to existing config validation in `src/core/config.ts`:
- `ticketing.provider` must be one of: 'none', 'github', 'jira'
- `ticketing.syncOnRun` must be boolean if present
- `ticketing.postProgressComments` must be boolean if present

## Out of Scope

- GitHub provider implementation (S-0074, S-0075)
- Jira provider implementation (future)
- StoryService wrapper (may be added in S-0074 if needed)
- Actual sync logic (S-0074, S-0075)

## Definition of Done

- [ ] TicketProvider interface defined in `src/services/ticket-provider/types.ts`
- [ ] NullTicketProvider implemented in `src/services/ticket-provider/null-provider.ts`
- [ ] Provider factory implemented in `src/services/ticket-provider/index.ts`
- [ ] Config schema updated with ticketing section
- [ ] All unit tests pass
- [ ] All existing tests pass (no regression)
- [ ] Documentation updated
- [ ] `make verify` passes
