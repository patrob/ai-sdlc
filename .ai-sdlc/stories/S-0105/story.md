---
id: S-0105
title: Create Intent Classifier for Natural Language Commands
priority: 6
status: backlog
type: feature
created: '2026-01-19'
labels:
  - tui
  - nlp
  - intent
  - epic-conversational-tui
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
slug: intent-classifier
dependencies:
  - S-0103
  - S-0104
---
# Create Intent Classifier for Natural Language Commands

## User Story

**As a** developer using the ai-sdlc TUI
**I want** the system to understand what I'm trying to do from natural language
**So that** I can say "refine this story" instead of running specific commands

## Summary

Build an intent classifier that maps natural language input to ai-sdlc actions. This bridges conversational input to the existing workflow system, enabling commands like "implement the auth feature" to trigger the appropriate workflow.

## Technical Context

**Current State:**
- Workflows triggered by CLI flags (--refine, --research, --plan, --implement, --review)
- No natural language command parsing
- Agent receives raw user input

**Target State:**
- Detect user intent from natural language
- Map intents to ai-sdlc workflows
- Handle conversational vs command input
- Support compound intents ("refine and then implement")

## Acceptance Criteria

### Intent Categories

- [ ] Define intent types:
  ```typescript
  type Intent =
    | { type: 'workflow'; workflow: WorkflowType; storyId?: string }
    | { type: 'query'; question: string }
    | { type: 'status'; scope: 'board' | 'story' | 'metrics' }
    | { type: 'conversation'; content: string }
    | { type: 'system'; action: 'help' | 'clear' | 'exit' }
    | { type: 'unknown'; raw: string };
  ```

### Workflow Intent Detection

- [ ] Detect refine intent:
  - "refine this story", "let's refine S-0078", "improve the requirements"

- [ ] Detect research intent:
  - "research how to implement", "investigate the codebase", "explore options"

- [ ] Detect plan intent:
  - "create a plan", "plan the implementation", "break it down into tasks"

- [ ] Detect implement intent:
  - "implement this", "build it", "write the code", "make it happen"

- [ ] Detect review intent:
  - "review the changes", "check the implementation", "verify it works"

### Query Intent Detection

- [ ] Detect questions:
  - "what stories are in progress?", "show me the backlog"
  - "how does the auth system work?", "explain this code"

### Conversational Intent

- [ ] Detect general conversation:
  - Follow-up questions about previous response
  - Clarification requests
  - General discussion not tied to specific action

### Intent Resolution

- [ ] Return confidence score for each intent
- [ ] Handle ambiguous input (ask for clarification)
- [ ] Support compound intents with sequencing

## Files to Create

| File | Purpose |
|------|---------|
| `packages/core/src/core/intent-classifier.ts` | Intent classification logic |
| `packages/core/src/core/intent-patterns.ts` | Pattern definitions |
| `packages/tui/src/hooks/useIntentHandler.ts` | Intent to action mapping |
| `packages/core/tests/intent-classifier.test.ts` | Classification tests |

## Implementation Notes

```typescript
// packages/core/src/core/intent-classifier.ts
export type WorkflowType = 'refine' | 'research' | 'plan' | 'implement' | 'review';

export type Intent =
  | { type: 'workflow'; workflow: WorkflowType; storyId?: string; confidence: number }
  | { type: 'query'; question: string; confidence: number }
  | { type: 'status'; scope: 'board' | 'story' | 'metrics'; confidence: number }
  | { type: 'conversation'; content: string; confidence: number }
  | { type: 'system'; action: 'help' | 'clear' | 'exit'; confidence: number }
  | { type: 'unknown'; raw: string; confidence: number };

interface PatternRule {
  patterns: RegExp[];
  intent: Partial<Intent>;
  priority: number;
}

const workflowPatterns: PatternRule[] = [
  {
    patterns: [
      /\b(refine|improve|clarify|enhance)\s+(the\s+)?(story|requirements?|spec)/i,
      /\blet'?s?\s+refine\b/i,
      /\bwork\s+on\s+(the\s+)?requirements?\b/i,
    ],
    intent: { type: 'workflow', workflow: 'refine' },
    priority: 10,
  },
  {
    patterns: [
      /\b(research|investigate|explore|analyze)\s+(the\s+)?(codebase|code|implementation)/i,
      /\bhow\s+(does|do|should|would)\s+(we|i|the)\s+(implement|build|create)/i,
    ],
    intent: { type: 'workflow', workflow: 'research' },
    priority: 10,
  },
  {
    patterns: [
      /\b(plan|break\s+down|create\s+a?\s*plan|design)\s+(the\s+)?(implementation|tasks?|work)/i,
      /\blet'?s?\s+(plan|design)\b/i,
    ],
    intent: { type: 'workflow', workflow: 'plan' },
    priority: 10,
  },
  {
    patterns: [
      /\b(implement|build|code|create|make|write)\s+(it|this|the\s+(feature|story|code))/i,
      /\bstart\s+(coding|implementing|building)\b/i,
      /\bmake\s+it\s+happen\b/i,
    ],
    intent: { type: 'workflow', workflow: 'implement' },
    priority: 10,
  },
  {
    patterns: [
      /\b(review|check|verify|validate|test)\s+(the\s+)?(changes?|implementation|code)/i,
      /\bis\s+(it|this)\s+(done|ready|working)\b/i,
    ],
    intent: { type: 'workflow', workflow: 'review' },
    priority: 10,
  },
];

const queryPatterns: PatternRule[] = [
  {
    patterns: [
      /^(what|which|where|who|how|why|when|show|list|display)\b/i,
      /\?\s*$/,
    ],
    intent: { type: 'query' },
    priority: 5,
  },
];

const systemPatterns: PatternRule[] = [
  {
    patterns: [/\b(help|commands?|usage)\b/i],
    intent: { type: 'system', action: 'help' },
    priority: 15,
  },
  {
    patterns: [/\b(clear|reset)\s+(the\s+)?(screen|output|history)\b/i],
    intent: { type: 'system', action: 'clear' },
    priority: 15,
  },
  {
    patterns: [/\b(exit|quit|bye|goodbye)\b/i],
    intent: { type: 'system', action: 'exit' },
    priority: 15,
  },
];

export class IntentClassifier {
  classify(input: string, context?: StoryContextState): Intent {
    const trimmed = input.trim();

    // Check system patterns first (highest priority)
    for (const rule of systemPatterns) {
      if (rule.patterns.some(p => p.test(trimmed))) {
        return { ...rule.intent, confidence: 0.9 } as Intent;
      }
    }

    // Check workflow patterns
    for (const rule of workflowPatterns) {
      if (rule.patterns.some(p => p.test(trimmed))) {
        const intent = {
          ...rule.intent,
          storyId: context?.currentStory || undefined,
          confidence: 0.85,
        } as Intent;
        return intent;
      }
    }

    // Check query patterns
    for (const rule of queryPatterns) {
      if (rule.patterns.some(p => p.test(trimmed))) {
        return {
          type: 'query',
          question: trimmed,
          confidence: 0.7,
        };
      }
    }

    // Default to conversation
    return {
      type: 'conversation',
      content: trimmed,
      confidence: 0.5,
    };
  }

  /**
   * Detect compound intents like "refine and then implement"
   */
  classifyCompound(input: string): Intent[] {
    const conjunctions = /\s+(and\s+then|then|after\s+that|followed\s+by)\s+/i;
    const parts = input.split(conjunctions).filter(p => !conjunctions.test(p));

    return parts.map(part => this.classify(part.trim()));
  }
}
```

```tsx
// packages/tui/src/hooks/useIntentHandler.ts
import { useCallback } from 'react';
import { IntentClassifier, Intent } from '@ai-sdlc/core';
import { useConversation } from './useConversation.js';
import { useStoryContext } from './useStoryContext.js';

export function useIntentHandler() {
  const classifier = useMemo(() => new IntentClassifier(), []);
  const { buildPrompt, addUserMessage } = useConversation();
  const { currentStory, updateContext } = useStoryContext();

  const handleInput = useCallback(async (input: string) => {
    // Update story context from input
    updateContext(input);

    // Classify intent
    const intent = classifier.classify(input, { currentStory });

    // Add to conversation history
    addUserMessage(input, currentStory);

    switch (intent.type) {
      case 'workflow':
        return handleWorkflow(intent);
      case 'query':
        return handleQuery(intent);
      case 'system':
        return handleSystem(intent);
      case 'conversation':
      default:
        return handleConversation(input);
    }
  }, [classifier, currentStory]);

  return { handleInput };
}
```

## Testing Requirements

- [ ] Unit test: Classify refine intent variants
- [ ] Unit test: Classify research intent variants
- [ ] Unit test: Classify plan intent variants
- [ ] Unit test: Classify implement intent variants
- [ ] Unit test: Classify review intent variants
- [ ] Unit test: Classify query intents (questions)
- [ ] Unit test: Classify system commands
- [ ] Unit test: Default to conversation for ambiguous input
- [ ] Unit test: Detect compound intents
- [ ] Unit test: Include story context in workflow intents
- [ ] Integration test: Intent flows to correct handler
- [ ] `npm test` passes
- [ ] `npm run build` succeeds

## Definition of Done

- [ ] All workflow types detected accurately
- [ ] Query vs conversation distinguished
- [ ] System commands recognized
- [ ] Compound intents parsed
- [ ] Story context included in intents
- [ ] All tests pass
- [ ] `make verify` passes

## References

- Existing workflows: `packages/core/src/cli/runner.ts`
- Related: S-0103 (Conversation), S-0104 (Story context), S-0106 (Workflow integration)
