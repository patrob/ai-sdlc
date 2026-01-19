import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { findStoriesByEpic, findStoriesBySprint, findStoriesByTeam, getUniqueLabels, getGroupings } from '../../src/core/kanban.js';

describe('Grouping Queries Integration', () => {
  let tempDir: string;
  let sdlcRoot: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-sdlc-grouping-integration-'));
    sdlcRoot = path.join(tempDir, '.ai-sdlc');
    fs.mkdirSync(sdlcRoot, { recursive: true });

    // Create sample stories with various grouping labels
    createStory('S-001', ['epic-ticketing-integration', 'sprint-2024-q1', 'team-backend'], 'backlog');
    createStory('S-002', ['epic-ticketing-integration', 'sprint-2024-q1', 'team-frontend'], 'ready');
    createStory('S-003', ['epic-ticketing-integration', 'sprint-2024-q2', 'team-backend'], 'in-progress');
    createStory('S-004', ['epic-auth', 'sprint-2024-q1', 'team-backend'], 'done');
    createStory('S-005', ['epic-auth', 'sprint-2024-q2', 'team-frontend'], 'backlog');
  });

  afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  function createStory(id: string, labels: string[], status: string): void {
    const storiesFolder = path.join(sdlcRoot, 'stories');
    fs.mkdirSync(storiesFolder, { recursive: true });

    const storyFolder = path.join(storiesFolder, id);
    fs.mkdirSync(storyFolder, { recursive: true });

    const labelsYaml = labels.length > 0 ? `\n  - ${labels.join('\n  - ')}` : ' []';

    const content = `---
id: ${id}
title: Test Story ${id}
slug: ${id}
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

# Test Story ${id}

Test content for ${id}.
`;

    fs.writeFileSync(path.join(storyFolder, 'story.md'), content, 'utf-8');
  }

  describe('Epic queries', () => {
    it('should find all stories in epic-ticketing-integration', () => {
      const stories = findStoriesByEpic(sdlcRoot, 'ticketing-integration');
      expect(stories).toHaveLength(3);
      expect(stories.map(s => s.frontmatter.id).sort()).toEqual(['S-001', 'S-002', 'S-003']);
    });

    it('should find all stories in epic-auth', () => {
      const stories = findStoriesByEpic(sdlcRoot, 'auth');
      expect(stories).toHaveLength(2);
      expect(stories.map(s => s.frontmatter.id).sort()).toEqual(['S-004', 'S-005']);
    });

    it('should return empty array for non-existent epic', () => {
      const stories = findStoriesByEpic(sdlcRoot, 'nonexistent');
      expect(stories).toHaveLength(0);
    });
  });

  describe('Sprint queries', () => {
    it('should find all stories in sprint-2024-q1', () => {
      const stories = findStoriesBySprint(sdlcRoot, '2024-q1');
      expect(stories).toHaveLength(3);
      expect(stories.map(s => s.frontmatter.id).sort()).toEqual(['S-001', 'S-002', 'S-004']);
    });

    it('should find all stories in sprint-2024-q2', () => {
      const stories = findStoriesBySprint(sdlcRoot, '2024-q2');
      expect(stories).toHaveLength(2);
      expect(stories.map(s => s.frontmatter.id).sort()).toEqual(['S-003', 'S-005']);
    });
  });

  describe('Team queries', () => {
    it('should find all stories for team-backend', () => {
      const stories = findStoriesByTeam(sdlcRoot, 'backend');
      expect(stories).toHaveLength(3);
      expect(stories.map(s => s.frontmatter.id).sort()).toEqual(['S-001', 'S-003', 'S-004']);
    });

    it('should find all stories for team-frontend', () => {
      const stories = findStoriesByTeam(sdlcRoot, 'frontend');
      expect(stories).toHaveLength(2);
      expect(stories.map(s => s.frontmatter.id).sort()).toEqual(['S-002', 'S-005']);
    });
  });

  describe('Unique labels discovery', () => {
    it('should return all unique labels across stories', () => {
      const labels = getUniqueLabels(sdlcRoot);
      expect(labels).toHaveLength(6);
      expect(labels).toContain('epic-ticketing-integration');
      expect(labels).toContain('epic-auth');
      expect(labels).toContain('sprint-2024-q1');
      expect(labels).toContain('sprint-2024-q2');
      expect(labels).toContain('team-backend');
      expect(labels).toContain('team-frontend');
    });
  });

  describe('Groupings discovery', () => {
    it('should discover thematic groupings (epics)', () => {
      const groupings = getGroupings(sdlcRoot, 'thematic');
      expect(groupings).toHaveLength(2);

      const ticketing = groupings.find(g => g.id === 'ticketing-integration');
      expect(ticketing).toBeDefined();
      expect(ticketing?.storyCount).toBe(3);
      expect(ticketing?.statusBreakdown).toEqual({
        backlog: 1,
        ready: 1,
        'in-progress': 1,
        done: 0,
        blocked: 0,
      });

      const auth = groupings.find(g => g.id === 'auth');
      expect(auth).toBeDefined();
      expect(auth?.storyCount).toBe(2);
      expect(auth?.statusBreakdown).toEqual({
        backlog: 1,
        ready: 0,
        'in-progress': 0,
        done: 1,
        blocked: 0,
      });
    });

    it('should discover temporal groupings (sprints)', () => {
      const groupings = getGroupings(sdlcRoot, 'temporal');
      expect(groupings).toHaveLength(2);

      const q1 = groupings.find(g => g.id === '2024-q1');
      expect(q1).toBeDefined();
      expect(q1?.storyCount).toBe(3);

      const q2 = groupings.find(g => g.id === '2024-q2');
      expect(q2).toBeDefined();
      expect(q2?.storyCount).toBe(2);
    });

    it('should discover structural groupings (teams)', () => {
      const groupings = getGroupings(sdlcRoot, 'structural');
      expect(groupings).toHaveLength(2);

      const backend = groupings.find(g => g.id === 'backend');
      expect(backend).toBeDefined();
      expect(backend?.storyCount).toBe(3);

      const frontend = groupings.find(g => g.id === 'frontend');
      expect(frontend).toBeDefined();
      expect(frontend?.storyCount).toBe(2);
    });

    it('should sort groupings by story count descending', () => {
      const groupings = getGroupings(sdlcRoot, 'thematic');
      expect(groupings[0].storyCount).toBeGreaterThanOrEqual(groupings[1].storyCount);
    });
  });
});
