import { describe, it, expect, vi } from 'vitest';
import {
  ConsensusManager,
  checkConsensus,
  formatConcernsForIteration,
} from './consensus-manager.js';
import type { AgentOutput, Concern, ConsensusIterationContext } from '../types/workflow-config.js';

const createOutput = (
  agentId: string,
  approved: boolean,
  concerns: Concern[] = []
): AgentOutput => ({
  agentId,
  role: 'tech_lead_reviewer',
  content: `Review from ${agentId}`,
  concerns,
  approved,
});

const createBlocker = (description: string): Concern => ({
  severity: 'blocker',
  category: 'technical',
  description,
});

const createWarning = (description: string): Concern => ({
  severity: 'warning',
  category: 'technical',
  description,
});

describe('ConsensusManager', () => {
  describe('seekConsensus()', () => {
    it('should return reached=true if initial outputs all approve', async () => {
      const manager = new ConsensusManager();
      const outputs = [
        createOutput('agent1', true),
        createOutput('agent2', true),
        createOutput('agent3', true),
      ];

      const executor = vi.fn();
      const result = await manager.seekConsensus(outputs, executor);

      expect(result.reached).toBe(true);
      expect(result.iterations).toBe(1);
      expect(result.requiresHumanReview).toBe(false);
      expect(executor).not.toHaveBeenCalled(); // No iteration needed
    });

    it('should return reached=false if any output has blockers', async () => {
      const manager = new ConsensusManager({ maxIterations: 1 });
      const outputs = [
        createOutput('agent1', false, [createBlocker('Critical issue')]),
        createOutput('agent2', true),
      ];

      const executor = vi.fn();
      const result = await manager.seekConsensus(outputs, executor);

      expect(result.reached).toBe(false);
      expect(result.unresolvedConcerns).toHaveLength(1);
      expect(result.requiresHumanReview).toBe(true);
    });

    it('should iterate when agents disagree', async () => {
      const manager = new ConsensusManager({ maxIterations: 3 });

      // Initial: one agent disapproves with warning
      const initialOutputs = [
        createOutput('agent1', false, [createWarning('Minor issue')]),
        createOutput('agent2', true),
      ];

      let iterationCount = 0;
      const executor = vi.fn().mockImplementation(async () => {
        iterationCount++;
        // After iteration, all approve
        return [
          createOutput('agent1', true),
          createOutput('agent2', true),
        ];
      });

      const result = await manager.seekConsensus(initialOutputs, executor);

      expect(result.reached).toBe(true);
      expect(result.iterations).toBe(2); // Initial + 1 iteration
      expect(executor).toHaveBeenCalledTimes(1);
    });

    it('should stop at maxIterations without consensus', async () => {
      const manager = new ConsensusManager({ maxIterations: 2 });

      const initialOutputs = [
        createOutput('agent1', false, [createBlocker('Persistent issue')]),
        createOutput('agent2', true),
      ];

      const executor = vi.fn().mockImplementation(async () => {
        // Agent keeps disagreeing
        return [
          createOutput('agent1', false, [createBlocker('Still an issue')]),
          createOutput('agent2', true),
        ];
      });

      const result = await manager.seekConsensus(initialOutputs, executor);

      expect(result.reached).toBe(false);
      expect(result.iterations).toBe(2);
      expect(result.requiresHumanReview).toBe(true);
    });

    it('should call onProgress callback during iteration', async () => {
      const onProgress = vi.fn();
      const manager = new ConsensusManager({ maxIterations: 2, onProgress });

      const initialOutputs = [
        createOutput('agent1', false, [createWarning('Issue')]),
        createOutput('agent2', true),
      ];

      const executor = vi.fn().mockResolvedValue([
        createOutput('agent1', true),
        createOutput('agent2', true),
      ]);

      await manager.seekConsensus(initialOutputs, executor);

      expect(onProgress).toHaveBeenCalled();
    });

    it('should handle executor errors gracefully', async () => {
      const manager = new ConsensusManager();

      const initialOutputs = [
        createOutput('agent1', false, [createWarning('Issue')]),
        createOutput('agent2', true),
      ];

      const executor = vi.fn().mockRejectedValue(new Error('Agent failed'));

      const result = await manager.seekConsensus(initialOutputs, executor);

      expect(result.reached).toBe(false);
      expect(result.requiresHumanReview).toBe(true);
    });

    it('should use minApprovalRatio when requireUnanimous is false', async () => {
      const manager = new ConsensusManager({
        requireUnanimous: false,
        minApprovalRatio: 0.66, // 2/3 majority
      });

      // 2 out of 3 approve = 66.7% > 66% threshold
      const outputs = [
        createOutput('agent1', true),
        createOutput('agent2', true),
        createOutput('agent3', false, [createWarning('Minor concern')]),
      ];

      const executor = vi.fn();
      const result = await manager.seekConsensus(outputs, executor);

      expect(result.reached).toBe(true);
    });
  });
});

describe('checkConsensus()', () => {
  it('should return hasConsensus=true when all approve with no blockers', () => {
    const outputs = [
      createOutput('agent1', true),
      createOutput('agent2', true),
    ];

    const result = checkConsensus(outputs);

    expect(result.hasConsensus).toBe(true);
  });

  it('should return hasConsensus=false when blockers present', () => {
    const outputs = [
      createOutput('agent1', true),
      createOutput('agent2', true, [createBlocker('Critical')]),
    ];

    const result = checkConsensus(outputs);

    expect(result.hasConsensus).toBe(false);
    expect(result.summary).toContain('Blocker');
  });

  it('should return hasConsensus=false when not all approve', () => {
    const outputs = [
      createOutput('agent1', true),
      createOutput('agent2', false),
    ];

    const result = checkConsensus(outputs);

    expect(result.hasConsensus).toBe(false);
    expect(result.summary.toLowerCase()).toContain('not all');
  });

  it('should support minApprovalRatio option', () => {
    const outputs = [
      createOutput('agent1', true),
      createOutput('agent2', true),
      createOutput('agent3', false),
    ];

    // Default (unanimous required)
    expect(checkConsensus(outputs).hasConsensus).toBe(false);

    // With 50% threshold
    expect(checkConsensus(outputs, {
      requireUnanimous: false,
      minApprovalRatio: 0.5,
    }).hasConsensus).toBe(true);
  });
});

describe('formatConcernsForIteration()', () => {
  it('should format concerns for next iteration', () => {
    const context: ConsensusIterationContext = {
      iteration: 2,
      previousOutputs: [
        createOutput('agent1', false, [createBlocker('Security issue')]),
        createOutput('agent2', true, [createWarning('Minor issue')]),
      ],
      allConcerns: [
        createBlocker('Security issue'),
        createWarning('Minor issue'),
      ],
      sharedConcerns: [],
      previousSummary: '1/2 agents approved',
    };

    const formatted = formatConcernsForIteration(context);

    expect(formatted).toContain('Previous Iteration Summary');
    expect(formatted).toContain('Individual Agent Concerns');
    expect(formatted).toContain('Security issue');
    expect(formatted).toContain('Instructions for This Iteration');
  });

  it('should highlight shared concerns', () => {
    const sharedConcern = createBlocker('Shared concern between agents');
    const context: ConsensusIterationContext = {
      iteration: 2,
      previousOutputs: [
        createOutput('agent1', false, [sharedConcern]),
        createOutput('agent2', false, [sharedConcern]),
      ],
      allConcerns: [sharedConcern, sharedConcern],
      sharedConcerns: [sharedConcern],
      previousSummary: '0/2 agents approved',
    };

    const formatted = formatConcernsForIteration(context);

    expect(formatted).toContain('Shared Concerns');
    expect(formatted).toContain('Shared concern between agents');
  });
});
