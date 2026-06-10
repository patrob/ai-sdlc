import fs from 'fs';
import path from 'path';

import { KANBAN_FOLDERS, type KanbanFolder, STORIES_FOLDER } from '../../types/index.js';
import { findStoriesByStatus } from './discovery.js';

/**
 * Initialize the kanban folder structure
 */
export function initializeKanban(sdlcRoot: string): void {
  // Create stories/ folder for new architecture
  const storiesFolder = path.join(sdlcRoot, STORIES_FOLDER);
  if (!fs.existsSync(storiesFolder)) {
    fs.mkdirSync(storiesFolder, { recursive: true });
  }
}

/**
 * Check if kanban structure exists
 */
export function kanbanExists(sdlcRoot: string): boolean {
  // Check for new stories/ folder architecture
  const storiesFolder = path.join(sdlcRoot, STORIES_FOLDER);
  return fs.existsSync(storiesFolder);
}

/**
 * Get board statistics
 */
export function getBoardStats(sdlcRoot: string): Record<KanbanFolder, number> {
  const stats: Record<KanbanFolder, number> = {
    backlog: 0,
    ready: 0,
    'in-progress': 0,
    done: 0,
  };

  for (const folder of KANBAN_FOLDERS) {
    stats[folder] = findStoriesByStatus(sdlcRoot, folder).length;
  }

  return stats;
}
