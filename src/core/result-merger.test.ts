import { describe, it, expect } from 'vitest';
import {
  mergeAgentOutputs,
  findSharedConcerns,
  combineAgentContent,
} from './result-merger.js';
import type { AgentOutput, Concern } from '../types/workflow-config.js';

const createOutput = (
  agentId: string,
  approved: boolean,
  concerns: Concern[] = [],
  content = 'Review content'
): AgentOutput => ({
  agentId,
  role: 'tech_lead_reviewer',
  content,
  concerns,
  approved,
});

const createConcern = (
  severity: 'blocker' | 'warning' | 'suggestion',
  category: 'security' | 'technical' | 'product' | 'general',
  description: string
): Concern => ({
  severity,
  category,
  description,
});

describe('mergeAgentOutputs()', () => {
  it('should return default result for empty outputs', () => {
    const result = mergeAgentOutputs([]);

    expect(result.outputs).toHaveLength(0);
    expect(result.allApproved).toBe(true);
    expect(result.concerns).toHaveLength(0);
    expect(result.hasBlockers).toBe(false);
    expect(result.dissenting).toHaveLength(0);
  });

  it('should track approval status correctly', () => {
    const outputs = [
      createOutput('agent1', true),
      createOutput('agent2', false),
      createOutput('agent3', true),
    ];

    const result = mergeAgentOutputs(outputs);

    expect(result.allApproved).toBe(false);
    expect(result.dissenting).toEqual(['agent2']);
  });

  it('should merge concerns from all agents', () => {
    const outputs = [
      createOutput('agent1', false, [
        createConcern('blocker', 'security', 'SQL injection'),
      ]),
      createOutput('agent2', false, [
        createConcern('warning', 'technical', 'High complexity'),
      ]),
    ];

    const result = mergeAgentOutputs(outputs);

    expect(result.concerns).toHaveLength(2);
    expect(result.hasBlockers).toBe(true);
  });

  it('should deduplicate identical concerns', () => {
    const outputs = [
      createOutput('agent1', false, [
        createConcern('warning', 'security', 'Missing input validation'),
      ]),
      createOutput('agent2', false, [
        createConcern('warning', 'security', 'Missing input validation'),
      ]),
    ];

    const result = mergeAgentOutputs(outputs);

    expect(result.concerns).toHaveLength(1);
  });

  it('should keep more severe version when deduplicating', () => {
    const outputs = [
      createOutput('agent1', false, [
        createConcern('warning', 'security', 'Missing validation'),
      ]),
      createOutput('agent2', false, [
        createConcern('blocker', 'security', 'Missing validation'),
      ]),
    ];

    const result = mergeAgentOutputs(outputs);

    expect(result.concerns).toHaveLength(1);
    expect(result.concerns[0].severity).toBe('blocker');
  });

  it('should sort concerns by severity', () => {
    const outputs = [
      createOutput('agent1', false, [
        createConcern('suggestion', 'technical', 'Consider optimization'),
        createConcern('blocker', 'security', 'Critical vulnerability'),
        createConcern('warning', 'product', 'UX concern'),
      ]),
    ];

    const result = mergeAgentOutputs(outputs);

    expect(result.concerns[0].severity).toBe('blocker');
    expect(result.concerns[1].severity).toBe('warning');
    expect(result.concerns[2].severity).toBe('suggestion');
  });

  it('should group concerns by category', () => {
    const outputs = [
      createOutput('agent1', false, [
        createConcern('warning', 'security', 'Auth issue'),
        createConcern('warning', 'technical', 'Code smell'),
        createConcern('warning', 'security', 'XSS risk'),
      ]),
    ];

    const result = mergeAgentOutputs(outputs);

    expect(result.concernsByCategory.security).toHaveLength(2);
    expect(result.concernsByCategory.technical).toHaveLength(1);
    expect(result.concernsByCategory.product).toHaveLength(0);
  });

  it('should group concerns by severity', () => {
    const outputs = [
      createOutput('agent1', false, [
        createConcern('blocker', 'security', 'Critical'),
        createConcern('warning', 'technical', 'Medium'),
        createConcern('suggestion', 'product', 'Nice to have'),
      ]),
    ];

    const result = mergeAgentOutputs(outputs);

    expect(result.concernsBySeverity.blocker).toHaveLength(1);
    expect(result.concernsBySeverity.warning).toHaveLength(1);
    expect(result.concernsBySeverity.suggestion).toHaveLength(1);
  });

  it('should generate meaningful summary', () => {
    const outputs = [
      createOutput('agent1', true),
      createOutput('agent2', false, [
        createConcern('blocker', 'security', 'Issue'),
      ]),
    ];

    const result = mergeAgentOutputs(outputs);

    expect(result.summary).toContain('1/2 agents approved');
    expect(result.summary).toContain('1 blocker');
    expect(result.summary).toContain('must be resolved');
  });
});

describe('findSharedConcerns()', () => {
  it('should return empty array when no shared concerns', () => {
    const outputs = [
      createOutput('agent1', false, [
        createConcern('warning', 'security', 'Concern A'),
      ]),
      createOutput('agent2', false, [
        createConcern('warning', 'security', 'Concern B'),
      ]),
    ];

    const shared = findSharedConcerns(outputs);
    expect(shared).toHaveLength(0);
  });

  it('should find concerns raised by multiple agents', () => {
    const sharedDescription = 'Missing authentication check';
    const outputs = [
      createOutput('agent1', false, [
        createConcern('warning', 'security', sharedDescription),
      ]),
      createOutput('agent2', false, [
        createConcern('warning', 'security', sharedDescription),
      ]),
      createOutput('agent3', false, [
        createConcern('warning', 'technical', 'Different concern'),
      ]),
    ];

    const shared = findSharedConcerns(outputs);

    expect(shared).toHaveLength(1);
    expect(shared[0].description).toBe(sharedDescription);
  });

  it('should upgrade severity for shared concerns', () => {
    const sharedDescription = 'Missing validation';
    const outputs = [
      createOutput('agent1', false, [
        createConcern('warning', 'security', sharedDescription),
      ]),
      createOutput('agent2', false, [
        createConcern('blocker', 'security', sharedDescription),
      ]),
    ];

    const shared = findSharedConcerns(outputs);

    expect(shared[0].severity).toBe('blocker');
  });

  it('should sort shared concerns by severity', () => {
    const outputs = [
      createOutput('agent1', false, [
        createConcern('suggestion', 'technical', 'Minor'),
        createConcern('blocker', 'security', 'Critical'),
      ]),
      createOutput('agent2', false, [
        createConcern('suggestion', 'technical', 'Minor'),
        createConcern('blocker', 'security', 'Critical'),
      ]),
    ];

    const shared = findSharedConcerns(outputs);

    expect(shared[0].severity).toBe('blocker');
    expect(shared[1].severity).toBe('suggestion');
  });
});

describe('combineAgentContent()', () => {
  it('should combine content from all agents', () => {
    const outputs = [
      createOutput('tech-lead', true, [], 'Technical review looks good'),
      createOutput('security', true, [], 'No security issues found'),
    ];

    const combined = combineAgentContent(outputs);

    expect(combined).toContain('tech-lead');
    expect(combined).toContain('Technical review looks good');
    expect(combined).toContain('security');
    expect(combined).toContain('No security issues found');
  });

  it('should include approval status indicators', () => {
    const outputs = [
      createOutput('approved-agent', true),
      createOutput('rejected-agent', false),
    ];

    const combined = combineAgentContent(outputs);

    expect(combined).toMatch(/approved-agent.*✓/);
    expect(combined).toMatch(/rejected-agent.*✗/);
  });

  it('should use custom separator', () => {
    const outputs = [
      createOutput('agent1', true, [], 'Content 1'),
      createOutput('agent2', true, [], 'Content 2'),
    ];

    const combined = combineAgentContent(outputs, '\n===\n');

    expect(combined).toContain('===');
  });
});
