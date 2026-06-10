// Barrel file that re-exports all story module symbols for backward compatibility
export {
  SECTION_FILES,
  type SectionType,
  parseStory,
  writeStory,
  updateStoryStatus,
  moveStory,
  getSectionFilePath,
  readSectionContent,
  formatIterationHeader,
  writeSectionContent,
} from './story/io.js';

export {
  updateStoryField,
  appendToSection,
  getStoryContext,
} from './story/fields.js';

export {
  generateStoryId,
  generateLegacyStoryId,
  slugify,
  sanitizeTitle,
  extractTitleFromContent,
  createStory,
} from './story/create.js';

export {
  type MoveToBlockedOptions,
  generateFailureDiagnostic,
  moveToBlocked,
  recordRefinementAttempt,
  getRefinementCount,
  canRetryRefinement,
  resetPhaseCompletion,
  getLatestReviewFeedback,
  appendRefinementNote,
  getEffectiveMaxRetries,
  isAtMaxRetries,
  incrementRetryCount,
  resetRPIVCycle,
  appendReviewHistory,
  getLatestReviewAttempt,
  markStoryComplete,
  isPRMerged,
  markPRMerged,
  autoCompleteStoryAfterReview,
  snapshotMaxRetries,
} from './story/lifecycle.js';

export {
  getImplementationRetryCount,
  getEffectiveMaxImplementationRetries,
  isAtMaxImplementationRetries,
  resetImplementationRetryCount,
  incrementImplementationRetryCount,
  getTotalRecoveryAttempts,
  isAtGlobalRecoveryLimit,
  incrementTotalRecoveryAttempts,
  resetTotalRecoveryAttempts,
  GLOBAL_RECOVERY_LIMIT,
} from './story/recovery.js';

export {
  sanitizeStoryId,
  sanitizeReasonText,
  findStoryById,
  getStory,
  resetWorkflowState,
  unblockStory,
} from './story/lookup.js';
