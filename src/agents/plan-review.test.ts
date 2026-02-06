import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildPlanReviewPrompt,
  parsePlanReviewResponse,
  formatSuggestions,
  PLAN_REVIEW_SYSTEM_PROMPT,
  runPlanReviewAgent,
} from './plan-review.js';
import { DEFAULT_PLAN_REVIEW_CONFIG } from '../core/config.js';
import * as storyModule from '../core/story.js';
import { Story } from '../types/index.js';

// Mock external dependencies
vi.mock('../core/story.js', async () => {
  const actual = await vi.importActual<typeof import('../core/story.js')>('../core/story.js');
  return {
    ...actual,
    parseStory: vi.fn(),
    writeStory: vi.fn(),
    updateStoryField: vi.fn(),
    writeSectionContent: vi.fn(),
    readSectionContent: vi.fn(),
  };
});
vi.mock('../core/client.js', () => ({
  runAgentQuery: vi.fn(),
}));
vi.mock('../core/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

function makeStory(overrides: Partial<Story['frontmatter']> = {}): Story {
  return {
    path: '/test/stories/S-001/story.md',
    slug: 'test-story',
    frontmatter: {
      id: 'S-001',
      title: 'Test Story',
      slug: 'test-story',
      priority: 10,
      status: 'in-progress',
      type: 'feature',
      created: '2024-01-01',
      labels: [],
      research_complete: true,
      plan_complete: true,
      implementation_complete: false,
      reviews_complete: false,
      ...overrides,
    },
    content: 'As a user, I want to do a thing.',
  };
}

describe('Plan Review Agent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('DEFAULT_PLAN_REVIEW_CONFIG', () => {
    it('should have no iteration or gating fields', () => {
      expect(DEFAULT_PLAN_REVIEW_CONFIG).toEqual({});
      expect(DEFAULT_PLAN_REVIEW_CONFIG).not.toHaveProperty('maxIterations');
      expect(DEFAULT_PLAN_REVIEW_CONFIG).not.toHaveProperty('requireAllPerspectives');
    });
  });

  describe('PLAN_REVIEW_SYSTEM_PROMPT', () => {
    it('should mention all three perspectives', () => {
      expect(PLAN_REVIEW_SYSTEM_PROMPT).toContain('Tech Lead');
      expect(PLAN_REVIEW_SYSTEM_PROMPT).toContain('Security');
      expect(PLAN_REVIEW_SYSTEM_PROMPT).toContain('Product Owner');
    });

    it('should include JSON response format', () => {
      expect(PLAN_REVIEW_SYSTEM_PROMPT).toContain('perspectivesSatisfied');
      expect(PLAN_REVIEW_SYSTEM_PROMPT).toContain('suggestions');
    });
  });

  describe('buildPlanReviewPrompt', () => {
    const story = makeStory();

    it('should include story title and content', () => {
      const prompt = buildPlanReviewPrompt(story, '## Plan\n- Task 1', 1);
      expect(prompt).toContain('Test Story');
      expect(prompt).toContain('As a user, I want to do a thing.');
    });

    it('should include plan content', () => {
      const prompt = buildPlanReviewPrompt(story, '## Plan\n- Task 1', 1);
      expect(prompt).toContain('## Plan\n- Task 1');
    });

    it('should not include previous feedback on iteration 1', () => {
      const prompt = buildPlanReviewPrompt(story, 'plan', 1, 'old feedback');
      expect(prompt).not.toContain('Previous Review Feedback');
    });

    it('should include previous feedback on subsequent iterations', () => {
      const prompt = buildPlanReviewPrompt(story, 'plan', 2, 'old feedback');
      expect(prompt).toContain('Previous Review Feedback');
      expect(prompt).toContain('old feedback');
    });
  });

  describe('parsePlanReviewResponse', () => {
    const story = makeStory();

    it('should parse valid JSON response', () => {
      const response = JSON.stringify({
        perspectivesSatisfied: { techLead: true, security: true, productOwner: true },
        suggestions: [],
      });
      const result = parsePlanReviewResponse(response, story, 1);
      expect(result.overallReady).toBe(true);
      expect(result.suggestions).toEqual([]);
    });

    it('should extract JSON from markdown code blocks', () => {
      const response = '```json\n' + JSON.stringify({
        perspectivesSatisfied: { techLead: true, security: false, productOwner: true },
        suggestions: [{
          perspective: 'security',
          category: 'auth',
          description: 'Missing auth check',
          severity: 'blocking',
        }],
      }) + '\n```';
      const result = parsePlanReviewResponse(response, story, 1);
      expect(result.overallReady).toBe(false);
      expect(result.suggestions).toHaveLength(1);
    });

    it('should mark overallReady false when any perspective unsatisfied', () => {
      const response = JSON.stringify({
        perspectivesSatisfied: { techLead: true, security: false, productOwner: true },
        suggestions: [],
      });
      const result = parsePlanReviewResponse(response, story, 1);
      expect(result.overallReady).toBe(false);
    });

    it('should mark overallReady false when blocking issues exist despite all satisfied', () => {
      const response = JSON.stringify({
        perspectivesSatisfied: { techLead: true, security: true, productOwner: true },
        suggestions: [{
          perspective: 'security',
          category: 'vuln',
          description: 'SQL injection risk',
          severity: 'blocking',
        }],
      });
      const result = parsePlanReviewResponse(response, story, 1);
      expect(result.overallReady).toBe(false);
    });

    it('should return conservative result on invalid JSON', () => {
      const result = parsePlanReviewResponse('not json at all', story, 1);
      expect(result.overallReady).toBe(false);
      expect(result.perspectivesSatisfied).toEqual({
        techLead: false,
        security: false,
        productOwner: false,
      });
      expect(result.suggestions[0].category).toBe('parsing_error');
    });
  });

  describe('formatSuggestions', () => {
    it('should return approval message for empty suggestions', () => {
      expect(formatSuggestions([])).toBe('No suggestions - plan approved!');
    });

    it('should group suggestions by perspective', () => {
      const result = formatSuggestions([
        { perspective: 'techLead', category: 'arch', description: 'Issue A', severity: 'important' },
        { perspective: 'security', category: 'auth', description: 'Issue B', severity: 'blocking' },
      ]);
      expect(result).toContain('### Tech Lead Perspective');
      expect(result).toContain('### Security Engineer Perspective');
      expect(result).toContain('Issue A');
      expect(result).toContain('Issue B');
    });

    it('should include suggested changes when present', () => {
      const result = formatSuggestions([
        { perspective: 'productOwner', category: 'ux', description: 'Missing flow', severity: 'suggestion', suggestedChange: 'Add error page' },
      ]);
      expect(result).toContain('Suggested: Add error page');
    });
  });

  describe('runPlanReviewAgent - enrichment behavior', () => {
    const story = makeStory();

    let runAgentQuery: ReturnType<typeof vi.fn>;

    beforeEach(async () => {
      const clientModule = await import('../core/client.js');
      runAgentQuery = vi.mocked(clientModule.runAgentQuery);
      vi.mocked(storyModule.parseStory).mockReturnValue(story);
      vi.mocked(storyModule.readSectionContent).mockResolvedValue('## Plan\n- T1: Do something');
      vi.mocked(storyModule.updateStoryField).mockImplementation(async (s) => s);
      vi.mocked(storyModule.writeStory).mockResolvedValue(undefined);
      vi.mocked(storyModule.writeSectionContent).mockResolvedValue(undefined);
    });

    it('should always mark plan_review_complete true when all perspectives satisfied', async () => {
      runAgentQuery.mockResolvedValue(JSON.stringify({
        perspectivesSatisfied: { techLead: true, security: true, productOwner: true },
        suggestions: [],
      }));

      const result = await runPlanReviewAgent('/test/stories/S-001/story.md', '/test/.ai-sdlc');
      expect(result.success).toBe(true);
      expect(result.changesMade).toContain('Marked plan_review_complete: true');
    });

    it('should always mark plan_review_complete true even when perspectives are NOT satisfied', async () => {
      runAgentQuery.mockResolvedValue(JSON.stringify({
        perspectivesSatisfied: { techLead: false, security: false, productOwner: false },
        suggestions: [{
          perspective: 'techLead',
          category: 'arch',
          description: 'Major architecture concern',
          severity: 'blocking',
        }],
      }));

      const result = await runPlanReviewAgent('/test/stories/S-001/story.md', '/test/.ai-sdlc');
      expect(result.success).toBe(true);
      expect(result.changesMade).toContain('Marked plan_review_complete: true');
    });

    it('should never reset plan_complete to false', async () => {
      runAgentQuery.mockResolvedValue(JSON.stringify({
        perspectivesSatisfied: { techLead: false, security: false, productOwner: false },
        suggestions: [{
          perspective: 'security',
          category: 'vuln',
          description: 'Critical vulnerability',
          severity: 'blocking',
        }],
      }));

      await runPlanReviewAgent('/test/stories/S-001/story.md', '/test/.ai-sdlc');

      // Verify updateStoryField was never called with plan_complete = false
      const updateCalls = vi.mocked(storyModule.updateStoryField).mock.calls;
      const planCompleteResets = updateCalls.filter(
        ([, field, value]) => field === 'plan_complete' && value === false
      );
      expect(planCompleteResets).toHaveLength(0);
    });

    it('should write feedback to plan_review section', async () => {
      runAgentQuery.mockResolvedValue(JSON.stringify({
        perspectivesSatisfied: { techLead: true, security: true, productOwner: true },
        suggestions: [],
      }));

      await runPlanReviewAgent('/test/stories/S-001/story.md', '/test/.ai-sdlc');

      expect(storyModule.writeSectionContent).toHaveBeenCalledWith(
        '/test/stories/S-001/story.md',
        'plan_review',
        expect.stringContaining('Plan Review'),
        expect.objectContaining({ iteration: 1 }),
      );
    });

    it('should return error when no plan exists', async () => {
      vi.mocked(storyModule.readSectionContent).mockResolvedValue(null as any);

      const result = await runPlanReviewAgent('/test/stories/S-001/story.md', '/test/.ai-sdlc');
      expect(result.success).toBe(false);
      expect(result.error).toContain('No plan found');
    });

    it('should preserve suggestions in result even though not gating', async () => {
      const suggestions = [{
        perspective: 'security' as const,
        category: 'auth',
        description: 'Add rate limiting',
        severity: 'important' as const,
      }];

      runAgentQuery.mockResolvedValue(JSON.stringify({
        perspectivesSatisfied: { techLead: true, security: false, productOwner: true },
        suggestions,
      }));

      const result = await runPlanReviewAgent('/test/stories/S-001/story.md', '/test/.ai-sdlc');
      expect(result.suggestions).toHaveLength(1);
      expect(result.suggestions[0].description).toBe('Add rate limiting');
      // Still completes despite unsatisfied perspective
      expect(result.changesMade).toContain('Marked plan_review_complete: true');
    });
  });
});
