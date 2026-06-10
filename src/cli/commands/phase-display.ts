import type { ActionType, Story } from '../../types/index.js';

/**
 * Phase information for RPIV display
 */
export interface PhaseInfo {
  name: string;
  icon: string;
  iconAscii: string;
  colorFn: (str: string) => string;
}

/**
 * Get phase information for an action type
 * Returns null for non-RPIV actions (create_pr, move_to_done)
 *
 * @param actionType - The type of action to get phase info for
 * @param colors - The theme colors object
 * @returns Phase information object or null for non-RPIV actions
 */
export function getPhaseInfo(actionType: ActionType, colors: any): PhaseInfo | null {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const useAscii = process.env.NO_COLOR !== undefined;

  switch (actionType) {
    case 'refine':
      return {
        name: 'Refine',
        icon: '✨',
        iconAscii: '[RF]', // Changed from [R] to avoid collision with Research
        colorFn: colors.phaseRefine,
      };
    case 'research':
      return {
        name: 'Research',
        icon: '🔍',
        iconAscii: '[R]',
        colorFn: colors.phaseResearch,
      };
    case 'plan':
      return {
        name: 'Plan',
        icon: '📋',
        iconAscii: '[P]',
        colorFn: colors.phasePlan,
      };
    case 'plan_review':
      return {
        name: 'Plan Review',
        icon: '📝',
        iconAscii: '[PR]',
        colorFn: colors.phasePlan,
      };
    case 'implement':
      return {
        name: 'Implement',
        icon: '🔨',
        iconAscii: '[I]',
        colorFn: colors.phaseImplement,
      };
    case 'review':
      return {
        name: 'Verify',
        icon: '✓',
        iconAscii: '[V]',
        colorFn: colors.phaseVerify,
      };
    case 'rework':
      return {
        name: 'Rework',
        icon: '🔄',
        iconAscii: '[RW]',
        colorFn: colors.warning,
      };
    default:
      return null; // create_pr, move_to_done are not RPIV phases
  }
}

/**
 * Calculate phase progress for a story
 *
 * @param story - The story to calculate progress for
 * @returns Object containing current phase, completed phases, and all phases
 */
export function calculatePhaseProgress(story: Story): {
  currentPhase: string;
  completedPhases: string[];
  allPhases: string[];
} {
  const allPhases = ['Refine', 'Research', 'Plan', 'Implement', 'Verify'];
  const completedPhases: string[] = [];
  let currentPhase = 'Refine';

  // Check each phase completion status
  if (story.frontmatter.status !== 'backlog') {
    completedPhases.push('Refine');
    currentPhase = 'Research';
  }

  if (story.frontmatter.research_complete) {
    completedPhases.push('Research');
    currentPhase = 'Plan';
  }

  if (story.frontmatter.plan_complete) {
    completedPhases.push('Plan');
    currentPhase = 'Implement';
  }

  if (story.frontmatter.implementation_complete) {
    completedPhases.push('Implement');
    currentPhase = 'Verify';
  }

  if (story.frontmatter.reviews_complete) {
    completedPhases.push('Verify');
    currentPhase = 'Complete';
  }

  return { currentPhase, completedPhases, allPhases };
}

/**
 * Render phase checklist for progress display
 *
 * @param story - The story to render progress for
 * @param colors - The theme colors object
 * @returns Formatted checklist string with symbols and colors
 */
export function renderPhaseChecklist(story: Story, colors: any): string {
  const { currentPhase, completedPhases, allPhases } = calculatePhaseProgress(story);
  const useAscii = process.env.NO_COLOR !== undefined;

  const symbols = {
    complete: useAscii ? '[X]' : '✓',
    current: useAscii ? '[>]' : '●',
    pending: useAscii ? '[ ]' : '○',
    arrow: useAscii ? '->' : '→',
  };

  const parts = allPhases.map(phase => {
    if (completedPhases.includes(phase)) {
      return colors.success(symbols.complete) + ' ' + colors.dim(phase);
    } else if (phase === currentPhase) {
      return colors.info(symbols.current) + ' ' + colors.bold(phase);
    } else {
      return colors.dim(symbols.pending + ' ' + phase);
    }
  });

  return parts.join(colors.dim(' ' + symbols.arrow + ' '));
}
