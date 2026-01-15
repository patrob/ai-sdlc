---
id: S-0035
title: Conflict Detection Service
priority: 3
status: backlog
type: feature
created: '2026-01-15'
labels:
  - concurrent-workflows
  - phase-2
  - infrastructure
epic: concurrent-workflows
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
slug: conflict-detection-service
---
# Conflict Detection Service

## User Story

**As a** developer using ai-sdlc,
**I want** to know if two stories might conflict before running them,
**So that** I can avoid merge conflicts and wasted effort.

## Summary

Before running stories concurrently, we need to detect potential file conflicts. This service analyzes story branches to identify overlapping file modifications, allowing users to make informed decisions about concurrent execution.

## Context

This is the first story in **Phase 2: Concurrent Execution MVP** of the Concurrent Workflows epic.

**Depends on:** S-0033, S-0034 (Phase 1 complete)
**Blocks:** S-0036 (Pre-Flight Conflict Warning)

**Reference:** `docs/ROADMAP_TO_CONCURRENT_WORK.md` (Section 6, Phase 2 Stories)

## Acceptance Criteria

- [ ] New `src/core/conflict-detector.ts` service
- [ ] `detectConflicts(stories: Story[])` returns overlapping file analysis
- [ ] Uses `git diff --name-only` to compare branches against main
- [ ] Handles stories without branches (assumes no conflict yet)
- [ ] Handles stories in worktrees (checks worktree branch)
- [ ] Severity classification: high (same file), medium (same directory), low (different areas)
- [ ] Tests verify detection of shared file modifications
- [ ] All existing tests pass (`npm test`)
- [ ] TypeScript compilation succeeds (`npm run build`)

## Technical Notes

### Interface Design

```typescript
interface ConflictAnalysis {
  storyA: string;
  storyB: string;
  sharedFiles: string[];
  sharedDirectories: string[];
  severity: 'high' | 'medium' | 'low' | 'none';
  recommendation: string;
}

interface ConflictDetectionResult {
  conflicts: ConflictAnalysis[];
  safeToRunConcurrently: boolean;
  summary: string;
}

async function detectConflicts(stories: Story[]): Promise<ConflictDetectionResult>;
```

### Implementation Approach

```typescript
async function getModifiedFiles(storyId: string): Promise<string[]> {
  // Check if story has a branch
  const branchName = `ai-sdlc/${storyId}-*`;
  const branches = await git.branch(['--list', branchName]);

  if (branches.length === 0) {
    return []; // No branch yet, no files modified
  }

  // Get files modified in this branch vs main
  const diff = await git.diff(['--name-only', 'main...HEAD']);
  return diff.split('\n').filter(Boolean);
}

async function detectConflicts(stories: Story[]): Promise<ConflictDetectionResult> {
  const filesByStory = new Map<string, string[]>();

  for (const story of stories) {
    filesByStory.set(story.id, await getModifiedFiles(story.id));
  }

  const conflicts: ConflictAnalysis[] = [];

  // Pairwise comparison
  for (let i = 0; i < stories.length; i++) {
    for (let j = i + 1; j < stories.length; j++) {
      const filesA = filesByStory.get(stories[i].id) || [];
      const filesB = filesByStory.get(stories[j].id) || [];

      const sharedFiles = filesA.filter(f => filesB.includes(f));
      const sharedDirs = findSharedDirectories(filesA, filesB);

      if (sharedFiles.length > 0 || sharedDirs.length > 0) {
        conflicts.push({
          storyA: stories[i].id,
          storyB: stories[j].id,
          sharedFiles,
          sharedDirectories: sharedDirs,
          severity: classifySeverity(sharedFiles, sharedDirs),
          recommendation: generateRecommendation(sharedFiles, sharedDirs)
        });
      }
    }
  }

  return {
    conflicts,
    safeToRunConcurrently: conflicts.every(c => c.severity === 'none'),
    summary: generateSummary(conflicts)
  };
}
```

### Severity Classification

| Condition | Severity | Recommendation |
|-----------|----------|----------------|
| Same file modified | High | Run sequentially |
| Same directory, different files | Medium | Proceed with caution |
| Different directories | Low | Safe to run concurrently |
| No overlap | None | Safe to run concurrently |

### Files to Create/Modify

- `src/core/conflict-detector.ts` - New service
- `src/types/index.ts` - Add conflict types
- `src/core/index.ts` - Export new service

## Edge Cases

1. **Story without branch**: No files to compare, assume no conflict
2. **Story with uncommitted changes**: Include working directory changes
3. **Renamed files**: Track renames to detect semantic conflicts
4. **Deleted files**: Include in analysis (deletion + modification = conflict)
5. **Binary files**: Include but may need different handling

## Definition of Done

- [ ] Code review completed
- [ ] All tests passing (`npm test` shows 0 failures)
- [ ] TypeScript compilation succeeds (`npm run build`)
- [ ] Unit tests cover all severity classifications
- [ ] Integration test with real git branches
- [ ] Edge cases documented and handled

---

**Effort:** medium
**Dependencies:** S-0033, S-0034 (Phase 1)
**Blocks:** S-0036
