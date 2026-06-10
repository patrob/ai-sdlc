/**
 * Epic Processor
 *
 * Orchestrates the execution of an epic: discovers stories, validates dependencies,
 * manages worktrees, executes stories in phases, and tracks progress.
 */

export { discoverEpicStories,normalizeEpicId } from './discovery.js';
export { processEpic } from './processor.js';
