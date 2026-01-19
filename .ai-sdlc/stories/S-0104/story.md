---
id: S-0104
title: Implement Story Context Detection and Awareness
priority: 5
status: backlog
type: feature
created: '2026-01-19'
labels:
  - tui
  - context
  - stories
  - epic-conversational-tui
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
slug: story-context-awareness
dependencies:
  - S-0103
---
# Implement Story Context Detection and Awareness

## User Story

**As a** developer using the ai-sdlc TUI
**I want** the system to automatically detect when I'm talking about a story
**So that** operations are scoped correctly without me specifying story IDs every time

## Summary

Build context detection that identifies story references in natural language ("work on the auth story", "S-0078", "that bug fix") and maintains awareness of the current story context. This enables natural conversation like "now implement it" after discussing a story.

## Technical Context

**Current State:**
- Stories identified by explicit IDs (S-XXXX)
- No natural language story reference
- No persistent "current story" concept in TUI

**Target State:**
- Detect story references in user input
- Resolve references to story IDs
- Maintain "current story" context
- Include story details in agent prompts

## Acceptance Criteria

### Story Reference Detection

- [ ] Detect explicit story IDs: "S-0078", "story S-0078"
- [ ] Detect title references: "the auth story", "user authentication"
- [ ] Detect relative references: "that story", "the one we discussed", "it"
- [ ] Detect status references: "the blocked story", "stories in progress"

### Reference Resolution

- [ ] Match story ID exactly when provided
- [ ] Fuzzy match titles using similarity scoring
- [ ] Resolve "it"/"that" to most recently mentioned story
- [ ] Return multiple candidates when ambiguous (ask user to clarify)

### Context Persistence

- [ ] Track "current story" - the story we're actively discussing/working on
- [ ] Update current story when user explicitly mentions one
- [ ] Clear current story with "switch to...", "work on something else"
- [ ] Display current story in UI (status area)

### Agent Prompt Enhancement

- [ ] When story context exists, include in prompt:
  ```
  ## Current Story Context
  Story: S-0078 - Create IProvider Interface
  Status: in-progress
  Phase: implementation

  Summary: [story summary]

  Acceptance Criteria:
  - [ ] Create src/providers/types.ts
  - [x] Define IProvider interface
  ...
  ```

## Files to Create

| File | Purpose |
|------|---------|
| `packages/core/src/core/story-context.ts` | Context detection and resolution |
| `packages/core/src/core/fuzzy-match.ts` | Fuzzy string matching utilities |
| `packages/tui/src/hooks/useStoryContext.ts` | Story context state hook |
| `packages/core/tests/story-context.test.ts` | Context detection tests |

## Implementation Notes

```typescript
// packages/core/src/core/story-context.ts
export interface StoryReference {
  type: 'explicit' | 'title' | 'relative' | 'status';
  raw: string;           // Original text matched
  resolved?: string;     // Story ID if resolved
  candidates?: string[]; // Multiple matches if ambiguous
  confidence: number;    // 0-1 confidence score
}

export interface StoryContextState {
  currentStory: string | null;
  recentlyMentioned: string[];  // Last N story IDs mentioned
  lastUpdated: Date;
}

export class StoryContextDetector {
  private state: StoryContextState = {
    currentStory: null,
    recentlyMentioned: [],
    lastUpdated: new Date(),
  };

  constructor(private stories: StoryMetadata[]) {}

  /**
   * Detect story references in user input
   */
  detectReferences(input: string): StoryReference[] {
    const references: StoryReference[] = [];

    // Explicit ID pattern: S-0078, S0078, story S-0078
    const explicitPattern = /\b[Ss]-?(\d{4})\b/g;
    let match;
    while ((match = explicitPattern.exec(input)) !== null) {
      const id = `S-${match[1].padStart(4, '0')}`;
      references.push({
        type: 'explicit',
        raw: match[0],
        resolved: this.storyExists(id) ? id : undefined,
        confidence: 1.0,
      });
    }

    // Title reference pattern
    const titleRef = this.detectTitleReference(input);
    if (titleRef) references.push(titleRef);

    // Relative reference pattern: "it", "that story", "the one"
    const relativeRef = this.detectRelativeReference(input);
    if (relativeRef) references.push(relativeRef);

    return references;
  }

  /**
   * Update context based on user message
   */
  updateContext(input: string): void {
    const refs = this.detectReferences(input);
    const resolved = refs.find(r => r.resolved);

    if (resolved?.resolved) {
      this.state.currentStory = resolved.resolved;
      this.addToRecent(resolved.resolved);
      this.state.lastUpdated = new Date();
    }
  }

  /**
   * Build story context section for prompt
   */
  buildContextSection(): string {
    if (!this.state.currentStory) return '';

    const story = this.stories.find(s => s.id === this.state.currentStory);
    if (!story) return '';

    return `## Current Story Context
Story: ${story.id} - ${story.title}
Status: ${story.status}
Priority: ${story.priority}

${story.summary || ''}

Acceptance Criteria:
${story.acceptanceCriteria?.map(ac => `- [ ] ${ac}`).join('\n') || 'None defined'}
`;
  }

  private detectTitleReference(input: string): StoryReference | null {
    // Look for phrases like "the auth story", "user authentication feature"
    const words = input.toLowerCase().split(/\s+/);

    let bestMatch: { story: StoryMetadata; score: number } | null = null;

    for (const story of this.stories) {
      const score = this.fuzzyMatchScore(input, story.title);
      if (score > 0.5 && (!bestMatch || score > bestMatch.score)) {
        bestMatch = { story, score };
      }
    }

    if (bestMatch) {
      return {
        type: 'title',
        raw: input,
        resolved: bestMatch.story.id,
        confidence: bestMatch.score,
      };
    }

    return null;
  }

  private detectRelativeReference(input: string): StoryReference | null {
    const relativePatterns = [
      /\b(it|that|this)\b/i,
      /\bthe (story|one|feature|bug|issue)\b/i,
      /\bthe one we (discussed|mentioned|talked about)\b/i,
    ];

    for (const pattern of relativePatterns) {
      if (pattern.test(input) && this.state.recentlyMentioned.length > 0) {
        return {
          type: 'relative',
          raw: input.match(pattern)?.[0] || '',
          resolved: this.state.recentlyMentioned[0],
          confidence: 0.7,
        };
      }
    }

    return null;
  }

  private fuzzyMatchScore(input: string, title: string): number {
    // Simple word overlap score
    const inputWords = new Set(input.toLowerCase().split(/\s+/));
    const titleWords = title.toLowerCase().split(/\s+/);
    const matches = titleWords.filter(w => inputWords.has(w)).length;
    return matches / titleWords.length;
  }

  private storyExists(id: string): boolean {
    return this.stories.some(s => s.id === id);
  }

  private addToRecent(id: string): void {
    this.state.recentlyMentioned = [
      id,
      ...this.state.recentlyMentioned.filter(s => s !== id),
    ].slice(0, 5);
  }

  get currentStory(): string | null {
    return this.state.currentStory;
  }

  clearContext(): void {
    this.state.currentStory = null;
  }
}
```

## Testing Requirements

- [ ] Unit test: Detect explicit story IDs (S-0078, S0078)
- [ ] Unit test: Detect title references with fuzzy matching
- [ ] Unit test: Detect relative references (it, that story)
- [ ] Unit test: Resolve references to correct story ID
- [ ] Unit test: Handle ambiguous references (multiple candidates)
- [ ] Unit test: Update current story on mention
- [ ] Unit test: Build context section for prompt
- [ ] Integration test: Context flows through conversation
- [ ] `npm test` passes
- [ ] `npm run build` succeeds

## Definition of Done

- [ ] Story reference detection working for all types
- [ ] Fuzzy title matching with reasonable accuracy
- [ ] Current story context persists across turns
- [ ] Context section added to agent prompts
- [ ] All tests pass
- [ ] `make verify` passes

## References

- Story metadata: `packages/core/src/core/kanban.ts`
- Related: S-0103 (Conversation manager)
