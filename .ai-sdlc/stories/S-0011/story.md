---
id: S-0011
title: Migrate existing stories to folder-per-story architecture
priority: 11
status: done
type: chore
created: '2026-01-13'
labels:
  - migration
  - architecture
depends_on:
  - story-m7x9k2f1-arch
research_complete: true
plan_complete: true
implementation_complete: true
reviews_complete: true
slug: migrate-existing-stories-to-folder-per-story
---
# Migrate existing stories to folder-per-story architecture

## Summary

**As a** developer with existing ai-sdlc stories
**I want** a migration command to move stories to the new folder-per-story structure
**So that** I can adopt the new architecture without losing any story data

This story depends on the folder-per-story architecture being implemented first (story-m7x9k2f1-arch).

## Acceptance Criteria

### Migration Command
- [ ] `ai-sdlc migrate` command moves all stories to new structure
- [ ] `--dry-run` flag shows what would happen without making changes
- [ ] `--no-backup` flag skips backup creation (for CI or git users)
- [ ] Migration is idempotent (safe to run multiple times)

### Story Migration
- [ ] Stories from `backlog/*.md` → `stories/{id}/story.md` with `status: backlog`
- [ ] Stories from `ready/*.md` → `stories/{id}/story.md` with `status: ready`
- [ ] Stories from `in-progress/*.md` → `stories/{id}/story.md` with `status: in-progress`
- [ ] Stories from `done/*.md` → `stories/{id}/story.md` with `status: done`
- [ ] Stories from `blocked/*.md` → `stories/{id}/story.md` with `status: blocked`

### Data Integrity
- [ ] Priority extracted from filename prefix (e.g., `01-story.md` → priority: 1)
- [ ] ID taken from existing frontmatter `id` field
- [ ] Slug added to frontmatter (derived from filename without priority prefix)
- [ ] Stories without IDs get generated IDs with warning
- [ ] Duplicate IDs detected and reported as error (abort migration)

### Safety & Cleanup
- [ ] Backup created before migration (default behavior)
- [ ] Old folders removed only after all stories successfully migrated
- [ ] Non-.md files in old folders are preserved (with warning)
- [ ] Git dirty state check with `--force` override
- [ ] Migration state file created to prevent re-running

### Workflow State Handling
- [ ] Existing `.workflow-state.json` checkpoints are invalidated
- [ ] Clear message shown if active checkpoint exists

## Out of Scope

- Splitting story content into separate research.md/plan.md files (future enhancement)
- Automated rollback (manual git restore is sufficient)

## Technical Design

### CLI Command

```bash
# Show what would be migrated
ai-sdlc migrate --dry-run

# Run migration with backup
ai-sdlc migrate

# Run without backup (for CI or when using git)
ai-sdlc migrate --no-backup

# Force migration even with uncommitted changes
ai-sdlc migrate --force
```

### Migration State File

After successful migration, create `.ai-sdlc/.migrated`:
```json
{
  "version": 2,
  "migratedAt": "2026-01-13T10:30:00Z",
  "storiesCount": 9
}
```

This prevents accidental re-runs on already-migrated repos.

### Migration Logic

```typescript
// src/cli/commands/migrate.ts

interface MigrationItem {
  oldPath: string;
  newPath: string;
  storyId: string;
  status: StoryStatus;
  priority: number;
  slug: string;
}

interface MigrationResult {
  dryRun: boolean;
  migrations: MigrationItem[];
  warnings: string[];
  errors: string[];
}

export async function migrateToFolderPerStory(
  sdlcRoot: string,
  options: { dryRun?: boolean; backup?: boolean; force?: boolean }
): Promise<MigrationResult> {
  const warnings: string[] = [];
  const errors: string[] = [];

  // 0. Check if already migrated
  const migratedFile = path.join(sdlcRoot, '.migrated');
  if (fs.existsSync(migratedFile)) {
    return {
      dryRun: options.dryRun || false,
      migrations: [],
      warnings: ['Already migrated. Delete .ai-sdlc/.migrated to re-run.'],
      errors: [],
    };
  }

  // 1. Check git status (unless --force)
  if (!options.force && !options.dryRun) {
    const gitStatus = execSync('git status --porcelain', { cwd: sdlcRoot }).toString();
    if (gitStatus.trim()) {
      errors.push('Uncommitted changes detected. Commit or stash first, or use --force.');
      return { dryRun: false, migrations: [], warnings, errors };
    }
  }

  // 2. Check for active workflow state
  const workflowState = path.join(sdlcRoot, '.workflow-state.json');
  if (fs.existsSync(workflowState)) {
    warnings.push('Active workflow checkpoint found. It will be invalidated after migration.');
  }

  // 3. Scan old folders
  const oldFolders = ['backlog', 'ready', 'in-progress', 'done', 'blocked'];
  const migrations: MigrationItem[] = [];
  const seenIds = new Set<string>();

  for (const folder of oldFolders) {
    const folderPath = path.join(sdlcRoot, folder);
    if (!fs.existsSync(folderPath)) continue;

    const entries = fs.readdirSync(folderPath, { withFileTypes: true });

    // Check for non-.md files
    const nonMdFiles = entries.filter(e => e.isFile() && !e.name.endsWith('.md'));
    if (nonMdFiles.length > 0) {
      warnings.push(`Non-.md files in ${folder}/ will be preserved: ${nonMdFiles.map(f => f.name).join(', ')}`);
    }

    const mdFiles = entries.filter(e => e.isFile() && e.name.endsWith('.md'));

    for (const file of mdFiles) {
      const oldPath = path.join(folderPath, file.name);
      const story = parseStory(oldPath);

      // Validate ID exists
      if (!story.frontmatter.id) {
        const generatedId = generateStoryId();
        warnings.push(`Story ${file.name} has no ID. Generated: ${generatedId}`);
        story.frontmatter.id = generatedId;
      }

      // Check for duplicate IDs
      if (seenIds.has(story.frontmatter.id)) {
        errors.push(`Duplicate story ID: ${story.frontmatter.id} in ${oldPath}`);
        continue;
      }
      seenIds.add(story.frontmatter.id);

      // Derive status from folder name
      const status = folder as StoryStatus;

      // Extract priority from filename (e.g., "01-story-name.md" → 1)
      const priorityMatch = file.name.match(/^(\d+)-/);
      const priority = priorityMatch ? parseInt(priorityMatch[1], 10) : 99;

      // Extract slug from filename (without priority prefix and .md)
      const slug = file.name.replace(/^\d+-/, '').replace(/\.md$/, '');

      migrations.push({
        oldPath,
        newPath: path.join(sdlcRoot, 'stories', story.frontmatter.id, 'story.md'),
        storyId: story.frontmatter.id,
        status,
        priority,
        slug,
      });
    }
  }

  // 4. Abort if errors
  if (errors.length > 0) {
    return { dryRun: options.dryRun || false, migrations: [], warnings, errors };
  }

  // 5. Dry run - just report
  if (options.dryRun) {
    return { dryRun: true, migrations, warnings, errors: [] };
  }

  // 6. Create backup
  if (options.backup !== false) {
    const backupPath = path.join(path.dirname(sdlcRoot), `.ai-sdlc-backup-${Date.now()}`);
    fs.cpSync(sdlcRoot, backupPath, { recursive: true });
    console.log(`Backup created: ${backupPath}`);
  }

  // 7. Create stories/ folder
  const storiesDir = path.join(sdlcRoot, 'stories');
  fs.mkdirSync(storiesDir, { recursive: true });

  // 8. Execute migrations
  for (const item of migrations) {
    const story = parseStory(item.oldPath);

    // Update frontmatter
    story.frontmatter.status = item.status;
    story.frontmatter.priority = item.priority;
    story.frontmatter.slug = item.slug;

    // Create new folder and write
    const newFolder = path.dirname(item.newPath);
    fs.mkdirSync(newFolder, { recursive: true });
    story.path = item.newPath;
    writeStory(story);

    // Remove old file
    fs.unlinkSync(item.oldPath);
  }

  // 9. Remove empty old folders (keep non-empty ones)
  for (const folder of oldFolders) {
    const folderPath = path.join(sdlcRoot, folder);
    if (fs.existsSync(folderPath)) {
      const remaining = fs.readdirSync(folderPath);
      if (remaining.length === 0) {
        fs.rmdirSync(folderPath);
      } else {
        warnings.push(`Folder ${folder}/ not removed (contains: ${remaining.join(', ')})`);
      }
    }
  }

  // 10. Invalidate workflow state
  if (fs.existsSync(workflowState)) {
    const state = JSON.parse(fs.readFileSync(workflowState, 'utf-8'));
    state.invalidated = true;
    state.invalidatedReason = 'Story paths changed during migration';
    fs.writeFileSync(workflowState, JSON.stringify(state, null, 2));
  }

  // 11. Write migration state file
  fs.writeFileSync(migratedFile, JSON.stringify({
    version: 2,
    migratedAt: new Date().toISOString(),
    storiesCount: migrations.length,
  }, null, 2));

  return { dryRun: false, migrations, warnings, errors: [] };
}
```

### Output Example

```
$ ai-sdlc migrate --dry-run

Migration Plan (dry run)
========================

Stories to migrate: 9

  backlog/10-implement-folder-per-story.md
    → stories/story-m7x9k2f1-arch/story.md
    status: backlog, priority: 10, slug: implement-folder-per-story

  ready/01-add-incremental-commits.md
    → stories/story-aad83a4b-b851/story.md
    status: ready, priority: 1, slug: add-incremental-commits

  blocked/some-blocked-story.md
    → stories/story-xyz789/story.md
    status: blocked, priority: 99, slug: some-blocked-story

Warnings:
  - Active workflow checkpoint found. It will be invalidated after migration.

Run without --dry-run to execute migration.


$ ai-sdlc migrate

Backup created: /path/to/.ai-sdlc-backup-1705142400000
Migrating 9 stories...
  ✓ story-m7x9k2f1-arch (backlog)
  ✓ story-aad83a4b-b851 (ready)
  ...

Migration complete!
  - 9 stories migrated
  - Old folders removed: backlog, ready, in-progress, done, blocked
  - Workflow checkpoint invalidated

Next steps:
  git add -A && git commit -m "chore: migrate to folder-per-story architecture"
```

### Files to Create/Modify

1. `src/cli/commands/migrate.ts` - New migration command (create)
2. `src/cli/commands.ts` - Register migrate command
3. `tests/integration/migrate.test.ts` - Integration tests (create)

## Definition of Done

- [ ] `npm test` passes
- [ ] `npm run build` succeeds
- [ ] `ai-sdlc migrate --dry-run` shows correct plan
- [ ] `ai-sdlc migrate` successfully moves all stories including blocked
- [ ] Old folders are removed after migration
- [ ] Non-.md files in old folders are preserved
- [ ] Stories retain all frontmatter data
- [ ] Status, priority, and slug are correct in migrated stories
- [ ] Running migration twice is safe (idempotent via .migrated file)
- [ ] Git dirty state is detected (unless --force)
- [ ] Duplicate IDs are detected and reported
- [ ] Workflow state is invalidated

## Edge Cases Handled

| Case | Behavior |
|------|----------|
| Story without ID | Generate ID, log warning |
| Duplicate IDs | Abort with error, list duplicates |
| Non-.md files in folders | Preserve, log warning |
| Already migrated | Skip, show message |
| Uncommitted git changes | Abort unless --force |
| Active workflow checkpoint | Invalidate, warn user |
| Partial migration failure | Backup allows manual recovery |

## Migration Checklist for Users

After this story is implemented, users will run:

```bash
# 1. Ensure clean git state
git status  # Should be clean

# 2. Preview migration
ai-sdlc migrate --dry-run

# 3. Run migration
ai-sdlc migrate

# 4. Verify
ai-sdlc status

# 5. Commit
git add -A && git commit -m "chore: migrate to folder-per-story architecture"
```
