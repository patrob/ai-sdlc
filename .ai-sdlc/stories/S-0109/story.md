---
id: S-0109
title: Add Session Persistence and Resume
priority: 9
status: backlog
type: feature
created: '2026-01-19'
labels:
  - tui
  - persistence
  - session
  - epic-conversational-tui
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
slug: session-persistence
dependencies:
  - S-0103
  - S-0107
---
# Add Session Persistence and Resume

## User Story

**As a** developer using the ai-sdlc TUI
**I want** my conversation and context to persist between sessions
**So that** I can close the TUI and resume where I left off

## Summary

Add session persistence so that conversation history, current story context, and TUI state are saved on exit and restored on launch. Users can resume previous sessions or start fresh.

## Technical Context

**Current State:**
- Conversation history lost on TUI exit
- No session storage
- Each TUI launch starts fresh

**Target State:**
- Session state saved to `.ai-sdlc/sessions/`
- Auto-resume most recent session on launch
- Option to list and select previous sessions
- Option to start fresh session

## Acceptance Criteria

### Session Storage

- [ ] Save session state to `.ai-sdlc/sessions/{session-id}.json`:
  ```json
  {
    "id": "abc123",
    "created": "2026-01-19T10:00:00Z",
    "lastAccessed": "2026-01-19T14:30:00Z",
    "conversation": [
      { "role": "user", "content": "...", "timestamp": "..." },
      { "role": "assistant", "content": "...", "timestamp": "..." }
    ],
    "context": {
      "currentStory": "S-0078",
      "recentlyMentioned": ["S-0078", "S-0097"]
    },
    "ui": {
      "activeTab": "terminal",
      "scrollPosition": 0
    }
  }
  ```

### Auto-Save

- [ ] Save session on:
  - Every user message sent
  - Workflow completion
  - Tab switch
  - Graceful exit (Ctrl+C)

- [ ] Debounce saves (max once per 5 seconds)

### Session Resume

- [ ] On TUI launch, check for recent session
- [ ] If session < 24h old, prompt:
  ```
  Resume previous session from 2 hours ago?
  [Y]es  [N]o (start fresh)  [L]ist sessions
  ```

- [ ] If no recent session, start fresh automatically

### Session List

- [ ] `ai-sdlc tui --list-sessions` shows available sessions:
  ```
  Available sessions:
    1. 2026-01-19 14:30 - Working on S-0078 (2h ago)
    2. 2026-01-18 09:00 - Refining auth stories (1d ago)
    3. 2026-01-17 16:45 - Planning epic (2d ago)

  Select session [1-3] or [N]ew:
  ```

- [ ] Select by number to resume
- [ ] `N` starts new session

### Session Management

- [ ] Auto-delete sessions older than 7 days
- [ ] Maximum 10 sessions stored (delete oldest)
- [ ] `ai-sdlc tui --clear-sessions` removes all sessions

### Fresh Start

- [ ] `ai-sdlc tui --new` always starts fresh session
- [ ] Skips resume prompt

## Files to Create

| File | Purpose |
|------|---------|
| `packages/core/src/core/session-manager.ts` | Session persistence logic |
| `packages/tui/src/hooks/useSessionPersistence.ts` | React hook for session state |
| `packages/tui/src/components/SessionPrompt.tsx` | Resume/list prompt UI |
| `packages/core/tests/session-manager.test.ts` | Persistence tests |

## Files to Modify

| File | Change |
|------|--------|
| `packages/tui/src/index.tsx` | Add session resume logic |
| `packages/cli/src/index.ts` | Add --list-sessions, --new, --clear-sessions flags |

## Implementation Notes

```typescript
// packages/core/src/core/session-manager.ts
import { writeFile, readFile, readdir, unlink } from 'fs/promises';
import { join } from 'path';

export interface SessionState {
  id: string;
  created: Date;
  lastAccessed: Date;
  conversation: ConversationTurn[];
  context: StoryContextState;
  ui: {
    activeTab: string;
    scrollPosition: number;
  };
}

export interface SessionSummary {
  id: string;
  created: Date;
  lastAccessed: Date;
  description: string;  // e.g., "Working on S-0078"
}

export class SessionManager {
  private sessionsDir: string;
  private maxSessions = 10;
  private maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days

  constructor(sdlcRoot: string) {
    this.sessionsDir = join(sdlcRoot, 'sessions');
  }

  async save(session: SessionState): Promise<void> {
    await this.ensureDir();
    const path = join(this.sessionsDir, `${session.id}.json`);
    await writeFile(path, JSON.stringify(session, null, 2));
  }

  async load(sessionId: string): Promise<SessionState | null> {
    try {
      const path = join(this.sessionsDir, `${sessionId}.json`);
      const content = await readFile(path, 'utf-8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  async getMostRecent(): Promise<SessionState | null> {
    const sessions = await this.list();
    if (sessions.length === 0) return null;

    // Sort by lastAccessed descending
    sessions.sort((a, b) =>
      new Date(b.lastAccessed).getTime() - new Date(a.lastAccessed).getTime()
    );

    // Check if recent enough (< 24h)
    const mostRecent = sessions[0];
    const age = Date.now() - new Date(mostRecent.lastAccessed).getTime();
    if (age > 24 * 60 * 60 * 1000) return null;

    return this.load(mostRecent.id);
  }

  async list(): Promise<SessionSummary[]> {
    await this.ensureDir();
    const files = await readdir(this.sessionsDir);
    const summaries: SessionSummary[] = [];

    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const session = await this.load(file.replace('.json', ''));
      if (!session) continue;

      summaries.push({
        id: session.id,
        created: new Date(session.created),
        lastAccessed: new Date(session.lastAccessed),
        description: this.buildDescription(session),
      });
    }

    return summaries;
  }

  async cleanup(): Promise<void> {
    const sessions = await this.list();
    const now = Date.now();

    // Delete old sessions
    for (const session of sessions) {
      const age = now - new Date(session.lastAccessed).getTime();
      if (age > this.maxAge) {
        await this.delete(session.id);
      }
    }

    // Delete excess sessions (keep newest)
    const remaining = await this.list();
    if (remaining.length > this.maxSessions) {
      remaining.sort((a, b) =>
        new Date(b.lastAccessed).getTime() - new Date(a.lastAccessed).getTime()
      );
      for (const session of remaining.slice(this.maxSessions)) {
        await this.delete(session.id);
      }
    }
  }

  async delete(sessionId: string): Promise<void> {
    const path = join(this.sessionsDir, `${sessionId}.json`);
    await unlink(path).catch(() => {});
  }

  async clearAll(): Promise<void> {
    const sessions = await this.list();
    for (const session of sessions) {
      await this.delete(session.id);
    }
  }

  private buildDescription(session: SessionState): string {
    if (session.context.currentStory) {
      return `Working on ${session.context.currentStory}`;
    }
    if (session.conversation.length > 0) {
      const lastUser = session.conversation
        .filter(t => t.role === 'user')
        .pop();
      if (lastUser) {
        return lastUser.content.slice(0, 30) + '...';
      }
    }
    return 'Empty session';
  }

  private async ensureDir(): Promise<void> {
    const { mkdir } = await import('fs/promises');
    await mkdir(this.sessionsDir, { recursive: true });
  }
}
```

```tsx
// packages/tui/src/hooks/useSessionPersistence.ts
import { useState, useEffect, useCallback, useRef } from 'react';
import { SessionManager, SessionState } from '@ai-sdlc/core';
import { useConversation } from './useConversation.js';
import { useStoryContext } from './useStoryContext.js';
import { useNavigation } from './useNavigation.js';

export function useSessionPersistence(sdlcRoot: string) {
  const manager = useMemo(() => new SessionManager(sdlcRoot), [sdlcRoot]);
  const [sessionId] = useState(() => crypto.randomUUID());
  const saveTimeout = useRef<NodeJS.Timeout>();

  const { history } = useConversation();
  const { currentStory, recentlyMentioned } = useStoryContext();
  const { activeTab } = useNavigation();

  const save = useCallback(() => {
    const state: SessionState = {
      id: sessionId,
      created: new Date(),
      lastAccessed: new Date(),
      conversation: history,
      context: { currentStory, recentlyMentioned },
      ui: { activeTab, scrollPosition: 0 },
    };
    manager.save(state);
  }, [sessionId, history, currentStory, recentlyMentioned, activeTab, manager]);

  // Debounced auto-save
  const triggerSave = useCallback(() => {
    if (saveTimeout.current) {
      clearTimeout(saveTimeout.current);
    }
    saveTimeout.current = setTimeout(save, 5000);
  }, [save]);

  // Save on state changes
  useEffect(() => {
    triggerSave();
  }, [history, currentStory, activeTab, triggerSave]);

  // Save on unmount
  useEffect(() => {
    return () => {
      save();
      if (saveTimeout.current) {
        clearTimeout(saveTimeout.current);
      }
    };
  }, [save]);

  return { save, sessionId };
}
```

## Testing Requirements

- [ ] Unit test: Session saved to correct path
- [ ] Unit test: Session loaded correctly
- [ ] Unit test: getMostRecent returns recent session
- [ ] Unit test: getMostRecent returns null if > 24h
- [ ] Unit test: Cleanup removes old sessions
- [ ] Unit test: Cleanup enforces max sessions
- [ ] Unit test: clearAll removes all sessions
- [ ] Integration test: Session restored on TUI launch
- [ ] Integration test: --new flag starts fresh
- [ ] Integration test: --list-sessions shows options
- [ ] `npm test` passes
- [ ] `npm run build` succeeds

## Definition of Done

- [ ] Sessions saved on state changes
- [ ] Sessions restored on TUI launch
- [ ] Resume prompt for recent sessions
- [ ] Session list view works
- [ ] Cleanup removes old sessions
- [ ] All CLI flags work
- [ ] All tests pass
- [ ] `make verify` passes

## References

- Related: S-0103 (Conversation manager), S-0104 (Story context)
