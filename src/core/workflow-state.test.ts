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
  migrateGlobalWorkflowState,
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

    it('should return story-specific path when storyId provided', () => {
      const result = getStateFilePath(TEST_SDLC_ROOT, 'S-0001');
      expect(result).toBe(path.join(TEST_SDLC_ROOT, 'stories', 'S-0001', '.workflow-state.json'));
    });

    it('should return global path when storyId omitted', () => {
      const result = getStateFilePath(TEST_SDLC_ROOT);
      expect(result).toBe(path.join(TEST_SDLC_ROOT, '.workflow-state.json'));
    });

    it('should construct correct nested directory structure', () => {
      const result = getStateFilePath(TEST_SDLC_ROOT, 'S-0123');
      expect(result).toContain('stories');
      expect(result).toContain('S-0123');
      expect(result).toContain('.workflow-state.json');
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

    it('should write to story directory when storyId provided', async () => {
      const state = createValidState({ workflowId: 'story-workflow' });
      await saveWorkflowState(state, TEST_SDLC_ROOT, 'S-TEST-001');

      const statePath = getStateFilePath(TEST_SDLC_ROOT, 'S-TEST-001');
      expect(fs.existsSync(statePath)).toBe(true);

      const content = await fs.promises.readFile(statePath, 'utf-8');
      const saved = JSON.parse(content);
      expect(saved.workflowId).toBe('story-workflow');
    });

    it('should write to global location when storyId omitted', async () => {
      const state = createValidState({ workflowId: 'global-workflow' });
      await saveWorkflowState(state, TEST_SDLC_ROOT);

      const statePath = getStateFilePath(TEST_SDLC_ROOT);
      expect(fs.existsSync(statePath)).toBe(true);

      const content = await fs.promises.readFile(statePath, 'utf-8');
      const saved = JSON.parse(content);
      expect(saved.workflowId).toBe('global-workflow');
    });

    it('should create story directory if it does not exist', async () => {
      const state = createValidState();
      await saveWorkflowState(state, TEST_SDLC_ROOT, 'S-NEW-STORY');

      const storyDir = path.join(TEST_SDLC_ROOT, 'stories', 'S-NEW-STORY');
      expect(fs.existsSync(storyDir)).toBe(true);

      const statePath = getStateFilePath(TEST_SDLC_ROOT, 'S-NEW-STORY');
      expect(fs.existsSync(statePath)).toBe(true);
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

    it('should read from story directory when storyId provided', async () => {
      const state = createValidState({ workflowId: 'story-123' });
      await saveWorkflowState(state, TEST_SDLC_ROOT, 'S-TEST-002');

      const loaded = await loadWorkflowState(TEST_SDLC_ROOT, 'S-TEST-002');
      expect(loaded).not.toBeNull();
      expect(loaded?.workflowId).toBe('story-123');
    });

    it('should read from global location when storyId omitted', async () => {
      const state = createValidState({ workflowId: 'global-123' });
      await saveWorkflowState(state, TEST_SDLC_ROOT);

      const loaded = await loadWorkflowState(TEST_SDLC_ROOT);
      expect(loaded).not.toBeNull();
      expect(loaded?.workflowId).toBe('global-123');
    });

    it('should return null if story-specific state file does not exist', async () => {
      const loaded = await loadWorkflowState(TEST_SDLC_ROOT, 'S-NONEXISTENT');
      expect(loaded).toBeNull();
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

    it('should return true for story-specific state when storyId provided', async () => {
      const state = createValidState();
      await saveWorkflowState(state, TEST_SDLC_ROOT, 'S-TEST-003');

      expect(hasWorkflowState(TEST_SDLC_ROOT, 'S-TEST-003')).toBe(true);
    });

    it('should return false for non-existent story-specific state', () => {
      expect(hasWorkflowState(TEST_SDLC_ROOT, 'S-MISSING')).toBe(false);
    });
  });

  describe('State Isolation Integration Tests', () => {
    it('should maintain independent workflow states for two stories', async () => {
      // Create state for story A
      const stateA = createValidState({
        workflowId: 'workflow-A',
        completedActions: [
          {
            type: 'research',
            storyId: 'S-STORY-A',
            storyPath: '/path/to/story-a.md',
            completedAt: new Date().toISOString(),
          },
        ],
      });

      // Create state for story B
      const stateB = createValidState({
        workflowId: 'workflow-B',
        completedActions: [
          {
            type: 'plan',
            storyId: 'S-STORY-B',
            storyPath: '/path/to/story-b.md',
            completedAt: new Date().toISOString(),
          },
        ],
      });

      // Save both states
      await saveWorkflowState(stateA, TEST_SDLC_ROOT, 'S-STORY-A');
      await saveWorkflowState(stateB, TEST_SDLC_ROOT, 'S-STORY-B');

      // Load both states
      const loadedA = await loadWorkflowState(TEST_SDLC_ROOT, 'S-STORY-A');
      const loadedB = await loadWorkflowState(TEST_SDLC_ROOT, 'S-STORY-B');

      // Verify isolation
      expect(loadedA?.workflowId).toBe('workflow-A');
      expect(loadedB?.workflowId).toBe('workflow-B');
      expect(loadedA?.completedActions[0].type).toBe('research');
      expect(loadedB?.completedActions[0].type).toBe('plan');

      // Verify files exist at correct paths
      const pathA = getStateFilePath(TEST_SDLC_ROOT, 'S-STORY-A');
      const pathB = getStateFilePath(TEST_SDLC_ROOT, 'S-STORY-B');
      expect(fs.existsSync(pathA)).toBe(true);
      expect(fs.existsSync(pathB)).toBe(true);
    });

    it('should not affect global state when using story-specific state', async () => {
      // Save global state
      const globalState = createValidState({ workflowId: 'global-workflow' });
      await saveWorkflowState(globalState, TEST_SDLC_ROOT);

      // Save story-specific state
      const storyState = createValidState({ workflowId: 'story-workflow' });
      await saveWorkflowState(storyState, TEST_SDLC_ROOT, 'S-STORY-C');

      // Load both
      const loadedGlobal = await loadWorkflowState(TEST_SDLC_ROOT);
      const loadedStory = await loadWorkflowState(TEST_SDLC_ROOT, 'S-STORY-C');

      // Verify both exist and are independent
      expect(loadedGlobal?.workflowId).toBe('global-workflow');
      expect(loadedStory?.workflowId).toBe('story-workflow');

      // Verify files exist at both locations
      expect(hasWorkflowState(TEST_SDLC_ROOT)).toBe(true);
      expect(hasWorkflowState(TEST_SDLC_ROOT, 'S-STORY-C')).toBe(true);
    });

    it('should clear story-specific state without affecting other stories', async () => {
      // Create states for two stories
      await saveWorkflowState(createValidState({ workflowId: 'workflow-D' }), TEST_SDLC_ROOT, 'S-STORY-D');
      await saveWorkflowState(createValidState({ workflowId: 'workflow-E' }), TEST_SDLC_ROOT, 'S-STORY-E');

      // Clear one story's state
      await clearWorkflowState(TEST_SDLC_ROOT, 'S-STORY-D');

      // Verify only D was cleared
      expect(hasWorkflowState(TEST_SDLC_ROOT, 'S-STORY-D')).toBe(false);
      expect(hasWorkflowState(TEST_SDLC_ROOT, 'S-STORY-E')).toBe(true);

      // Verify E's state is intact
      const loadedE = await loadWorkflowState(TEST_SDLC_ROOT, 'S-STORY-E');
      expect(loadedE?.workflowId).toBe('workflow-E');
    });
  });

  describe('Migration Tests', () => {
    it('should migrate global state to story directory', async () => {
      // Create global state with story ID
      const globalState = createValidState({
        workflowId: 'migrate-test-1',
        context: {
          sdlcRoot: TEST_SDLC_ROOT,
          options: { auto: true, story: 'S-MIGRATE-001' },
        },
      });
      await saveWorkflowState(globalState, TEST_SDLC_ROOT); // Save to global location

      // Run migration
      const result = await migrateGlobalWorkflowState(TEST_SDLC_ROOT);

      // Verify migration succeeded
      expect(result.migrated).toBe(true);
      expect(result.message).toContain('S-MIGRATE-001');

      // Verify state was moved to story location
      const storyStatePath = getStateFilePath(TEST_SDLC_ROOT, 'S-MIGRATE-001');
      expect(fs.existsSync(storyStatePath)).toBe(true);

      // Verify global state was deleted
      const globalStatePath = getStateFilePath(TEST_SDLC_ROOT);
      expect(fs.existsSync(globalStatePath)).toBe(false);

      // Verify state content is intact
      const loadedState = await loadWorkflowState(TEST_SDLC_ROOT, 'S-MIGRATE-001');
      expect(loadedState?.workflowId).toBe('migrate-test-1');
    });

    it('should be idempotent (safe to run multiple times)', async () => {
      // Create global state
      const globalState = createValidState({
        context: {
          sdlcRoot: TEST_SDLC_ROOT,
          options: { story: 'S-MIGRATE-002' },
        },
      });
      await saveWorkflowState(globalState, TEST_SDLC_ROOT);

      // Run migration first time
      const result1 = await migrateGlobalWorkflowState(TEST_SDLC_ROOT);
      expect(result1.migrated).toBe(true);

      // Manually create global state again (simulating another process)
      await saveWorkflowState(globalState, TEST_SDLC_ROOT);

      // Run migration second time
      const result2 = await migrateGlobalWorkflowState(TEST_SDLC_ROOT);
      expect(result2.migrated).toBe(true); // Should still succeed
      expect(result2.message).toContain('already exists');

      // Verify only story-specific state exists
      expect(hasWorkflowState(TEST_SDLC_ROOT, 'S-MIGRATE-002')).toBe(true);
      expect(hasWorkflowState(TEST_SDLC_ROOT)).toBe(false);
    });

    it('should skip migration if no story ID found', async () => {
      // Create global state without story ID
      const globalState = createValidState({
        context: {
          sdlcRoot: TEST_SDLC_ROOT,
          options: {},
        },
        completedActions: [], // No completed actions either
      });
      await saveWorkflowState(globalState, TEST_SDLC_ROOT);

      // Run migration
      const result = await migrateGlobalWorkflowState(TEST_SDLC_ROOT);

      // Verify migration was skipped
      expect(result.migrated).toBe(false);
      expect(result.message).toContain('no story ID found');

      // Verify global state still exists
      expect(hasWorkflowState(TEST_SDLC_ROOT)).toBe(true);
    });

    it('should skip migration if workflow is in progress', async () => {
      // Create global state with currentAction set
      const globalState = createValidState({
        context: {
          sdlcRoot: TEST_SDLC_ROOT,
          options: { story: 'S-MIGRATE-003' },
        },
        currentAction: {
          type: 'implement',
          storyId: 'S-MIGRATE-003',
          storyPath: '/path/to/story.md',
          startedAt: new Date().toISOString(),
        },
      });
      await saveWorkflowState(globalState, TEST_SDLC_ROOT);

      // Run migration
      const result = await migrateGlobalWorkflowState(TEST_SDLC_ROOT);

      // Verify migration was skipped
      expect(result.migrated).toBe(false);
      expect(result.message).toContain('in progress');

      // Verify global state still exists
      expect(hasWorkflowState(TEST_SDLC_ROOT)).toBe(true);
    });

    it('should return false if no global state file exists', async () => {
      // Run migration with no global state
      const result = await migrateGlobalWorkflowState(TEST_SDLC_ROOT);

      // Verify no migration occurred
      expect(result.migrated).toBe(false);
      expect(result.message).toContain('No global workflow state file found');
    });

    it('should extract story ID from completedActions as fallback', async () => {
      // Create global state without context.options.story but with completedActions
      const globalState = createValidState({
        context: {
          sdlcRoot: TEST_SDLC_ROOT,
          options: {},
        },
        completedActions: [
          {
            type: 'research',
            storyId: 'S-MIGRATE-004',
            storyPath: '/path/to/story.md',
            completedAt: new Date().toISOString(),
          },
        ],
      });
      await saveWorkflowState(globalState, TEST_SDLC_ROOT);

      // Run migration
      const result = await migrateGlobalWorkflowState(TEST_SDLC_ROOT);

      // Verify migration succeeded using completedActions storyId
      expect(result.migrated).toBe(true);
      expect(result.message).toContain('S-MIGRATE-004');

      // Verify state was moved
      expect(hasWorkflowState(TEST_SDLC_ROOT, 'S-MIGRATE-004')).toBe(true);
      expect(hasWorkflowState(TEST_SDLC_ROOT)).toBe(false);
    });
  });
});
