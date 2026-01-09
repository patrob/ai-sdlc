/**
 * Tests for workflow state persistence
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  saveWorkflowState,
  loadWorkflowState,
  validateWorkflowState,
  clearWorkflowState,
  getStateFilePath,
  generateWorkflowId,
  calculateStoryHash,
  hasWorkflowState,
} from './workflow-state.js';
import { WorkflowExecutionState } from '../types/workflow-state.js';

const TEST_SDLC_ROOT = path.join(process.cwd(), '.test-workflow-state');

// Helper to create a valid state object
function createValidState(overrides?: Partial<WorkflowExecutionState>): WorkflowExecutionState {
  return {
    version: '1.0',
    workflowId: 'test-workflow-123',
    timestamp: new Date().toISOString(),
    currentAction: null,
    completedActions: [],
    context: {
      sdlcRoot: TEST_SDLC_ROOT,
      options: { auto: true },
    },
    ...overrides,
  };
}

describe('workflow-state', () => {
  beforeEach(async () => {
    // Create test directory
    await fs.promises.mkdir(TEST_SDLC_ROOT, { recursive: true });
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await fs.promises.rm(TEST_SDLC_ROOT, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('getStateFilePath', () => {
    it('should return correct state file path', () => {
      const result = getStateFilePath(TEST_SDLC_ROOT);
      expect(result).toBe(path.join(TEST_SDLC_ROOT, '.workflow-state.json'));
    });
  });

  describe('generateWorkflowId', () => {
    it('should generate unique workflow IDs', () => {
      const id1 = generateWorkflowId();
      const id2 = generateWorkflowId();

      expect(id1).toMatch(/^workflow-\d+-[a-f0-9]{8}$/);
      expect(id2).toMatch(/^workflow-\d+-[a-f0-9]{8}$/);
      expect(id1).not.toBe(id2);
    });
  });

  describe('calculateStoryHash', () => {
    it('should calculate hash of existing file', async () => {
      const testFile = path.join(TEST_SDLC_ROOT, 'test-story.md');
      await fs.promises.writeFile(testFile, 'test content', 'utf-8');

      const hash = calculateStoryHash(testFile);
      expect(hash).toBeTruthy();
      expect(hash.length).toBe(64); // SHA-256 produces 64 hex characters
    });

    it('should return empty string for non-existent file', () => {
      const hash = calculateStoryHash('/nonexistent/file.md');
      expect(hash).toBe('');
    });

    it('should return different hashes for different content', async () => {
      const file1 = path.join(TEST_SDLC_ROOT, 'story1.md');
      const file2 = path.join(TEST_SDLC_ROOT, 'story2.md');

      await fs.promises.writeFile(file1, 'content 1', 'utf-8');
      await fs.promises.writeFile(file2, 'content 2', 'utf-8');

      const hash1 = calculateStoryHash(file1);
      const hash2 = calculateStoryHash(file2);

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('saveWorkflowState', () => {
    it('should save valid state to disk', async () => {
      const state = createValidState();
      await saveWorkflowState(state, TEST_SDLC_ROOT);

      const statePath = getStateFilePath(TEST_SDLC_ROOT);
      expect(fs.existsSync(statePath)).toBe(true);

      const content = await fs.promises.readFile(statePath, 'utf-8');
      const saved = JSON.parse(content);
      expect(saved.workflowId).toBe(state.workflowId);
    });

    it('should create directory if it does not exist', async () => {
      const newRoot = path.join(TEST_SDLC_ROOT, 'new-dir');
      const state = createValidState();

      await saveWorkflowState(state, newRoot);

      expect(fs.existsSync(newRoot)).toBe(true);
      expect(fs.existsSync(getStateFilePath(newRoot))).toBe(true);

      // Cleanup
      await fs.promises.rm(newRoot, { recursive: true, force: true });
    });

    it('should overwrite existing state file', async () => {
      const state1 = createValidState({ workflowId: 'workflow-1' });
      const state2 = createValidState({ workflowId: 'workflow-2' });

      await saveWorkflowState(state1, TEST_SDLC_ROOT);
      await saveWorkflowState(state2, TEST_SDLC_ROOT);

      const loaded = await loadWorkflowState(TEST_SDLC_ROOT);
      expect(loaded?.workflowId).toBe('workflow-2');
    });
  });

  describe('loadWorkflowState', () => {
    it('should load saved state correctly', async () => {
      const state = createValidState({
        workflowId: 'test-123',
        completedActions: [
          {
            type: 'research',
            storyId: 'story-1',
            storyPath: '/path/to/story.md',
            completedAt: new Date().toISOString(),
          },
        ],
      });

      await saveWorkflowState(state, TEST_SDLC_ROOT);
      const loaded = await loadWorkflowState(TEST_SDLC_ROOT);

      expect(loaded).not.toBeNull();
      expect(loaded?.workflowId).toBe('test-123');
      expect(loaded?.completedActions).toHaveLength(1);
      expect(loaded?.completedActions[0].type).toBe('research');
    });

    it('should return null if no state file exists', async () => {
      const loaded = await loadWorkflowState(TEST_SDLC_ROOT);
      expect(loaded).toBeNull();
    });

    it('should throw error for corrupted JSON', async () => {
      const statePath = getStateFilePath(TEST_SDLC_ROOT);
      await fs.promises.writeFile(statePath, 'invalid json{', 'utf-8');

      await expect(loadWorkflowState(TEST_SDLC_ROOT)).rejects.toThrow(/Corrupted workflow state/);
    });

    it('should throw error for invalid state structure', async () => {
      const statePath = getStateFilePath(TEST_SDLC_ROOT);
      await fs.promises.writeFile(statePath, JSON.stringify({ invalid: 'state' }), 'utf-8');

      await expect(loadWorkflowState(TEST_SDLC_ROOT)).rejects.toThrow(/Invalid state file/);
    });
  });

  describe('validateWorkflowState', () => {
    it('should validate correct state', () => {
      const state = createValidState();
      const result = validateWorkflowState(state);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect missing version', () => {
      const state = createValidState();
      delete (state as any).version;

      const result = validateWorkflowState(state);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required field: version');
    });

    it('should detect missing workflowId', () => {
      const state = createValidState();
      delete (state as any).workflowId;

      const result = validateWorkflowState(state);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required field: workflowId');
    });

    it('should detect missing timestamp', () => {
      const state = createValidState();
      delete (state as any).timestamp;

      const result = validateWorkflowState(state);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required field: timestamp');
    });

    it('should detect invalid completedActions', () => {
      const state = createValidState();
      (state as any).completedActions = 'not an array';

      const result = validateWorkflowState(state);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('completedActions must be an array');
    });

    it('should detect missing context', () => {
      const state = createValidState();
      delete (state as any).context;

      const result = validateWorkflowState(state);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing or invalid context object');
    });

    it('should detect missing context.sdlcRoot', () => {
      const state = createValidState();
      delete (state as any).context.sdlcRoot;

      const result = validateWorkflowState(state);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing context.sdlcRoot');
    });

    it('should warn about version mismatch', () => {
      const state = createValidState();
      (state as any).version = '2.0';

      const result = validateWorkflowState(state);
      expect(result.valid).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('version');
    });

    it('should reject non-object state', () => {
      const result = validateWorkflowState('not an object');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('State must be an object');
    });

    it('should reject null state', () => {
      const result = validateWorkflowState(null);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('State must be an object');
    });
  });

  describe('clearWorkflowState', () => {
    it('should delete existing state file', async () => {
      const state = createValidState();
      await saveWorkflowState(state, TEST_SDLC_ROOT);

      const statePath = getStateFilePath(TEST_SDLC_ROOT);
      expect(fs.existsSync(statePath)).toBe(true);

      await clearWorkflowState(TEST_SDLC_ROOT);
      expect(fs.existsSync(statePath)).toBe(false);
    });

    it('should not throw if state file does not exist', async () => {
      await expect(clearWorkflowState(TEST_SDLC_ROOT)).resolves.not.toThrow();
    });
  });

  describe('hasWorkflowState', () => {
    it('should return true if state file exists', async () => {
      const state = createValidState();
      await saveWorkflowState(state, TEST_SDLC_ROOT);

      expect(hasWorkflowState(TEST_SDLC_ROOT)).toBe(true);
    });

    it('should return false if state file does not exist', () => {
      expect(hasWorkflowState(TEST_SDLC_ROOT)).toBe(false);
    });
  });
});
