# ADR-003: Folder-per-story storage architecture

**Status:** Accepted
**Date:** 2026-01

## Context

The original kanban implementation stored each story as a single Markdown file
in a status-named folder (e.g. `.ai-sdlc/backlog/S-0001.md`). As the workflow
grew, each phase (research, plan, plan review, review) produced significant
structured output that needed to be stored alongside the story. Appending all
of this into a single `.md` file caused several problems:

1. **Lock contention**: Multiple agents reading/writing the same file raced
   even with file locking. Sections in a single file cannot be locked
   independently.
2. **Git diff noise**: A single file containing frontmatter, research output,
   implementation plan, and review feedback produced very large diffs.
3. **Context window bloat**: Agents that only needed the plan would receive
   the full story file including large research blobs.
4. **Migration complexity**: Moving a story between kanban folders required
   renaming the file with no way to attach sub-artifacts.

## Decision

Adopt a **folder-per-story** structure under `.ai-sdlc/stories/<story-id>/`,
with `story.md` holding frontmatter + description, and separate section files
(research, plan, plan review, review) written by each phase. The story's
kanban status moves from the parent folder name into the `status:` frontmatter
field inside `story.md`. A `migrate` command handles one-time migration from
the old flat structure.

## Consequences

**Positive:**
- Each section file can be read independently by agents (no excess context).
- Git diffs per phase are clean and reviewable.
- Lock contention is reduced: `story.md` is locked for status transitions;
  section files are written once by a single agent.
- Logs and future per-story artifacts have a natural home.

**Negative:**
- The `status` field is in frontmatter, not the folder name. Code that
  previously inferred status from the folder path must read frontmatter.
- Story lookup must resolve `stories/<id>/story.md` rather than searching
  kanban folders.
- Worktree support requires syncing the `stories/` subtree into each
  worktree's `.ai-sdlc/` directory.
