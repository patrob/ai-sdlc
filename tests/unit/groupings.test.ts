import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  labelMatchesPattern,
  findStoriesByLabel,
  findStoriesByLabels,
  findStoriesByPattern,
  getUniqueLabels,
  getGroupings,
} from '../../src/core/kanban.js';
import { Story, StoryStatus } from '../../src/types/index.js';
import { loadConfig } from '../../src/core/config.js';

describe('labelMatchesPattern', () => {
  describe('exact matches', () => {
    it('should match identical strings', () => {
      expect(labelMatchesPattern('epic-test', 'epic-test')).toBe(true);
      expect(labelMatchesPattern('sprint-2024-q1', 'sprint-2024-q1')).toBe(true);
    });

    it('should not match different strings', () => {
      expect(labelMatchesPattern('epic-test', 'epic-other')).toBe(false);
      expect(labelMatchesPattern('sprint-2024-q1', 'sprint-2024-q2')).toBe(false);
    });
  });

  describe('wildcard patterns', () => {
    it('should match prefix patterns (epic-*)', () => {
      expect(labelMatchesPattern('epic-ticketing', 'epic-*')).toBe(true);
      expect(labelMatchesPattern('epic-auth', 'epic-*')).toBe(true);
      expect(labelMatchesPattern('sprint-2024-q1', 'epic-*')).toBe(false);
    });

    it('should match suffix patterns (*-test)', () => {
      expect(labelMatchesPattern('unit-test', '*-test')).toBe(true);
      expect(labelMatchesPattern('integration-test', '*-test')).toBe(true);
      expect(labelMatchesPattern('test-only', '*-test')).toBe(false);
    });

    it('should match middle patterns (team-*-backend)', () => {
      expect(labelMatchesPattern('team-alpha-backend', 'team-*-backend')).toBe(true);
      expect(labelMatchesPattern('team-beta-backend', 'team-*-backend')).toBe(true);
      expect(labelMatchesPattern('team-alpha-frontend', 'team-*-backend')).toBe(false);
    });

    it('should match full wildcard (*)', () => {
      expect(labelMatchesPattern('any-label', '*')).toBe(true);
      expect(labelMatchesPattern('', '*')).toBe(true);
    });
  });

  describe('special character escaping', () => {
    it('should escape regex special characters', () => {
      expect(labelMatchesPattern('test.label', 'test.label')).toBe(true);
      expect(labelMatchesPattern('test[0]', 'test[0]')).toBe(true);
      expect(labelMatchesPattern('test(1)', 'test(1)')).toBe(true);
      expect(labelMatchesPattern('test{a}', 'test{a}')).toBe(true);
      expect(labelMatchesPattern('test^start', 'test^start')).toBe(true);
      expect(labelMatchesPattern('test$end', 'test$end')).toBe(true);
    });

    it('should not match when special characters differ', () => {
      expect(labelMatchesPattern('testXlabel', 'test.label')).toBe(false);
      expect(labelMatchesPattern('test0', 'test[0]')).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle empty pattern', () => {
      expect(labelMatchesPattern('any-label', '')).toBe(false);
      expect(labelMatchesPattern('', '')).toBe(true);
    });

    it('should handle empty label', () => {
      expect(labelMatchesPattern('', 'epic-*')).toBe(false);
      expect(labelMatchesPattern('', '*')).toBe(true);
    });

    it('should be case-sensitive', () => {
      expect(labelMatchesPattern('Epic-Test', 'epic-test')).toBe(false);
      expect(labelMatchesPattern('epic-test', 'EPIC-*')).toBe(false);
    });
  });

  describe('security - pattern length', () => {
    it('should reject patterns over 100 characters', () => {
      const longPattern = 'a'.repeat(101);
      expect(() => labelMatchesPattern('test', longPattern)).toThrow('Pattern exceeds maximum length');
    });

    it('should accept patterns up to 100 characters', () => {
      const maxPattern = 'a'.repeat(100);
      expect(() => labelMatchesPattern('test', maxPattern)).not.toThrow();
    });
  });

  describe('security - ReDoS prevention', () => {
    it('should escape regex special characters to prevent ReDoS', () => {
      // These patterns would cause ReDoS if not escaped properly
      // But since we escape special chars, they're treated as literals
      expect(() => labelMatchesPattern('test', '(a+)+')).not.toThrow();
      expect(() => labelMatchesPattern('test', '.*.*.* ')).not.toThrow();
      expect(() => labelMatchesPattern('test', '(.*)*')).not.toThrow();
      expect(() => labelMatchesPattern('test', '([a-z]+)*')).not.toThrow();
    });

    it('should handle patterns with regex special characters as literals', () => {
      // Parentheses are escaped, so they match literally
      expect(labelMatchesPattern('(test)', '(test)')).toBe(true);
      expect(labelMatchesPattern('test', '(test)')).toBe(false);

      // Plus signs are escaped
      expect(labelMatchesPattern('a+', 'a+')).toBe(true);
      expect(labelMatchesPattern('aa', 'a+')).toBe(false);

      // Square brackets are escaped
      expect(labelMatchesPattern('[test]', '[test]')).toBe(true);
      expect(labelMatchesPattern('t', '[test]')).toBe(false);
    });
  });
});

describe('findStoriesByLabel', () => {
  let tempDir: string;
  let sdlcRoot: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-sdlc-groupings-test-'));
    sdlcRoot = path.join(tempDir, '.ai-sdlc');
    fs.mkdirSync(sdlcRoot, { recursive: true });
  });

  afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  function createStory(slug: string, labels: string[], status: StoryStatus = 'backlog'): string {
    const storiesFolder = path.join(sdlcRoot, 'stories');
    fs.mkdirSync(storiesFolder, { recursive: true });

    const storyFolder = path.join(storiesFolder, slug);
    fs.mkdirSync(storyFolder, { recursive: true });

    const filePath = path.join(storyFolder, 'story.md');
    const labelsYaml = labels.length > 0 ? `\n  - ${labels.join('\n  - ')}` : ' []';

    const content = `---
id: ${slug}
title: Test Story ${slug}
slug: ${slug}
priority: 10
status: ${status}
type: feature
created: '2024-01-01'
labels:${labelsYaml}
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
---

# Test Story ${slug}

Test content.
`;

    fs.writeFileSync(filePath, content, 'utf-8');
    return filePath;
  }

  it('should return stories with exact label match', () => {
    createStory('story-1', ['epic-test', 'sprint-2024-q1']);
    createStory('story-2', ['epic-test', 'team-backend']);
    createStory('story-3', ['epic-other', 'sprint-2024-q1']);

    const results = findStoriesByLabel(sdlcRoot, 'epic-test');
    expect(results).toHaveLength(2);
    expect(results.map(s => s.frontmatter.id).sort()).toEqual(['story-1', 'story-2']);
  });

  it('should return empty array when no stories match', () => {
    createStory('story-1', ['epic-test']);
    createStory('story-2', ['sprint-2024-q1']);

    const results = findStoriesByLabel(sdlcRoot, 'epic-nonexistent');
    expect(results).toHaveLength(0);
  });

  it('should not return stories with empty labels', () => {
    createStory('story-1', []);
    createStory('story-2', ['epic-test']);

    const results = findStoriesByLabel(sdlcRoot, 'epic-test');
    expect(results).toHaveLength(1);
    expect(results[0].frontmatter.id).toBe('story-2');
  });

  it('should return stories sorted by priority', () => {
    const storiesFolder = path.join(sdlcRoot, 'stories');
    fs.mkdirSync(storiesFolder, { recursive: true });

    // Create stories with different priorities
    for (const [slug, priority] of [['story-high', 5], ['story-low', 20], ['story-mid', 10]]) {
      const storyFolder = path.join(storiesFolder, slug);
      fs.mkdirSync(storyFolder, { recursive: true });

      const content = `---
id: ${slug}
title: Test Story
slug: ${slug}
priority: ${priority}
status: backlog
type: feature
created: '2024-01-01'
labels:
  - epic-test
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
---

# Test Story
`;
      fs.writeFileSync(path.join(storyFolder, 'story.md'), content, 'utf-8');
    }

    const results = findStoriesByLabel(sdlcRoot, 'epic-test');
    expect(results.map(s => s.frontmatter.id)).toEqual(['story-high', 'story-mid', 'story-low']);
  });
});

describe('findStoriesByLabels', () => {
  let tempDir: string;
  let sdlcRoot: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-sdlc-groupings-test-'));
    sdlcRoot = path.join(tempDir, '.ai-sdlc');
    fs.mkdirSync(sdlcRoot, { recursive: true });
  });

  afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  function createStory(slug: string, labels: string[]): void {
    const storiesFolder = path.join(sdlcRoot, 'stories');
    fs.mkdirSync(storiesFolder, { recursive: true });

    const storyFolder = path.join(storiesFolder, slug);
    fs.mkdirSync(storyFolder, { recursive: true });

    const labelsYaml = labels.length > 0 ? `\n  - ${labels.join('\n  - ')}` : ' []';

    const content = `---
id: ${slug}
title: Test Story ${slug}
slug: ${slug}
priority: 10
status: backlog
type: feature
created: '2024-01-01'
labels:${labelsYaml}
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
---

# Test Story ${slug}
`;

    fs.writeFileSync(path.join(storyFolder, 'story.md'), content, 'utf-8');
  }

  describe('mode: all', () => {
    it('should return stories with all specified labels', () => {
      createStory('story-1', ['epic-test', 'sprint-2024-q1', 'team-backend']);
      createStory('story-2', ['epic-test', 'sprint-2024-q1']);
      createStory('story-3', ['epic-test']);

      const results = findStoriesByLabels(sdlcRoot, ['epic-test', 'sprint-2024-q1'], 'all');
      expect(results).toHaveLength(2);
      expect(results.map(s => s.frontmatter.id).sort()).toEqual(['story-1', 'story-2']);
    });

    it('should return empty array when no stories have all labels', () => {
      createStory('story-1', ['epic-test']);
      createStory('story-2', ['sprint-2024-q1']);
      createStory('story-3', ['team-backend']);

      const results = findStoriesByLabels(sdlcRoot, ['epic-test', 'sprint-2024-q1'], 'all');
      expect(results).toHaveLength(0);
    });
  });

  describe('mode: any', () => {
    it('should return stories with at least one specified label', () => {
      createStory('story-1', ['epic-test']);
      createStory('story-2', ['sprint-2024-q1']);
      createStory('story-3', ['team-backend']);
      createStory('story-4', ['other-label']);

      const results = findStoriesByLabels(sdlcRoot, ['epic-test', 'sprint-2024-q1'], 'any');
      expect(results).toHaveLength(2);
      expect(results.map(s => s.frontmatter.id).sort()).toEqual(['story-1', 'story-2']);
    });

    it('should return empty array when no stories have any labels', () => {
      createStory('story-1', ['other-label']);
      createStory('story-2', ['another-label']);

      const results = findStoriesByLabels(sdlcRoot, ['epic-test', 'sprint-2024-q1'], 'any');
      expect(results).toHaveLength(0);
    });
  });

  describe('edge cases', () => {
    it('should return empty array for empty labels input', () => {
      createStory('story-1', ['epic-test']);

      const resultsAll = findStoriesByLabels(sdlcRoot, [], 'all');
      const resultsAny = findStoriesByLabels(sdlcRoot, [], 'any');

      expect(resultsAll).toHaveLength(0);
      expect(resultsAny).toHaveLength(0);
    });

    it('should behave same for single label in both modes', () => {
      createStory('story-1', ['epic-test']);
      createStory('story-2', ['sprint-2024-q1']);

      const resultsAll = findStoriesByLabels(sdlcRoot, ['epic-test'], 'all');
      const resultsAny = findStoriesByLabels(sdlcRoot, ['epic-test'], 'any');

      expect(resultsAll).toEqual(resultsAny);
      expect(resultsAll).toHaveLength(1);
    });
  });
});

describe('findStoriesByPattern', () => {
  let tempDir: string;
  let sdlcRoot: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-sdlc-groupings-test-'));
    sdlcRoot = path.join(tempDir, '.ai-sdlc');
    fs.mkdirSync(sdlcRoot, { recursive: true });
  });

  afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  function createStory(slug: string, labels: string[]): void {
    const storiesFolder = path.join(sdlcRoot, 'stories');
    fs.mkdirSync(storiesFolder, { recursive: true });

    const storyFolder = path.join(storiesFolder, slug);
    fs.mkdirSync(storyFolder, { recursive: true });

    const labelsYaml = labels.length > 0 ? `\n  - ${labels.join('\n  - ')}` : ' []';

    const content = `---
id: ${slug}
title: Test Story ${slug}
slug: ${slug}
priority: 10
status: backlog
type: feature
created: '2024-01-01'
labels:${labelsYaml}
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
---

# Test Story ${slug}
`;

    fs.writeFileSync(path.join(storyFolder, 'story.md'), content, 'utf-8');
  }

  it('should match stories with wildcard patterns', () => {
    createStory('story-1', ['epic-ticketing', 'team-backend']);
    createStory('story-2', ['epic-auth', 'team-frontend']);
    createStory('story-3', ['sprint-2024-q1', 'team-backend']);

    const results = findStoriesByPattern(sdlcRoot, 'epic-*');
    expect(results).toHaveLength(2);
    expect(results.map(s => s.frontmatter.id).sort()).toEqual(['story-1', 'story-2']);
  });

  it('should return empty array for pattern with no matches', () => {
    createStory('story-1', ['epic-test']);
    createStory('story-2', ['sprint-2024-q1']);

    const results = findStoriesByPattern(sdlcRoot, 'team-*');
    expect(results).toHaveLength(0);
  });

  it('should match stories with multiple matching labels', () => {
    createStory('story-1', ['epic-test', 'epic-auth']);

    const results = findStoriesByPattern(sdlcRoot, 'epic-*');
    expect(results).toHaveLength(1);
    expect(results[0].frontmatter.id).toBe('story-1');
  });

  it('should handle special characters in patterns', () => {
    createStory('story-1', ['test.label']);
    createStory('story-2', ['test-label']);

    const results = findStoriesByPattern(sdlcRoot, 'test.label');
    expect(results).toHaveLength(1);
    expect(results[0].frontmatter.id).toBe('story-1');
  });

  it('should return empty array for empty pattern', () => {
    createStory('story-1', ['epic-test']);

    const results = findStoriesByPattern(sdlcRoot, '');
    expect(results).toHaveLength(0);
  });

  it('should handle labels with whitespace literally', () => {
    createStory('story-1', ['label with spaces']);
    createStory('story-2', ['label-no-spaces']);

    const results = findStoriesByPattern(sdlcRoot, 'label with spaces');
    expect(results).toHaveLength(1);
    expect(results[0].frontmatter.id).toBe('story-1');
  });
});

describe('getUniqueLabels', () => {
  let tempDir: string;
  let sdlcRoot: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-sdlc-groupings-test-'));
    sdlcRoot = path.join(tempDir, '.ai-sdlc');
    fs.mkdirSync(sdlcRoot, { recursive: true });
  });

  afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  function createStory(slug: string, labels: string[]): void {
    const storiesFolder = path.join(sdlcRoot, 'stories');
    fs.mkdirSync(storiesFolder, { recursive: true });

    const storyFolder = path.join(storiesFolder, slug);
    fs.mkdirSync(storyFolder, { recursive: true });

    const labelsYaml = labels.length > 0 ? `\n  - ${labels.join('\n  - ')}` : ' []';

    const content = `---
id: ${slug}
title: Test Story ${slug}
slug: ${slug}
priority: 10
status: backlog
type: feature
created: '2024-01-01'
labels:${labelsYaml}
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
---

# Test Story ${slug}
`;

    fs.writeFileSync(path.join(storyFolder, 'story.md'), content, 'utf-8');
  }

  it('should return deduplicated labels', () => {
    createStory('story-1', ['epic-test', 'sprint-2024-q1']);
    createStory('story-2', ['epic-test', 'team-backend']);
    createStory('story-3', ['sprint-2024-q1', 'team-frontend']);

    const labels = getUniqueLabels(sdlcRoot);
    expect(labels).toEqual(['epic-test', 'sprint-2024-q1', 'team-backend', 'team-frontend']);
  });

  it('should return empty array for no stories', () => {
    const labels = getUniqueLabels(sdlcRoot);
    expect(labels).toEqual([]);
  });

  it('should handle stories with empty labels', () => {
    createStory('story-1', []);
    createStory('story-2', ['epic-test']);

    const labels = getUniqueLabels(sdlcRoot);
    expect(labels).toEqual(['epic-test']);
  });

  it('should return sorted labels', () => {
    createStory('story-1', ['zebra', 'alpha', 'beta']);

    const labels = getUniqueLabels(sdlcRoot);
    expect(labels).toEqual(['alpha', 'beta', 'zebra']);
  });
});

describe('getGroupings', () => {
  let tempDir: string;
  let sdlcRoot: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-sdlc-groupings-test-'));
    sdlcRoot = path.join(tempDir, '.ai-sdlc');
    fs.mkdirSync(sdlcRoot, { recursive: true });
  });

  afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  function createStory(slug: string, labels: string[], status: StoryStatus = 'backlog'): void {
    const storiesFolder = path.join(sdlcRoot, 'stories');
    fs.mkdirSync(storiesFolder, { recursive: true });

    const storyFolder = path.join(storiesFolder, slug);
    fs.mkdirSync(storyFolder, { recursive: true });

    const labelsYaml = labels.length > 0 ? `\n  - ${labels.join('\n  - ')}` : ' []';

    const content = `---
id: ${slug}
title: Test Story ${slug}
slug: ${slug}
priority: 10
status: ${status}
type: feature
created: '2024-01-01'
labels:${labelsYaml}
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
---

# Test Story ${slug}
`;

    fs.writeFileSync(path.join(storyFolder, 'story.md'), content, 'utf-8');
  }

  it('should return thematic groupings (epic-*)', () => {
    createStory('story-1', ['epic-ticketing'], 'backlog');
    createStory('story-2', ['epic-ticketing'], 'in-progress');
    createStory('story-3', ['epic-auth'], 'done');

    const groupings = getGroupings(sdlcRoot, 'thematic');
    expect(groupings).toHaveLength(2);

    const ticketing = groupings.find(g => g.id === 'ticketing');
    expect(ticketing).toBeDefined();
    expect(ticketing?.label).toBe('epic-ticketing');
    expect(ticketing?.storyCount).toBe(2);
    expect(ticketing?.statusBreakdown).toEqual({
      backlog: 1,
      ready: 0,
      'in-progress': 1,
      done: 0,
      blocked: 0,
    });

    const auth = groupings.find(g => g.id === 'auth');
    expect(auth).toBeDefined();
    expect(auth?.label).toBe('epic-auth');
    expect(auth?.storyCount).toBe(1);
  });

  it('should return temporal groupings (sprint-*)', () => {
    createStory('story-1', ['sprint-2024-q1'], 'ready');
    createStory('story-2', ['sprint-2024-q1'], 'in-progress');
    createStory('story-3', ['sprint-2024-q2'], 'backlog');

    const groupings = getGroupings(sdlcRoot, 'temporal');
    expect(groupings).toHaveLength(2);

    const q1 = groupings.find(g => g.id === '2024-q1');
    expect(q1).toBeDefined();
    expect(q1?.storyCount).toBe(2);
  });

  it('should return structural groupings (team-*)', () => {
    createStory('story-1', ['team-backend'], 'backlog');
    createStory('story-2', ['team-frontend'], 'in-progress');
    createStory('story-3', ['team-backend', 'team-frontend'], 'done');

    const groupings = getGroupings(sdlcRoot, 'structural');
    expect(groupings).toHaveLength(2);

    const backend = groupings.find(g => g.id === 'backend');
    expect(backend).toBeDefined();
    expect(backend?.storyCount).toBe(2);

    const frontend = groupings.find(g => g.id === 'frontend');
    expect(frontend).toBeDefined();
    expect(frontend?.storyCount).toBe(2);
  });

  it('should return empty array for dimension with no matching labels', () => {
    createStory('story-1', ['other-label']);

    const groupings = getGroupings(sdlcRoot, 'thematic');
    expect(groupings).toEqual([]);
  });

  it('should return empty array for non-existent dimension', () => {
    createStory('story-1', ['epic-test']);

    // TypeScript prevents invalid dimensions at compile time, but testing runtime behavior
    const groupings = getGroupings(sdlcRoot, 'invalid' as any);
    expect(groupings).toEqual([]);
  });

  it('should sort groupings by story count descending', () => {
    createStory('story-1', ['epic-a'], 'backlog');
    createStory('story-2', ['epic-b'], 'backlog');
    createStory('story-3', ['epic-b'], 'backlog');
    createStory('story-4', ['epic-c'], 'backlog');
    createStory('story-5', ['epic-c'], 'backlog');
    createStory('story-6', ['epic-c'], 'backlog');

    const groupings = getGroupings(sdlcRoot, 'thematic');
    expect(groupings.map(g => g.id)).toEqual(['c', 'b', 'a']);
    expect(groupings.map(g => g.storyCount)).toEqual([3, 2, 1]);
  });

  it('should warn when story has multiple labels for single cardinality dimension', () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Create story with multiple epic-* labels (cardinality is 'single')
    createStory('story-1', ['epic-auth', 'epic-ticketing'], 'backlog');

    const groupings = getGroupings(sdlcRoot, 'thematic');

    // Should still return both groupings
    expect(groupings).toHaveLength(2);
    expect(groupings.find(g => g.id === 'auth')).toBeDefined();
    expect(groupings.find(g => g.id === 'ticketing')).toBeDefined();

    // Should have warned about cardinality violation
    expect(consoleWarnSpy).toHaveBeenCalled();
    const warningMessage = consoleWarnSpy.mock.calls[0][0];
    expect(warningMessage).toContain('Story story-1 has multiple thematic labels');
    expect(warningMessage).toContain('epic-auth');
    expect(warningMessage).toContain('epic-ticketing');
    expect(warningMessage).toContain("cardinality is 'single'");

    consoleWarnSpy.mockRestore();
  });
});

describe('Configuration', () => {
  let tempDir: string;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-sdlc-config-test-'));
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should load default groupings when no config file exists', () => {
    const config = loadConfig(tempDir);
    expect(config.groupings).toBeUndefined(); // Optional field, undefined means use defaults at runtime
  });

  it('should load custom groupings from config file', () => {
    const configPath = path.join(tempDir, '.ai-sdlc.json');
    const customConfig = {
      groupings: [
        {
          dimension: 'thematic',
          prefix: 'feature-',
          cardinality: 'single',
        },
        {
          dimension: 'temporal',
          prefix: 'release-',
          cardinality: 'single',
        },
      ],
    };

    fs.writeFileSync(configPath, JSON.stringify(customConfig, null, 2));

    const config = loadConfig(tempDir);
    expect(config.groupings).toHaveLength(2);
    expect(config.groupings?.[0].prefix).toBe('feature-');
    expect(config.groupings?.[1].prefix).toBe('release-');
  });

  it('should validate and reject invalid groupings config', () => {
    const configPath = path.join(tempDir, '.ai-sdlc.json');
    const invalidConfig = {
      groupings: [
        {
          dimension: 'invalid-dimension', // Invalid dimension
          prefix: 'epic-',
          cardinality: 'single',
        },
      ],
    };

    fs.writeFileSync(configPath, JSON.stringify(invalidConfig, null, 2));

    const config = loadConfig(tempDir);
    expect(config.groupings).toBeUndefined(); // Should fall back to undefined
    expect(consoleWarnSpy).toHaveBeenCalled();
  });

  it('should accept externalMapping in config', () => {
    const configPath = path.join(tempDir, '.ai-sdlc.json');
    const configWithMapping = {
      groupings: [
        {
          dimension: 'thematic',
          prefix: 'epic-',
          cardinality: 'single',
          externalMapping: {
            system: 'jira',
            field: 'epic',
          },
        },
      ],
    };

    fs.writeFileSync(configPath, JSON.stringify(configWithMapping, null, 2));

    const config = loadConfig(tempDir);
    expect(config.groupings).toHaveLength(1);
    expect(config.groupings?.[0].externalMapping).toEqual({
      system: 'jira',
      field: 'epic',
    });
  });

  it('should reject invalid externalMapping structure', () => {
    const configPath = path.join(tempDir, '.ai-sdlc.json');
    const invalidConfig = {
      groupings: [
        {
          dimension: 'thematic',
          prefix: 'epic-',
          cardinality: 'single',
          externalMapping: {
            system: 123, // Invalid type (should be string)
            field: 'epic',
          },
        },
      ],
    };

    fs.writeFileSync(configPath, JSON.stringify(invalidConfig, null, 2));

    const config = loadConfig(tempDir);
    expect(config.groupings).toBeUndefined();
    expect(consoleWarnSpy).toHaveBeenCalled();
  });
});
