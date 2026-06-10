import {spawn, spawnSync } from 'child_process';
import fs from 'fs';
import { beforeEach, describe, expect, it,vi } from 'vitest';

import * as clientModule from '../core/client.js';
import * as configModule from '../core/config.js';
import * as storyModule from '../core/story.js';
import { type Config, type ReviewIssue } from '../types/index.js';
import { deriveIndividualPassFailFromPerspectives, runReviewAgent } from './review.js';

// Mock external dependencies
vi.mock('child_process', () => ({
  spawn: vi.fn(),
  spawnSync: vi.fn(),
  execSync: vi.fn(),
}));
vi.mock('fs');
vi.mock('../core/story.js', async () => {
  const actual = await vi.importActual<typeof import('../core/story.js')>('../core/story.js');
  return {
    ...actual,
    parseStory: vi.fn(),
    writeStory: vi.fn(),
    appendReviewHistory: vi.fn(),
    snapshotMaxRetries: vi.fn(),
    isAtMaxRetries: vi.fn(() => false), // Default: not at max retries
    appendToSection: vi.fn(),
    updateStoryField: vi.fn(),
    updateStoryStatus: vi.fn((story) => Promise.resolve(story)), // Return same story with updated status
  };
});
vi.mock('../core/client.js');
vi.mock('../core/config.js', async () => {
  const actual = await vi.importActual<typeof import('../core/config.js')>('../core/config.js');
  return {
    ...actual,
    loadConfig: vi.fn(),
  };
});

describe('Unified Collaborative Review', () => {
  describe('deriveIndividualPassFailFromPerspectives', () => {
    it('should export deriveIndividualPassFailFromPerspectives function', () => {
      expect(deriveIndividualPassFailFromPerspectives).toBeDefined();
      expect(typeof deriveIndividualPassFailFromPerspectives).toBe('function');
    });

    it('should return all pass when no blocker/critical issues', () => {
      const issues: ReviewIssue[] = [
        {
          severity: 'major',
          category: 'code_quality',
          description: 'Minor issue',
          perspectives: ['code', 'security'],
        },
        {
          severity: 'minor',
          category: 'style',
          description: 'Style issue',
          perspectives: ['code'],
        },
      ];

      const result = deriveIndividualPassFailFromPerspectives(issues);

      expect(result.codeReviewPassed).toBe(true);
      expect(result.securityReviewPassed).toBe(true);
      expect(result.poReviewPassed).toBe(true);
    });

    it('should fail code perspective when blocker issue flagged for code', () => {
      const issues: ReviewIssue[] = [
        {
          severity: 'blocker',
          category: 'testing',
          description: 'No tests',
          perspectives: ['code'],
        },
      ];

      const result = deriveIndividualPassFailFromPerspectives(issues);

      expect(result.codeReviewPassed).toBe(false);
      expect(result.securityReviewPassed).toBe(true);
      expect(result.poReviewPassed).toBe(true);
    });

    it('should fail security perspective when critical issue flagged for security', () => {
      const issues: ReviewIssue[] = [
        {
          severity: 'critical',
          category: 'security',
          description: 'SQL injection vulnerability',
          perspectives: ['security'],
        },
      ];

      const result = deriveIndividualPassFailFromPerspectives(issues);

      expect(result.codeReviewPassed).toBe(true);
      expect(result.securityReviewPassed).toBe(false);
      expect(result.poReviewPassed).toBe(true);
    });

    it('should fail PO perspective when blocker issue flagged for po', () => {
      const issues: ReviewIssue[] = [
        {
          severity: 'blocker',
          category: 'requirements',
          description: 'Acceptance criteria not met',
          perspectives: ['po'],
        },
      ];

      const result = deriveIndividualPassFailFromPerspectives(issues);

      expect(result.codeReviewPassed).toBe(true);
      expect(result.securityReviewPassed).toBe(true);
      expect(result.poReviewPassed).toBe(false);
    });

    it('should fail multiple perspectives when issue affects them', () => {
      const issues: ReviewIssue[] = [
        {
          severity: 'blocker',
          category: 'implementation',
          description: 'No implementation exists',
          perspectives: ['code', 'security', 'po'],
        },
      ];

      const result = deriveIndividualPassFailFromPerspectives(issues);

      expect(result.codeReviewPassed).toBe(false);
      expect(result.securityReviewPassed).toBe(false);
      expect(result.poReviewPassed).toBe(false);
    });

    it('should handle issues without perspectives field (backward compatibility)', () => {
      const issues: ReviewIssue[] = [
        {
          severity: 'blocker',
          category: 'testing',
          description: 'No tests',
          // No perspectives field
        },
      ];

      const result = deriveIndividualPassFailFromPerspectives(issues);

      // Without perspectives, all should pass (no issues attributed to them)
      expect(result.codeReviewPassed).toBe(true);
      expect(result.securityReviewPassed).toBe(true);
      expect(result.poReviewPassed).toBe(true);
    });

    it('should handle empty issues array', () => {
      const result = deriveIndividualPassFailFromPerspectives([]);

      expect(result.codeReviewPassed).toBe(true);
      expect(result.securityReviewPassed).toBe(true);
      expect(result.poReviewPassed).toBe(true);
    });

    it('should only fail on blocker/critical, not major/minor', () => {
      const issues: ReviewIssue[] = [
        {
          severity: 'major',
          category: 'code_quality',
          description: 'Major issue',
          perspectives: ['code'],
        },
        {
          severity: 'minor',
          category: 'security',
          description: 'Minor security issue',
          perspectives: ['security'],
        },
      ];

      const result = deriveIndividualPassFailFromPerspectives(issues);

      // Major/minor don't fail perspectives
      expect(result.codeReviewPassed).toBe(true);
      expect(result.securityReviewPassed).toBe(true);
      expect(result.poReviewPassed).toBe(true);
    });

    it('should handle mixed severity issues correctly', () => {
      const issues: ReviewIssue[] = [
        {
          severity: 'major',
          category: 'style',
          description: 'Style issue',
          perspectives: ['code'],
        },
        {
          severity: 'critical',
          category: 'security',
          description: 'Security flaw',
          perspectives: ['security'],
        },
        {
          severity: 'minor',
          category: 'documentation',
          description: 'Missing docs',
          perspectives: ['po'],
        },
      ];

      const result = deriveIndividualPassFailFromPerspectives(issues);

      // Only security has critical issue
      expect(result.codeReviewPassed).toBe(true);
      expect(result.securityReviewPassed).toBe(false);
      expect(result.poReviewPassed).toBe(true);
    });
  });

  describe('Unified review integration', () => {
    const mockStoryPath = '/test/stories/test-story.md';
    const mockWorkingDir = '/test/project';

    const mockStory = {
      path: mockStoryPath,
      slug: 'test-story',
      frontmatter: {
        id: 'test-1',
        title: 'Test Story',
        priority: 1,
        status: 'in-progress' as const,
        type: 'feature' as const,
        created: '2024-01-01',
        labels: [],
        research_complete: true,
        plan_complete: true,
        implementation_complete: true,
        reviews_complete: false,
      },
      content: '# Test Story\n\nContent',
    };

    const mockConfig: Config = {
      sdlcFolder: '/test/sdlc',
      stageGates: {
        requireApprovalBeforeImplementation: false,
        requireApprovalBeforePR: false,
        autoMergeOnApproval: false,
      },
      refinement: {
        maxIterations: 3,
        escalateOnMaxAttempts: 'error',
        enableCircuitBreaker: true,
      },
      reviewConfig: {
        maxRetries: 3,
        maxRetriesUpperBound: 10,
        autoCompleteOnApproval: true,
        autoRestartOnRejection: true,
      },
      defaultLabels: [],
      theme: 'auto',
      testCommand: 'npm test',
      buildCommand: 'npm run build',
      timeouts: {
        agentTimeout: 600000,
        buildTimeout: 120000,
        testTimeout: 300000,
      },
    };

    beforeEach(() => {
      vi.resetAllMocks();
      vi.mocked(storyModule.parseStory).mockReturnValue(mockStory);
      vi.mocked(configModule.loadConfig).mockReturnValue(mockConfig);
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => true } as fs.Stats);
    });

    it('should parse unified review response with perspectives', async () => {
      // Mock spawnSync (for hasTestFiles check) - tests exist
      vi.mocked(spawnSync).mockReturnValue({
        status: 0,
        stdout: Buffer.from('src/feature.ts\nsrc/feature.test.ts\n'),
        stderr: Buffer.from(''),
        output: [],
        pid: 1,
        signal: null,
      } as any);

      const mockSpawn = vi.mocked(spawn);
      mockSpawn.mockImplementation((() => {
        const mockProcess: any = {
          stdout: { on: vi.fn() },
          stderr: { on: vi.fn() },
          on: vi.fn((event, callback) => {
            if (event === 'close') {
              process.nextTick(() => callback(0));
            }
          }),
        };
        return mockProcess;
      }) as any);

      // Mock unified review response with perspectives
      const unifiedResponse = JSON.stringify({
        passed: false,
        issues: [
          {
            severity: 'blocker',
            category: 'implementation',
            description: 'No implementation exists',
            perspectives: ['code', 'security', 'po'],
          },
          {
            severity: 'critical',
            category: 'testing',
            description: 'No tests written',
            perspectives: ['code'],
          },
        ],
      });

      vi.mocked(clientModule.runAgentQuery).mockResolvedValue(unifiedResponse);

      const result = await runReviewAgent(mockStoryPath, mockWorkingDir);

      expect(result.issues).toHaveLength(2);
      expect(result.issues[0].perspectives).toEqual(['code', 'security', 'po']);
      expect(result.issues[1].perspectives).toEqual(['code']);
    });

    it('should make only 1 LLM call for unified review', async () => {
      // Mock spawnSync (for hasTestFiles check) - tests exist
      vi.mocked(spawnSync).mockReturnValue({
        status: 0,
        stdout: Buffer.from('src/feature.ts\nsrc/feature.test.ts\n'),
        stderr: Buffer.from(''),
        output: [],
        pid: 1,
        signal: null,
      } as any);

      const mockSpawn = vi.mocked(spawn);
      mockSpawn.mockImplementation((() => {
        const mockProcess: any = {
          stdout: { on: vi.fn() },
          stderr: { on: vi.fn() },
          on: vi.fn((event, callback) => {
            if (event === 'close') {
              process.nextTick(() => callback(0));
            }
          }),
        };
        return mockProcess;
      }) as any);

      vi.mocked(clientModule.runAgentQuery).mockResolvedValue('{"passed": true, "issues": []}');

      await runReviewAgent(mockStoryPath, mockWorkingDir);

      // Should call LLM only once (unified review), not 3 times
      expect(clientModule.runAgentQuery).toHaveBeenCalledTimes(1);
    });

    it('should derive correct pass/fail for each perspective', async () => {
      // Mock spawnSync (for hasTestFiles check) - tests exist
      vi.mocked(spawnSync).mockReturnValue({
        status: 0,
        stdout: Buffer.from('src/feature.ts\nsrc/feature.test.ts\n'),
        stderr: Buffer.from(''),
        output: [],
        pid: 1,
        signal: null,
      } as any);

      const mockSpawn = vi.mocked(spawn);
      mockSpawn.mockImplementation((() => {
        const mockProcess: any = {
          stdout: { on: vi.fn() },
          stderr: { on: vi.fn() },
          on: vi.fn((event, callback) => {
            if (event === 'close') {
              process.nextTick(() => callback(0));
            }
          }),
        };
        return mockProcess;
      }) as any);

      // Security has critical issue, others don't
      const unifiedResponse = JSON.stringify({
        passed: false,
        issues: [
          {
            severity: 'critical',
            category: 'security',
            description: 'SQL injection vulnerability',
            perspectives: ['security'],
          },
        ],
      });

      vi.mocked(clientModule.runAgentQuery).mockResolvedValue(unifiedResponse);

      const _result = await runReviewAgent(mockStoryPath, mockWorkingDir);

      // Parse the review history to check derived values
      expect(vi.mocked(storyModule.appendReviewHistory)).toHaveBeenCalled();
      const reviewAttempt = vi.mocked(storyModule.appendReviewHistory).mock.calls[0][1];

      expect(reviewAttempt.codeReviewPassed).toBe(true);
      expect(reviewAttempt.securityReviewPassed).toBe(false);
      expect(reviewAttempt.poReviewPassed).toBe(true);
    });
  });
});
