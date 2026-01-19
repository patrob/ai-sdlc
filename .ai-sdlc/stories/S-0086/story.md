---
id: S-0086
title: Convert Research Agent to Class-Based with SRP Refactoring
priority: 9
status: backlog
type: refactor
created: '2026-01-19'
labels:
  - architecture
  - agent-abstraction
  - srp-refactor
  - epic-modular-architecture
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
slug: convert-research-agent-srp
dependencies:
  - S-0082
  - S-0083
---
# Convert Research Agent to Class-Based with SRP Refactoring

## User Story

**As a** developer maintaining ai-sdlc
**I want** the research agent converted to a class with Single Responsibility Principle applied
**So that** each concern (codebase analysis, web research, sanitization, scoring) is properly separated

## Summary

This story converts `src/agents/research.ts` from a function-based implementation to a class-based implementation, while also addressing the SRP violation. The research agent currently handles 4 distinct responsibilities that should be separated.

## Technical Context

**Current State:**
- `research.ts` is 713 lines handling:
  1. Codebase context gathering
  2. Web research decision and execution
  3. Content sanitization
  4. FAR score evaluation
- All responsibilities mixed in one file

**Target State:**
- `ResearchAgent` class extending `BaseAgent`
- Supporting classes for each responsibility:
  - `CodebaseAnalyzer`
  - `WebResearcher`
  - `ContentSanitizer`
  - `FARScoreEvaluator`

## Acceptance Criteria

### ResearchAgent Class

- [ ] Create `ResearchAgent` class in `src/agents/research/index.ts`
- [ ] Extend `BaseAgent`
- [ ] Compose with supporting classes
- [ ] Define `requiredCapabilities`

### Supporting Classes (SRP Split)

- [ ] Create `src/agents/research/codebase-analyzer.ts`:
  - [ ] `gatherContext(sdlcRoot: string): Promise<CodebaseContext>`
  - [ ] Handles file discovery, pattern analysis

- [ ] Create `src/agents/research/web-researcher.ts`:
  - [ ] `shouldPerform(story: Story, context: CodebaseContext): boolean`
  - [ ] `perform(story: Story, context: CodebaseContext): Promise<WebResearchResult>`
  - [ ] Encapsulates web research logic

- [ ] Create `src/agents/research/content-sanitizer.ts`:
  - [ ] `sanitizeWebContent(text: string): string`
  - [ ] `sanitizeForLogging(text: string): string`
  - [ ] `sanitizeCodebaseContext(text: string): string`

- [ ] Create `src/agents/research/far-evaluator.ts`:
  - [ ] `evaluate(finding: ResearchFinding): FARScore`
  - [ ] FAR = Factual, Actionable, Relevant scoring

### Class Structure

```typescript
// src/agents/research/index.ts
export class ResearchAgent extends BaseAgent {
  readonly name = 'research';
  readonly requiredCapabilities: (keyof ProviderCapabilities)[] = [
    'supportsSystemPrompt',
    'supportsTools',
  ];

  private codebaseAnalyzer: CodebaseAnalyzer;
  private webResearcher: WebResearcher;
  private contentSanitizer: ContentSanitizer;
  private farEvaluator: FARScoreEvaluator;

  constructor(provider: IProvider) {
    super(provider);
    this.codebaseAnalyzer = new CodebaseAnalyzer();
    this.webResearcher = new WebResearcher(provider);
    this.contentSanitizer = new ContentSanitizer();
    this.farEvaluator = new FARScoreEvaluator();
  }

  async execute(context: AgentContext): Promise<ResearchResult> {
    const codebaseContext = await this.codebaseAnalyzer.gatherContext(context.sdlcRoot);

    let webResearch: WebResearchResult | undefined;
    if (this.webResearcher.shouldPerform(context.story, codebaseContext)) {
      webResearch = await this.webResearcher.perform(context.story, codebaseContext);
    }

    // ... combine and score
  }
}
```

### Backward Compatibility

- [ ] Keep `runResearch()` function export from `src/agents/research.ts`
- [ ] Function delegates to `ResearchAgent`

### File Organization

```
src/agents/research/
├── index.ts              # ResearchAgent class + runResearch export
├── codebase-analyzer.ts  # CodebaseAnalyzer class
├── web-researcher.ts     # WebResearcher class
├── content-sanitizer.ts  # ContentSanitizer class
├── far-evaluator.ts      # FARScoreEvaluator class
└── types.ts              # Research-specific types
```

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/agents/research/index.ts` | Create | ResearchAgent class |
| `src/agents/research/codebase-analyzer.ts` | Create | Codebase analysis |
| `src/agents/research/web-researcher.ts` | Create | Web research |
| `src/agents/research/content-sanitizer.ts` | Create | Content sanitization |
| `src/agents/research/far-evaluator.ts` | Create | FAR scoring |
| `src/agents/research/types.ts` | Create | Research types |
| `src/agents/research.ts` | Modify | Re-export from research/index.ts |
| `src/agents/factory.ts` | Modify | Register ResearchAgent |

## Testing Requirements

- [ ] Unit test: `CodebaseAnalyzer.gatherContext()`
- [ ] Unit test: `WebResearcher.shouldPerform()` decision logic
- [ ] Unit test: `ContentSanitizer` methods
- [ ] Unit test: `FARScoreEvaluator.evaluate()`
- [ ] Unit test: `ResearchAgent.execute()` integration
- [ ] `npm test` passes
- [ ] `npm run build` succeeds

## Definition of Done

- [ ] `ResearchAgent` class implemented
- [ ] All 4 supporting classes extracted
- [ ] SRP violations resolved
- [ ] Registered with `AgentFactory`
- [ ] Backward-compatible exports
- [ ] All existing tests pass
- [ ] Build succeeds

## References

- Architecture Analysis: `docs/architecture-analysis.md` Section 4.1 (SRP Violations)
- Current implementation: `src/agents/research.ts`
- SOLID Principle: Single Responsibility (SRP)
