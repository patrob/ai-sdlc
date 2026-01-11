---
id: story-mk6a525t-u69k
title: >-
  Change story architecture to folder-based: each story becomes a folder
  containing story.md plus related artifacts (implementation docs, research
  notes, etc.)
priority: 3
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
# Change story architecture to folder-based: each story becomes a folder containing story.md plus related artifacts (implementation docs, research notes, etc.)

## User Story

**As a** developer using the multi-agent story management system,  
**I want** each story to be organized as a folder containing a `story.md` file plus related artifacts (implementation docs, research notes, etc.),  
**So that** I can keep all story-related materials co-located and maintain better organization as stories evolve through the workflow.

## Summary

Transform the current flat-file story architecture into a folder-based structure where each story becomes a directory. This enables better organization of story lifecycle artifacts (research outputs, implementation plans, review notes, supporting documentation) by keeping them physically co-located with the main story file.

## Acceptance Criteria

- [ ] Each story is represented as a folder (e.g., `stories/001-story-name/` instead of `stories/001-story-name.md`)
- [ ] Every story folder contains a `story.md` file with the main story content
- [ ] Story folders can contain additional artifacts (e.g., `research.md`, `implementation-plan.md`, `review-notes.md`)
- [ ] The backlog agent correctly discovers and lists stories from the new folder structure
- [ ] The refine agent can read from and write to `story.md` within story folders
- [ ] The research agent can create additional files within the story folder (e.g., research artifacts)
- [ ] The planning agent can create implementation documentation within the story folder
- [ ] All file path references in agents are updated to handle the folder-based structure
- [ ] Existing flat-file stories can be migrated to the new structure (migration script or manual process documented)
- [ ] **All existing stories in the current board MUST be migrated to the new folder format as part of implementation** - do not leave any stories in the old flat-file format
- [ ] Documentation is updated to reflect the new folder-based architecture

## Constraints & Edge Cases

**Constraints:**
- Must maintain backward compatibility during migration period or provide clear migration path
- Folder naming convention must be consistent and filesystem-safe
- File path handling must work across different operating systems (Windows/Linux/Mac)

**Edge Cases:**
- Stories created before the migration exist as flat files
- Multiple agents attempting to write different files to the same story folder simultaneously
- Story folder names containing special characters or spaces
- Very long story titles that exceed filesystem path length limits
- Empty story folders (folder exists but no `story.md` yet)
- Orphaned artifact files in story folders after story deletion

## Technical Considerations

- Update all glob patterns and file search logic to look for `*/story.md` instead of `*.md`
- Consider using a consistent naming convention (e.g., `{id}-{slug}/story.md`)
- Decide whether to use numeric prefixes, timestamps, or pure slug-based folder names
- Determine structure for artifact files (free-form or prescribed names like `research.md`, `plan.md`)

---

**Effort:** medium

**Labels:** enhancement, architecture, refactoring, breaking-change

## Research

Now I have enough information to provide comprehensive research findings. Let me compile the research report:

# Research: Folder-Based Story Architecture

## 1. Relevant Existing Patterns and Code

### Current Architecture (Flat-File)

The system currently uses a **flat-file architecture** where each story is a single markdown file:

```
.agentic-sdlc/
├── backlog/
│   ├── 01-story-name.md
│   ├── 02-another-story.md
├── ready/
│   ├── 01-refined-story.md
├── in-progress/
│   ├── 01-active-story.md
└── done/
    ├── 01-completed-story.md
```

**Key Code Patterns:**

1. **Story Discovery** (`src/core/kanban.ts:10-22`):
   - Uses `fs.readdirSync()` to list files
   - Filters for `.md` files: `files.filter(f => f.endsWith('.md'))`
   - Maps to `parseStory()` function

2. **Story Parsing** (`src/core/story.ts:9-23`):
   - Reads file using `fs.readFileSync(filePath, 'utf-8')`
   - Parses YAML frontmatter using `gray-matter` library
   - Extracts slug from filename: `path.basename(filePath, '.md')`
   - Returns Story object with `path`, `slug`, `frontmatter`, `content`

3. **Story Creation** (`src/core/story.ts:93-159`):
   - Generates filename: `${priority.padStart(2, '0')}-${slug}.md`
   - Writes single markdown file with frontmatter + content

4. **Story Movement** (`src/core/story.ts:36-68`):
   - Creates new filename in target folder
   - Writes to new location
   - Deletes old file
   - Updates frontmatter status and priority

### Existing Dependencies

- **gray-matter**: YAML frontmatter parsing (already in package.json)
- **glob**: File pattern matching (already in package.json)
- **fs**: Node.js built-in filesystem operations
- **path**: Node.js built-in path manipulation

## 2. Files/Modules That Need Modification

### Core Files (High Priority)

1. **`src/core/story.ts`** - Primary refactoring target
   - `parseStory()`: Update to look for `story.md` within folder
   - `writeStory()`: Write to `{folder}/story.md` instead of `{folder}.md`
   - `moveStory()`: Move entire folder instead of single file
   - `createStory()`: Create folder structure instead of single file
   - **New function needed**: `createArtifact()` - Create additional files in story folder

2. **`src/core/kanban.ts`** - Story discovery logic
   - `getStoriesInFolder()`: Change from filtering `.md` files to finding folders containing `story.md`
   - Update pattern: `fs.readdirSync(folderPath).filter(f => f.endsWith('.md'))` 
     → `fs.readdirSync(folderPath).filter(f => fs.existsSync(path.join(folderPath, f, 'story.md')))`

### Agent Files (Medium Priority)

All agents need updates to support artifact creation:

3. **`src/agents/research.ts`** (lines 25-82)
   - Keep appending to `story.md` OR
   - Create separate `research.md` artifact file
   - Add utility to write artifacts to story folder

4. **`src/agents/planning.ts`** (lines 22-80)
   - Keep appending to `story.md` OR
   - Create separate `implementation-plan.md` artifact
   
5. **`src/agents/implementation.ts`** (lines 23-117)
   - Create `implementation-notes.md` artifact instead of appending
   - Could track which files were modified in a `changes.md` artifact

6. **`src/agents/review.ts`** (lines 36-98, 132-225)
   - Create `review-notes.md` artifact with all review feedback
   - Potentially track individual reviews as separate files

### CLI/Display Files (Low Priority)

7. **`src/cli/commands.ts`**
   - `formatAction()`: Update slug extraction (line 406)
   - `displayContentSections()`: May need to read from multiple files
   - No major structural changes needed (uses Story object abstraction)

### Type Definitions (Low Priority)

8. **`src/types/index.ts`**
   - `Story` interface: May want to add `folderPath` field
   - Consider adding artifact metadata tracking

### Utility/Template Files

9. **`templates/story.md`**
   - This becomes the template for the main `story.md` file
   - No changes needed (or minimal)

## 3. External Best Practices

### Folder-Based Document Organization

**Recommended Structure:**
```
.agentic-sdlc/
├── backlog/
│   ├── 01-story-name/
│   │   ├── story.md              # Main story file (required)
│   │   ├── research.md           # Research findings (optional)
│   │   ├── implementation-plan.md # Implementation plan (optional)
│   │   ├── review-notes.md       # Review feedback (optional)
│   │   └── artifacts/            # Supporting files (optional)
│   │       ├── diagrams/
│   │       └── notes/
```

**Best Practices from Similar Systems:**

1. **ADR (Architecture Decision Records)**: Uses numbered folders with index files
2. **Docusaurus/VuePress**: Uses folder-based organization with `index.md` or `README.md`
3. **Git repositories**: Many use folder-per-feature with supporting docs

**Naming Conventions:**

- **Main file**: `story.md` (clear, unambiguous)
- **Artifacts**: Descriptive names (`research.md`, `plan.md`, `review.md`)
- **Folders**: Keep existing `{priority}-{slug}` pattern for sorting

### Cross-Platform Compatibility

**Filesystem Considerations:**

1. **Path length limits**:
   - Windows: 260 character MAX_PATH (can be extended)
   - Unix/Linux: 4096 characters
   - macOS: 1024 characters
   - **Solution**: Keep slugs under 50 chars (already implemented in `slugify()`)

2. **Special characters**:
   - Existing `slugify()` function handles this well (line 82-88 in story.ts)
   - Converts to lowercase, replaces non-alphanumeric with `-`

3. **Case sensitivity**:
   - Windows/macOS: Case-insensitive but case-preserving
   - Linux: Case-sensitive
   - **Best practice**: Use lowercase consistently (already done)

## 4. Potential Challenges and Risks

### Migration Challenges

**Challenge 1: Backward Compatibility**
- **Risk**: Existing flat-file stories need migration
- **Impact**: Medium - affects all existing users
- **Mitigation**: 
  - Create migration script that converts `story.md` → `story-folder/story.md`
  - Add detection logic to support both formats during transition
  - Provide clear migration documentation

**Challenge 2: Concurrent File Access**
- **Risk**: Multiple agents writing different artifacts simultaneously
- **Impact**: Low - Node.js is single-threaded by default
- **Mitigation**: 
  - Already using `write-file-atomic` dependency (in package.json)
  - Extend atomic writes to folder operations
  - Use proper file locking if needed

**Challenge 3: Story Movement Complexity**
- **Risk**: Moving entire folders is more complex than moving files
- **Impact**: Medium - core operation could fail leaving orphaned files
- **Mitigation**:
  - Use atomic operations: create in new location, then delete old
  - Add validation before deletion
  - Consider using `fs.rename()` when possible (same filesystem)

### Implementation Challenges

**Challenge 4: Glob Pattern Updates**
- **Risk**: Need to update all file discovery patterns
- **Impact**: High - affects story listing, search, state assessment
- **Current pattern**: `*.md` files
- **New pattern**: `*/story.md` (folders containing story.md)
- **Mitigation**: Centralize discovery logic in `kanban.ts`

**Challenge 5: Path Reference Updates**
- **Risk**: Story paths now reference folders, not files
- **Impact**: Medium - affects how stories are referenced
- **Example**: 
  - Old: `.agentic-sdlc/backlog/01-story-name.md`
  - New: `.agentic-sdlc/backlog/01-story-name/story.md`
- **Mitigation**: Update Story interface to track both folder and file paths

**Challenge 6: Empty Folder Handling**
- **Risk**: Folder exists but no `story.md` inside
- **Impact**: Low - could break story parsing
- **Mitigation**: Add validation in `parseStory()` to check file exists

### Edge Cases

**Edge Case 1: Orphaned Artifacts**
- **Scenario**: Story deleted but artifacts remain
- **Solution**: Delete entire folder (not just story.md)

**Edge Case 2: Duplicate Story IDs**
- **Scenario**: Same story in multiple folders (shouldn't happen but...)
- **Solution**: Use frontmatter ID as source of truth, warn on duplicates

**Edge Case 3: Very Long Story Titles**
- **Current mitigation**: `slugify()` limits to 50 chars
- **Additional risk**: Folder paths are longer than file paths
- **Solution**: Consider shorter slugs or hash-based folder names

## 5. Dependencies and Prerequisites

### Code Dependencies

**No new dependencies required** - all necessary packages already in `package.json`:
- ✅ `gray-matter` - YAML frontmatter parsing
- ✅ `glob` - Pattern matching (may need pattern updates)
- ✅ `write-file-atomic` - Atomic file operations
- ✅ Node.js built-in: `fs`, `path`

### Development Prerequisites

1. **TypeScript types**: Update `Story` interface to include folder path
2. **Migration script**: Create standalone script to migrate existing stories
3. **Validation**: Add checks for folder structure integrity
4. **Tests**: Update existing tests for folder-based architecture

### Operational Prerequisites

**Before Implementation:**
1. Document current story structure
2. Create backup/migration strategy
3. Define artifact file naming conventions
4. Update user documentation

**Breaking Change Management:**
- This is a **breaking change** (as noted in story labels)
- Requires version bump (suggest 0.2.0 or 1.0.0)
- Provide migration tool or clear manual instructions

## 6. Recommended Implementation Approach

### Phase 1: Core Infrastructure
1. Update `parseStory()` to handle folder-based stories
2. Update `writeStory()` to write to folder structure
3. Update `getStoriesInFolder()` discovery logic
4. Add new `createArtifact()` helper function

### Phase 2: Agent Updates
1. Update research agent to create `research.md` artifact
2. Update planning agent to create `implementation-plan.md` artifact
3. Update implementation agent to create `implementation-notes.md`
4. Update review agent to create `review-notes.md`

### Phase 3: Migration & Compatibility
1. Create migration script for existing stories
2. Add backward compatibility layer (optional)
3. Update CLI display logic if needed
4. Update documentation

### Phase 4: Testing & Validation
1. Test story creation in new format
2. Test story movement between folders
3. Test artifact creation by agents
4. Test edge cases (empty folders, missing files, etc.)

### Artifact Organization Strategy

**Option A: Keep sections in story.md** (Lower risk)
- Research, Plan, Reviews stay in `story.md`
- Only add artifacts when explicitly needed
- Minimal changes to existing agent logic

**Option B: Separate artifact files** (Higher benefit)
- Move Research → `research.md`
- Move Implementation Plan → `implementation-plan.md`
- Move Review Notes → `review-notes.md`
- Keep only core story content in `story.md`
- Better organization, cleaner separation

**Recommendation**: Start with Option A (append to story.md), then add Option B as enhancement

## 7. Success Criteria

✅ Each story is a folder containing `story.md`  
✅ Agents can create additional artifact files  
✅ Story discovery works across all kanban folders  
✅ Story movement preserves all artifacts  
✅ Existing flat-file stories can be migrated  
✅ No breaking changes to Story interface consumers  
✅ Cross-platform compatibility maintained  
✅ Clear migration path documented  

---

**Estimated Effort Validation**: ✅ **Medium** - Matches story estimate
- Core changes are straightforward but touch many files
- Migration adds complexity
- Testing needs to be thorough
- Breaking change requires careful rollout

## Implementation Plan

# Implementation Plan: Folder-Based Story Architecture

## Overview
Transform the story management system from flat-file architecture (`.md` files) to folder-based architecture (folders containing `story.md` + artifacts). This plan uses a **phased migration approach** to minimize risk and maintain system stability.

---

## Phase 1: Preparation & Setup

### 1.1 Create Test Infrastructure
- [ ] Create test story fixtures in flat-file format for migration testing
- [ ] Create test story fixtures in folder format for validation
- [ ] Set up test utilities to create/cleanup temporary story folders
- [ ] Add test helpers for comparing story content before/after migration

### 1.2 Document Current Architecture
- [ ] Document current file paths and naming conventions
- [ ] List all locations where story paths are referenced
- [ ] Create backup of existing `.agentic-sdlc` folder structure (document in README)
- [ ] Define new folder naming convention (recommendation: keep `{priority}-{slug}` format)

### 1.3 Define Artifact Conventions
- [ ] Document standard artifact filenames (`research.md`, `implementation-plan.md`, `review-notes.md`)
- [ ] Define folder structure for supporting files (optional `artifacts/` subfolder)
- [ ] Update `templates/story.md` if needed (minimal changes expected)
- [ ] Create example story folder structure in documentation

---

## Phase 2: Core Infrastructure Updates

### 2.1 Update Type Definitions
**File: `src/types/index.ts`**
- [ ] Add `folderPath: string` field to `Story` interface (tracks folder containing story)
- [ ] Add `filePath: string` field (tracks path to `story.md` within folder)
- [ ] Add optional `artifacts?: string[]` field to track additional files
- [ ] Ensure backward compatibility with existing Story consumers

### 2.2 Update Story Parsing Logic
**File: `src/core/story.ts`**
- [ ] Update `parseStory()` to accept folder path and look for `story.md` inside
- [ ] Add validation: check that `story.md` exists before parsing
- [ ] Update slug extraction: `path.basename(folderPath)` instead of `path.basename(filePath, '.md')`
- [ ] Update Story object construction to include `folderPath` and `filePath`
- [ ] Add error handling for empty folders or missing `story.md`

### 2.3 Update Story Writing Logic
**File: `src/core/story.ts`**
- [ ] Update `writeStory()` to create folder if it doesn't exist (`fs.mkdirSync(folderPath, { recursive: true })`)
- [ ] Write content to `{folderPath}/story.md` instead of `{folderPath}.md`
- [ ] Use `write-file-atomic` for atomic writes to `story.md`
- [ ] Update error handling for folder creation failures

### 2.4 Update Story Creation Logic
**File: `src/core/story.ts` - `createStory()` function**
- [ ] Change filename generation from `${priority}-${slug}.md` to `${priority}-${slug}/story.md`
- [ ] Create folder structure: `fs.mkdirSync(folderPath, { recursive: true })`
- [ ] Write story content to `story.md` within folder
- [ ] Update return value to reflect new folder-based paths

### 2.5 Update Story Movement Logic
**File: `src/core/story.ts` - `moveStory()` function**
- [ ] Update to move entire folder instead of single file
- [ ] Use `fs.renameSync(oldFolderPath, newFolderPath)` for same-filesystem moves
- [ ] For cross-filesystem moves: copy entire folder recursively, then delete old folder
- [ ] Add validation: ensure target folder doesn't already exist
- [ ] Add rollback logic if move fails partway through
- [ ] Preserve all artifacts during move operation

### 2.6 Add Artifact Management Functions
**File: `src/core/story.ts`**
- [ ] Create `createArtifact(story: Story, artifactName: string, content: string)` function
- [ ] Create `readArtifact(story: Story, artifactName: string): string | null` function
- [ ] Create `listArtifacts(story: Story): string[]` function to list all files in story folder
- [ ] Create `deleteArtifact(story: Story, artifactName: string)` function
- [ ] Use `write-file-atomic` for artifact writes

### 2.7 Update Story Discovery Logic
**File: `src/core/kanban.ts` - `getStoriesInFolder()` function**
- [ ] Change from filtering `.md` files to finding folders containing `story.md`
- [ ] Update pattern: `fs.readdirSync(folderPath).filter(item => {...})`
- [ ] Check: `fs.statSync(fullPath).isDirectory()` AND `fs.existsSync(path.join(fullPath, 'story.md'))`
- [ ] Update to pass folder path (not file path) to `parseStory()`
- [ ] Add error handling for permission issues or corrupted folders

---

## Phase 3: Create Migration Script

### 3.1 Build Migration Utility
**File: `src/scripts/migrate-to-folders.ts` (new file)**
- [ ] Create script that scans all kanban folders for flat-file stories
- [ ] For each `*.md` file found (except `README.md`):
  - [ ] Extract filename slug: `path.basename(file, '.md')`
  - [ ] Create folder with same name: `{slug}/`
  - [ ] Move file into folder and rename to `story.md`
  - [ ] Log migration progress
- [ ] Add dry-run mode (`--dry-run` flag) to preview changes without modifying files
- [ ] Add backup creation before migration
- [ ] Add rollback capability in case of failures

### 3.2 Add Migration Validation
**File: `src/scripts/migrate-to-folders.ts`**
- [ ] Validate that all stories were migrated successfully
- [ ] Check for orphaned flat files after migration
- [ ] Verify all `story.md` files are valid and parseable
- [ ] Generate migration report (files moved, errors encountered)
- [ ] Add checksum validation (content unchanged after migration)

### 3.3 Create Migration Documentation
**File: `docs/migration-guide.md` (new file)**
- [ ] Document why migration is needed
- [ ] Provide step-by-step migration instructions
- [ ] Document backup/restore procedures
- [ ] Include troubleshooting section
- [ ] Add examples of before/after folder structures
- [ ] Note that this is a breaking change requiring version bump

---

## Phase 4: Update Agent Logic

### 4.1 Update Research Agent
**File: `src/agents/research.ts`**
- [ ] Keep current behavior: append research to `story.md` (Option A - lower risk)
- [ ] Update file path references to use `story.folderPath`
- [ ] (Future enhancement) Add optional `createArtifact()` call to write `research.md`
- [ ] Test research workflow with folder-based stories

### 4.2 Update Planning Agent
**File: `src/agents/planning.ts`**
- [ ] Keep current behavior: append plan to `story.md`
- [ ] Update file path references to use `story.folderPath`
- [ ] (Future enhancement) Add optional `createArtifact()` call to write `implementation-plan.md`
- [ ] Test planning workflow with folder-based stories

### 4.3 Update Implementation Agent
**File: `src/agents/implementation.ts`**
- [ ] Update to use `story.folderPath` for file operations
- [ ] Keep appending to `story.md` for now
- [ ] (Future enhancement) Create `implementation-notes.md` artifact
- [ ] Test implementation workflow with folder-based stories

### 4.4 Update Review Agent
**File: `src/agents/review.ts`**
- [ ] Update to use `story.folderPath` for file operations
- [ ] Keep appending review notes to `story.md`
- [ ] (Future enhancement) Create `review-notes.md` artifact for each review
- [ ] Test review workflow with folder-based stories

---

## Phase 5: Update CLI and Display Logic

### 5.1 Update CLI Commands
**File: `src/cli/commands.ts`**
- [ ] Update `formatAction()` to handle folder-based paths (line ~406)
- [ ] Update any path display logic to show folder names correctly
- [ ] Test all CLI commands (list, show, move, create, refine, etc.)
- [ ] Ensure story slugs display correctly in CLI output

### 5.2 Update Content Display
**File: `src/cli/commands.ts` - `displayContentSections()`**
- [ ] Verify it works with folder-based Story objects (should work via abstraction)
- [ ] Test displaying stories with multiple artifacts
- [ ] (Future enhancement) Add artifact listing to story display
- [ ] Update help text if needed

---

## Phase 6: Testing

### 6.1 Unit Tests for Core Functions
**Files: `src/core/__tests__/story.test.ts`, `src/core/__tests__/kanban.test.ts`**
- [ ] Test `parseStory()` with folder-based stories
- [ ] Test `writeStory()` creates folder and `story.md` correctly
- [ ] Test `createStory()` generates correct folder structure
- [ ] Test `moveStory()` moves entire folder with artifacts
- [ ] Test `createArtifact()` creates files in correct location
- [ ] Test `listArtifacts()` returns all non-story.md files
- [ ] Test `getStoriesInFolder()` discovers folder-based stories
- [ ] Test error handling (missing `story.md`, invalid paths, etc.)

### 6.2 Integration Tests for Agents
**Files: `src/agents/__tests__/*.test.ts`**
- [ ] Test research agent creates/updates folder-based stories
- [ ] Test planning agent works with folder structure
- [ ] Test implementation agent preserves artifacts during updates
- [ ] Test review agent can read/write to folder-based stories
- [ ] Test agent workflows end-to-end (backlog → done)

### 6.3 Migration Tests
**File: `src/scripts/__tests__/migrate-to-folders.test.ts`**
- [ ] Test migration script converts flat files to folders
- [ ] Test dry-run mode doesn't modify files
- [ ] Test migration preserves story content exactly
- [ ] Test migration handles edge cases (special characters, long names)
- [ ] Test rollback functionality
- [ ] Test migration report generation

### 6.4 Edge Case Testing
- [ ] Test empty folders (folder exists but no `story.md`)
- [ ] Test orphaned artifacts (artifacts without parent story)
- [ ] Test duplicate folder names (shouldn't happen but validate)
- [ ] Test very long story titles (exceed path length limits)
- [ ] Test special characters in folder names
- [ ] Test concurrent access (multiple agents, same story)
- [ ] Test cross-platform compatibility (Windows/Linux/macOS path handling)

---

## Phase 7: Documentation Updates

### 7.1 Update User Documentation
**File: `README.md`**
- [ ] Update architecture section to describe folder-based structure
- [ ] Add example of folder structure with artifacts
- [ ] Document artifact file naming conventions
- [ ] Add migration instructions (or link to migration guide)
- [ ] Update getting started guide if needed

### 7.2 Update Developer Documentation
**File: `docs/architecture.md` (or similar)**
- [ ] Document new folder-based architecture
- [ ] Explain Story interface changes (`folderPath`, `filePath`)
- [ ] Document artifact management functions
- [ ] Provide code examples for creating artifacts
- [ ] Update file organization diagrams

### 7.3 Update Changelog
**File: `CHANGELOG.md`**
- [ ] Add entry for breaking change (version bump to 0.2.0 or 1.0.0)
- [ ] List all changes (folder structure, artifact support, migration)
- [ ] Note backward incompatibility and migration requirements
- [ ] Link to migration guide

---

## Phase 8: Verification & Rollout

### 8.1 Manual Verification
- [ ] Create a new story using CLI and verify folder structure
- [ ] Move a story between kanban columns and verify artifacts preserved
- [ ] Run research agent and verify output location
- [ ] Run planning agent and verify output location
- [ ] Run implementation agent and verify it works with folders
- [ ] Run review agent and verify it works with folders
- [ ] List stories in each kanban column and verify discovery works

### 8.2 Migration Verification
- [ ] Create test stories in flat-file format
- [ ] Run migration script with `--dry-run` flag
- [ ] Review migration report for accuracy
- [ ] Run actual migration
- [ ] Verify all stories are accessible after migration
- [ ] Verify story content unchanged (checksum validation)
- [ ] Test all CLI commands post-migration

### 8.3 Backward Compatibility Check
- [ ] Verify no existing workflows are broken
- [ ] Test with real user stories (if applicable)
- [ ] Check for any hardcoded path assumptions in external tools
- [ ] Validate that Story interface consumers still work

### 8.4 Performance Testing
- [ ] Test with large number of stories (100+)
- [ ] Measure story discovery performance (folder-based vs flat-file)
- [ ] Test folder operations on slow filesystems
- [ ] Verify no performance degradation in CLI commands

---

## Phase 9: Deployment & Monitoring

### 9.1 Pre-Deployment Checklist
- [ ] All tests passing (unit, integration, edge cases)
- [ ] Migration script tested thoroughly
- [ ] Documentation complete and reviewed
- [ ] Changelog updated with breaking change notice
- [ ] Version number bumped appropriately (0.2.0 or 1.0.0)

### 9.2 Deployment Steps
- [ ] Tag release in version control
- [ ] Publish migration guide
- [ ] Notify users of breaking change
- [ ] Provide support for migration issues
- [ ] Monitor for bug reports or issues

### 9.3 Post-Deployment Validation
- [ ] Verify migration script works for real users
- [ ] Address any reported issues promptly
- [ ] Update FAQ with common migration questions
- [ ] Consider creating automated migration on first run (future enhancement)

---

## Rollback Plan

### If Critical Issues Arise
- [ ] Revert code changes to previous version
- [ ] Restore backup of `.agentic-sdlc` folder
- [ ] Document issues encountered
- [ ] Create hotfix plan to address root cause
- [ ] Re-test before attempting deployment again

---

## Future Enhancements (Post-Implementation)

### Optional Improvements
- [ ] Add artifact visualization in CLI (list all artifacts for a story)
- [ ] Implement Option B: Move research/plan/review to separate artifact files
- [ ] Add artifact templates (e.g., `research-template.md`)
- [ ] Create artifact diffing/versioning
- [ ] Add support for nested artifact folders (`artifacts/diagrams/`, etc.)
- [ ] Implement automatic artifact cleanup on story deletion
- [ ] Add artifact search across all stories

---

## Success Criteria

✅ **All acceptance criteria met:**
- Each story is a folder containing `story.md`
- Story folders support additional artifacts
- All agents work correctly with folder structure
- Migration path exists and is documented
- No breaking changes to Story interface consumers
- Cross-platform compatibility maintained
- Documentation reflects new architecture

✅ **All tests passing** (unit, integration, edge cases)

✅ **Migration successful** with zero data loss

✅ **Performance acceptable** (no significant degradation)

---

## Estimated Timeline

- **Phase 1-2** (Preparation & Core): 2-3 days
- **Phase 3** (Migration): 1-2 days
- **Phase 4-5** (Agents & CLI): 1-2 days
- **Phase 6** (Testing): 2-3 days
- **Phase 7-9** (Docs & Deployment): 1-2 days

**Total: 7-12 days** (aligns with "medium" effort estimate)

---

## Risk Mitigation Summary

| Risk | Mitigation |
|------|------------|
| Data loss during migration | Automated backup, dry-run mode, rollback capability |
| Backward compatibility issues | Phased approach, thorough testing, clear migration guide |
| Performance degradation | Performance testing, folder discovery optimization |
| Concurrent access issues | Atomic file operations, file locking if needed |
| Cross-platform path issues | Use Node.js `path` module, test on all platforms |
| Empty/corrupted folders | Validation in `parseStory()`, error handling |
