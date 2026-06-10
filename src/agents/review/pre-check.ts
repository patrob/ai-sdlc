import { getLogger } from '../../core/logger.js';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { updateStoryField } from '../../core/story.js';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { Config,Story } from '../../types/index.js';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { ReviewIssue } from '../../types/index.js';
import { ReviewDecision as ReviewDecisionEnum, ReviewSeverity as ReviewSeverityEnum } from '../../types/index.js';
import { determineEffectiveContentType, getConfigurationChanges, getDocumentationChanges, getSourceCodeChanges, hasTestFiles } from './diff-analysis.js';
import { formatIssuesForDisplay } from './parsers.js';

/**
 * Result from pre-check validation
 */
export interface PreCheckResult {
  passed: boolean;
  contentType: string;
  validationFailed: boolean;
  validationReason: string;
  validationCategory: string;
  reviewResult?: any; // ReviewResult type if validation failed
}

/**
 * Run content type-aware validation and test file checks
 */
export async function runPreChecks(
  story: Story,
  workingDir: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  storyPath: string
): Promise<PreCheckResult> {
  const logger = getLogger();
  const contentType = determineEffectiveContentType(story);

  logger.info('review', 'Running content-type-specific validation', {
    storyId: story.frontmatter.id,
    contentType,
    explicitContentType: story.frontmatter.content_type,
    requiresSourceChanges: story.frontmatter.requires_source_changes,
  });

  // Validation flags
  let validationFailed = false;
  let validationReason = '';
  const validationCategory = 'implementation';

  // Check source code changes for 'code' and 'mixed' types
  if (contentType === 'code' || contentType === 'mixed') {
    const sourceChanges = getSourceCodeChanges(workingDir);

    if (sourceChanges.length === 0) {
      validationFailed = true;
      validationReason = contentType === 'mixed'
        ? 'Mixed story requires both source AND configuration changes - no source code was modified.'
        : 'Implementation wrote documentation/planning only - no source code was modified.';

      logger.warn('review', 'Source code validation failed', {
        storyId: story.frontmatter.id,
        contentType,
        sourceChangesFound: sourceChanges.length,
      });
    } else {
      logger.info('review', 'Source code changes detected', {
        storyId: story.frontmatter.id,
        fileCount: sourceChanges.length,
      });
    }
  }

  // Check configuration changes for 'configuration' and 'mixed' types
  if (!validationFailed && (contentType === 'configuration' || contentType === 'mixed')) {
    const configChanges = getConfigurationChanges(workingDir);

    if (configChanges.length === 0) {
      validationFailed = true;
      validationReason = contentType === 'mixed'
        ? 'Mixed story requires both source AND configuration changes. No configuration file changes detected.'
        : 'Configuration story requires changes to config files (.claude/, .github/, or root config files). No configuration changes detected.';

      logger.warn('review', 'Configuration validation failed', {
        storyId: story.frontmatter.id,
        contentType,
        configChangesFound: configChanges.length,
      });
    } else {
      logger.info('review', 'Configuration changes detected', {
        storyId: story.frontmatter.id,
        fileCount: configChanges.length,
      });
    }
  }

  // Check documentation changes for 'documentation' type
  if (!validationFailed && contentType === 'documentation') {
    const docChanges = getDocumentationChanges(workingDir);

    if (docChanges.length === 0) {
      validationFailed = true;
      validationReason = 'Documentation story requires changes to markdown files (.md) or docs/ directory. No documentation changes detected.';

      logger.warn('review', 'Documentation validation failed', {
        storyId: story.frontmatter.id,
        contentType,
        docChangesFound: docChanges.length,
      });
    } else {
      logger.info('review', 'Documentation changes detected', {
        storyId: story.frontmatter.id,
        fileCount: docChanges.length,
      });
    }
  }

  return {
    passed: !validationFailed,
    contentType,
    validationFailed,
    validationReason,
    validationCategory,
  };
}

/**
 * Check if test files exist for code/mixed content types
 */
export async function runTestFileCheck(
  story: Story,
  workingDir: string,
  contentType: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  storyPath: string
): Promise<{ passed: boolean; reviewResult?: any }> {
  const logger = getLogger();
  const requiresTests = contentType === 'code' || contentType === 'mixed';

  if (requiresTests) {
    const testsExist = hasTestFiles(workingDir);
    if (!testsExist) {
      logger.warn('review', 'No test files detected in implementation changes', {
        storyId: story.frontmatter.id,
      });

      return {
        passed: false,
        reviewResult: {
          success: true,
          story,
          changesMade: ['No test files found for implementation'],
          passed: false,
          decision: ReviewDecisionEnum.REJECTED,
          severity: ReviewSeverityEnum.CRITICAL,
          reviewType: 'pre-check' as any,
          issues: [{
            severity: 'blocker',
            category: 'testing',
            description: 'No tests found for this implementation. All implementations must include tests.',
            suggestedFix: 'Add test files (*.test.ts, *.spec.ts, or files in __tests__/ directory) that verify the implementation.',
          }],
          feedback: formatIssuesForDisplay([{
            severity: 'blocker',
            category: 'testing',
            description: 'No tests found for this implementation. All implementations must include tests.',
            suggestedFix: 'Add test files (*.test.ts, *.spec.ts, or files in __tests__/ directory) that verify the implementation.',
          }]),
        },
      };
    }
  } else {
    logger.info('review', 'Test file check skipped for non-code content type', {
      storyId: story.frontmatter.id,
      contentType,
    });
  }

  return { passed: true };
}
