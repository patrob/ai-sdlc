---
id: story-mk8p9hcm-163q
title: Add web research as secondary source for external libraries and docs
priority: 9
status: ready
type: feature
created: '2026-01-10'
labels:
  - s
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
updated: '2026-01-11'
---
# Add web research as secondary source for external libraries and docs

## User Story

**As a** developer using the AI-SDLC workflow  
**I want** the research agent to supplement codebase analysis with web research for external library documentation  
**So that** I can get comprehensive research results that include both local code patterns and authoritative external documentation

## Context

This enhancement builds on the codebase-first research approach (Story 02) by adding web research as an intelligent secondary source. The research agent should first analyze the local codebase, then determine whether additional web research would provide value (e.g., external library APIs, industry best practices, unfamiliar patterns).

**Dependencies**: Story 02 (codebase-first research) must be completed first.

**Reference**: `/Users/probinson/.claude/plugins/cache/on-par/rpi/0.6.0/agents/web-research-specialist.md` contains web research patterns.

## Acceptance Criteria

- [ ] Research agent performs codebase analysis FIRST using existing Story 02 behavior
- [ ] Agent automatically determines when web research would add value (external dependencies, unfamiliar patterns, library-specific APIs)
- [ ] Web research phase uses Context7 MCP tools when available for library/framework documentation
- [ ] Web research phase falls back to WebSearch/WebFetch for general solutions and community knowledge
- [ ] Research findings include a dedicated "Web Research Findings" section in the structured output
- [ ] Web research results include FAR scale evaluation (Factuality, Actionability, Relevance)
- [ ] All research output (codebase + web) is written to the story file's Research section
- [ ] Existing research agent tests continue to pass
- [ ] New tests verify web research integration and FAR evaluation
- [ ] Agent gracefully handles cases where web tools are unavailable (offline mode)

## Constraints & Edge Cases

**Constraints:**
- Web research should NOT replace codebase analysis—it's supplementary only
- Must not make redundant web requests if codebase already has sufficient information
- Must respect web tool availability (Context7 may not be configured, network may be unavailable)
- FAR scale evaluation should be applied to web findings specifically, not redundantly to codebase findings

**Edge Cases:**
- Story topic is purely internal (no external dependencies) → Agent should skip web research
- Context7 MCP tools not available → Fall back to WebSearch/WebFetch
- All web tools unavailable → Agent completes with codebase-only research and logs limitation
- Web research contradicts codebase patterns → Agent should note the discrepancy and defer to local patterns with explanation
- Rate limiting or network errors during web research → Agent should note partial results and continue

## Technical Considerations

**Implementation approach:**
1. Add a web research decision point after codebase analysis completes
2. Create heuristics for when web research adds value (e.g., importing external packages, referencing unfamiliar APIs)
3. Implement Context7 integration with fallback to WebSearch/WebFetch
4. Add "Web Research Findings" section to research output template
5. Implement FAR scale evaluation utility for web research results
6. Update research agent tests to mock web tools and verify integration

**Testing strategy:**
- Unit tests: FAR evaluation logic, web research decision heuristics
- Integration tests: Full research flow with mocked web tools (Context7, WebSearch, WebFetch)
- Edge case tests: Missing dependencies, network failures, contradictory findings

**Files likely affected:**
- `src/agents/research.ts` (or equivalent research agent file)
- Research output templates/formatters
- Test files for research agent

---

**Effort**: medium  
**Labels**: enhancement, research-agent, web-integration, story-02-dependent
