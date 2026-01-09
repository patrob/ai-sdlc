import fs from 'fs';
import path from 'path';
import { glob } from 'glob';
import { Story, StateAssessment, Action, KANBAN_FOLDERS, KanbanFolder } from '../types/index.js';
import { parseStory } from './story.js';

/**
 * Get all stories in a specific kanban folder
 */
export function getStoriesInFolder(sdlcRoot: string, folder: KanbanFolder): Story[] {
  const folderPath = path.join(sdlcRoot, folder);

  if (!fs.existsSync(folderPath)) {
    return [];
  }

  const files = fs.readdirSync(folderPath).filter(f => f.endsWith('.md'));

  return files
    .map(f => parseStory(path.join(folderPath, f)))
    .sort((a, b) => a.frontmatter.priority - b.frontmatter.priority);
}

/**
 * Get all stories across all kanban folders
 */
export function getAllStories(sdlcRoot: string): Map<KanbanFolder, Story[]> {
  const stories = new Map<KanbanFolder, Story[]>();

  for (const folder of KANBAN_FOLDERS) {
    stories.set(folder, getStoriesInFolder(sdlcRoot, folder));
  }

  return stories;
}

/**
 * Find a story by ID across all folders
 */
export function findStoryById(sdlcRoot: string, storyId: string): Story | null {
  for (const folder of KANBAN_FOLDERS) {
    const stories = getStoriesInFolder(sdlcRoot, folder);
    const found = stories.find(s => s.frontmatter.id === storyId);
    if (found) return found;
  }
  return null;
}

/**
 * Find a story by slug across all folders
 */
export function findStoryBySlug(sdlcRoot: string, slug: string): Story | null {
  for (const folder of KANBAN_FOLDERS) {
    const stories = getStoriesInFolder(sdlcRoot, folder);
    const found = stories.find(s => s.slug === slug);
    if (found) return found;
  }
  return null;
}

/**
 * Assess the current state of the kanban board and recommend actions
 */
export function assessState(sdlcRoot: string): StateAssessment {
  const backlogItems = getStoriesInFolder(sdlcRoot, 'backlog');
  const readyItems = getStoriesInFolder(sdlcRoot, 'ready');
  const inProgressItems = getStoriesInFolder(sdlcRoot, 'in-progress');
  const doneItems = getStoriesInFolder(sdlcRoot, 'done');

  const recommendedActions: Action[] = [];

  // Check backlog items that need refinement
  for (const story of backlogItems) {
    recommendedActions.push({
      type: 'refine',
      storyId: story.frontmatter.id,
      storyPath: story.path,
      reason: `Story "${story.frontmatter.title}" needs refinement`,
      priority: story.frontmatter.priority,
    });
  }

  // Check ready items that need research/planning/implementation
  for (const story of readyItems) {
    if (!story.frontmatter.research_complete) {
      recommendedActions.push({
        type: 'research',
        storyId: story.frontmatter.id,
        storyPath: story.path,
        reason: `Story "${story.frontmatter.title}" needs research`,
        priority: story.frontmatter.priority + 100, // Lower priority than refinement
      });
    } else if (!story.frontmatter.plan_complete) {
      recommendedActions.push({
        type: 'plan',
        storyId: story.frontmatter.id,
        storyPath: story.path,
        reason: `Story "${story.frontmatter.title}" needs implementation plan`,
        priority: story.frontmatter.priority + 200,
      });
    } else {
      recommendedActions.push({
        type: 'implement',
        storyId: story.frontmatter.id,
        storyPath: story.path,
        reason: `Story "${story.frontmatter.title}" is ready for implementation`,
        priority: story.frontmatter.priority + 300,
      });
    }
  }

  // Check in-progress items
  for (const story of inProgressItems) {
    if (!story.frontmatter.implementation_complete) {
      recommendedActions.push({
        type: 'implement',
        storyId: story.frontmatter.id,
        storyPath: story.path,
        reason: `Story "${story.frontmatter.title}" implementation in progress`,
        priority: story.frontmatter.priority + 400,
      });
    } else if (!story.frontmatter.reviews_complete) {
      recommendedActions.push({
        type: 'review',
        storyId: story.frontmatter.id,
        storyPath: story.path,
        reason: `Story "${story.frontmatter.title}" needs review`,
        priority: story.frontmatter.priority + 500,
      });
    } else {
      recommendedActions.push({
        type: 'create_pr',
        storyId: story.frontmatter.id,
        storyPath: story.path,
        reason: `Story "${story.frontmatter.title}" is ready for PR`,
        priority: story.frontmatter.priority + 600,
      });
    }
  }

  // Sort actions by priority (lower number = higher priority)
  recommendedActions.sort((a, b) => a.priority - b.priority);

  return {
    backlogItems,
    readyItems,
    inProgressItems,
    doneItems,
    recommendedActions,
  };
}

/**
 * Initialize the kanban folder structure
 */
export function initializeKanban(sdlcRoot: string): void {
  for (const folder of KANBAN_FOLDERS) {
    const folderPath = path.join(sdlcRoot, folder);
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }
  }
}

/**
 * Check if kanban structure exists
 */
export function kanbanExists(sdlcRoot: string): boolean {
  return KANBAN_FOLDERS.every(folder =>
    fs.existsSync(path.join(sdlcRoot, folder))
  );
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
    stats[folder] = getStoriesInFolder(sdlcRoot, folder).length;
  }

  return stats;
}
