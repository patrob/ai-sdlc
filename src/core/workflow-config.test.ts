import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  WorkflowConfigLoader,
  loadWorkflowConfig,
  getPhaseConfig,
  hasCustomAgents,
  isPhaseEnabled,
} from './workflow-config.js';
import { DEFAULT_WORKFLOW_CONFIG } from '../types/workflow-config.js';

describe('WorkflowConfigLoader', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-config-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('load()', () => {
    it('should return default config when no workflow.yaml exists', () => {
      const loader = new WorkflowConfigLoader(tempDir);
      const config = loader.load();

      expect(config.version).toBe('1.0');
      expect(config.phases).toBeDefined();
      expect(config.phases.refine).toEqual({});
      expect(config.phases.research).toEqual({});
    });

    it('should load valid workflow.yaml', () => {
      const yaml = `
version: "1.0"
phases:
  refine:
    agents:
      - id: my-agent
        role: story_refiner
`;
      fs.writeFileSync(path.join(tempDir, 'workflow.yaml'), yaml);

      const loader = new WorkflowConfigLoader(tempDir);
      const config = loader.load();

      expect(config.version).toBe('1.0');
      expect(config.phases.refine.agents).toHaveLength(1);
      expect(config.phases.refine.agents![0].id).toBe('my-agent');
      expect(config.phases.refine.agents![0].role).toBe('story_refiner');
    });

    it('should load agent groups with parallel composition', () => {
      const yaml = `
version: "1.0"
phases:
  refine:
    agents:
      - id: group1
        composition: parallel
        consensus: required
        maxIterations: 5
        agents:
          - id: tech
            role: tech_lead_reviewer
          - id: security
            role: security_reviewer
`;
      fs.writeFileSync(path.join(tempDir, 'workflow.yaml'), yaml);

      const loader = new WorkflowConfigLoader(tempDir);
      const config = loader.load();

      const group = config.phases.refine.agents![0];
      expect(group.id).toBe('group1');
      expect(group.composition).toBe('parallel');
      expect(group.consensus).toBe('required');
      expect(group.maxIterations).toBe(5);
      expect(group.agents).toHaveLength(2);
    });

    it('should throw on invalid YAML', () => {
      fs.writeFileSync(path.join(tempDir, 'workflow.yaml'), 'invalid: yaml: content:');

      const loader = new WorkflowConfigLoader(tempDir);
      expect(() => loader.load()).toThrow();
    });

    it('should throw on missing version', () => {
      const yaml = `
phases:
  refine: {}
`;
      fs.writeFileSync(path.join(tempDir, 'workflow.yaml'), yaml);

      const loader = new WorkflowConfigLoader(tempDir);
      expect(() => loader.load()).toThrow(/version/);
    });

    it('should throw on missing phases', () => {
      const yaml = `
version: "1.0"
`;
      fs.writeFileSync(path.join(tempDir, 'workflow.yaml'), yaml);

      const loader = new WorkflowConfigLoader(tempDir);
      expect(() => loader.load()).toThrow(/phases/);
    });

    it('should throw on invalid agent role', () => {
      const yaml = `
version: "1.0"
phases:
  refine:
    agents:
      - id: bad-agent
        role: invalid_role
`;
      fs.writeFileSync(path.join(tempDir, 'workflow.yaml'), yaml);

      const loader = new WorkflowConfigLoader(tempDir);
      expect(() => loader.load()).toThrow(/role/);
    });
  });

  describe('validate()', () => {
    it('should return valid for correct config', () => {
      const loader = new WorkflowConfigLoader(tempDir);
      const result = loader.validate({
        version: '1.0',
        phases: {
          refine: {
            agents: [
              { id: 'test', role: 'story_refiner' },
            ],
          },
        },
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect missing agent id', () => {
      const loader = new WorkflowConfigLoader(tempDir);
      const result = loader.validate({
        version: '1.0',
        phases: {
          refine: {
            agents: [
              { role: 'story_refiner' } as any,
            ],
          },
        },
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path.includes('id'))).toBe(true);
    });

    it('should detect invalid composition mode', () => {
      const loader = new WorkflowConfigLoader(tempDir);
      const result = loader.validate({
        version: '1.0',
        phases: {
          refine: {
            agents: [
              {
                id: 'group',
                composition: 'invalid' as any,
                agents: [{ id: 'a', role: 'story_refiner' }],
              },
            ],
          },
        },
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.message.includes('composition'))).toBe(true);
    });

    it('should warn on unknown phase', () => {
      const loader = new WorkflowConfigLoader(tempDir);
      const result = loader.validate({
        version: '1.0',
        phases: {
          unknown_phase: {},
        },
      });

      expect(result.valid).toBe(true); // warnings don't invalidate
      expect(result.warnings.some(w => w.message.includes('Unknown phase'))).toBe(true);
    });
  });

  describe('exists()', () => {
    it('should return false when file does not exist', () => {
      const loader = new WorkflowConfigLoader(tempDir);
      expect(loader.exists()).toBe(false);
    });

    it('should return true when file exists', () => {
      fs.writeFileSync(path.join(tempDir, 'workflow.yaml'), 'version: "1.0"\nphases: {}');
      const loader = new WorkflowConfigLoader(tempDir);
      expect(loader.exists()).toBe(true);
    });
  });

  describe('getPath()', () => {
    it('should return correct path', () => {
      const loader = new WorkflowConfigLoader(tempDir);
      expect(loader.getPath()).toBe(path.join(tempDir, 'workflow.yaml'));
    });
  });
});

describe('loadWorkflowConfig()', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-config-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should be a convenience function that loads config', () => {
    const config = loadWorkflowConfig(tempDir);
    expect(config.version).toBe('1.0');
  });
});

describe('getPhaseConfig()', () => {
  it('should return phase config if exists', () => {
    const config = {
      version: '1.0',
      phases: {
        refine: { agents: [{ id: 'a', role: 'story_refiner' as const }] },
      },
    };

    const phaseConfig = getPhaseConfig(config, 'refine');
    expect(phaseConfig.agents).toHaveLength(1);
  });

  it('should return empty object for non-existent phase', () => {
    const config = {
      version: '1.0',
      phases: {},
    };

    const phaseConfig = getPhaseConfig(config, 'refine');
    expect(phaseConfig).toEqual({});
  });
});

describe('hasCustomAgents()', () => {
  it('should return false for empty config', () => {
    expect(hasCustomAgents({})).toBe(false);
  });

  it('should return false for empty agents array', () => {
    expect(hasCustomAgents({ agents: [] })).toBe(false);
  });

  it('should return true when agents are configured', () => {
    expect(hasCustomAgents({
      agents: [{ id: 'a', role: 'story_refiner' as const }],
    })).toBe(true);
  });
});

describe('isPhaseEnabled()', () => {
  it('should return true by default', () => {
    expect(isPhaseEnabled({})).toBe(true);
  });

  it('should return false when explicitly disabled', () => {
    expect(isPhaseEnabled({ enabled: false })).toBe(false);
  });

  it('should return true when explicitly enabled', () => {
    expect(isPhaseEnabled({ enabled: true })).toBe(true);
  });
});
