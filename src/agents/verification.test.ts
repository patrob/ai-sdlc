import { describe, it, expect, vi, beforeEach } from 'vitest';
import { verifyImplementation, type VerificationResult } from './verification.js';
import type { Story } from '../types/index.js';

vi.mock('../core/config.js', () => ({
  loadConfig: vi.fn(() => ({
    timeouts: {
      testTimeout: 300000,
      buildTimeout: 120000,
    },
    tdd: {
      requirePassingTestsForComplete: true,
    },
  })),
}));

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
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T10:00:00Z'));
  });

  it('should return passed when tests and build both pass', async () => {
    const mockRunTests = vi.fn().mockResolvedValue({
      success: true,
      output: 'All tests passed',
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

    expect(result.passed).toBe(true);
    expect(result.testsOutput).toContain('All tests passed');
    expect(result.buildOutput).toContain('Build succeeded');
    expect(result.timestamp).toBe('2024-01-15T10:00:00.000Z');
    expect(result.failures).toBe(0);
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
});
