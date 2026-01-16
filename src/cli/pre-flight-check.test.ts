import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
}));
vi.mock('../core/theme.js', () => ({
  getThemedChalk: vi.fn(() => ({
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
  let originalIsTTY: boolean | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    // Store original value and mock process.stdin.isTTY to simulate interactive mode by default
    originalIsTTY = process.stdin.isTTY;
    Object.defineProperty(process.stdin, 'isTTY', { value: true, writable: true, configurable: true });
  });

  afterEach(() => {
    // Restore original value
    if (originalIsTTY !== undefined) {
      Object.defineProperty(process.stdin, 'isTTY', { value: originalIsTTY, writable: true, configurable: true });
    }
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
    Object.defineProperty(process.stdin, 'isTTY', { value: false, writable: true, configurable: true });

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

  it('throws error when sdlcRoot contains null bytes', async () => {
    const invalidRoot = '/test/.ai-sdlc\0malicious';
    // Generic error message for security (prevents information leakage)
    await expect(preFlightConflictCheck(targetStory, invalidRoot, {})).rejects.toThrow('Invalid project path');
  });

  it('throws error when sdlcRoot is not absolute path', async () => {
    const relativeRoot = 'relative/path/.ai-sdlc';
    // Generic error message for security (prevents information leakage)
    await expect(preFlightConflictCheck(targetStory, relativeRoot, {})).rejects.toThrow('Invalid project path');
  });

  it('throws error when sdlcRoot path is too long', async () => {
    const longRoot = '/' + 'a'.repeat(1025);
    // Generic error message for security (prevents information leakage)
    await expect(preFlightConflictCheck(targetStory, longRoot, {})).rejects.toThrow('Invalid project path');
  });

  it('returns error when target story is already in-progress', async () => {
    const inProgressStory = createMockStory('S-0002', 'in-progress');
    const result = await preFlightConflictCheck(inProgressStory, sdlcRoot, {});

    expect(result.proceed).toBe(false);
    expect(result.warnings).toContain('Story already in progress');
  });

  it('handles malicious story IDs with ANSI escape codes safely', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const maliciousStory = createMockStory('S-0001', 'in-progress');
    // Story ID with ANSI code (0x1B = 27 IS in range 0x00-0x1F, so sanitizeStoryId throws)
    // The implementation catches this and shows a safe generic message
    maliciousStory.frontmatter.id = 'S-ANSI\x1b[31mCODE\x1b[0m';
    vi.mocked(kanbanModule.findStoriesByStatus).mockReturnValue([maliciousStory]);

    const mockConflictResult: ConflictDetectionResult = {
      conflicts: [
        {
          storyA: 'S-ANSI\x1b[31mCODE\x1b[0m',
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

    // Simulate non-interactive to avoid prompt
    Object.defineProperty(process.stdin, 'isTTY', { value: false, writable: true, configurable: true });

    await preFlightConflictCheck(targetStory, sdlcRoot, {});

    const logs = consoleSpy.mock.calls.map(call => call[0]).join('\n');
    // ANSI codes should NOT appear in output (either stripped or blocked)
    expect(logs).not.toContain('\x1b[31m');
    expect(logs).not.toContain('\x1b[0m');
    // Should show safe generic message since validation failed (sanitizeStoryId throws for control chars)
    expect(logs).toContain('invalid ID format');

    consoleSpy.mockRestore();
  });

  it('sanitizes file paths containing ANSI codes in conflict display', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const activeStory = createMockStory('S-0001', 'in-progress');
    vi.mocked(kanbanModule.findStoriesByStatus).mockReturnValue([activeStory]);

    const mockConflictResult: ConflictDetectionResult = {
      conflicts: [
        {
          storyA: 'S-0001',
          storyB: 'S-0002',
          sharedFiles: ['src/api/\x1b[31mmalicious\x1b[0m.ts'],
          sharedDirectories: [],
          severity: 'high',
          recommendation: 'Run sequentially',
        },
      ],
      safeToRunConcurrently: false,
      summary: 'High severity conflict',
    };

    vi.mocked(conflictDetectorModule.detectConflicts).mockReturnValue(mockConflictResult);

    // Simulate non-interactive to avoid prompt
    Object.defineProperty(process.stdin, 'isTTY', { value: false, writable: true, configurable: true });

    await preFlightConflictCheck(targetStory, sdlcRoot, {});

    const logs = consoleSpy.mock.calls.map(call => call[0]).join('\n');
    // ANSI codes should be stripped from file paths
    expect(logs).not.toContain('\x1b[31m');
    expect(logs).not.toContain('\x1b[0m');

    consoleSpy.mockRestore();
  });

  it('sanitizes directory paths containing control characters', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const activeStory = createMockStory('S-0001', 'in-progress');
    vi.mocked(kanbanModule.findStoriesByStatus).mockReturnValue([activeStory]);

    const mockConflictResult: ConflictDetectionResult = {
      conflicts: [
        {
          storyA: 'S-0001',
          storyB: 'S-0002',
          sharedFiles: [],
          sharedDirectories: ['src/\x00api/'],
          severity: 'medium',
          recommendation: 'Monitor for conflicts',
        },
      ],
      safeToRunConcurrently: false,
      summary: 'Medium severity conflict',
    };

    vi.mocked(conflictDetectorModule.detectConflicts).mockReturnValue(mockConflictResult);

    // Simulate non-interactive to avoid prompt
    Object.defineProperty(process.stdin, 'isTTY', { value: false, writable: true, configurable: true });

    await preFlightConflictCheck(targetStory, sdlcRoot, {});

    const logs = consoleSpy.mock.calls.map(call => call[0]).join('\n');
    // Control characters should be stripped from directory paths
    expect(logs).not.toContain('\x00');

    consoleSpy.mockRestore();
  });

  it('sanitizes malicious recommendations from conflict detector', async () => {
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
          recommendation: 'Run \x1b[31msequentially\x1b[0m to avoid conflicts',
        },
      ],
      safeToRunConcurrently: false,
      summary: 'High severity conflict',
    };

    vi.mocked(conflictDetectorModule.detectConflicts).mockReturnValue(mockConflictResult);

    // Simulate non-interactive to avoid prompt
    Object.defineProperty(process.stdin, 'isTTY', { value: false, writable: true, configurable: true });

    await preFlightConflictCheck(targetStory, sdlcRoot, {});

    const logs = consoleSpy.mock.calls.map(call => call[0]).join('\n');
    // ANSI codes should be stripped from recommendations
    expect(logs).not.toContain('\x1b[31m');
    expect(logs).not.toContain('\x1b[0m');

    consoleSpy.mockRestore();
  });

  it('does not display raw error message when conflict detection fails', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const activeStory = createMockStory('S-0001', 'in-progress');
    vi.mocked(kanbanModule.findStoriesByStatus).mockReturnValue([activeStory]);
    vi.mocked(conflictDetectorModule.detectConflicts).mockImplementation(() => {
      throw new Error('Sensitive error with secrets: API_KEY=abc123');
    });

    const result = await preFlightConflictCheck(targetStory, sdlcRoot, {});

    expect(result.proceed).toBe(true);
    expect(result.warnings).toContain('Conflict detection failed');

    const logs = consoleSpy.mock.calls.map(call => call[0]).join('\n');
    expect(logs).toContain('Conflict detection unavailable');
    expect(logs).toContain('Proceeding without conflict check');
    // Raw error message with sensitive info should NOT be displayed
    expect(logs).not.toContain('API_KEY=abc123');
    expect(logs).not.toContain('Sensitive error');

    consoleSpy.mockRestore();
  });

  it('displays multiple conflicts sorted by severity (high, medium, low)', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const activeStory1 = createMockStory('S-0001', 'in-progress');
    const activeStory2 = createMockStory('S-0003', 'in-progress');
    const activeStory3 = createMockStory('S-0004', 'in-progress');
    vi.mocked(kanbanModule.findStoriesByStatus).mockReturnValue([activeStory1, activeStory2, activeStory3]);

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
        {
          storyA: 'S-0003',
          storyB: 'S-0002',
          sharedFiles: ['src/api/user.ts'],
          sharedDirectories: [],
          severity: 'high',
          recommendation: 'Run sequentially',
        },
        {
          storyA: 'S-0004',
          storyB: 'S-0002',
          sharedFiles: [],
          sharedDirectories: ['src/api/'],
          severity: 'medium',
          recommendation: 'Monitor for conflicts',
        },
      ],
      safeToRunConcurrently: false,
      summary: 'Multiple conflicts',
    };

    vi.mocked(conflictDetectorModule.detectConflicts).mockReturnValue(mockConflictResult);

    // Simulate non-interactive to avoid prompt
    Object.defineProperty(process.stdin, 'isTTY', { value: false, writable: true, configurable: true });

    await preFlightConflictCheck(targetStory, sdlcRoot, {});

    const logs = consoleSpy.mock.calls.map(call => call[0]).join('\n');

    // Find positions of each conflict in the log output
    const highPos = logs.indexOf('S-0003');
    const mediumPos = logs.indexOf('S-0004');
    const lowPos = logs.indexOf('S-0001');

    // Verify they appear in order: high -> medium -> low
    expect(highPos).toBeLessThan(mediumPos);
    expect(mediumPos).toBeLessThan(lowPos);

    consoleSpy.mockRestore();
  });

  it('truncates extremely long file paths to prevent DoS', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const activeStory = createMockStory('S-0001', 'in-progress');
    vi.mocked(kanbanModule.findStoriesByStatus).mockReturnValue([activeStory]);

    // Create a file path that's 1000 characters long
    const longPath = 'src/' + 'a'.repeat(1000) + '.ts';

    const mockConflictResult: ConflictDetectionResult = {
      conflicts: [
        {
          storyA: 'S-0001',
          storyB: 'S-0002',
          sharedFiles: [longPath],
          sharedDirectories: [],
          severity: 'high',
          recommendation: 'Run sequentially',
        },
      ],
      safeToRunConcurrently: false,
      summary: 'High severity conflict',
    };

    vi.mocked(conflictDetectorModule.detectConflicts).mockReturnValue(mockConflictResult);

    // Simulate non-interactive to avoid prompt
    Object.defineProperty(process.stdin, 'isTTY', { value: false, writable: true, configurable: true });

    await preFlightConflictCheck(targetStory, sdlcRoot, {});

    const logs = consoleSpy.mock.calls.map(call => call[0]).join('\n');
    // Should be truncated to 500 chars max (497 + '...')
    expect(logs).toContain('...');
    // Should not contain the full 1000-char path
    expect(logs).not.toContain('a'.repeat(1000));

    consoleSpy.mockRestore();
  });

  // Note: The null byte path traversal test was removed because path.normalize()
  // truncates at null bytes (making '/valid/path\0/../../etc/passwd' become '/valid/path').
  // The basic null byte test 'throws error when sdlcRoot contains null bytes' covers this case.

  it('validates sdlcRoot rejects relative paths', async () => {
    const relativePath = '../relative/path';

    await expect(preFlightConflictCheck(targetStory, relativePath, {}))
      .rejects.toThrow('Invalid project path');
  });

  it('validates sdlcRoot rejects extremely long paths', async () => {
    const longPath = '/' + 'a'.repeat(2000);

    await expect(preFlightConflictCheck(targetStory, longPath, {}))
      .rejects.toThrow('Invalid project path');
  });

  it('normalizes path before validation to prevent bypass', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    // Path with /../ sequences that normalizes to a shorter path
    const bypassPath = '/valid/path/../path/../../attempt/../.ai-sdlc';

    vi.mocked(kanbanModule.findStoriesByStatus).mockReturnValue([]);

    // Should succeed (normalized path is valid)
    const result = await preFlightConflictCheck(targetStory, bypassPath, {});

    expect(result.proceed).toBe(true);
    expect(vi.mocked(kanbanModule.findStoriesByStatus)).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });
});
