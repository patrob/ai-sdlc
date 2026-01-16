import { describe, it, expect, vi, beforeEach } from 'vitest';
import { preFlightConflictCheck } from './commands.js';
import type { Story, ConflictDetectionResult } from '../types/index.js';
import * as kanbanModule from '../core/kanban.js';
import * as conflictDetectorModule from '../core/conflict-detector.js';

// Mock modules
vi.mock('../core/kanban.js');
vi.mock('../core/conflict-detector.js');
vi.mock('../core/config.js', () => ({
  loadConfig: vi.fn(() => ({
    theme: 'dark',
    sdlcFolder: '.ai-sdlc',
    stageGates: { requireResearch: false, requirePlan: false, requireReview: false },
    refinement: { enabled: false, maxAttempts: 3 },
    reviewConfig: { enabled: false },
    implementation: { autoCommit: false },
    defaultLabels: [],
  })),
  getThemedChalk: vi.fn((config) => ({
    success: (s: string) => s,
    warning: (s: string) => s,
    error: (s: string) => s,
    dim: (s: string) => s,
    bold: (s: string) => s,
    info: (s: string) => s,
  })),
}));

// Helper to create mock story
function createMockStory(id: string, status: string = 'to-do'): Story {
  return {
    path: `/test/.ai-sdlc/stories/${id}.md`,
    slug: id.toLowerCase(),
    frontmatter: {
      id,
      title: `Story ${id}`,
      slug: id.toLowerCase(),
      priority: 10,
      status: status as any,
      type: 'feature',
      created: '2025-01-01',
      labels: [],
      research_complete: false,
      plan_complete: false,
      implementation_complete: false,
      reviews_complete: false,
    },
    content: 'Test story content',
  };
}

describe('preFlightConflictCheck', () => {
  const targetStory = createMockStory('S-0002', 'to-do');
  const sdlcRoot = '/test/.ai-sdlc';

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock process.stdin.isTTY to simulate interactive mode by default
    Object.defineProperty(process.stdin, 'isTTY', { value: true, writable: true });
  });

  it('returns proceed=true when --force flag is provided', async () => {
    const result = await preFlightConflictCheck(targetStory, sdlcRoot, { force: true });

    expect(result.proceed).toBe(true);
    expect(result.warnings).toContain('Conflict check skipped');
    // Should not query for stories when --force is used
    expect(vi.mocked(kanbanModule.findStoriesByStatus)).not.toHaveBeenCalled();
  });

  it('returns proceed=true when no active stories exist', async () => {
    vi.mocked(kanbanModule.findStoriesByStatus).mockReturnValue([]);

    const result = await preFlightConflictCheck(targetStory, sdlcRoot, {});

    expect(result.proceed).toBe(true);
    expect(result.warnings).toEqual([]);
    expect(vi.mocked(kanbanModule.findStoriesByStatus)).toHaveBeenCalledWith(sdlcRoot, 'in-progress');
  });

  it('returns proceed=true when no conflicts detected', async () => {
    const activeStory = createMockStory('S-0001', 'in-progress');
    vi.mocked(kanbanModule.findStoriesByStatus).mockReturnValue([activeStory]);

    const mockConflictResult: ConflictDetectionResult = {
      conflicts: [
        {
          storyA: 'S-0001',
          storyB: 'S-0002',
          sharedFiles: [],
          sharedDirectories: [],
          severity: 'none',
          recommendation: 'No conflicts',
        },
      ],
      safeToRunConcurrently: true,
      summary: 'No conflicts',
    };

    vi.mocked(conflictDetectorModule.detectConflicts).mockReturnValue(mockConflictResult);

    const result = await preFlightConflictCheck(targetStory, sdlcRoot, {});

    expect(result.proceed).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  it('filters out target story from active stories list', async () => {
    const targetInProgress = createMockStory('S-0002', 'in-progress');
    const otherActiveStory = createMockStory('S-0001', 'in-progress');
    vi.mocked(kanbanModule.findStoriesByStatus).mockReturnValue([targetInProgress, otherActiveStory]);

    const mockConflictResult: ConflictDetectionResult = {
      conflicts: [],
      safeToRunConcurrently: true,
      summary: 'No conflicts',
    };

    vi.mocked(conflictDetectorModule.detectConflicts).mockReturnValue(mockConflictResult);

    await preFlightConflictCheck(targetStory, sdlcRoot, {});

    // Verify detectConflicts was called with target story + only other active stories (not including target itself)
    expect(vi.mocked(conflictDetectorModule.detectConflicts)).toHaveBeenCalledWith(
      [targetStory, otherActiveStory],
      expect.any(String),
      'main'
    );
  });

  it('returns proceed=false in non-interactive mode with conflicts', async () => {
    // Simulate non-interactive terminal
    Object.defineProperty(process.stdin, 'isTTY', { value: false, writable: true });

    const activeStory = createMockStory('S-0001', 'in-progress');
    vi.mocked(kanbanModule.findStoriesByStatus).mockReturnValue([activeStory]);

    const mockConflictResult: ConflictDetectionResult = {
      conflicts: [
        {
          storyA: 'S-0001',
          storyB: 'S-0002',
          sharedFiles: ['src/api/user.ts'],
          sharedDirectories: [],
          severity: 'high',
          recommendation: 'Run sequentially',
        },
      ],
      safeToRunConcurrently: false,
      summary: 'High severity conflict',
    };

    vi.mocked(conflictDetectorModule.detectConflicts).mockReturnValue(mockConflictResult);

    const result = await preFlightConflictCheck(targetStory, sdlcRoot, {});

    expect(result.proceed).toBe(false);
    expect(result.warnings).toContain('Conflicts detected');
  });

  it('formats high severity conflicts correctly', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const activeStory = createMockStory('S-0001', 'in-progress');
    vi.mocked(kanbanModule.findStoriesByStatus).mockReturnValue([activeStory]);

    const mockConflictResult: ConflictDetectionResult = {
      conflicts: [
        {
          storyA: 'S-0001',
          storyB: 'S-0002',
          sharedFiles: ['src/api/user.ts'],
          sharedDirectories: [],
          severity: 'high',
          recommendation: 'Run sequentially to avoid merge conflicts',
        },
      ],
      safeToRunConcurrently: false,
      summary: 'High severity conflict',
    };

    vi.mocked(conflictDetectorModule.detectConflicts).mockReturnValue(mockConflictResult);

    // Simulate non-interactive to avoid prompt
    Object.defineProperty(process.stdin, 'isTTY', { value: false, writable: true });

    await preFlightConflictCheck(targetStory, sdlcRoot, {});

    // Verify conflict details were logged
    const logs = consoleSpy.mock.calls.map(call => call[0]).join('\n');
    expect(logs).toContain('Potential conflicts detected');
    expect(logs).toContain('S-0001');
    expect(logs).toContain('src/api/user.ts');

    consoleSpy.mockRestore();
  });

  it('formats medium severity conflicts correctly', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const activeStory = createMockStory('S-0001', 'in-progress');
    vi.mocked(kanbanModule.findStoriesByStatus).mockReturnValue([activeStory]);

    const mockConflictResult: ConflictDetectionResult = {
      conflicts: [
        {
          storyA: 'S-0001',
          storyB: 'S-0002',
          sharedFiles: [],
          sharedDirectories: ['src/api/'],
          severity: 'medium',
          recommendation: 'Monitor for conflicts',
        },
      ],
      safeToRunConcurrently: false,
      summary: 'Medium severity conflict',
    };

    vi.mocked(conflictDetectorModule.detectConflicts).mockReturnValue(mockConflictResult);

    // Simulate non-interactive to avoid prompt
    Object.defineProperty(process.stdin, 'isTTY', { value: false, writable: true });

    await preFlightConflictCheck(targetStory, sdlcRoot, {});

    const logs = consoleSpy.mock.calls.map(call => call[0]).join('\n');
    expect(logs).toContain('src/api/');

    consoleSpy.mockRestore();
  });

  it('formats low severity conflicts correctly', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const activeStory = createMockStory('S-0001', 'in-progress');
    vi.mocked(kanbanModule.findStoriesByStatus).mockReturnValue([activeStory]);

    const mockConflictResult: ConflictDetectionResult = {
      conflicts: [
        {
          storyA: 'S-0001',
          storyB: 'S-0002',
          sharedFiles: [],
          sharedDirectories: ['tests/'],
          severity: 'low',
          recommendation: 'Safe to proceed',
        },
      ],
      safeToRunConcurrently: true,
      summary: 'Low severity conflict',
    };

    vi.mocked(conflictDetectorModule.detectConflicts).mockReturnValue(mockConflictResult);

    // Simulate non-interactive to avoid prompt
    Object.defineProperty(process.stdin, 'isTTY', { value: false, writable: true });

    await preFlightConflictCheck(targetStory, sdlcRoot, {});

    const logs = consoleSpy.mock.calls.map(call => call[0]).join('\n');
    expect(logs).toContain('tests/');

    consoleSpy.mockRestore();
  });

  it('fails open when ConflictDetectorService throws error', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const activeStory = createMockStory('S-0001', 'in-progress');
    vi.mocked(kanbanModule.findStoriesByStatus).mockReturnValue([activeStory]);
    vi.mocked(conflictDetectorModule.detectConflicts).mockImplementation(() => {
      throw new Error('Git error');
    });

    const result = await preFlightConflictCheck(targetStory, sdlcRoot, {});

    expect(result.proceed).toBe(true);
    expect(result.warnings).toContain('Conflict detection failed');

    const logs = consoleSpy.mock.calls.map(call => call[0]).join('\n');
    expect(logs).toContain('Conflict detection unavailable');
    expect(logs).toContain('Proceeding without conflict check');

    consoleSpy.mockRestore();
  });

  it('extracts only conflicts involving target story', async () => {
    const activeStory1 = createMockStory('S-0001', 'in-progress');
    const activeStory2 = createMockStory('S-0003', 'in-progress');
    vi.mocked(kanbanModule.findStoriesByStatus).mockReturnValue([activeStory1, activeStory2]);

    const mockConflictResult: ConflictDetectionResult = {
      conflicts: [
        {
          storyA: 'S-0001',
          storyB: 'S-0002',
          sharedFiles: ['src/api/user.ts'],
          sharedDirectories: [],
          severity: 'high',
          recommendation: 'Run sequentially',
        },
        {
          storyA: 'S-0001',
          storyB: 'S-0003',
          sharedFiles: ['src/api/admin.ts'],
          sharedDirectories: [],
          severity: 'high',
          recommendation: 'Run sequentially',
        },
      ],
      safeToRunConcurrently: false,
      summary: 'Multiple conflicts',
    };

    vi.mocked(conflictDetectorModule.detectConflicts).mockReturnValue(mockConflictResult);

    // Simulate non-interactive to avoid prompt
    Object.defineProperty(process.stdin, 'isTTY', { value: false, writable: true });

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await preFlightConflictCheck(targetStory, sdlcRoot, {});

    // Should only show conflict between S-0001 and S-0002 (involving target story)
    const logs = consoleSpy.mock.calls.map(call => call[0]).join('\n');
    expect(logs).toContain('S-0001');
    expect(logs).toContain('src/api/user.ts');
    // Should NOT show conflict between S-0001 and S-0003 (not involving target)
    expect(logs).not.toContain('src/api/admin.ts');

    consoleSpy.mockRestore();
  });
});
