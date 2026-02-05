/**
 * Integration Tests for Multi-Agent Refinement
 *
 * Tests the full workflow of multi-agent refinement with:
 * - Parallel perspective reviewers
 * - Consensus-based conflict resolution
 * - Iteration until agreement
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import yaml from 'js-yaml';
import { PhaseExecutor } from './phase-executor.js';
import { WorkflowConfigLoader } from './workflow-config.js';
import type { WorkflowConfig } from '../types/workflow-config.js';

// Mock all the agents
const mockTechLeadReviewer = vi.fn();
const mockSecurityReviewer = vi.fn();
const mockProductOwnerReviewer = vi.fn();
const mockRefinementAgent = vi.fn();

vi.mock('../agents/perspectives/index.js', () => ({
  runTechLeadReviewer: (...args: any[]) => mockTechLeadReviewer(...args),
  runSecurityReviewer: (...args: any[]) => mockSecurityReviewer(...args),
  runProductOwnerReviewer: (...args: any[]) => mockProductOwnerReviewer(...args),
}));

vi.mock('../agents/refinement.js', () => ({
  runRefinementAgent: (...args: any[]) => mockRefinementAgent(...args),
}));

vi.mock('../providers/registry.js', () => ({
  ProviderRegistry: {
    getDefault: vi.fn().mockReturnValue({
      name: 'mock',
      capabilities: {
        supportsTools: true,
        supportsSystemPrompt: true,
      },
    }),
  },
}));

describe('Multi-Agent Refinement Integration', () => {
  let tempDir: string;
  let storyPath: string;

  const createStoryFile = (content: string) => {
    const storiesDir = path.join(tempDir, 'stories', 'S-001');
    fs.mkdirSync(storiesDir, { recursive: true });
    storyPath = path.join(storiesDir, 'story.md');
    fs.writeFileSync(storyPath, content);
  };

  const createWorkflowConfig = (config: WorkflowConfig) => {
    fs.writeFileSync(
      path.join(tempDir, 'workflow.yaml'),
      yaml.dump(config)
    );
  };

  const defaultStory = `---
id: S-001
title: Add user authentication
slug: add-user-auth
priority: 10
status: backlog
type: feature
created: "2025-01-01"
labels: []
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
---

As a user, I want to authenticate so that I can access protected resources.

## Acceptance Criteria
- [ ] Users can log in with email/password
- [ ] Session persists across browser refreshes
- [ ] Invalid credentials show error message
`;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'multi-agent-test-'));
    vi.clearAllMocks();

    // Setup default mock responses
    mockRefinementAgent.mockResolvedValue({
      success: true,
      story: { frontmatter: { id: 'S-001' }, content: 'Refined story' },
      changesMade: ['Refined story'],
    });

    mockTechLeadReviewer.mockResolvedValue({
      output: {
        agentId: 'tech-lead',
        role: 'tech_lead_reviewer',
        content: 'Tech review passed',
        concerns: [],
        approved: true,
      },
      positives: ['Good technical approach'],
      rawResponse: '{}',
    });

    mockSecurityReviewer.mockResolvedValue({
      output: {
        agentId: 'security',
        role: 'security_reviewer',
        content: 'Security review passed',
        concerns: [],
        approved: true,
      },
      riskLevel: 'low',
      positives: ['Good security practices'],
      complianceNotes: [],
      rawResponse: '{}',
    });

    mockProductOwnerReviewer.mockResolvedValue({
      output: {
        agentId: 'product-owner',
        role: 'product_owner_reviewer',
        content: 'PO review passed',
        concerns: [],
        approved: true,
      },
      userValueScore: 5,
      scopeAssessment: 'appropriate',
      acceptanceCriteriaComplete: true,
      missingCriteria: [],
      positives: ['Clear user value'],
      rawResponse: '{}',
    });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('Full Multi-Agent Workflow', () => {
    it('should run refinement followed by parallel perspective review', async () => {
      createStoryFile(defaultStory);
      createWorkflowConfig({
        version: '1.0',
        phases: {
          refine: {
            agents: [
              { id: 'initial-refinement', role: 'story_refiner' },
              {
                id: 'perspective-review',
                composition: 'parallel',
                agents: [
                  { id: 'tech-review', role: 'tech_lead_reviewer' },
                  { id: 'security-review', role: 'security_reviewer' },
                  { id: 'po-review', role: 'product_owner_reviewer' },
                ],
              },
            ],
          },
        },
      });

      const executor = new PhaseExecutor(tempDir);
      const result = await executor.execute('refine', {
        phase: 'refine',
        storyPath,
        sdlcRoot: tempDir,
      });

      expect(result.success).toBe(true);
      expect(result.outputs).toHaveLength(4); // 1 refiner + 3 reviewers

      // Verify all agents were called
      expect(mockRefinementAgent).toHaveBeenCalledTimes(1);
      expect(mockTechLeadReviewer).toHaveBeenCalledTimes(1);
      expect(mockSecurityReviewer).toHaveBeenCalledTimes(1);
      expect(mockProductOwnerReviewer).toHaveBeenCalledTimes(1);
    });

    it('should reach consensus when all agents approve', async () => {
      createStoryFile(defaultStory);
      createWorkflowConfig({
        version: '1.0',
        phases: {
          refine: {
            agents: [
              {
                id: 'consensus-group',
                composition: 'parallel',
                consensus: 'required',
                maxIterations: 3,
                agents: [
                  { id: 'tech', role: 'tech_lead_reviewer' },
                  { id: 'security', role: 'security_reviewer' },
                ],
              },
            ],
          },
        },
      });

      const executor = new PhaseExecutor(tempDir);
      const result = await executor.execute('refine', {
        phase: 'refine',
        storyPath,
        sdlcRoot: tempDir,
      });

      expect(result.success).toBe(true);
      expect(result.consensus).toBeDefined();
      expect(result.consensus?.reached).toBe(true);
      expect(result.consensus?.iterations).toBe(1);
    });

    it('should iterate when agents disagree initially', async () => {
      createStoryFile(defaultStory);
      createWorkflowConfig({
        version: '1.0',
        phases: {
          refine: {
            agents: [
              {
                id: 'consensus-group',
                composition: 'parallel',
                consensus: 'required',
                maxIterations: 3,
                agents: [
                  { id: 'tech', role: 'tech_lead_reviewer' },
                  { id: 'security', role: 'security_reviewer' },
                ],
              },
            ],
          },
        },
      });

      // First call: security reviewer disagrees
      let securityCallCount = 0;
      mockSecurityReviewer.mockImplementation(async () => {
        securityCallCount++;
        if (securityCallCount === 1) {
          return {
            output: {
              agentId: 'security',
              role: 'security_reviewer',
              content: 'Security concerns identified',
              concerns: [{
                severity: 'warning',
                category: 'security',
                description: 'Missing CSRF protection',
              }],
              approved: false,
            },
            riskLevel: 'medium',
            positives: [],
            complianceNotes: [],
            rawResponse: '{}',
          };
        }
        // Second call: security reviewer approves
        return {
          output: {
            agentId: 'security',
            role: 'security_reviewer',
            content: 'Security review passed after iteration',
            concerns: [],
            approved: true,
          },
          riskLevel: 'low',
          positives: ['CSRF addressed'],
          complianceNotes: [],
          rawResponse: '{}',
        };
      });

      const executor = new PhaseExecutor(tempDir);
      const result = await executor.execute('refine', {
        phase: 'refine',
        storyPath,
        sdlcRoot: tempDir,
      });

      expect(result.success).toBe(true);
      expect(result.consensus?.reached).toBe(true);
      expect(result.consensus?.iterations).toBe(2);
      expect(securityCallCount).toBe(2);
    });

    it('should flag for human review when max iterations reached', async () => {
      createStoryFile(defaultStory);
      createWorkflowConfig({
        version: '1.0',
        phases: {
          refine: {
            agents: [
              {
                id: 'consensus-group',
                composition: 'parallel',
                consensus: 'required',
                maxIterations: 2,
                agents: [
                  { id: 'tech', role: 'tech_lead_reviewer' },
                  { id: 'security', role: 'security_reviewer' },
                ],
              },
            ],
          },
        },
      });

      // Security reviewer never approves
      mockSecurityReviewer.mockResolvedValue({
        output: {
          agentId: 'security',
          role: 'security_reviewer',
          content: 'Persistent security concern',
          concerns: [{
            severity: 'blocker',
            category: 'security',
            description: 'Critical vulnerability cannot be mitigated',
          }],
          approved: false,
        },
        riskLevel: 'critical',
        positives: [],
        complianceNotes: [],
        rawResponse: '{}',
      });

      const executor = new PhaseExecutor(tempDir);
      const result = await executor.execute('refine', {
        phase: 'refine',
        storyPath,
        sdlcRoot: tempDir,
      });

      expect(result.success).toBe(false);
      expect(result.consensus?.reached).toBe(false);
      expect(result.consensus?.requiresHumanReview).toBe(true);
      expect(result.error).toContain('human review');
    });
  });

  describe('Backward Compatibility', () => {
    it('should use single agent when no workflow.yaml exists', async () => {
      createStoryFile(defaultStory);
      // No workflow.yaml created

      const executor = new PhaseExecutor(tempDir);
      const result = await executor.execute('refine', {
        phase: 'refine',
        storyPath,
        sdlcRoot: tempDir,
      });

      expect(result.success).toBe(true);
      // Should only call refinement agent (not perspective reviewers)
      expect(mockRefinementAgent).toHaveBeenCalledTimes(1);
      expect(mockTechLeadReviewer).not.toHaveBeenCalled();
      expect(mockSecurityReviewer).not.toHaveBeenCalled();
      expect(mockProductOwnerReviewer).not.toHaveBeenCalled();
    });

    it('should use single agent when phase config is empty', async () => {
      createStoryFile(defaultStory);
      createWorkflowConfig({
        version: '1.0',
        phases: {
          refine: {}, // Empty = use default
        },
      });

      const executor = new PhaseExecutor(tempDir);
      const result = await executor.execute('refine', {
        phase: 'refine',
        storyPath,
        sdlcRoot: tempDir,
      });

      expect(result.success).toBe(true);
      expect(mockRefinementAgent).toHaveBeenCalledTimes(1);
      expect(mockTechLeadReviewer).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle agent errors gracefully', async () => {
      createStoryFile(defaultStory);
      createWorkflowConfig({
        version: '1.0',
        phases: {
          refine: {
            agents: [
              { id: 'tech', role: 'tech_lead_reviewer' },
            ],
          },
        },
      });

      mockTechLeadReviewer.mockRejectedValue(new Error('Agent crashed'));

      const executor = new PhaseExecutor(tempDir);
      const result = await executor.execute('refine', {
        phase: 'refine',
        storyPath,
        sdlcRoot: tempDir,
      });

      // Should return a result (not throw)
      expect(result.outputs).toHaveLength(1);
      expect(result.outputs[0].approved).toBe(false);
      expect(result.outputs[0].concerns.length).toBeGreaterThan(0);
    });

    it('should handle invalid workflow config', async () => {
      createStoryFile(defaultStory);
      fs.writeFileSync(
        path.join(tempDir, 'workflow.yaml'),
        'invalid yaml: : :'
      );

      expect(() => new PhaseExecutor(tempDir)).toThrow();
    });
  });

  describe('Progress Callbacks', () => {
    it('should call onProgress during multi-agent execution', async () => {
      createStoryFile(defaultStory);
      createWorkflowConfig({
        version: '1.0',
        phases: {
          refine: {
            agents: [
              { id: 'tech', role: 'tech_lead_reviewer' },
              { id: 'security', role: 'security_reviewer' },
            ],
          },
        },
      });

      const onProgress = vi.fn();
      const executor = new PhaseExecutor(tempDir);
      await executor.execute('refine', {
        phase: 'refine',
        storyPath,
        sdlcRoot: tempDir,
        onProgress,
      });

      expect(onProgress).toHaveBeenCalled();
      expect(onProgress.mock.calls.some(call =>
        call[0].includes('tech') || call[0].includes('security')
      )).toBe(true);
    });
  });
});
