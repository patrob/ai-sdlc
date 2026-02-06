import { describe, it, expect, beforeEach } from 'vitest';
import { CostTracker, getCostTracker, initCostTracker, resetCostTracker } from './cost-tracker.js';
import type { TokenUsage } from '../providers/types.js';

function makeUsage(input: number, output: number): TokenUsage {
  return { inputTokens: input, outputTokens: output, totalTokens: input + output };
}

describe('CostTracker', () => {
  let tracker: CostTracker;

  beforeEach(() => {
    tracker = new CostTracker();
  });

  describe('addUsage', () => {
    it('records a usage entry', () => {
      tracker.addUsage('S-0001', 'implement', 'agent-1', makeUsage(100, 50), 1000, 'claude-3');

      const entries = tracker.getEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0].storyId).toBe('S-0001');
      expect(entries[0].phase).toBe('implement');
      expect(entries[0].agentId).toBe('agent-1');
      expect(entries[0].usage.inputTokens).toBe(100);
      expect(entries[0].usage.outputTokens).toBe(50);
      expect(entries[0].usage.totalTokens).toBe(150);
      expect(entries[0].durationMs).toBe(1000);
      expect(entries[0].model).toBe('claude-3');
      expect(entries[0].timestamp).toBeTruthy();
    });

    it('accumulates multiple entries', () => {
      tracker.addUsage('S-0001', 'research', 'agent-1', makeUsage(100, 50), 500);
      tracker.addUsage('S-0001', 'implement', 'agent-2', makeUsage(200, 100), 1000);
      tracker.addUsage('S-0002', 'research', 'agent-1', makeUsage(50, 25), 300);

      expect(tracker.getEntries()).toHaveLength(3);
    });
  });

  describe('getStoryCost', () => {
    it('aggregates costs for a specific story', () => {
      tracker.addUsage('S-0001', 'research', 'agent-1', makeUsage(100, 50), 500);
      tracker.addUsage('S-0001', 'implement', 'agent-2', makeUsage(200, 100), 1000);
      tracker.addUsage('S-0002', 'research', 'agent-1', makeUsage(50, 25), 300);

      const cost = tracker.getStoryCost('S-0001');
      expect(cost.totalInputTokens).toBe(300);
      expect(cost.totalOutputTokens).toBe(150);
      expect(cost.totalTokens).toBe(450);
      expect(cost.totalDurationMs).toBe(1500);
      expect(cost.entryCount).toBe(2);
    });

    it('returns zeroes for unknown story', () => {
      const cost = tracker.getStoryCost('S-9999');
      expect(cost.totalTokens).toBe(0);
      expect(cost.entryCount).toBe(0);
    });
  });

  describe('getPhaseCost', () => {
    it('aggregates costs for a specific story+phase', () => {
      tracker.addUsage('S-0001', 'implement', 'agent-1', makeUsage(100, 50), 500);
      tracker.addUsage('S-0001', 'implement', 'agent-2', makeUsage(200, 100), 1000);
      tracker.addUsage('S-0001', 'review', 'agent-3', makeUsage(50, 25), 300);

      const cost = tracker.getPhaseCost('S-0001', 'implement');
      expect(cost.totalInputTokens).toBe(300);
      expect(cost.totalOutputTokens).toBe(150);
      expect(cost.totalTokens).toBe(450);
      expect(cost.entryCount).toBe(2);
    });
  });

  describe('getTotalCost', () => {
    it('aggregates all costs', () => {
      tracker.addUsage('S-0001', 'research', 'agent-1', makeUsage(100, 50), 500);
      tracker.addUsage('S-0002', 'implement', 'agent-2', makeUsage(200, 100), 1000);

      const cost = tracker.getTotalCost();
      expect(cost.totalInputTokens).toBe(300);
      expect(cost.totalOutputTokens).toBe(150);
      expect(cost.totalTokens).toBe(450);
      expect(cost.totalDurationMs).toBe(1500);
      expect(cost.entryCount).toBe(2);
    });

    it('returns zeroes when empty', () => {
      const cost = tracker.getTotalCost();
      expect(cost.totalTokens).toBe(0);
      expect(cost.entryCount).toBe(0);
    });
  });

  describe('getCostByStory', () => {
    it('groups costs by story', () => {
      tracker.addUsage('S-0001', 'research', 'a1', makeUsage(100, 50), 500);
      tracker.addUsage('S-0001', 'implement', 'a2', makeUsage(200, 100), 1000);
      tracker.addUsage('S-0002', 'research', 'a1', makeUsage(50, 25), 300);

      const byStory = tracker.getCostByStory();
      expect(byStory.size).toBe(2);
      expect(byStory.get('S-0001')!.totalTokens).toBe(450);
      expect(byStory.get('S-0002')!.totalTokens).toBe(75);
    });
  });

  describe('cost limits', () => {
    describe('checkStoryLimit', () => {
      it('returns not exceeded when no limit configured', () => {
        tracker.addUsage('S-0001', 'implement', 'a1', makeUsage(10000, 5000), 500);

        const check = tracker.checkStoryLimit('S-0001');
        expect(check.exceeded).toBe(false);
        expect(check.warning).toBe(false);
        expect(check.currentTokens).toBe(15000);
        expect(check.limitTokens).toBeUndefined();
      });

      it('detects when story limit is exceeded', () => {
        const limited = new CostTracker({ perStoryMaxTokens: 1000 });
        limited.addUsage('S-0001', 'implement', 'a1', makeUsage(600, 500), 500);

        const check = limited.checkStoryLimit('S-0001');
        expect(check.exceeded).toBe(true);
        expect(check.currentTokens).toBe(1100);
        expect(check.limitTokens).toBe(1000);
        expect(check.percentUsed).toBe(110);
      });

      it('detects warning threshold', () => {
        const limited = new CostTracker({
          perStoryMaxTokens: 1000,
          warningThresholdPercent: 80,
        });
        limited.addUsage('S-0001', 'implement', 'a1', makeUsage(500, 350), 500);

        const check = limited.checkStoryLimit('S-0001');
        expect(check.exceeded).toBe(false);
        expect(check.warning).toBe(true);
        expect(check.percentUsed).toBe(85);
      });

      it('uses default 80% warning threshold', () => {
        const limited = new CostTracker({ perStoryMaxTokens: 1000 });
        limited.addUsage('S-0001', 'implement', 'a1', makeUsage(500, 310), 500);

        const check = limited.checkStoryLimit('S-0001');
        expect(check.warning).toBe(true); // 810/1000 = 81%
      });

      it('returns no warning below threshold', () => {
        const limited = new CostTracker({ perStoryMaxTokens: 1000 });
        limited.addUsage('S-0001', 'implement', 'a1', makeUsage(200, 100), 500);

        const check = limited.checkStoryLimit('S-0001');
        expect(check.warning).toBe(false);
        expect(check.exceeded).toBe(false);
      });
    });

    describe('checkRunLimit', () => {
      it('aggregates across all stories for run limit', () => {
        const limited = new CostTracker({ perRunMaxTokens: 5000 });
        limited.addUsage('S-0001', 'implement', 'a1', makeUsage(1500, 1000), 500);
        limited.addUsage('S-0002', 'research', 'a2', makeUsage(1500, 1000), 500);

        const check = limited.checkRunLimit();
        expect(check.exceeded).toBe(true);
        expect(check.currentTokens).toBe(5000);
        expect(check.limitTokens).toBe(5000);
      });
    });
  });

  describe('setCostLimits', () => {
    it('allows updating limits after construction', () => {
      tracker.addUsage('S-0001', 'implement', 'a1', makeUsage(500, 500), 500);

      let check = tracker.checkStoryLimit('S-0001');
      expect(check.exceeded).toBe(false);

      tracker.setCostLimits({ perStoryMaxTokens: 500 });
      check = tracker.checkStoryLimit('S-0001');
      expect(check.exceeded).toBe(true);
    });
  });

  describe('reset', () => {
    it('clears all entries', () => {
      tracker.addUsage('S-0001', 'implement', 'a1', makeUsage(100, 50), 500);
      expect(tracker.getEntries()).toHaveLength(1);

      tracker.reset();
      expect(tracker.getEntries()).toHaveLength(0);
      expect(tracker.getTotalCost().totalTokens).toBe(0);
    });
  });
});

describe('singleton accessors', () => {
  beforeEach(() => {
    resetCostTracker();
  });

  it('getCostTracker creates default instance', () => {
    const tracker = getCostTracker();
    expect(tracker).toBeInstanceOf(CostTracker);
  });

  it('getCostTracker returns same instance', () => {
    const a = getCostTracker();
    const b = getCostTracker();
    expect(a).toBe(b);
  });

  it('initCostTracker creates instance with limits', () => {
    const tracker = initCostTracker({ perStoryMaxTokens: 1000 });
    tracker.addUsage('S-0001', 'implement', 'a1', makeUsage(600, 500), 500);

    const check = tracker.checkStoryLimit('S-0001');
    expect(check.exceeded).toBe(true);
  });

  it('initCostTracker replaces existing instance', () => {
    const first = getCostTracker();
    first.addUsage('S-0001', 'implement', 'a1', makeUsage(100, 50), 500);

    const second = initCostTracker();
    expect(second.getEntries()).toHaveLength(0);
    expect(getCostTracker()).toBe(second);
  });

  it('resetCostTracker clears the singleton', () => {
    const first = getCostTracker();
    resetCostTracker();
    const second = getCostTracker();
    expect(first).not.toBe(second);
  });
});
