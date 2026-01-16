import { describe, it, expect, vi, beforeEach } from 'vitest';
import { shouldPerformWebResearch, evaluateFAR } from './research.js';
import { Story } from '../types/index.js';

describe('shouldPerformWebResearch', () => {
  let mockStory: Story;

  beforeEach(() => {
    mockStory = {
      path: '/test/story.md',
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
        research_complete: false,
        plan_complete: false,
        implementation_complete: false,
        reviews_complete: false,
      },
      content: 'Test story content',
    };
  });

  it('should return true when story mentions external library', () => {
    mockStory.content = 'We need to integrate the Stripe API for payments';
    const result = shouldPerformWebResearch(mockStory, '');
    expect(result).toBe(true);
  });

  it('should return true when story mentions API integration', () => {
    mockStory.content = 'Add API endpoint for user authentication';
    const result = shouldPerformWebResearch(mockStory, '');
    expect(result).toBe(true);
  });

  it('should return true when story mentions framework', () => {
    mockStory.content = 'Use React Query framework for data fetching';
    const result = shouldPerformWebResearch(mockStory, '');
    expect(result).toBe(true);
  });

  it('should return true when story mentions best practices', () => {
    mockStory.content = 'Follow best practices for error handling';
    const result = shouldPerformWebResearch(mockStory, '');
    expect(result).toBe(true);
  });

  it('should return true when story mentions npm package', () => {
    mockStory.content = 'Install the npm package for date formatting';
    const result = shouldPerformWebResearch(mockStory, '');
    expect(result).toBe(true);
  });

  it('should return true when story mentions external keyword', () => {
    mockStory.content = 'Integrate third-party authentication provider';
    const result = shouldPerformWebResearch(mockStory, '');
    expect(result).toBe(true);
  });

  it('should return true when npm dependency mentioned with package.json context', () => {
    mockStory.content = 'Install new npm dependency for logging';
    const codebaseContext = '=== package.json ===\n{"dependencies": {}}';
    const result = shouldPerformWebResearch(mockStory, codebaseContext);
    expect(result).toBe(true);
  });

  it('should return false for purely internal refactoring', () => {
    mockStory.content = 'Refactor internal utility functions';
    const result = shouldPerformWebResearch(mockStory, '');
    expect(result).toBe(false);
  });

  it('should return false when moving internal functions', () => {
    mockStory.content = 'Move function to different internal module';
    const result = shouldPerformWebResearch(mockStory, '');
    expect(result).toBe(false);
  });

  it('should return false when renaming variables', () => {
    mockStory.content = 'Rename variable from oldName to newName';
    const result = shouldPerformWebResearch(mockStory, '');
    expect(result).toBe(false);
  });

  it('should return false when no external dependencies mentioned', () => {
    mockStory.content = 'Update the calculation logic in the utility';
    const result = shouldPerformWebResearch(mockStory, '');
    expect(result).toBe(false);
  });

  it('should handle empty story content gracefully', () => {
    mockStory.content = '';
    const result = shouldPerformWebResearch(mockStory, '');
    expect(result).toBe(false);
  });

  it('should check title as well as content', () => {
    mockStory.frontmatter.title = 'Integrate Stripe API';
    mockStory.content = 'Payment processing feature';
    const result = shouldPerformWebResearch(mockStory, '');
    expect(result).toBe(true);
  });

  it('should prioritize internal keywords over external', () => {
    mockStory.content = 'Refactor internal API utility functions';
    const result = shouldPerformWebResearch(mockStory, '');
    expect(result).toBe(false);
  });
});

describe('evaluateFAR', () => {
  it('should parse valid FAR scores correctly', () => {
    const finding = `### React Query Documentation
**Source**: Context7 - React Query
**FAR Score**: Factuality: 5, Actionability: 4, Relevance: 5
**Justification**: Official documentation provides verified API examples directly applicable to our data fetching needs.

[Finding content here...]`;

    const result = evaluateFAR(finding);
    expect(result.factuality).toBe(5);
    expect(result.actionability).toBe(4);
    expect(result.relevance).toBe(5);
    expect(result.justification).toBe('Official documentation provides verified API examples directly applicable to our data fetching needs.');
  });

  it('should parse FAR scores with different formatting', () => {
    const finding = `**FAR Score**: Factuality: 3, Actionability: 5, Relevance: 4
**Justification**: Community best practices from Stack Overflow with code examples.`;

    const result = evaluateFAR(finding);
    expect(result.factuality).toBe(3);
    expect(result.actionability).toBe(5);
    expect(result.relevance).toBe(4);
    expect(result.justification).toContain('Community best practices');
  });

  it('should handle multiline justification', () => {
    const finding = `**FAR Score**: Factuality: 4, Actionability: 3, Relevance: 5
**Justification**: This finding provides detailed information
that spans multiple lines and contains
important context.

Next section starts here.`;

    const result = evaluateFAR(finding);
    expect(result.factuality).toBe(4);
    expect(result.actionability).toBe(3);
    expect(result.relevance).toBe(5);
    expect(result.justification).toContain('multiple lines');
  });

  it('should return default scores when FAR scores are missing', () => {
    const finding = `### Some Finding
This finding has no FAR scores.`;

    const result = evaluateFAR(finding);
    expect(result.factuality).toBe(3);
    expect(result.actionability).toBe(3);
    expect(result.relevance).toBe(3);
    expect(result.justification).toBe('Unable to parse FAR evaluation from finding');
  });

  it('should return default scores when FAR scores are out of range', () => {
    const finding = `**FAR Score**: Factuality: 10, Actionability: 0, Relevance: 3
**Justification**: Invalid scores.`;

    const result = evaluateFAR(finding);
    expect(result.factuality).toBe(3);
    expect(result.actionability).toBe(3);
    expect(result.relevance).toBe(3);
  });

  it('should handle missing justification', () => {
    const finding = `**FAR Score**: Factuality: 5, Actionability: 4, Relevance: 5`;

    const result = evaluateFAR(finding);
    // Should use defaults because justification is required
    expect(result.factuality).toBe(3);
    expect(result.actionability).toBe(3);
    expect(result.relevance).toBe(3);
  });

  it('should handle malformed input gracefully', () => {
    const finding = `Completely unstructured finding text with no format.`;

    const result = evaluateFAR(finding);
    expect(result.factuality).toBe(3);
    expect(result.actionability).toBe(3);
    expect(result.relevance).toBe(3);
  });

  it('should handle empty input', () => {
    const finding = '';

    const result = evaluateFAR(finding);
    expect(result.factuality).toBe(3);
    expect(result.actionability).toBe(3);
    expect(result.relevance).toBe(3);
  });

  it('should validate all scores are in 1-5 range', () => {
    const finding = `**FAR Score**: Factuality: 1, Actionability: 2, Relevance: 5
**Justification**: Valid range test.`;

    const result = evaluateFAR(finding);
    expect(result.factuality).toBe(1);
    expect(result.actionability).toBe(2);
    expect(result.relevance).toBe(5);
  });
});
