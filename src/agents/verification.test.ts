import { describe, it, expect, vi, beforeEach } from 'vitest';
import { verifyImplementation, ensureDependenciesInstalled, type VerificationResult } from './verification.js';
import type { Story } from '../types/index.js';
import fs from 'fs';
import child_process from 'child_process';
import { loadConfig } from '../core/config.js';

vi.mock('fs');
vi.mock('child_process');
vi.mock('../core/config.js');

const mockConfig = {
  timeouts: {
    testTimeout: 300000,
    buildTimeout: 120000,
  },
  tdd: {
    requirePassingTestsForComplete: true,
  },
};

function createMockStory(overrides: Partial<Story> = {}): Story {
  return {
    path: '/test/story.md',
    slug: 'test-story',
    frontmatter: {
      id: 'test-123',
      title: 'Test Story',
      slug: 'test-story',
      priority: 1,
      status: 'in-progress',
      type: 'feature',
      created: '2024-01-01',
      labels: [],
      research_complete: true,
      plan_complete: true,
      implementation_complete: false,
      reviews_complete: false,
      ...overrides.frontmatter,
    },
    content: '# Test Story',
    ...overrides,
  } as Story;
}

describe('verifyImplementation', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T10:00:00Z'));
    // Set up config mock
    vi.mocked(loadConfig).mockReturnValue(mockConfig as any);
    // By default, skip dependency check in existing tests to avoid side effects
    vi.mocked(fs.existsSync).mockReturnValue(false);
  });

  it('should return passed when tests and build both pass', async () => {
    const callOrder: string[] = [];
    const mockRunTests = vi.fn().mockImplementation(async () => {
      callOrder.push('tests');
      return {
        success: true,
        output: 'All tests passed',
      };
    });
    const mockRunBuild = vi.fn().mockImplementation(async () => {
      callOrder.push('build');
      return {
        success: true,
        output: 'Build succeeded',
      };
    });

    const story = createMockStory();
    const result = await verifyImplementation(story, '/test/dir', {
      runTests: mockRunTests,
      runBuild: mockRunBuild,
    });

    expect(result.passed).toBe(true);
    expect(result.testsOutput).toContain('All tests passed');
    expect(result.buildOutput).toContain('Build succeeded');
    expect(result.timestamp).toBe('2024-01-15T10:00:00.000Z');
    expect(result.failures).toBe(0);
    // Verify build runs before tests
    expect(callOrder).toEqual(['build', 'tests']);
  });

  it('should return failed when tests fail', async () => {
    const mockRunTests = vi.fn().mockResolvedValue({
      success: false,
      output: 'Test run failed: 3 failed',
    });
    const mockRunBuild = vi.fn().mockResolvedValue({
      success: true,
      output: 'Build succeeded',
    });

    const story = createMockStory();
    const result = await verifyImplementation(story, '/test/dir', {
      runTests: mockRunTests,
      runBuild: mockRunBuild,
    });

    expect(result.passed).toBe(false);
    expect(result.testsOutput).toContain('3 failed');
    expect(result.failures).toBe(3);
  });

  it('should return failed when build fails', async () => {
    const mockRunTests = vi.fn().mockResolvedValue({
      success: true,
      output: 'All tests passed',
    });
    const mockRunBuild = vi.fn().mockResolvedValue({
      success: false,
      output: 'TypeScript compilation error',
    });

    const story = createMockStory();
    const result = await verifyImplementation(story, '/test/dir', {
      runTests: mockRunTests,
      runBuild: mockRunBuild,
    });

    expect(result.passed).toBe(false);
    expect(result.buildOutput).toContain('TypeScript compilation error');
    // Tests should not run when build fails
    expect(mockRunTests).not.toHaveBeenCalled();
    expect(result.testsOutput).toBe('Build failed - skipping tests. Fix TypeScript errors first.');
  });

  it('should skip tests if no test command configured', async () => {
    const mockRunBuild = vi.fn().mockResolvedValue({
      success: true,
      output: 'Build succeeded',
    });

    const story = createMockStory();
    const result = await verifyImplementation(story, '/test/dir', {
      runBuild: mockRunBuild,
    });

    expect(result.passed).toBe(true);
    expect(result.testsOutput).toBe('');
  });

  it('should skip build if no build command configured', async () => {
    const mockRunTests = vi.fn().mockResolvedValue({
      success: true,
      output: 'All tests passed',
    });

    const story = createMockStory();
    const result = await verifyImplementation(story, '/test/dir', {
      runTests: mockRunTests,
    });

    expect(result.passed).toBe(true);
    expect(result.buildOutput).toBe('');
  });

  it('should extract failure count from test output', async () => {
    const mockRunTests = vi.fn().mockResolvedValue({
      success: false,
      output: 'Tests summary: 5 failed, 10 passed',
    });

    const story = createMockStory();
    const result = await verifyImplementation(story, '/test/dir', {
      runTests: mockRunTests,
    });

    expect(result.failures).toBe(5);
  });

  it('should respect requirePassingTestsForComplete config option', async () => {
    const mockRunTests = vi.fn().mockResolvedValue({
      success: false,
      output: '2 failed',
    });
    const mockRunBuild = vi.fn().mockResolvedValue({
      success: true,
      output: 'Build succeeded',
    });

    const story = createMockStory();
    const result = await verifyImplementation(story, '/test/dir', {
      runTests: mockRunTests,
      runBuild: mockRunBuild,
      requirePassingTests: false,
    });

    expect(result.passed).toBe(true);
    expect(result.testsOutput).toContain('2 failed');
  });

  it('should skip dependency check when skipDependencyCheck is true', async () => {
    // Set up a scenario where dependency install would happen if not skipped
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      const pathStr = p.toString();
      return pathStr.includes('package.json');
    });

    const mockRunTests = vi.fn().mockResolvedValue({
      success: true,
      output: 'Tests passed',
    });

    const story = createMockStory();
    const result = await verifyImplementation(story, '/test/dir', {
      runTests: mockRunTests,
      skipDependencyCheck: true,
    });

    expect(result.passed).toBe(true);
    // spawnSync should not be called for dependency install
    expect(child_process.spawnSync).not.toHaveBeenCalled();
  });

  it('should skip tests when build fails', async () => {
    const mockRunBuild = vi.fn().mockResolvedValue({
      success: false,
      output: 'TS2304: Cannot find name "Foo"',
    });
    const mockRunTests = vi.fn().mockResolvedValue({
      success: true,
      output: 'All tests passed',
    });

    const story = createMockStory();
    const result = await verifyImplementation(story, '/test/dir', {
      runBuild: mockRunBuild,
      runTests: mockRunTests,
      skipDependencyCheck: true,
    });

    expect(result.passed).toBe(false);
    expect(result.testsOutput).toBe('Build failed - skipping tests. Fix TypeScript errors first.');
    expect(result.buildOutput).toContain('TS2304');
    expect(result.failures).toBe(0);
    expect(mockRunBuild).toHaveBeenCalledWith('/test/dir', 120000);
    expect(mockRunTests).not.toHaveBeenCalled();
  });

  it('should run tests when build succeeds', async () => {
    const mockRunBuild = vi.fn().mockResolvedValue({
      success: true,
      output: 'Build succeeded',
    });
    const mockRunTests = vi.fn().mockResolvedValue({
      success: true,
      output: 'All tests passed',
    });

    const story = createMockStory();
    const result = await verifyImplementation(story, '/test/dir', {
      runBuild: mockRunBuild,
      runTests: mockRunTests,
      skipDependencyCheck: true,
    });

    expect(result.passed).toBe(true);
    expect(result.testsOutput).toBe('All tests passed');
    expect(result.buildOutput).toBe('Build succeeded');
    expect(mockRunBuild).toHaveBeenCalledWith('/test/dir', 120000);
    expect(mockRunTests).toHaveBeenCalledWith('/test/dir', 300000);
  });

  it('should run tests when no build command configured', async () => {
    const mockRunTests = vi.fn().mockResolvedValue({
      success: true,
      output: 'All tests passed',
    });

    const story = createMockStory();
    const result = await verifyImplementation(story, '/test/dir', {
      runTests: mockRunTests,
      skipDependencyCheck: true,
    });

    expect(result.passed).toBe(true);
    expect(result.testsOutput).toBe('All tests passed');
    expect(result.buildOutput).toBe('');
    expect(mockRunTests).toHaveBeenCalled();
  });

  it('should include correct message in testsOutput when short-circuiting', async () => {
    const mockRunBuild = vi.fn().mockResolvedValue({
      success: false,
      output: 'Build error details',
    });

    const story = createMockStory();
    const result = await verifyImplementation(story, '/test/dir', {
      runBuild: mockRunBuild,
      skipDependencyCheck: true,
    });

    expect(result.testsOutput).toBe('Build failed - skipping tests. Fix TypeScript errors first.');
    expect(result.passed).toBe(false);
  });

  it('should preserve buildOutput on build failure', async () => {
    const mockRunBuild = vi.fn().mockResolvedValue({
      success: false,
      output: 'Detailed build error:\nLine 42: Type error\nLine 99: Syntax error',
    });

    const story = createMockStory();
    const result = await verifyImplementation(story, '/test/dir', {
      runBuild: mockRunBuild,
      skipDependencyCheck: true,
    });

    expect(result.buildOutput).toContain('Detailed build error');
    expect(result.buildOutput).toContain('Line 42: Type error');
    expect(result.buildOutput).toContain('Line 99: Syntax error');
  });

  it('should run tests after successful build when both commands configured', async () => {
    const mockRunBuild = vi.fn().mockResolvedValue({
      success: true,
      output: 'Build completed',
    });
    const mockRunTests = vi.fn().mockResolvedValue({
      success: false,
      output: '2 tests failed',
    });

    const story = createMockStory();
    const result = await verifyImplementation(story, '/test/dir', {
      runBuild: mockRunBuild,
      runTests: mockRunTests,
      skipDependencyCheck: true,
    });

    expect(result.passed).toBe(false);
    expect(result.testsOutput).toBe('2 tests failed');
    expect(result.buildOutput).toBe('Build completed');
    expect(mockRunBuild).toHaveBeenCalled();
    expect(mockRunTests).toHaveBeenCalled();
  });
});

describe('ensureDependenciesInstalled', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should return installed: false when no package.json exists', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const result = ensureDependenciesInstalled('/test/dir');

    expect(result.installed).toBe(false);
    expect(result.error).toBeUndefined();
    expect(child_process.spawnSync).not.toHaveBeenCalled();
  });

  it('should return installed: false when node_modules already exists with packages', () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      const pathStr = p.toString();
      return pathStr.includes('package.json') || pathStr.includes('node_modules');
    });
    vi.mocked(fs.readdirSync).mockReturnValue(['some-package', '.bin'] as any);

    const result = ensureDependenciesInstalled('/test/dir');

    expect(result.installed).toBe(false);
    expect(result.error).toBeUndefined();
    expect(child_process.spawnSync).not.toHaveBeenCalled();
  });

  it('should run npm install when node_modules is empty', () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      const pathStr = p.toString();
      return pathStr.includes('package.json') || pathStr.includes('package-lock.json');
    });
    vi.mocked(fs.readdirSync).mockReturnValue([] as any);
    vi.mocked(child_process.spawnSync).mockReturnValue({
      status: 0,
      stdout: '',
      stderr: '',
      pid: 1234,
      output: [],
      signal: null,
    });

    const result = ensureDependenciesInstalled('/test/dir');

    expect(result.installed).toBe(true);
    expect(result.error).toBeUndefined();
    expect(child_process.spawnSync).toHaveBeenCalledWith(
      'npm',
      ['install'],
      expect.objectContaining({ cwd: '/test/dir' })
    );
  });

  it('should use yarn when yarn.lock exists', () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      const pathStr = p.toString();
      return pathStr.includes('package.json') || pathStr.includes('yarn.lock');
    });
    vi.mocked(fs.readdirSync).mockReturnValue([] as any);
    vi.mocked(child_process.spawnSync).mockReturnValue({
      status: 0,
      stdout: '',
      stderr: '',
      pid: 1234,
      output: [],
      signal: null,
    });

    const result = ensureDependenciesInstalled('/test/dir');

    expect(result.installed).toBe(true);
    expect(child_process.spawnSync).toHaveBeenCalledWith(
      'yarn',
      ['install'],
      expect.objectContaining({ cwd: '/test/dir' })
    );
  });

  it('should use pnpm when pnpm-lock.yaml exists', () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      const pathStr = p.toString();
      return pathStr.includes('package.json') || pathStr.includes('pnpm-lock.yaml');
    });
    vi.mocked(fs.readdirSync).mockReturnValue([] as any);
    vi.mocked(child_process.spawnSync).mockReturnValue({
      status: 0,
      stdout: '',
      stderr: '',
      pid: 1234,
      output: [],
      signal: null,
    });

    const result = ensureDependenciesInstalled('/test/dir');

    expect(result.installed).toBe(true);
    expect(child_process.spawnSync).toHaveBeenCalledWith(
      'pnpm',
      ['install'],
      expect.objectContaining({ cwd: '/test/dir' })
    );
  });

  it('should return error when install fails', () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      const pathStr = p.toString();
      return pathStr.includes('package.json') || pathStr.includes('package-lock.json');
    });
    vi.mocked(fs.readdirSync).mockReturnValue([] as any);
    vi.mocked(child_process.spawnSync).mockReturnValue({
      status: 1,
      stdout: '',
      stderr: 'npm ERR! something went wrong',
      pid: 1234,
      output: [],
      signal: null,
    });

    const result = ensureDependenciesInstalled('/test/dir');

    expect(result.installed).toBe(false);
    expect(result.error).toContain('Failed to install dependencies');
    expect(result.error).toContain('npm ERR!');
  });

  it('should run install when node_modules only has .bin', () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      const pathStr = p.toString();
      return pathStr.includes('package.json') || pathStr.includes('node_modules') || pathStr.includes('package-lock.json');
    });
    vi.mocked(fs.readdirSync).mockReturnValue(['.bin'] as any);
    vi.mocked(child_process.spawnSync).mockReturnValue({
      status: 0,
      stdout: '',
      stderr: '',
      pid: 1234,
      output: [],
      signal: null,
    });

    const result = ensureDependenciesInstalled('/test/dir');

    expect(result.installed).toBe(true);
    expect(child_process.spawnSync).toHaveBeenCalled();
  });
});
