import fs from 'fs';
import path from 'path';

import { generateStoryId,parseStory, writeStory } from '../../core/story.js';
import { type StoryStatus } from '../../types/index.js';

export interface MigrationItem {
  oldPath: string;
  newPath: string;
  storyId: string;
  status: StoryStatus;
  priority: number;
  slug: string;
}

export interface MigrationResult {
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

  const migratedFile = path.join(sdlcRoot, '.migrated');
  let alreadyMigrated = false;
  try { fs.readFileSync(migratedFile); alreadyMigrated = true; } catch { alreadyMigrated = false; }
  if (alreadyMigrated) {
    return {
      dryRun: options.dryRun || false,
      migrations: [],
      warnings: ['Already migrated. Delete .ai-sdlc/.migrated to re-run.'],
      errors: [],
    };
  }

  const workflowState = path.join(sdlcRoot, '.workflow-state.json');
  let workflowStateExists = false;
  try { fs.readFileSync(workflowState); workflowStateExists = true; } catch { workflowStateExists = false; }
  if (workflowStateExists) {
    warnings.push('Active workflow checkpoint found. It will be invalidated after migration.');
  }

  const oldFolders = ['backlog', 'ready', 'in-progress', 'done', 'blocked'];
  const migrations: MigrationItem[] = [];
  const seenIds = new Set<string>();

  for (const folder of oldFolders) {
    const folderPath = path.join(sdlcRoot, folder);
    if (!fs.existsSync(folderPath)) continue;

    const entries = fs.readdirSync(folderPath, { withFileTypes: true });

    const nonMdFiles = entries.filter(e => e.isFile() && !e.name.endsWith('.md'));
    if (nonMdFiles.length > 0) {
      warnings.push(`Non-.md files in ${folder}/ will be preserved: ${nonMdFiles.map(f => f.name).join(', ')}`);
    }

    const mdFiles = entries.filter(e => e.isFile() && e.name.endsWith('.md'));

    for (const file of mdFiles) {
      const oldPath = path.join(folderPath, file.name);
      const story = parseStory(oldPath);

      if (!story.frontmatter.id) {
        const generatedId = generateStoryId();
        warnings.push(`Story ${file.name} has no ID. Generated: ${generatedId}`);
        story.frontmatter.id = generatedId;
      }

      if (seenIds.has(story.frontmatter.id)) {
        errors.push(`Duplicate story ID: ${story.frontmatter.id} in ${oldPath}`);
        continue;
      }
      seenIds.add(story.frontmatter.id);

      const status = folder as StoryStatus;

      const priorityMatch = file.name.match(/^(\d+)-/);
      const priority = priorityMatch ? parseInt(priorityMatch[1], 10) : 99;

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

  if (errors.length > 0) {
    return { dryRun: options.dryRun || false, migrations: [], warnings, errors };
  }

  if (options.dryRun) {
    return { dryRun: true, migrations, warnings, errors: [] };
  }

  if (options.backup !== false) {
    const backupPath = path.join(path.dirname(sdlcRoot), `.ai-sdlc-backup-${Date.now()}`);
    fs.cpSync(sdlcRoot, backupPath, { recursive: true });
  }

  const storiesDir = path.join(sdlcRoot, 'stories');
  fs.mkdirSync(storiesDir, { recursive: true });

  for (const item of migrations) {
    const story = parseStory(item.oldPath);

    story.frontmatter.status = item.status;
    story.frontmatter.priority = item.priority;
    story.frontmatter.slug = item.slug;

    const newFolder = path.dirname(item.newPath);
    fs.mkdirSync(newFolder, { recursive: true });
    story.path = item.newPath;
    await writeStory(story);

    fs.unlinkSync(item.oldPath);
  }

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

  let workflowStateRaw: string | undefined;
  try { workflowStateRaw = fs.readFileSync(workflowState, 'utf-8'); } catch { workflowStateRaw = undefined; }
  if (workflowStateRaw !== undefined) {
    const state = JSON.parse(workflowStateRaw);
    state.invalidated = true;
    state.invalidatedReason = 'Story paths changed during migration';
    fs.writeFileSync(workflowState, JSON.stringify(state, null, 2));
  }

  fs.writeFileSync(migratedFile, JSON.stringify({
    version: 2,
    migratedAt: new Date().toISOString(),
    storiesCount: migrations.length,
  }, null, 2));

  return { dryRun: false, migrations, warnings, errors: [] };
}
