---
id: S-0072
title: Add ticket fields to story schema
priority: 20
status: backlog
type: feature
created: '2026-01-19'
labels:
  - schema
  - ticketing
  - non-breaking
  - epic-ticketing-integration
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
slug: add-ticket-fields-to-story-schema
dependencies:
  - S-0071
---
# Add ticket fields to story schema

## User Story

**As a** developer using ai-sdlc
**I want** optional ticket fields in story frontmatter
**So that** stories can be linked to external tickets without breaking existing workflows

## Summary

This story adds optional fields to `StoryFrontmatter` to support linking stories to external ticketing systems (GitHub Issues, Jira, etc.). This is a minimal, non-breaking change that lays the groundwork for ticketing integration without changing any existing behavior.

## Context

The current `StoryFrontmatter` interface in `src/types/index.ts` has no fields for external ticket references. To support ticketing integration, we need:
- `ticket_provider`: Which system (github, jira, etc.)
- `ticket_id`: The external ticket identifier
- `ticket_url`: Direct link to the ticket
- `synced_at`: Last sync timestamp

All fields are optional to maintain backward compatibility with existing stories.

## Acceptance Criteria

### Schema Changes

- [ ] Add optional fields to `StoryFrontmatter` in `src/types/index.ts`:
  ```typescript
  ticket_provider?: 'github' | 'jira' | 'linear';
  ticket_id?: string;
  ticket_url?: string;
  ticket_synced_at?: string;
  ```

- [ ] Update `parseStory()` in `src/core/story.ts` to handle stories with and without ticket fields

- [ ] Update `writeStory()` in `src/core/story.ts` to preserve ticket fields if present

### Backward Compatibility

- [ ] All existing stories (without ticket fields) continue to parse correctly
- [ ] All existing stories (without ticket fields) continue to write correctly
- [ ] No changes to story behavior - fields are purely for metadata storage

### Testing

- [ ] Add unit test: parseStory handles story with ticket fields
- [ ] Add unit test: parseStory handles story without ticket fields (existing behavior)
- [ ] Add unit test: writeStory preserves ticket fields when present
- [ ] Add unit test: writeStory works without ticket fields (existing behavior)
- [ ] All existing tests continue to pass

### Documentation

- [ ] Update `docs/configuration.md` (from S-0071) with ticket field descriptions
- [ ] Add note that fields are optional and used by ticketing integration

## Technical Details

### Type Definition

```typescript
// src/types/index.ts
export interface StoryFrontmatter {
  // ... existing fields ...

  // External ticket integration (optional)
  ticket_provider?: 'github' | 'jira' | 'linear';
  ticket_id?: string;        // e.g., "123" for GitHub, "PROJ-456" for Jira
  ticket_url?: string;       // Full URL to external ticket
  ticket_synced_at?: string; // ISO timestamp of last sync
}
```

### Test Cases

```typescript
describe('Story ticket fields', () => {
  it('should parse story with ticket fields', () => {
    const content = `---
id: S-0001
title: Test
ticket_provider: github
ticket_id: '123'
ticket_url: https://github.com/org/repo/issues/123
ticket_synced_at: '2026-01-19T10:00:00Z'
---
# Test`;
    const story = parseStoryContent(content);
    expect(story.frontmatter.ticket_provider).toBe('github');
    expect(story.frontmatter.ticket_id).toBe('123');
  });

  it('should parse story without ticket fields', () => {
    const content = `---
id: S-0001
title: Test
---
# Test`;
    const story = parseStoryContent(content);
    expect(story.frontmatter.ticket_provider).toBeUndefined();
  });
});
```

## Out of Scope

- Ticketing provider logic (covered in S-0073)
- Reading/writing to external tickets (covered in S-0074, S-0075)
- Any behavior changes based on ticket fields

## Definition of Done

- [ ] StoryFrontmatter includes ticket_provider, ticket_id, ticket_url, ticket_synced_at fields
- [ ] parseStory() handles stories with and without ticket fields
- [ ] writeStory() preserves ticket fields if present
- [ ] All existing tests pass
- [ ] New unit tests for ticket field handling pass
- [ ] Documentation updated
- [ ] `make verify` passes
