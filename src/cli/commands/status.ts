import { getSdlcRoot, loadConfig } from '../../core/config.js';
import { assessState, findStoriesByStatus,getBoardStats, kanbanExists } from '../../core/kanban.js';
import { getThemedChalk } from '../../core/theme.js';
import type { SerializedStory, StatusJsonOutput } from '../../types/index.js';
import type { Story } from '../../types/index.js';
import { type KanbanColumn,renderKanbanBoard, renderStories, shouldUseKanbanLayout } from '../table-renderer.js';
import { formatAction } from './format-utils.js';

/**
 * Serialize a Story object for JSON output by extracting essential fields
 */
function serializeStoryForJson(story: Story): SerializedStory {
  return {
    id: story.frontmatter.id,
    slug: story.slug,
    title: story.frontmatter.title,
    status: story.frontmatter.status,
    priority: story.frontmatter.priority,
    type: story.frontmatter.type,
    created: story.frontmatter.created,
    labels: story.frontmatter.labels ?? [],
  };
}

/**
 * Show current board state
 */
export async function status(options?: { active?: boolean; json?: boolean }): Promise<void> {
  const config = loadConfig();
  const sdlcRoot = getSdlcRoot();
  const c = getThemedChalk(config);

  if (!kanbanExists(sdlcRoot)) {
    console.log(c.warning('ai-sdlc not initialized. Run `ai-sdlc init` first.'));
    return;
  }

  const assessment = await assessState(sdlcRoot);

  // Handle JSON output mode
  if (options?.json) {
    const blockedStories = findStoriesByStatus(sdlcRoot, 'blocked');
    const backlog = assessment.backlogItems.map(serializeStoryForJson);
    const ready = assessment.readyItems.map(serializeStoryForJson);
    const inProgress = assessment.inProgressItems.map(serializeStoryForJson);
    const done = options.active ? [] : assessment.doneItems.map(serializeStoryForJson);
    const blocked = blockedStories.map(serializeStoryForJson);
    const total = backlog.length + ready.length + inProgress.length + done.length + blocked.length;

    const jsonOutput: StatusJsonOutput = {
      version: 1,
      generatedAt: new Date().toISOString(),
      backlog,
      ready,
      inProgress,
      done,
      blocked,
      total,
    };
    console.log(JSON.stringify(jsonOutput, null, 2));
    return;
  }

  const stats = getBoardStats(sdlcRoot);

  console.log();
  console.log(c.bold('═══ AI SDLC Board ═══'));
  console.log();

  // Define columns with their data
  const columnDefs: { name: string; folder: string; color: any }[] = [
    { name: 'BACKLOG', folder: 'backlog', color: c.backlog },
    { name: 'READY', folder: 'ready', color: c.ready },
    { name: 'IN-PROGRESS', folder: 'in-progress', color: c.inProgress },
    { name: 'DONE', folder: 'done', color: c.done },
  ];

  // Filter columns if --active flag is set
  let displayColumns = columnDefs;
  let doneCount = 0;

  if (options?.active) {
    doneCount = stats['done'];
    displayColumns = columnDefs.filter(col => col.folder !== 'done');
  }

  // Check if we should use kanban layout
  if (shouldUseKanbanLayout()) {
    // Prepare kanban columns with stories
    const kanbanColumns: KanbanColumn[] = displayColumns.map(col => {
      const stories = col.folder === 'backlog' ? assessment.backlogItems
        : col.folder === 'ready' ? assessment.readyItems
        : col.folder === 'in-progress' ? assessment.inProgressItems
        : assessment.doneItems;

      return {
        name: col.name,
        stories,
        color: col.color,
      };
    });

    // Render kanban board
    console.log(renderKanbanBoard(kanbanColumns, c));
    console.log();
  } else {
    // Fall back to vertical layout for narrow terminals
    for (const col of displayColumns) {
      const count = stats[col.folder as keyof typeof stats];
      console.log(c.bold(col.color(`${col.name} (${count})`)));

      const stories = col.folder === 'backlog' ? assessment.backlogItems
        : col.folder === 'ready' ? assessment.readyItems
        : col.folder === 'in-progress' ? assessment.inProgressItems
        : assessment.doneItems;

      // Use existing table/compact renderer
      console.log(renderStories(stories, c));
      console.log();
    }
  }

  // Show summary line when done is filtered and there are done stories
  if (options?.active && doneCount > 0) {
    console.log(c.dim(`${doneCount} done stories (use 'status' without --active to show all)`));
    console.log();
  }

  // Show recommended next action
  if (assessment.recommendedActions.length > 0) {
    const nextAction = assessment.recommendedActions[0];
    console.log(c.info('Recommended:'), formatAction(nextAction));
  } else {
    console.log(c.success('No pending actions. Board is up to date!'));
  }
}
