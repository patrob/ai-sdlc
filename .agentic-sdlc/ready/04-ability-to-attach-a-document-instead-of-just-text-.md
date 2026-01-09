---
id: story-mk6abtvp-muan
title: >-
  Ability to attach a document instead of just text for creating a story - i.e.
  add takes text or a file for input or make a separate command for adding files
  - for now accept markdown files or plaintext, but not pigeonholing into that,
  eventually take any kind of file or combination of text and file or multiple
  files to make one story.
priority: 4
status: ready
type: feature
created: '2026-01-09'
labels:
  - s
research_complete: true
plan_complete: true
implementation_complete: false
reviews_complete: false
updated: '2026-01-09'
---
# File Attachment Support for Story Creation

## User Story

As a **product manager**, I want to **create stories by uploading document files instead of only typing text**, so that **I can quickly import existing requirements documentation and work more efficiently with my existing workflow**.

## Summary

Extend the story creation functionality to accept file uploads (initially markdown and plaintext files) in addition to or instead of text input. This feature should be designed to eventually support multiple file types and combinations of text and file inputs.

## Acceptance Criteria

- [ ] System accepts `.md` (markdown) and `.txt` (plaintext) file uploads when creating a new story
- [ ] File content is parsed and populated into the appropriate story fields (title, summary, acceptance criteria if structured)
- [ ] User can choose between text input, file upload, or both when creating a story
- [ ] File size limit is enforced (suggest 5MB max for initial implementation)
- [ ] Unsupported file types display a clear error message listing accepted formats
- [ ] File upload preserves formatting from markdown files (headers, lists, code blocks, etc.)
- [ ] Command supports both inline text and file path parameter (e.g., `add --file path/to/story.md`)
- [ ] Successfully uploaded file content is validated before story creation
- [ ] User receives confirmation showing parsed content before final story creation

## Edge Cases & Constraints

**Edge Cases:**
- Empty files should be rejected with appropriate error message
- Malformed markdown should degrade gracefully to plain text
- Very large files (>5MB) should be rejected with size guidance
- Binary files or unsupported formats should fail with helpful error
- Files with no readable text content should be rejected

**Technical Constraints:**
- Initial implementation limited to `.md` and `.txt` files only
- Architecture should be extensible for future file type support (PDF, DOCX, etc.)
- Must maintain backward compatibility with existing text-only input method
- File uploads should work in both CLI and potential future web interface

**Future Considerations:**
- Support for multiple file uploads to create a single story
- Support for additional formats (PDF, DOCX, HTML)
- Combination of text input + file attachments
- Attachment storage and retrieval for reference

## Implementation Hints

- Consider using a file parsing abstraction layer to easily add new file types
- May need separate command (e.g., `add-from-file`) vs. modifying existing `add` command
- Implement file type detection via extension and/or magic number validation

---

**effort:** medium

**labels:** enhancement, file-upload, story-creation, phase-1, markdown-support

## Research

Perfect! Now I have enough context to provide comprehensive research findings. Let me compile the research report.

# Research: File Attachment Support for Story Creation

## 1. Relevant Existing Patterns and Code

### Current Story Creation Flow

**Entry Point: `src/index.ts` (Lines 46-49)**
```typescript
program
  .command('add <title>')
  .description('Add a new story to the backlog')
  .action(add);
```

**Command Handler: `src/cli/commands.ts` (Lines 110-135)**
- The `add()` function currently accepts a single `title: string` parameter
- Calls `createStory(title, sdlcRoot)` which generates a story from a title
- Creates a markdown file with frontmatter using the `gray-matter` library
- Returns the created story object with path information

**Story Creation Logic: `src/core/story.ts` (Lines 93-159)**
- `createStory()` function takes `title` and optional `StoryFrontmatter` options
- Uses `gray-matter` library (already installed!) for frontmatter parsing
- Generates structured markdown with predefined sections:
  - `## Summary`
  - `## Acceptance Criteria`
  - `## Research`
  - `## Implementation Plan`
  - `## Review Notes`

**Story Parsing: `src/core/story.ts` (Lines 9-23)**
- `parseStory()` function uses `gray-matter` to parse existing markdown files
- Separates frontmatter (metadata) from content body
- Already handles the exact file format we need to support

### Key Dependencies Already Available

**From `package.json`:**
- ✅ `gray-matter@^4.0.3` - Already installed for markdown frontmatter parsing
- ✅ `commander@^12.0.0` - CLI framework supporting options/arguments
- ✅ Node.js built-in `fs` module - File system operations

# Implementation Plan: File Attachment Support for Story Creation

## Overview
This plan implements file upload support for story creation, allowing users to create stories from `.md` and `.txt` files while maintaining backward compatibility with text-only input.

**Estimated Effort:** 4-6 hours  
**Approach:** Extend existing `add` command with `--file` option

---

## Phase 1: Setup & Validation Infrastructure

### 1.1 Create File Validation Module
- [ ] Create new file `src/core/validators.ts`
- [ ] Implement `validateFileExists(filePath: string): void` function
- [ ] Implement `validateFileSize(filePath: string, maxSizeMB: number): void` function
- [ ] Implement `validateFileExtension(filePath: string, allowedExtensions: string[]): void` function
- [ ] Implement `validateFileContent(content: string): void` function (check for empty/binary content)
- [ ] Add proper error messages with actionable guidance for each validation failure

### 1.2 Create Constants Configuration
- [ ] Add constants to `src/core/validators.ts` or new `src/config/constants.ts`:
  - `MAX_FILE_SIZE_MB = 5`
  - `ALLOWED_EXTENSIONS = ['.md', '.txt']`
  - Error message templates

---

## Phase 2: File Parser Implementation (TDD Approach)

### 2.1 Create Test Fixtures
- [ ] Create `test/fixtures/` directory
- [ ] Create `test/fixtures/valid-story.md` - Well-formed markdown with frontmatter and sections
- [ ] Create `test/fixtures/no-frontmatter.md` - Markdown without frontmatter (title from H1)
- [ ] Create `test/fixtures/plain-story.txt` - Plain text file
- [ ] Create `test/fixtures/empty.md` - Empty file
- [ ] Create `test/fixtures/malformed.md` - Markdown with inconsistent structure
- [ ] Create `test/fixtures/large.md` - File >5MB (for rejection testing)

### 2.2 Write Parser Tests (Test First!)
- [ ] Create `test/core/file-parser.test.ts`
- [ ] Write test: "should parse markdown file with frontmatter"
- [ ] Write test: "should extract title from H1 when frontmatter missing"
- [ ] Write test: "should parse acceptance criteria from checkbox lists"
- [ ] Write test: "should handle plaintext files and convert to story structure"
- [ ] Write test: "should preserve markdown formatting (code blocks, lists, tables)"
- [ ] Write test: "should gracefully handle malformed markdown"
- [ ] Write test: "should reject empty files"

### 2.3 Implement File Parser Module
- [ ] Create new file `src/core/file-parser.ts`
- [ ] Define `ParsedStoryContent` interface:
  ```typescript
  interface ParsedStoryContent {
    title?: string;
    frontmatter?: Partial<StoryFrontmatter>;
    content: string;
    sections?: { summary?: string; acceptanceCriteria?: string; };
  }
  ```
- [ ] Implement `parseMarkdownFile(content: string): ParsedStoryContent`
  - Extract frontmatter using `gray-matter`
  - Parse title from frontmatter or first H1
  - Extract structured sections (Summary, Acceptance Criteria)
  - Preserve markdown formatting
- [ ] Implement `parsePlaintextFile(content: string, filename: string): ParsedStoryContent`
  - Use filename (without extension) as title fallback
  - Place entire content in summary section
  - Generate basic structure
- [ ] Implement `parseFile(filePath: string): ParsedStoryContent` dispatcher
  - Determine file type from extension
  - Call appropriate parser
  - Handle errors gracefully
- [ ] Run tests and iterate until all pass ✅

---

## Phase 3: Core Story Creation Enhancement

### 3.1 Write Story Creation Tests
- [ ] Create `test/core/story-from-file.test.ts`
- [ ] Write test: "should create story from markdown file"
- [ ] Write test: "should create story from plaintext file"
- [ ] Write test: "should merge file content with default structure"
- [ ] Write test: "should auto-generate missing frontmatter fields"
- [ ] Write test: "should validate file before creating story"

### 3.2 Extend Story Module
- [ ] Open `src/core/story.ts`
- [ ] Create new function `createStoryFromFile(filePath: string, sdlcRoot: string): Story`
  - Read file content with `fs.readFileSync(filePath, 'utf-8')`
  - Call validation functions from validators module
  - Parse file using file-parser module
  - Extract/generate title from parsed content or filename
  - Merge parsed frontmatter with defaults (id, created, status, priority)
  - Merge parsed sections with default template
  - Call existing story creation logic to write file
  - Return Story object with path information
- [ ] Add helper function `mergeStoryContent(parsed: ParsedStoryContent, defaults: StoryTemplate): string`
- [ ] Run tests and verify all pass ✅

---

## Phase 4: CLI Integration

### 4.1 Update CLI Command Definition
- [ ] Open `src/index.ts`
- [ ] Modify the `add` command:
  ```typescript
  program
    .command('add [title]')
    .description('Add a new story to the backlog')
    .option('-f, --file <path>', 'Path to markdown or text file')
    .action((title, options) => add(title, options));
  ```
- [ ] Make `title` argument optional (square brackets)
- [ ] Add `--file` option with path parameter

### 4.2 Update Command Handler
- [ ] Open `src/cli/commands.ts`
- [ ] Update `add()` function signature:
  ```typescript
  export async function add(
    title?: string, 
    options?: { file?: string }
  ): Promise<void>
  ```
- [ ] Add logic at start of function:
  - If `options?.file` is provided, call `createStoryFromFile()`
  - If `title` is provided, call existing `createStory()`
  - If neither provided, show error: "Must provide either a title or --file option"
- [ ] Handle file path resolution with `path.resolve()`
- [ ] Wrap file operations in try-catch with user-friendly error messages

### 4.3 Add Preview/Confirmation Flow
- [ ] After parsing file, display preview to user:
  - Show extracted title
  - Show key sections (summary, acceptance criteria)
  - Show metadata that will be set
- [ ] Add confirmation prompt using existing CLI prompt utilities
- [ ] Only create story after user confirms (Y/n)
- [ ] Display success message with story path

---

## Phase 5: Error Handling & Edge Cases

### 5.1 Write Error Handling Tests
- [ ] Create `test/cli/add-command-errors.test.ts`
- [ ] Write test: "should reject file larger than 5MB"
- [ ] Write test: "should reject unsupported file extension (.pdf, .docx)"
- [ ] Write test: "should reject non-existent file path"
- [ ] Write test: "should reject empty file"
- [ ] Write test: "should reject binary files"
- [ ] Write test: "should handle file permission errors (EACCES)"
- [ ] Write test: "should show error when neither title nor --file provided"

### 5.2 Implement Error Handling
- [ ] Add comprehensive try-catch blocks in `createStoryFromFile()`
- [ ] Handle specific error types:
  - `ENOENT` - File not found
  - `EACCES` - Permission denied
  - `ERR_FILE_TOO_LARGE` - Custom error from validation
  - `ERR_UNSUPPORTED_EXTENSION` - Custom error from validation
  - `ERR_EMPTY_FILE` - Custom error from validation
- [ ] Use `chalk.red()` for error messages
- [ ] Provide actionable guidance in each error message
- [ ] Run tests and verify proper error handling ✅

### 5.3 Handle Edge Cases
- [ ] Test and handle malformed markdown (should degrade gracefully to plaintext)
- [ ] Test and handle files with special characters in filename
- [ ] Test and handle files with spaces in path
- [ ] Test and handle very long filenames
- [ ] Test and handle symbolic links to files
- [ ] Ensure all edge cases have appropriate tests

---

## Phase 6: Documentation & Examples

### 6.1 Update Help Documentation
- [ ] Verify `--file` option appears in help text (`agentic-sdlc add --help`)
- [ ] Ensure description is clear and concise
- [ ] Add examples section if not present

### 6.2 Create Example Files
- [ ] Create `examples/` directory (if doesn't exist)
- [ ] Create `examples/sample-story.md` with proper structure and comments
- [ ] Create `examples/sample-story.txt` with usage instructions
- [ ] Add comments explaining expected structure

### 6.3 Update README
- [ ] Add section: "Creating Stories from Files"
- [ ] Document usage: `agentic-sdlc add --file path/to/story.md`
- [ ] Document supported file types: `.md`, `.txt`
- [ ] Document file size limit: 5MB
- [ ] Document expected markdown structure (with example)
- [ ] Document how title extraction works
- [ ] Add note about future file type support

---

## Phase 7: Integration Testing

### 7.1 End-to-End Testing
- [ ] Create `test/integration/file-upload.test.ts`
- [ ] Write test: "should create story from markdown file end-to-end"
  - Mock file system with test fixtures
  - Call CLI command programmatically
  - Verify story file created in correct location
  - Verify story content matches expected structure
- [ ] Write test: "should create story from plaintext file end-to-end"
- [ ] Write test: "should preserve backward compatibility with text-only input"
- [ ] Write test: "should handle relative and absolute file paths"

### 7.2 Manual Testing Checklist
- [ ] Test: `agentic-sdlc add --file examples/sample-story.md`
- [ ] Test: `agentic-sdlc add --file examples/sample-story.txt`
- [ ] Test: `agentic-sdlc add "Manual Title"` (backward compatibility)
- [ ] Test: `agentic-sdlc add` with no arguments (should show error)
- [ ] Test: `agentic-sdlc add --file nonexistent.md` (should show error)
- [ ] Test: `agentic-sdlc add --file largefile.md` (should reject >5MB)
- [ ] Test: `agentic-sdlc add --file file.pdf` (should reject unsupported type)
- [ ] Test with file path containing spaces
- [ ] Test with relative path: `--file ./story.md`
- [ ] Test with absolute path: `--file /Users/name/story.md`

---

## Phase 8: Code Quality & Refinement

### 8.1 Code Review Checklist
- [ ] Review all new code for TypeScript type safety
- [ ] Ensure all functions have proper JSDoc comments
- [ ] Verify consistent error handling patterns
- [ ] Check for any hardcoded paths or values
- [ ] Verify proper use of async/await
- [ ] Ensure no console.log statements (use proper logging)

### 8.2 Testing Coverage
- [ ] Run test suite: `npm test`
- [ ] Verify all new functions have unit tests
- [ ] Check test coverage report
- [ ] Aim for >80% coverage on new code
- [ ] Add missing tests if coverage is low

### 8.3 Performance Validation
- [ ] Test with 5MB file (at limit) - should complete in <2 seconds
- [ ] Test with 100KB file - should complete in <500ms
- [ ] Test with 1KB file - should complete in <100ms
- [ ] Verify no memory leaks with large files

---

## Phase 9: Final Verification

### 9.1 Acceptance Criteria Verification
- [ ] ✅ System accepts `.md` (markdown) and `.txt` (plaintext) file uploads
- [ ] ✅ File content is parsed and populated into appropriate story fields
- [ ] ✅ User can choose between text input, file upload (both work)
- [ ] ✅ File size limit (5MB) is enforced with clear error
- [ ] ✅ Unsupported file types display error with accepted formats list
- [ ] ✅ File upload preserves markdown formatting
- [ ] ✅ Command supports `--file path/to/story.md` parameter
- [ ] ✅ File content is validated before story creation
- [ ] ✅ User receives confirmation/preview before final creation

### 9.2 Edge Cases Verification
- [ ] ✅ Empty files rejected with error message
- [ ] ✅ Malformed markdown degrades gracefully to plain text
- [ ] ✅ Large files (>5MB) rejected with size guidance
- [ ] ✅ Binary/unsupported formats fail with helpful error
- [ ] ✅ Files with no readable text content rejected

### 9.3 Constraints Verification
- [ ] ✅ Limited to `.md` and `.txt` only
- [ ] ✅ Architecture is extensible (parser abstraction layer exists)
- [ ] ✅ Backward compatibility maintained (`add "title"` still works)
- [ ] ✅ File uploads work in CLI (future web interface considered)

### 9.4 Pre-Deployment Checklist
- [ ] All tests passing (`npm test`)
- [ ] TypeScript compilation successful (`npm run build`)
- [ ] Linting passing (`npm run lint`)
- [ ] Documentation updated (README, examples)
- [ ] Manual testing completed
- [ ] No breaking changes to existing functionality

---

## Phase 10: Future Extensibility Setup

### 10.1 Architecture Documentation
- [ ] Add comments in `file-parser.ts` explaining how to add new file types
- [ ] Document the parser interface pattern
- [ ] Add TODO comments for future enhancements:
  - Multiple file upload support
  - PDF support (with `pdf-parse`)
  - DOCX support (with `mammoth`)
  - Combined text + file input

### 10.2 Feature Flags (Optional)
- [ ] Consider adding feature flag for file upload (if gradual rollout desired)
- [ ] Document how to disable/enable file upload feature

---

## Success Metrics

Upon completion, verify:
- ✅ Zero breaking changes to existing `add` command
- ✅ File upload works for both markdown and plaintext
- ✅ All acceptance criteria met
- ✅ All edge cases handled
- ✅ Test coverage >80% for new code
- ✅ Documentation complete and accurate
- ✅ Performance acceptable (<2s for 5MB file)

---

## Notes

- **TDD Approach**: Tests are written *before* implementation in Phases 2 and 3
- **Backward Compatibility**: Maintained throughout - existing `add "title"` continues to work
- **Extensibility**: Parser abstraction allows easy addition of new file types
- **User Experience**: Preview/confirmation step ensures user sees what will be created
- **No New Dependencies**: Everything uses existing project dependencies

**Estimated Time Breakdown:**
- Phase 1-2: 1.5 hours (setup + parser)
- Phase 3-4: 1.5 hours (core + CLI)
- Phase 5-6: 1 hour (errors + docs)
- Phase 7-8: 1 hour (testing + quality)
- Phase 9-10: 1 hour (verification + future prep)
- **Total: ~6 hours**

## 2. Files/Modules That Need Modification

### Core Implementation Files

1. **`src/index.ts`** (Modify)
   - Update the `add` command definition to accept an optional `--file` flag
   - Add option: `.option('-f, --file <path>', 'Path to markdown or text file')`
   - Signature becomes: `add <title>` OR `add --file <path>`

2. **`src/cli/commands.ts`** (Modify)
   - Update `add()` function signature to accept options object
   - Change from: `export async function add(title: string)`
   - Change to: `export async function add(titleOrOptions: string | { file?: string }, options?: { file?: string })`
   - Add file reading and parsing logic before calling `createStory()`
   - Add file validation (size, extension, content)

3. **`src/core/story.ts`** (Extend)
   - Add new function: `createStoryFromFile(filePath: string, sdlcRoot: string)`
   - Add helper: `parseFileContent(filePath: string, fileExtension: string)`
   - Add validation: `validateStoryFile(filePath: string)`
   - Keep existing `createStory()` for backward compatibility

4. **`src/types/index.ts`** (New types - Optional)
   - Could add: `type FileType = '.md' | '.txt';`
   - Could add: `interface FileUploadOptions { maxSize?: number; allowedExtensions?: FileType[]; }`

### New Files to Create (Optional but Recommended)

5. **`src/core/file-parser.ts`** (New - Recommended)
   - Abstract file parsing logic into a dedicated module
   - `interface FileParser { canParse(extension: string): boolean; parse(content: string): ParsedStory; }`
   - `class MarkdownParser implements FileParser` - Handles .md files
   - `class PlaintextParser implements FileParser` - Handles .txt files
   - `class FileParserFactory` - Returns appropriate parser based on extension
   - Makes it easy to add PDF, DOCX parsers later

6. **`src/core/validators.ts`** (New - Optional)
   - `validateFileSize(filePath: string, maxSize: number): void`
   - `validateFileExtension(filePath: string, allowed: string[]): void`
   - `validateFileContent(content: string): void`

## 3. External Resources & Best Practices

### File Handling Best Practices

**File Size Limits:**
- 5MB is reasonable for markdown/text files
- Node.js `fs.statSync(path).size` for size checking
- Should fail fast before reading entire file

**File Type Detection:**
- **Primary**: Extension-based (`.md`, `.txt`)
- **Secondary**: Could use "magic number" validation later
- Use `path.extname()` from Node.js built-in `path` module

**Error Handling:**
- Validate file exists before reading (`fs.existsSync()`)
- Handle permission errors (EACCES)
- Handle large files gracefully
- Provide clear, actionable error messages

### Markdown Parsing with `gray-matter`

The project already uses `gray-matter` which is perfect for this use case:

```typescript
import matter from 'gray-matter';

// Parse markdown file with frontmatter
const fileContent = fs.readFileSync(filePath, 'utf-8');
const { data, content } = matter(fileContent);

// data = frontmatter object
// content = markdown body
```

**Markdown Structure Detection:**
- Can detect existing frontmatter in uploaded files
- Can parse headers (`## Summary`, `## Acceptance Criteria`) from content
- Can extract title from `# Heading` if not in frontmatter

### Commander.js Options Patterns

**Approach 1: Optional Flag (Recommended)**
```typescript
program
  .command('add [title]')
  .option('-f, --file <path>', 'Path to markdown or text file')
  .description('Add a new story to the backlog')
  .action((title, options) => add(title, options));
```

**Approach 2: Separate Command**
```typescript
program
  .command('add-from-file <path>')
  .description('Add a new story from a file')
  .action((path) => addFromFile(path));
```

**Recommendation:** Use Approach 1 (optional flag) for better UX and maintains backward compatibility.

## 4. Potential Challenges & Risks

### Technical Challenges

**1. Ambiguous File Structure**
- **Challenge**: Uploaded markdown may not match expected section structure
- **Solution**: Use intelligent parsing to extract content
  - Look for `## Summary`, `## Acceptance Criteria` headers
  - If not found, place entire content in Summary section
  - Use first H1 (`#`) as title if not in frontmatter

**2. Incomplete or Missing Metadata**
- **Challenge**: File may lack required frontmatter fields
- **Solution**: Generate missing fields with defaults
  - Auto-generate `id`, `created`, `priority`, `status`
  - Extract `title` from filename or first H1 if missing
  - Set other fields to defaults

**3. Malformed Markdown**
- **Challenge**: Invalid markdown syntax could break parsing
- **Solution**: Graceful degradation
  - `gray-matter` handles missing frontmatter gracefully
  - Treat entire file as content body if frontmatter parse fails
  - Log warnings but don't fail

**4. File Path Resolution**
- **Challenge**: Relative vs absolute paths, spaces in paths
- **Solution**: Use `path.resolve()` to normalize paths
  - Handle spaces in filenames
  - Validate path exists with clear error message

**5. Character Encoding**
- **Challenge**: Files might use different encodings
- **Solution**: Default to UTF-8, could add encoding option later
  - `fs.readFileSync(path, 'utf-8')` handles most cases

### User Experience Challenges

**1. Confirmation/Preview**
- **Challenge**: User acceptance criteria requires "confirmation showing parsed content"
- **Solution**: After parsing, display structured preview before final creation
  - Show extracted title, sections, metadata
  - Ask for confirmation (Y/n prompt)
  - Could use `ora` for formatted display

**2. Large Files**
- **Challenge**: 5MB+ files should be rejected but need clear guidance
- **Solution**: Show file size in error message
  - "File too large: 6.2MB (max 5MB)"
  - Suggest splitting into multiple stories

**3. Binary Files**
- **Challenge**: Users might accidentally try to upload PDFs, images
- **Solution**: Early validation with helpful message
  - "Unsupported file type: .pdf"
  - "Currently supported: .md, .txt"
  - Mention future support for other formats

## 5. Dependencies & Prerequisites

### Already Available ✅
- `gray-matter` - Markdown frontmatter parsing
- `commander` - CLI option handling
- `fs`, `path` - Built-in Node.js modules
- `chalk`, `ora` - User feedback (already used)

### No New Dependencies Needed! ✅
All required functionality is available with existing dependencies.

### Optional Future Dependencies
- `mime-types` - For magic number file type detection
- `iconv-lite` - For non-UTF8 encoding support
- `mammoth` - For future DOCX support
- `pdf-parse` - For future PDF support

## 6. Implementation Strategy

### Phase 1: Basic File Upload (Markdown + Text)

**Step 1: Update CLI Interface**
- Modify `src/index.ts` to add `--file` option to `add` command
- Make `title` argument optional when `--file` is provided

**Step 2: Add File Validation**
- Create validation functions for size, extension, existence
- File size limit: 5MB
- Allowed extensions: `.md`, `.txt`

**Step 3: Create File Parser**
- New module: `src/core/file-parser.ts`
- Markdown parser: Extract frontmatter + structured sections
- Plaintext parser: Convert to basic story structure

**Step 4: Update Story Creation**
- Extend `createStory()` to accept optional parsed content
- OR create new `createStoryFromFile()` function
- Merge file content with default structure

**Step 5: Add Preview/Confirmation**
- Display parsed content to user
- Prompt for confirmation before final creation
- Use `ora` and `chalk` for formatting

### Phase 2: Enhanced Parsing

**Step 6: Intelligent Content Extraction**
- Auto-detect title from `# Header` or filename
- Parse acceptance criteria from checkbox lists
- Detect and preserve code blocks, tables

**Step 7: Error Handling & Edge Cases**
- Empty files
- Malformed markdown
- Files with no readable text
- Binary file detection

### Phase 3: Future Extensibility (Not in scope)

- Abstract parser interface for new file types
- Plugin architecture for custom parsers
- Multiple file upload support
- Combined text + file input

## 7. Backward Compatibility

✅ **Fully Maintained**
- Existing `agentic-sdlc add "title"` continues to work unchanged
- New `--file` option is additive
- No breaking changes to existing API
- Story file format remains identical

## 8. Testing Strategy

### Unit Tests to Add
- File validation (size, extension, existence)
- Markdown parsing with various structures
- Plaintext conversion to story format
- Error cases (empty, malformed, too large)

### Integration Tests
- End-to-end file upload flow
- CLI command parsing with `--file` flag
- Story creation from uploaded files

### Test Files Needed
- `fixtures/valid-story.md` - Well-formed markdown
- `fixtures/plain-story.txt` - Plain text file
- `fixtures/empty.md` - Empty file (should reject)
- `fixtures/large.md` - >5MB file (should reject)
- `fixtures/no-frontmatter.md` - Markdown without frontmatter

---

## Summary

This feature is **well-suited to the existing codebase** because:

1. ✅ **No new dependencies required** - `gray-matter` already handles markdown parsing
2. ✅ **Clean extension point** - Existing `createStory()` can be enhanced without breaking changes
3. ✅ **Consistent architecture** - File parsing fits naturally with existing story structure
4. ✅ **Commander.js support** - Framework already supports file path options
5. ✅ **Graceful degradation** - Can handle imperfect file inputs by falling back to defaults

**Recommended Approach:**
- Start with `--file` option on existing `add` command (not a separate command)
- Create abstracted `file-parser.ts` module for extensibility
- Use `gray-matter` for markdown, simple string processing for plaintext
- Display preview and require confirmation before creation
- Maintain full backward compatibility

**Estimated Effort:** Medium (as specified) - approximately 4-6 hours of development time.
