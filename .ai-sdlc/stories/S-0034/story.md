---
id: S-0034
title: Atomic Story Updates
priority: 2
status: backlog
type: feature
created: '2026-01-15'
labels:
  - concurrent-workflows
  - phase-1
  - infrastructure
epic: concurrent-workflows
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
slug: atomic-story-updates
---
# Atomic Story Updates

## User Story

**As a** developer using ai-sdlc,
**I want** story file updates to be atomic,
**So that** concurrent reads/writes don't corrupt frontmatter.

## Summary

When multiple processes read and write story frontmatter concurrently, race conditions can corrupt the file. This story adds file locking to ensure atomic read-modify-write operations on story files.

## Context

This is the second story in **Phase 1: Isolation Hardening** of the Concurrent Workflows epic.

**Depends on:** S-0033 (Per-Story Workflow State)
**Blocks:** All Phase 2 concurrent execution stories

**Reference:** `docs/ROADMAP_TO_CONCURRENT_WORK.md` (Section 6, Phase 1 Stories)

## Acceptance Criteria

- [ ] Add `proper-lockfile` dependency (or equivalent)
- [ ] `updateStoryFrontmatter()` acquires lock before read-modify-write
- [ ] Lock timeout is configurable (default 5 seconds)
- [ ] Lock acquisition failures are logged with helpful message
- [ ] Lock is always released, even on errors (try/finally pattern)
- [ ] Tests verify two concurrent writers don't corrupt file
- [ ] Performance impact is minimal (<100ms overhead for typical operations)
- [ ] All existing tests pass (`npm test`)
- [ ] TypeScript compilation succeeds (`npm run build`)

## Technical Notes

### Implementation Approach

```typescript
import { lock } from 'proper-lockfile';

async function updateStoryFrontmatter(
  storyPath: string,
  updates: Partial<Frontmatter>,
  options?: { lockTimeout?: number }
): Promise<void> {
  const timeout = options?.lockTimeout ?? 5000;
  const release = await lock(storyPath, {
    retries: {
      retries: 3,
      minTimeout: 100,
      maxTimeout: 1000
    },
    stale: timeout
  });

  try {
    const current = parseStory(storyPath);
    const updated = { ...current.frontmatter, ...updates };
    writeStory({ ...current, frontmatter: updated });
  } finally {
    await release();
  }
}
```

### Lock File Location

Lock files will be created adjacent to story files:
- Story: `.ai-sdlc/stories/S-0001/story.md`
- Lock: `.ai-sdlc/stories/S-0001/story.md.lock`

### Files to Modify

- `package.json` - Add `proper-lockfile` dependency
- `src/core/story.ts` - Add locking to update functions
- `src/types/index.ts` - Add lock options type if needed

### Error Handling

```typescript
// Lock acquisition failure
if (error.code === 'ELOCKED') {
  console.error(`Story ${storyId} is being modified by another process. Retrying...`);
}

// Stale lock (process crashed)
if (error.code === 'ESTALE') {
  console.warn(`Removing stale lock for ${storyId}`);
  // proper-lockfile handles this automatically with stale option
}
```

## Edge Cases

1. **Process crash during lock**: `proper-lockfile` handles stale locks
2. **Lock file on read-only filesystem**: Error gracefully, warn user
3. **Very long operations**: Consider lock renewal for operations > 5s
4. **Nested lock acquisition**: Avoid deadlock by not nesting locks

## Testing Strategy

```typescript
describe('atomic story updates', () => {
  it('should not corrupt file with concurrent writes', async () => {
    const storyPath = createTestStory();

    // Simulate concurrent updates
    await Promise.all([
      updateStoryFrontmatter(storyPath, { status: 'in-progress' }),
      updateStoryFrontmatter(storyPath, { priority: 1 }),
      updateStoryFrontmatter(storyPath, { labels: ['test'] }),
    ]);

    const result = parseStory(storyPath);
    // Verify file is valid YAML and all updates applied
    expect(result.frontmatter).toBeDefined();
  });
});
```

## Definition of Done

- [ ] Code review completed
- [ ] All tests passing (`npm test` shows 0 failures)
- [ ] TypeScript compilation succeeds (`npm run build`)
- [ ] Concurrent write test passes reliably
- [ ] Lock timeout is configurable
- [ ] No deadlock scenarios in testing

---

**Effort:** small
**Dependencies:** S-0033
**Blocks:** All Phase 2 stories
