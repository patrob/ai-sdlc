---
id: S-0103
title: Build Conversation Manager for Multi-Turn Context
priority: 5
status: backlog
type: feature
created: '2026-01-19'
labels:
  - tui
  - conversation
  - context
  - epic-conversational-tui
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
slug: conversation-manager
dependencies:
  - S-0098
  - S-0099
  - S-0100
---
# Build Conversation Manager for Multi-Turn Context

## User Story

**As a** developer using the ai-sdlc TUI
**I want** the system to remember our conversation context
**So that** I can have natural multi-turn interactions without repeating myself

## Summary

Create a conversation manager that maintains history across turns, builds context-aware prompts, and manages the sliding window to stay within token limits. This is the core intelligence layer that enables Claude Code-like interactions.

## Technical Context

**Current State:**
- `runAgentQuery()` takes single prompt, no history
- Each agent call is stateless
- No conversation persistence

**Target State:**
- Conversation history maintained in memory
- Context window management (sliding window)
- History serialization for prompt building
- Session-level persistence (lost on TUI exit)

## Acceptance Criteria

### Conversation Turn Tracking

- [ ] Track each user message and assistant response as a turn
- [ ] Store metadata per turn:
  ```typescript
  interface ConversationTurn {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
    storyContext?: string;  // e.g., "S-0078"
    workflowPhase?: string; // e.g., "refine", "implement"
    toolsUsed?: string[];   // Tools called in this turn
  }
  ```

### Context Window Management

- [ ] Estimate token count for conversation history
- [ ] Implement sliding window when approaching limit:
  - Keep system context always
  - Keep most recent N turns
  - Summarize older turns if needed
- [ ] Target: Leave 100K tokens for agent response (of 200K context)

### Prompt Building

- [ ] Build prompts that include:
  - Current project context (active stories, board state)
  - Relevant conversation history
  - User's current message
- [ ] Format for Claude:
  ```
  ## Project Context
  Repository: {repo}
  Active stories: {count}
  Current story: {storyId} (if in context)

  ## Conversation History
  [Previous turns...]

  ## Current Request
  {user message}
  ```

### History Operations

- [ ] `addTurn(turn)` - Add new turn to history
- [ ] `getHistory(maxTurns?)` - Get recent turns
- [ ] `buildPrompt(message)` - Build context-aware prompt
- [ ] `clear()` - Clear conversation history
- [ ] `getRelevantHistory(storyId?)` - Filter by story context

## Files to Create

| File | Purpose |
|------|---------|
| `packages/core/src/core/conversation.ts` | Conversation manager class |
| `packages/core/src/core/token-estimator.ts` | Token counting utilities |
| `packages/tui/src/hooks/useConversation.ts` | React hook for conversation state |
| `packages/core/tests/conversation.test.ts` | Conversation manager tests |

## Implementation Notes

```typescript
// packages/core/src/core/conversation.ts
export interface ConversationTurn {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  storyContext?: string;
  workflowPhase?: string;
  toolsUsed?: string[];
}

export interface ConversationOptions {
  maxTokens?: number;        // Default: 100000
  maxTurns?: number;         // Default: 50
  includeProjectContext?: boolean;
}

export class ConversationManager {
  private history: ConversationTurn[] = [];
  private options: Required<ConversationOptions>;

  constructor(options: ConversationOptions = {}) {
    this.options = {
      maxTokens: options.maxTokens ?? 100000,
      maxTurns: options.maxTurns ?? 50,
      includeProjectContext: options.includeProjectContext ?? true,
    };
  }

  addTurn(turn: Omit<ConversationTurn, 'id' | 'timestamp'>): ConversationTurn {
    const fullTurn: ConversationTurn = {
      ...turn,
      id: crypto.randomUUID(),
      timestamp: new Date(),
    };
    this.history.push(fullTurn);
    this.enforceLimit();
    return fullTurn;
  }

  buildPrompt(message: string, projectContext?: ProjectContext): string {
    const contextSection = this.options.includeProjectContext && projectContext
      ? this.formatProjectContext(projectContext)
      : '';

    const historySection = this.formatHistory();

    return `${contextSection}\n\n${historySection}\n\n## Current Request\n${message}`;
  }

  private enforceLimit(): void {
    // Remove oldest turns if exceeding max
    while (this.history.length > this.options.maxTurns) {
      this.history.shift();
    }

    // Check token estimate and trim if needed
    while (this.estimateTokens() > this.options.maxTokens && this.history.length > 2) {
      this.history.shift();
    }
  }

  private estimateTokens(): number {
    // Rough estimate: 4 chars per token
    return this.history.reduce((sum, turn) => sum + turn.content.length / 4, 0);
  }

  private formatHistory(): string {
    if (this.history.length === 0) return '';

    return '## Conversation History\n' +
      this.history.map(turn =>
        `**${turn.role === 'user' ? 'User' : 'Assistant'}**: ${turn.content}`
      ).join('\n\n');
  }

  private formatProjectContext(ctx: ProjectContext): string {
    return `## Project Context
Repository: ${ctx.repository}
Active stories: ${ctx.activeStoryCount}
${ctx.currentStory ? `Current story: ${ctx.currentStory}` : ''}`;
  }

  getHistory(maxTurns?: number): ConversationTurn[] {
    if (maxTurns === undefined) return [...this.history];
    return this.history.slice(-maxTurns);
  }

  clear(): void {
    this.history = [];
  }
}
```

```tsx
// packages/tui/src/hooks/useConversation.ts
import { useState, useCallback, useMemo } from 'react';
import { ConversationManager, ConversationTurn } from '@ai-sdlc/core';

export function useConversation() {
  const manager = useMemo(() => new ConversationManager(), []);
  const [history, setHistory] = useState<ConversationTurn[]>([]);

  const addUserMessage = useCallback((content: string, storyContext?: string) => {
    const turn = manager.addTurn({ role: 'user', content, storyContext });
    setHistory(manager.getHistory());
    return turn;
  }, [manager]);

  const addAssistantMessage = useCallback((content: string, toolsUsed?: string[]) => {
    const turn = manager.addTurn({ role: 'assistant', content, toolsUsed });
    setHistory(manager.getHistory());
    return turn;
  }, [manager]);

  const buildPrompt = useCallback((message: string) => {
    return manager.buildPrompt(message);
  }, [manager]);

  const clear = useCallback(() => {
    manager.clear();
    setHistory([]);
  }, [manager]);

  return { history, addUserMessage, addAssistantMessage, buildPrompt, clear };
}
```

## Testing Requirements

- [ ] Unit test: addTurn adds turn with generated id and timestamp
- [ ] Unit test: getHistory returns correct number of turns
- [ ] Unit test: enforceLimit removes oldest turns when over maxTurns
- [ ] Unit test: enforceLimit removes turns when over token estimate
- [ ] Unit test: buildPrompt includes project context when provided
- [ ] Unit test: buildPrompt includes conversation history
- [ ] Unit test: clear empties history
- [ ] Integration test: Conversation flows through TUI
- [ ] `npm test` passes
- [ ] `npm run build` succeeds

## Definition of Done

- [ ] ConversationManager class implemented
- [ ] Token estimation working
- [ ] Prompt building includes context and history
- [ ] Sliding window enforces limits
- [ ] React hook integrates with TUI
- [ ] All tests pass
- [ ] `make verify` passes

## References

- Claude context window: 200K tokens
- Related: S-0099 (Input), S-0100 (Output), S-0104 (Story context)
