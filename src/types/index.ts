// Story types
export type StoryStatus = 'backlog' | 'ready' | 'in-progress' | 'done';
export type StoryType = 'feature' | 'bug' | 'chore' | 'spike';
export type EffortEstimate = 'small' | 'medium' | 'large';

export interface StoryFrontmatter {
  id: string;
  title: string;
  priority: number;
  status: StoryStatus;
  type: StoryType;
  created: string;
  updated?: string;
  assignee?: string;
  labels: string[];
  estimated_effort?: EffortEstimate;
  // Workflow tracking
  research_complete: boolean;
  plan_complete: boolean;
  implementation_complete: boolean;
  reviews_complete: boolean;
  pr_url?: string;
  branch?: string;
  last_error?: string;
}

export interface Story {
  path: string;
  slug: string;
  frontmatter: StoryFrontmatter;
  content: string;
}

// Action types for state assessor
export type ActionType =
  | 'refine'
  | 'research'
  | 'plan'
  | 'implement'
  | 'review'
  | 'create_pr'
  | 'move_to_done';

export interface Action {
  type: ActionType;
  storyId: string;
  storyPath: string;
  reason: string;
  priority: number;
}

export interface StateAssessment {
  backlogItems: Story[];
  readyItems: Story[];
  inProgressItems: Story[];
  doneItems: Story[];
  recommendedActions: Action[];
}

// Theme types
export type ThemePreference = 'auto' | 'light' | 'dark' | 'none';

export interface ThemeColors {
  success: any; // Chalk instance
  error: any;
  warning: any;
  info: any;
  dim: any;
  bold: any;
  backlog: any;
  ready: any;
  inProgress: any;
  done: any;
}

// Configuration types
export interface StageGateConfig {
  requireApprovalBeforeImplementation: boolean;
  requireApprovalBeforePR: boolean;
  autoMergeOnApproval: boolean;
}

export interface Config {
  sdlcFolder: string;
  stageGates: StageGateConfig;
  defaultLabels: string[];
  theme: ThemePreference;
}

// Agent types
export interface AgentResult {
  success: boolean;
  story: Story;
  changesMade: string[];
  error?: string;
}

// Kanban folder structure
export const KANBAN_FOLDERS = ['backlog', 'ready', 'in-progress', 'done'] as const;
export type KanbanFolder = typeof KANBAN_FOLDERS[number];

// Map status to folder
export const STATUS_TO_FOLDER: Record<StoryStatus, KanbanFolder> = {
  'backlog': 'backlog',
  'ready': 'ready',
  'in-progress': 'in-progress',
  'done': 'done',
};

// Map folder to status
export const FOLDER_TO_STATUS: Record<KanbanFolder, StoryStatus> = {
  'backlog': 'backlog',
  'ready': 'ready',
  'in-progress': 'in-progress',
  'done': 'done',
};

// Export workflow state types
export * from './workflow-state.js';
