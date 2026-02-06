import { describe, it, expect, vi } from 'vitest';
import { findPotentialDuplicates, shouldDecompose } from './ideation.js';
import { Story } from '../types/index.js';

function makeStory(id: string, title: string): Story {
  return {
    path: `/test/${id}/story.md`,
    slug: id,
    frontmatter: {
      id,
      title,
      slug: id,
      priority: 10,
      status: 'backlog',
      type: 'feature',
      created: '2026-01-01',
      labels: [],
      research_complete: false,
      plan_complete: false,
      implementation_complete: false,
      reviews_complete: false,
    },
    content: '',
  };
}

describe('findPotentialDuplicates', () => {
  it('finds similar titles', () => {
    const existing = [
      makeStory('S-001', 'Add user authentication'),
      makeStory('S-002', 'Create database schema'),
      makeStory('S-003', 'Add user login page'),
    ];

    const results = findPotentialDuplicates('Add user authentication flow', existing);

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].story.frontmatter.id).toBe('S-001');
    expect(results[0].similarity).toBeGreaterThan(0.3);
  });

  it('returns empty for completely different titles', () => {
    const existing = [
      makeStory('S-001', 'Database migration tool'),
      makeStory('S-002', 'API rate limiting'),
    ];

    const results = findPotentialDuplicates('Color theme configuration', existing);

    expect(results.length).toBe(0);
  });

  it('respects threshold parameter', () => {
    const existing = [
      makeStory('S-001', 'Add user authentication'),
    ];

    // Very low threshold should find more matches
    const lowThreshold = findPotentialDuplicates('user stuff', existing, 0.1);
    const highThreshold = findPotentialDuplicates('user stuff', existing, 0.9);

    expect(lowThreshold.length).toBeGreaterThanOrEqual(highThreshold.length);
  });

  it('sorts by similarity descending', () => {
    const existing = [
      makeStory('S-001', 'Create a simple button component'),
      makeStory('S-002', 'Create a simple button component with hover'),
    ];

    const results = findPotentialDuplicates('Create a simple button component with hover state', existing, 0.2);

    if (results.length > 1) {
      expect(results[0].similarity).toBeGreaterThanOrEqual(results[1].similarity);
    }
  });

  it('handles empty stories array', () => {
    const results = findPotentialDuplicates('Anything', []);
    expect(results).toEqual([]);
  });
});

describe('shouldDecompose', () => {
  it('recommends decomposition for stories with many acceptance criteria', () => {
    const content = `
      # Big Feature
      - [ ] Criterion 1
      - [ ] Criterion 2
      - [ ] Criterion 3
      - [ ] Criterion 4
      - [ ] Criterion 5
      - [ ] Criterion 6
      - [ ] Criterion 7
      - [ ] Criterion 8
      - [ ] Criterion 9
    `;

    expect(shouldDecompose(content)).toBe(true);
  });

  it('does not recommend decomposition for small stories', () => {
    const content = `
      # Simple Feature
      - [ ] Do the thing
      - [ ] Test the thing
    `;

    expect(shouldDecompose(content)).toBe(false);
  });

  it('recommends decomposition for scope creep (many ands + feature verbs)', () => {
    const content = `
      Add authentication and authorization and rate limiting and create
      the user profile page and implement the settings and build the
      admin dashboard and integrate with OAuth and support SAML
    `;

    expect(shouldDecompose(content)).toBe(true);
  });

  it('handles empty content', () => {
    expect(shouldDecompose('')).toBe(false);
  });
});
