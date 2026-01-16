---
id: S-0012
title: Add file input support for story creation
priority: 4
status: in-progress
type: feature
created: '2026-01-09'
labels:
  - cli
  - story-creation
research_complete: true
plan_complete: true
implementation_complete: false
reviews_complete: false
updated: '2026-01-16'
slug: ability-to-attach-a-document-instead-of-just-text-
worktree_path: >-
  /Users/probinson/Repos/on-par/pocs/ai-sdlc/.ai-sdlc/worktrees/S-0012-ability-to-attach-a-document-instead-of-just-text-
branch: ai-sdlc/ability-to-attach-a-document-instead-of-just-text-
last_test_run:
  passed: true
  failures: 0
  timestamp: '2026-01-16T16:30:16.724Z'
implementation_retry_count: 0
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

## Research

Perfect! Now I have enough context. Let me compile my research findings.

---

# Research Findings: Add File Input Support for Story Creation

## 1. Relevant Existing Patterns and Code

### Current `add` Command Implementation
- **Location**: `src/cli/commands.ts` (lines 151-176)
- **Current signature**: `export async function add(title: string): Promise<void>`
- **Dependencies**: Uses `createStory(title, sdlcRoot)` from `src/core/story.ts`
- **Pattern**: Simple function that takes only a title string, creates story with default template content

### Story Creation Flow
- **`createStory()` function** (src/core/story.ts, lines 270-372):
  - Takes `title: string`, `sdlcRoot: string`, and `options: Partial<StoryFrontmatter>`
  - Generates sequential ID (S-0001, S-0002, etc.) via `generateStoryId()`
  - Creates slug from title via `slugify()`
  - Creates hardcoded content template (lines 338-358)
  - **Key insight**: Content is currently a hardcoded template string. The `options` parameter only accepts frontmatter fields, not custom content.

### Title Extraction Utilities
- **`slugify()` function** (src/core/story.ts, line 256): Converts titles to URL-safe slugs
- **`path.basename()` usage**: Used in multiple places to extract filename from path (e.g., line 29, line 234 in index.ts)
- **No existing `extractTitleFromContent()` function**: Grep search returned no results - this is a new utility needed

### File Reading Patterns
- **`fs.readFileSync()` usage**: Found in 10 files across the codebase
- **Common pattern**: `fs.readFileSync(filePath, 'utf-8')` for text files
- **Path resolution**: Uses `path.resolve()` for absolute paths (security best practice)
- **Example** (src/core/story.ts, line 14):
  \`\`\`typescript
  const content = fs.readFileSync(filePath, 'utf-8');
  \`\`\`

### Commander.js Option Patterns
- **Existing option examples** (src/index.ts):
  - Boolean flags: `--dry-run`, `--force`, `--watch`
  - Value options: `--story <id-or-slug>`, `--log-level <level>`
  - Short forms: `-v, --verbose`, `-t, --tail`, `-f, --file <timestamp>`
  - **Pattern for file option**: `-f, --file <timestamp>` already exists for `logs` command (line 198)

## 2. Files/Modules That Need Modification

### Primary Changes

1. **`src/index.ts`** (CLI entry point)
   - Add `.option('-f, --file <path>', 'Create story from file')` to `add` command (after line 56)
   - Pass options to `add()` function

2. **`src/cli/commands.ts`** (Command implementations)
   - Modify `add()` function signature to accept options parameter
   - Add file reading logic when `options?.file` is provided
   - Add title extraction logic
   - Add error handling for file not found/unreadable

3. **`src/core/story.ts`** (Story creation utilities)
   - Modify `createStory()` to accept optional custom content
   - Add new exported function: `extractTitleFromContent(content: string): string | null`

### Testing Files to Create/Modify

1. **`src/core/story.test.ts`** (Unit tests)
   - Add tests for `extractTitleFromContent()` helper function
   - Test various markdown heading formats (ATX-style `# Title`, Setext-style underline)

2. **New test file or add to `src/cli/commands.test.ts`** (Integration tests)
   - Test `add` with `--file` option (file reading, title extraction, story creation)
   - Test error cases (file not found, empty file, no title extractable)

## 3. External Resources and Best Practices

### Markdown Title Extraction

**ATX-style headings** (recommended approach):
\`\`\`regex
^#\s+(.+)$
\`\`\`
- Matches lines starting with `#` followed by space and text
- Captures the title text in group 1
- Multi-line mode needed to match line start (`^`)

**Edge cases to handle**:
- Multiple H1 headings: Use the **first** occurrence
- No H1 heading: Fall back to filename (without extension)
- Empty file: Error or use filename as title
- File with only frontmatter: Extract from frontmatter `title:` field if present

**Best practice**: Look for frontmatter first (YAML between `---`), then H1 heading, then filename.

### File Path Security

**Security considerations** (already implemented in codebase):
- Always resolve to absolute path: `path.resolve(filePath)`
- Validate path is within expected directory (path traversal protection)
- Example from `moveToBlocked()` (story.ts, lines 184-196):
  \`\`\`typescript
  const resolvedPath = path.resolve(storyPath);
  if (!resolvedPath.startsWith(resolvedRoot)) {
    throw new Error('Invalid story path: outside SDLC root');
  }
  \`\`\`

**For user-provided file paths**:
- Use `path.resolve()` to normalize relative paths
- Check `fs.existsSync()` before reading
- Use try-catch for `fs.readFileSync()` to handle permission errors

### Commander.js Option Handling

**Pattern from existing code**:
\`\`\`typescript
program
  .command('add <title>')
  .description('Add a new story to the backlog')
  .option('-f, --file <path>', 'Create story from file')
  .action((title, options) => add(title, options));
\`\`\`

**Making title optional when --file is used**:
- Change `<title>` to `[title]` for optional positional arg
- Validate that either `title` or `options?.file` is provided

## 4. Potential Challenges and Risks

### Challenge 1: Backward Compatibility
**Issue**: Existing `add(title: string)` function signature will change.

**Mitigation**:
- Make options parameter optional with default value
- Existing calls `add(title)` will continue to work
- **Low risk** - internal API, no external consumers

### Challenge 2: Title Extraction Ambiguity
**Issue**: Multiple valid sources for title (frontmatter, H1, filename).

**Resolution order** (recommended):
1. Frontmatter `title:` field (if YAML present)
2. First H1 heading (`# Title`)
3. Filename without extension (`path.basename(filePath, path.extname(filePath))`)

**Risk**: Low - clear fallback chain ensures title is always available

### Challenge 3: Content Merging
**Issue**: File content may or may not include required sections (Summary, Acceptance Criteria, Research, etc.).

**Approach options**:
1. **Option A (recommended)**: Use file content as-is, don't inject template sections
   - Simpler, respects user intent
   - User can manually add sections if needed
   - Story structure sections can be added by agents during workflow

2. **Option B**: Parse file and inject missing sections
   - Complex, error-prone
   - May conflict with user's existing structure
   - **Not recommended** for v1

**Decision**: Use Option A - file content becomes story body verbatim (after frontmatter).

### Challenge 4: File Encoding
**Issue**: Files may not be UTF-8 encoded.

**Mitigation**:
- Explicitly specify `'utf-8'` encoding in `fs.readFileSync()`
- Add error handling for encoding errors
- Document limitation: only UTF-8 plaintext files supported
- **Low risk** - most markdown files are UTF-8

### Challenge 5: Large File Handling
**Issue**: User might try to import very large files.

**Current approach**: No size limit in acceptance criteria (marked as out of scope).

**Recommendation for v2**:
- Add validation: reject files > 1MB
- Show friendly error with file size
- **v1 decision**: Accept any size (simpler implementation)

## 5. Dependencies and Prerequisites

### Runtime Dependencies
- **All existing**: No new npm packages required
- `fs` (Node.js built-in)
- `path` (Node.js built-in)
- `commander` (already in package.json)

### Testing Dependencies
- **All existing**: vitest framework already configured
- Follow existing test patterns in `src/core/story.test.ts`

### Git State
- **No special requirements**: Standard file operations only
- No changes to git worktree logic needed

## 6. Implementation Strategy

### Phase 1: Core Utilities (Low Risk)
1. Add `extractTitleFromContent()` to `src/core/story.ts`
2. Modify `createStory()` to accept optional `content` parameter
3. Write unit tests for title extraction

### Phase 2: CLI Integration (Medium Risk)
1. Update `src/index.ts` to add `--file` option
2. Modify `add()` in `src/cli/commands.ts` to handle file input
3. Add error handling (file not found, read errors)

### Phase 3: Testing (Low Risk)
1. Add integration tests for file-based story creation
2. Test backward compatibility (existing `add "title"` still works)
3. Test error conditions

### Recommended Testing Approach
\`\`\`typescript
// Unit test: extractTitleFromContent()
describe('extractTitleFromContent', () => {
  it('should extract H1 heading', () => {
    const content = '# My Story Title\n\nSome content';
    expect(extractTitleFromContent(content)).toBe('My Story Title');
  });

  it('should handle no H1 heading', () => {
    const content = 'Just plain text';
    expect(extractTitleFromContent(content)).toBeNull();
  });

  it('should extract frontmatter title', () => {
    const content = '---\ntitle: Frontmatter Title\n---\n\n# Heading Title';
    expect(extractTitleFromContent(content)).toBe('Frontmatter Title');
  });
});
\`\`\`

## 7. Architecture Trade-offs

### Trade-off 1: Title Source Priority
**Options**:
- A) Frontmatter > H1 > Filename (recommended)
- B) H1 > Frontmatter > Filename (simpler regex)

**Recommendation**: Option A - respects explicit metadata over implicit content.

### Trade-off 2: Content Structure
**Options**:
- A) Use file content verbatim (recommended)
- B) Parse and inject missing sections

**Recommendation**: Option A - simpler, more predictable for v1.

### Trade-off 3: Error Handling
**Options**:
- A) Strict validation (file must exist, must be readable)
- B) Lenient fallbacks (use defaults on error)

**Recommendation**: Option A - fail fast with clear error messages.

---

## Summary

This feature is a **low-complexity addition** with minimal risk:

- **3 files to modify** (`src/index.ts`, `src/cli/commands.ts`, `src/core/story.ts`)
- **1 new function** (`extractTitleFromContent()`)
- **1 modified function** (`createStory()` - add optional content param)
- **Existing patterns** for file reading, path handling, and option parsing
- **No new dependencies** required

## Implementation Plan

# Implementation Plan: Add File Input Support for Story Creation

## Phase 1: Core Utility Functions

### Add Title Extraction Helper
- [ ] Add `extractTitleFromContent()` function to `src/core/story.ts`
  - Extract title from frontmatter YAML `title:` field (if present)
  - Fall back to first H1 heading using regex `^#\s+(.+)$`
  - Return `null` if no title found (caller will use filename)
  - Handle edge cases: empty content, multiple H1s (use first), malformed frontmatter

- [ ] Write unit tests in `src/core/story.test.ts` for `extractTitleFromContent()`
  - Test H1 heading extraction: `'# My Title\n\nContent'` → `'My Title'`
  - Test frontmatter title extraction: `'---\ntitle: My Title\n---\n\nContent'` → `'My Title'`
  - Test frontmatter priority over H1: frontmatter present → use frontmatter
  - Test no title found: `'Just plain text'` → `null`
  - Test empty content: `''` → `null`
  - Test multiple H1s: use first occurrence only
  - Test H1 with extra whitespace: `'#   Title  '` → `'Title'` (trimmed)

### Modify Story Creation Function
- [ ] Update `createStory()` signature in `src/core/story.ts`
  - Add optional `content?: string` parameter to function signature (line 270)
  - If `content` provided, use it instead of hardcoded template (replace lines 338-358)
  - If `content` not provided, use existing template (backward compatible)
  - Ensure frontmatter is prepended correctly in both cases

- [ ] Write unit tests in `src/core/story.test.ts` for custom content
  - Test `createStory()` with custom content parameter
  - Test `createStory()` without content parameter (existing behavior)
  - Verify frontmatter is correctly prepended to custom content
  - Verify file is created at correct path with correct content

## Phase 2: CLI Integration

### Update CLI Entry Point
- [ ] Modify `add` command in `src/index.ts` (around line 56)
  - Change `<title>` to `[title]` to make positional argument optional
  - Add `.option('-f, --file <path>', 'Create story from file')`
  - Update `.action()` to pass options object: `.action((title, options) => add(title, options))`

### Update Add Command Handler
- [ ] Modify `add()` function in `src/cli/commands.ts` (lines 151-176)
  - Change signature: `export async function add(title?: string, options?: { file?: string }): Promise<void>`
  - Add validation: ensure either `title` or `options?.file` is provided (exit with error if neither)
  - Add file handling logic:
    - If `options?.file` provided:
      - Resolve absolute path: `const filePath = path.resolve(options.file)`
      - Check file exists: `fs.existsSync(filePath)` (error if not)
      - Read file content: `fs.readFileSync(filePath, 'utf-8')` (wrap in try-catch)
      - Extract title: `extractTitleFromContent(content) || path.basename(filePath, path.extname(filePath))`
      - Call `createStory(title, sdlcRoot, {}, content)`
    - Else: use existing logic with `title` parameter
  - Add error handling:
    - File not found: clear error message with file path
    - File read error (permissions, encoding): clear error message
    - Neither title nor file provided: usage error

- [ ] Write integration tests in `src/cli/commands.test.ts`
  - Test `add()` with `--file` option (mock fs, verify `createStory()` called with file content)
  - Test `add()` with title only (existing behavior unchanged)
  - Test error: file not found
  - Test error: neither title nor file provided
  - Test title extraction: file with H1 heading
  - Test title extraction: file without H1 (uses filename)
  - Test title extraction: file with frontmatter title

## Phase 3: End-to-End Testing

### Manual Verification Tests
- [ ] Create test file `test-story.md` with H1 heading
  - Run: `npm run dev add --file test-story.md`
  - Verify: Story created in backlog with title from H1
  - Verify: Story content matches file content (after frontmatter)

- [ ] Create test file `test-frontmatter.md` with YAML frontmatter containing `title:`
  - Run: `npm run dev add --file test-frontmatter.md`
  - Verify: Story created with title from frontmatter (not H1)

- [ ] Create test file `no-title.txt` with no H1 or frontmatter
  - Run: `npm run dev add --file no-title.txt`
  - Verify: Story created with title from filename (`no-title`)

- [ ] Test error handling: non-existent file
  - Run: `npm run dev add --file does-not-exist.md`
  - Verify: Clear error message shown, no story created

- [ ] Test backward compatibility
  - Run: `npm run dev add "Manual Title Test"`
  - Verify: Story created with traditional template content

- [ ] Clean up test files and stories created during manual testing

## Phase 4: Final Verification

### Run Test Suite
- [ ] Run unit tests: `npm test` (or `npm run test:unit` if separate)
  - All new tests pass
  - All existing tests still pass (regression check)

- [ ] Run integration tests (if separate command)
  - File input integration tests pass
  - Backward compatibility tests pass

### Build and Lint Checks
- [ ] Run TypeScript compiler: `npm run build`
  - No type errors
  - Build succeeds

- [ ] Run linter: `npm run lint`
  - No linting errors
  - Code follows project style

### Pre-Commit Verification
- [ ] Run full verification: `make verify`
  - All checks pass (tests, build, lint)
  - Ready for commit

### Documentation Updates
- [ ] Update `README.md` if CLI usage section exists
  - Document `--file` / `-f` option
  - Add example: `ai-sdlc add --file requirements.md`

- [ ] Update story document with implementation status
  - Mark acceptance criteria as complete
  - Add "Implementation Complete" section with verification results
  - Include example usage

---

## Implementation Notes

### Key Files to Create/Modify

**Modified Files:**
1. `src/core/story.ts` - Add `extractTitleFromContent()`, modify `createStory()`
2. `src/cli/commands.ts` - Modify `add()` to handle file option
3. `src/index.ts` - Add `--file` option to CLI

**Test Files:**
1. `src/core/story.test.ts` - Unit tests for title extraction and custom content
2. `src/cli/commands.test.ts` - Integration tests for file input

### Risk Mitigation

- **Backward compatibility**: Optional parameters ensure existing `add "title"` still works
- **Error handling**: Explicit checks for file existence, read errors, missing title/file
- **Type safety**: TypeScript compilation will catch signature mismatches
- **Test coverage**: Unit tests for utilities, integration tests for full flow

### Success Criteria

✅ All checkboxes completed
✅ `npm test` passes with 0 failures  
✅ `npm run build` succeeds  
✅ `make verify` passes  
✅ Manual testing confirms all acceptance criteria met  
✅ Existing functionality unchanged (backward compatible)


### Implementation Notes (2026-01-16)

I need permission to read the files. Let me wait for the user to grant access.
