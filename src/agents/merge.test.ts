import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies before imports
vi.mock('../core/story.js', () => ({
  parseStory: vi.fn(),
  updateStoryField: vi.fn(),
}));

vi.mock('../core/config.js', () => ({
  loadConfig: vi.fn(),
}));

vi.mock('../core/event-bus.js', () => ({
  getEventBus: vi.fn(),
}));

vi.mock('../services/gh-cli.js', () => ({
  ghPRChecks: vi.fn(),
  ghPRMerge: vi.fn(),
  extractPRNumber: vi.fn(),
}));

import { runMergeAgent } from './merge.js';
import { parseStory, updateStoryField } from '../core/story.js';
import { loadConfig } from '../core/config.js';
import { getEventBus } from '../core/event-bus.js';
import { ghPRChecks, ghPRMerge, extractPRNumber } from '../services/gh-cli.js';

const mockParseStory = vi.mocked(parseStory);
const mockUpdateStoryField = vi.mocked(updateStoryField);
const mockLoadConfig = vi.mocked(loadConfig);
const mockGetEventBus = vi.mocked(getEventBus);
const mockGhPRChecks = vi.mocked(ghPRChecks);
const mockGhPRMerge = vi.mocked(ghPRMerge);
const mockExtractPRNumber = vi.mocked(extractPRNumber);

function makeStory(overrides: Record<string, any> = {}) {
  return {
    path: '/test/story.md',
    slug: 'test-story',
    frontmatter: {
      id: 'S-001',
      title: 'Test Story',
      slug: 'test-story',
      priority: 10,
      status: 'in-progress' as const,
      type: 'feature' as const,
      created: '2026-01-01',
      labels: [],
      research_complete: true,
      plan_complete: true,
      implementation_complete: true,
      reviews_complete: true,
      pr_url: 'https://github.com/owner/repo/pull/42',
      ...overrides,
    },
    content: '',
  };
}

describe('runMergeAgent', () => {
  const mockEmit = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetEventBus.mockReturnValue({ emit: mockEmit } as any);
    mockLoadConfig.mockReturnValue({
      merge: {
        enabled: true,
        strategy: 'squash',
        deleteBranchAfterMerge: true,
        checksTimeout: 5000,
        checksPollingInterval: 100,
        requireAllChecksPassing: true,
      },
    } as any);
    mockExtractPRNumber.mockReturnValue(42);
    mockUpdateStoryField.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns error when no pr_url on story', async () => {
    const story = makeStory({ pr_url: undefined });
    mockParseStory.mockReturnValue(story);

    const result = await runMergeAgent('/test/story.md', '/test/.ai-sdlc');

    expect(result.success).toBe(false);
    expect(result.error).toContain('No PR URL');
  });

  it('returns success when PR already merged', async () => {
    const story = makeStory({ pr_merged: true });
    mockParseStory.mockReturnValue(story);

    const result = await runMergeAgent('/test/story.md', '/test/.ai-sdlc');

    expect(result.success).toBe(true);
    expect(result.changesMade).toContain('PR already merged');
  });

  it('merges PR when all checks pass', async () => {
    const story = makeStory();
    mockParseStory.mockReturnValue(story);
    mockGhPRChecks.mockReturnValue({
      checks: [{ name: 'build', status: 'completed', conclusion: 'success' }],
      allPassed: true,
      anyFailed: false,
      anyPending: false,
    });
    mockGhPRMerge.mockReturnValue('abc123');

    const result = await runMergeAgent('/test/story.md', '/test/.ai-sdlc');

    expect(result.success).toBe(true);
    expect(mockGhPRMerge).toHaveBeenCalledWith(42, 'squash', true, undefined);
    expect(mockUpdateStoryField).toHaveBeenCalledWith(
      expect.anything(),
      'pr_merged',
      true
    );
  });

  it('fails when checks fail', async () => {
    const story = makeStory();
    mockParseStory.mockReturnValue(story);
    mockGhPRChecks.mockReturnValue({
      checks: [{ name: 'lint', status: 'completed', conclusion: 'failure' }],
      allPassed: false,
      anyFailed: true,
      anyPending: false,
    });

    const result = await runMergeAgent('/test/story.md', '/test/.ai-sdlc');

    expect(result.success).toBe(false);
    expect(result.error).toContain('CI checks failed');
    expect(mockGhPRMerge).not.toHaveBeenCalled();
  });

  it('times out when checks stay pending', async () => {
    const story = makeStory();
    mockParseStory.mockReturnValue(story);
    mockLoadConfig.mockReturnValue({
      merge: {
        enabled: true,
        strategy: 'squash',
        deleteBranchAfterMerge: true,
        checksTimeout: 200,
        checksPollingInterval: 50,
        requireAllChecksPassing: true,
      },
    } as any);
    mockGhPRChecks.mockReturnValue({
      checks: [{ name: 'e2e', status: 'in_progress', conclusion: null }],
      allPassed: false,
      anyFailed: false,
      anyPending: true,
    });

    const result = await runMergeAgent('/test/story.md', '/test/.ai-sdlc');

    expect(result.success).toBe(false);
    expect(result.error).toContain('timed out');
  });

  it('returns error for invalid PR URL', async () => {
    const story = makeStory({ pr_url: 'not-a-url' });
    mockParseStory.mockReturnValue(story);
    mockExtractPRNumber.mockReturnValue(null);

    const result = await runMergeAgent('/test/story.md', '/test/.ai-sdlc');

    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid PR URL');
  });

  it('emits agent_start and agent_complete events', async () => {
    const story = makeStory();
    mockParseStory.mockReturnValue(story);
    mockGhPRChecks.mockReturnValue({
      checks: [],
      allPassed: true,
      anyFailed: false,
      anyPending: false,
    });
    mockGhPRMerge.mockReturnValue('sha123');

    await runMergeAgent('/test/story.md', '/test/.ai-sdlc');

    expect(mockEmit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'agent_start', phase: 'merge' })
    );
    expect(mockEmit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'agent_complete', phase: 'merge', success: true })
    );
  });
});
