import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { PhaseExecutor, createPhaseExecutor, executePhase } from './phase-executor.js';
import type { WorkflowConfig, PhaseConfig } from '../types/workflow-config.js';

// Mock dependencies
vi.mock('../agents/refinement.js', () => ({
  runRefinementAgent: vi.fn().mockResolvedValue({
    success: true,
    story: { frontmatter: { id: 'S-001' }, content: 'Story' },
    changesMade: ['Refined story'],
  }),
}));

vi.mock('../agents/perspectives/index.js', () => ({
  runTechLeadReviewer: vi.fn().mockResolvedValue({
    output: {
      agentId: 'tech-lead',
      role: 'tech_lead_reviewer',
      content: 'Technical review passed',
      concerns: [],
      approved: true,
    },
    positives: ['Good architecture'],
    rawResponse: '{}',
  }),
  runSecurityReviewer: vi.fn().mockResolvedValue({
    output: {
      agentId: 'security',
      role: 'security_reviewer',
      content: 'Security review passed',
      concerns: [],
      approved: true,
    },
    riskLevel: 'low',
    positives: ['No vulnerabilities'],
    complianceNotes: [],
    rawResponse: '{}',
  }),
  runProductOwnerReviewer: vi.fn().mockResolvedValue({
    output: {
      agentId: 'product-owner',
      role: 'product_owner_reviewer',
      content: 'Product review passed',
      concerns: [],
      approved: true,
    },
    userValueScore: 5,
    scopeAssessment: 'appropriate',
    acceptanceCriteriaComplete: true,
    missingCriteria: [],
    positives: ['Clear user value'],
    rawResponse: '{}',
  }),
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

describe('PhaseExecutor', () => {
  let tempDir: string;
  let storyPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-executor-test-'));

    // Create story directory structure
    const storiesDir = path.join(tempDir, 'stories', 'S-001');
    fs.mkdirSync(storiesDir, { recursive: true });
    storyPath = path.join(storiesDir, 'story.md');
    fs.writeFileSync(storyPath, `---
id: S-001
title: Test Story
slug: test-story
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

Test story content`);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  describe('execute() with default config', () => {
    it('should execute default agent when no workflow.yaml exists', async () => {
      const executor = new PhaseExecutor(tempDir);
      const result = await executor.execute('refine', {
        phase: 'refine',
        storyPath,
        sdlcRoot: tempDir,
      });

      expect(result.success).toBe(true);
      expect(result.outputs).toHaveLength(1);
    });

    it('should return error result for unknown phase', async () => {
      const executor = new PhaseExecutor(tempDir);
      const result = await executor.execute('unknown_phase', {
        phase: 'unknown_phase',
        storyPath,
        sdlcRoot: tempDir,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown phase');
    });
  });

  describe('execute() with custom config', () => {
    it('should execute single custom agent', async () => {
      const config: WorkflowConfig = {
        version: '1.0',
        phases: {
          refine: {
            agents: [
              { id: 'custom-refiner', role: 'story_refiner' },
            ],
          },
        },
      };

      const executor = new PhaseExecutor(tempDir, config);
      const result = await executor.execute('refine', {
        phase: 'refine',
        storyPath,
        sdlcRoot: tempDir,
      });

      expect(result.success).toBe(true);
      expect(result.outputs.some(o => o.agentId === 'custom-refiner')).toBe(true);
    });

    it('should execute parallel agent group', async () => {
      const config: WorkflowConfig = {
        version: '1.0',
        phases: {
          refine: {
            agents: [
              {
                id: 'parallel-group',
                composition: 'parallel',
                agents: [
                  { id: 'tech', role: 'tech_lead_reviewer' },
                  { id: 'security', role: 'security_reviewer' },
                ],
              },
            ],
          },
        },
      };

      const executor = new PhaseExecutor(tempDir, config);
      const result = await executor.execute('refine', {
        phase: 'refine',
        storyPath,
        sdlcRoot: tempDir,
      });

      expect(result.success).toBe(true);
      expect(result.outputs.length).toBe(2);
    });

    it('should execute sequential agents', async () => {
      const config: WorkflowConfig = {
        version: '1.0',
        phases: {
          refine: {
            agents: [
              { id: 'first', role: 'story_refiner' },
              { id: 'second', role: 'tech_lead_reviewer' },
            ],
          },
        },
      };

      const executor = new PhaseExecutor(tempDir, config);
      const result = await executor.execute('refine', {
        phase: 'refine',
        storyPath,
        sdlcRoot: tempDir,
      });

      expect(result.success).toBe(true);
      expect(result.outputs).toHaveLength(2);
    });

    it('should handle consensus required groups', async () => {
      const config: WorkflowConfig = {
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
                  { id: 'po', role: 'product_owner_reviewer' },
                ],
              },
            ],
          },
        },
      };

      const executor = new PhaseExecutor(tempDir, config);
      const result = await executor.execute('refine', {
        phase: 'refine',
        storyPath,
        sdlcRoot: tempDir,
      });

      // All mocked agents approve, so consensus should be reached
      expect(result.success).toBe(true);
      expect(result.consensus?.reached).toBe(true);
    });
  });

  describe('onProgress callback', () => {
    it('should call onProgress during execution', async () => {
      const onProgress = vi.fn();
      const config: WorkflowConfig = {
        version: '1.0',
        phases: {
          refine: {
            agents: [
              { id: 'agent1', role: 'story_refiner' },
            ],
          },
        },
      };

      const executor = new PhaseExecutor(tempDir, config);
      await executor.execute('refine', {
        phase: 'refine',
        storyPath,
        sdlcRoot: tempDir,
        onProgress,
      });

      expect(onProgress).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should return error output for agent with no role', async () => {
      const config: WorkflowConfig = {
        version: '1.0',
        phases: {
          refine: {
            agents: [
              { id: 'no-role' } as any, // Missing role
            ],
          },
        },
      };

      const executor = new PhaseExecutor(tempDir, config);
      const result = await executor.execute('refine', {
        phase: 'refine',
        storyPath,
        sdlcRoot: tempDir,
      });

      expect(result.outputs[0].approved).toBe(false);
      expect(result.outputs[0].concerns.length).toBeGreaterThan(0);
    });

    it('should return error for unsupported role', async () => {
      const config: WorkflowConfig = {
        version: '1.0',
        phases: {
          refine: {
            agents: [
              { id: 'unknown', role: 'researcher' }, // researcher not yet supported in switch
            ],
          },
        },
      };

      const executor = new PhaseExecutor(tempDir, config);
      const result = await executor.execute('refine', {
        phase: 'refine',
        storyPath,
        sdlcRoot: tempDir,
      });

      // Should return an output with error
      expect(result.outputs[0].approved).toBe(false);
    });
  });
});

describe('createPhaseExecutor()', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-executor-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should create a PhaseExecutor instance', () => {
    const executor = createPhaseExecutor(tempDir);
    expect(executor).toBeInstanceOf(PhaseExecutor);
  });

  it('should accept optional config', () => {
    const config: WorkflowConfig = {
      version: '1.0',
      phases: { refine: {} },
    };
    const executor = createPhaseExecutor(tempDir, config);
    expect(executor).toBeInstanceOf(PhaseExecutor);
  });
});

describe('executePhase()', () => {
  let tempDir: string;
  let storyPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-executor-test-'));
    const storiesDir = path.join(tempDir, 'stories', 'S-001');
    fs.mkdirSync(storiesDir, { recursive: true });
    storyPath = path.join(storiesDir, 'story.md');
    fs.writeFileSync(storyPath, `---
id: S-001
title: Test
slug: test
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
Content`);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should be a convenience function for executing phases', async () => {
    const result = await executePhase('refine', storyPath, tempDir);
    expect(result.success).toBe(true);
  });
});
