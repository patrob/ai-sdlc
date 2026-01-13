---
id: story-mk6abtvp-muan
title: Add file input support for story creation
priority: 4
status: ready
type: feature
created: '2026-01-09'
labels:
  - cli
  - story-creation
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
updated: '2026-01-13'
slug: ability-to-attach-a-document-instead-of-just-text-
---
# Add file input support for story creation

## User Story

**As a** developer using ai-sdlc,
**I want** to create stories by providing a file path instead of typing text,
**So that** I can quickly import existing requirements or documentation.

## Summary

Add a `--file` option to the `add` command that reads content from a file and creates a story from it. This is a minimal implementation to enable the workflow - future stories can add support for PDFs, images, etc.

## Acceptance Criteria

- [ ] `add` command accepts `--file <path>` option (short form: `-f`)
- [ ] File is read as UTF-8 text (supports .md, .txt, or any plaintext file)
- [ ] Title is extracted from: first H1 heading (`# Title`) OR filename (without extension)
- [ ] File content becomes the story body (after the standard frontmatter)
- [ ] Error shown if file doesn't exist or can't be read
- [ ] Existing `add "title"` behavior unchanged (backward compatible)
- [ ] No preview/confirmation step - story created immediately

## Out of Scope (Future Stories)

- PDF, DOCX, image support
- File size limits
- Multiple file uploads
- Combined text + file input
- Structured parsing of acceptance criteria from file

## Technical Notes

### Implementation Approach

1. Update `src/index.ts` - add `.option('-f, --file <path>')` to `add` command
2. Update `src/cli/commands.ts` - modify `add()` to handle file option:
   ```typescript
   if (options?.file) {
     const content = fs.readFileSync(path.resolve(options.file), 'utf-8');
     const title = extractTitleFromContent(content) || path.basename(options.file, path.extname(options.file));
     // Create story with content
   }
   ```
3. Add simple `extractTitleFromContent()` helper - regex for `^# (.+)$`

### Files to Modify

- `src/index.ts` - add --file option
- `src/cli/commands.ts` - handle file in add()

## Definition of Done

- [ ] `ai-sdlc add --file story.md` creates story from file
- [ ] `ai-sdlc add "Title"` still works (backward compatible)
- [ ] Error message shown for non-existent file
- [ ] All existing tests pass
- [ ] Basic test for file input added

---

**Effort:** small
**Labels:** cli, story-creation, file-input
