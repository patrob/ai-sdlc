import { Story, StoryExecutionStatus } from '../types/index.js';

/**
 * Progress information for a single story
 */
export interface StoryProgress {
  storyId: string;
  title: string;
  status: StoryExecutionStatus;
  percentage: number; // 0-100
  currentTask?: string;
  blockingDeps?: string[]; // Story IDs this story is waiting for
  error?: string;
}

/**
 * State of the epic execution dashboard
 */
export interface DashboardState {
  epicId: string;
  currentPhase: number;
  totalPhases: number;
  stories: Map<string, StoryProgress>;
  startTime: number; // timestamp
}

/**
 * Statistics for dashboard summary
 */
interface DashboardStats {
  completed: number;
  failed: number;
  inProgress: number;
  queued: number;
}

/**
 * Create a new dashboard state for epic execution
 */
export function createDashboard(epicId: string, phases: Story[][]): DashboardState {
  const stories = new Map<string, StoryProgress>();

  // Initialize all stories in queued state
  phases.forEach((phase, phaseIndex) => {
    phase.forEach(story => {
      stories.set(story.frontmatter.id, {
        storyId: story.frontmatter.id,
        title: story.frontmatter.title,
        status: 'queued',
        percentage: 0,
        blockingDeps: story.frontmatter.dependencies || [],
      });
    });
  });

  return {
    epicId,
    currentPhase: 0,
    totalPhases: phases.length,
    stories,
    startTime: Date.now(),
  };
}

/**
 * Update story status in the dashboard
 */
export function updateStoryStatus(
  state: DashboardState,
  storyId: string,
  status: StoryExecutionStatus
): void {
  const story = state.stories.get(storyId);
  if (story) {
    story.status = status;

    // Update percentage based on status
    switch (status) {
      case 'in-progress':
        story.percentage = 10;
        break;
      case 'reviewing':
        story.percentage = 80;
        break;
      case 'completed':
        story.percentage = 100;
        break;
      case 'failed':
      case 'skipped':
        // Keep current percentage
        break;
    }
  }
}

/**
 * Update story progress percentage and current task
 */
export function updateStoryProgress(
  state: DashboardState,
  storyId: string,
  percentage: number,
  currentTask?: string
): void {
  const story = state.stories.get(storyId);
  if (story) {
    story.percentage = Math.min(100, Math.max(0, percentage));
    if (currentTask !== undefined) {
      story.currentTask = currentTask;
    }
  }
}

/**
 * Mark a story as skipped due to dependency failure
 */
export function markStorySkipped(
  state: DashboardState,
  storyId: string,
  reason: string
): void {
  const story = state.stories.get(storyId);
  if (story) {
    story.status = 'skipped';
    story.error = reason;
  }
}

/**
 * Mark a story as failed with error message
 */
export function markStoryFailed(
  state: DashboardState,
  storyId: string,
  error: string
): void {
  const story = state.stories.get(storyId);
  if (story) {
    story.status = 'failed';
    story.error = error;
  }
}

/**
 * Advance to the next phase
 */
export function advancePhase(state: DashboardState): void {
  state.currentPhase++;
}

/**
 * Calculate dashboard statistics
 */
function getStats(state: DashboardState): DashboardStats {
  const stats = {
    completed: 0,
    failed: 0,
    inProgress: 0,
    queued: 0,
  };

  for (const story of state.stories.values()) {
    switch (story.status) {
      case 'completed':
        stats.completed++;
        break;
      case 'failed':
      case 'skipped':
        stats.failed++;
        break;
      case 'in-progress':
      case 'reviewing':
        stats.inProgress++;
        break;
      case 'queued':
        stats.queued++;
        break;
    }
  }

  return stats;
}

/**
 * Format elapsed time in human-readable format
 */
function formatElapsedTime(startTime: number): string {
  const elapsed = Date.now() - startTime;
  const seconds = Math.floor(elapsed / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes === 0) {
    return `${remainingSeconds}s`;
  }

  return `${minutes}m ${remainingSeconds}s`;
}

/**
 * Generate progress bar string
 */
function generateProgressBar(percentage: number, width: number = 10): string {
  const filled = Math.floor((percentage / 100) * width);
  const empty = width - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

/**
 * Format story status with color codes
 */
function formatStatus(status: StoryExecutionStatus): string {
  const statusMap: Record<StoryExecutionStatus, string> = {
    queued: '\x1b[90mqueued\x1b[0m', // gray
    'in-progress': '\x1b[36mimplementing\x1b[0m', // cyan
    reviewing: '\x1b[33mreviewing\x1b[0m', // yellow
    completed: '\x1b[32mcompleted\x1b[0m', // green
    failed: '\x1b[31mfailed\x1b[0m', // red
    skipped: '\x1b[90mskipped\x1b[0m', // gray
  };
  return statusMap[status] || status;
}

/**
 * Render the dashboard to the console
 * Clears screen and draws updated state
 */
export function renderDashboard(state: DashboardState): void {
  // Clear screen and move cursor to top-left
  console.log('\x1b[2J\x1b[H');

  const stats = getStats(state);
  const elapsed = formatElapsedTime(state.startTime);

  // Header
  console.log(`\x1b[1mEpic: ${state.epicId}\x1b[0m (Phase ${state.currentPhase + 1}/${state.totalPhases})`);
  console.log('┌─────────────────────────────────────────────────────────────┐');

  // Story rows (show up to 10 most recent/active stories)
  const sortedStories = Array.from(state.stories.values())
    .sort((a, b) => {
      // Sort by status priority: in-progress/reviewing > queued > completed/failed/skipped
      const statusOrder = { 'in-progress': 0, 'reviewing': 0, 'queued': 1, 'completed': 2, 'failed': 2, 'skipped': 2 };
      const aOrder = statusOrder[a.status];
      const bOrder = statusOrder[b.status];
      if (aOrder !== bOrder) return aOrder - bOrder;
      return a.storyId.localeCompare(b.storyId);
    })
    .slice(0, 10);

  for (const story of sortedStories) {
    const progressBar = generateProgressBar(story.percentage);
    const statusStr = formatStatus(story.status);
    const taskInfo = story.currentTask ? ` (${story.currentTask})` : '';

    let details = statusStr + taskInfo;
    if (story.error) {
      details = `\x1b[31m${story.error.slice(0, 30)}\x1b[0m`;
    } else if (story.blockingDeps && story.blockingDeps.length > 0 && story.status === 'queued') {
      details = `\x1b[90mblocked: ${story.blockingDeps.join(', ')}\x1b[0m`;
    }

    console.log(`│ ${story.storyId} [${progressBar}] ${details.padEnd(32)} │`);
  }

  if (state.stories.size > 10) {
    console.log(`│ ... and ${state.stories.size - 10} more stories                           │`);
  }

  console.log('└─────────────────────────────────────────────────────────────┘');

  // Summary
  console.log(
    `Completed: ${stats.completed}/${state.stories.size} • Failed: ${stats.failed} • ` +
    `In Progress: ${stats.inProgress} • Queued: ${stats.queued}`
  );
  console.log(`Elapsed: ${elapsed}`);
}

/**
 * Create a dashboard renderer that updates periodically
 * Returns a function to stop rendering
 */
export function startDashboardRenderer(state: DashboardState, intervalMs: number = 1000): () => void {
  const intervalId = setInterval(() => {
    renderDashboard(state);
  }, intervalMs);

  // Render immediately
  renderDashboard(state);

  return () => {
    clearInterval(intervalId);
    // Final render
    renderDashboard(state);
  };
}
