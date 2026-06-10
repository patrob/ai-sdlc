import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { moveToBlocked, parseStory, sanitizeReasonText, unblockStory, getStory, writeStory, findStoryById, sanitizeTitle, extractTitleFromContent, createStory, autoCompleteStoryAfterReview } from './story.js';
import { BLOCKED_DIR, ReviewDecision, ReviewResult, Config } from '../types/index.js';

describe('Story ticket fields integration', () => {
  let tempDir: string;
  let sdlcRoot: string;

  beforeEach(() => {
    tempDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ai-sdlc-test-')));
    sdlcRoot = path.join(tempDir, '.ai-sdlc');
    fs.mkdirSync(sdlcRoot, { recursive: true });
  });

  afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  function createTestStoryWithTicketFields(): string {
    const storiesFolder = path.join(sdlcRoot, 'stories');
    fs.mkdirSync(storiesFolder, { recursive: true });

    const storyId = 'S-0001';
    const storyFolder = path.join(storiesFolder, storyId);
    fs.mkdirSync(storyFolder, { recursive: true });

    const filePath = path.join(storyFolder, 'story.md');

    const content = `---
id: ${storyId}
title: Test Story with Ticket
slug: test-story-with-ticket
priority: 10
status: backlog
type: feature
created: '2024-01-01'
labels: []
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
ticket_provider: github
ticket_id: '123'
ticket_url: https://github.com/org/repo/issues/123
ticket_synced_at: '2026-01-19T10:00:00Z'
---

# Test Story with Ticket

Test content
`;

    fs.writeFileSync(filePath, content);
    return filePath;
  }

  function createTestStoryWithoutTicketFields(): string {
    const storiesFolder = path.join(sdlcRoot, 'stories');
    fs.mkdirSync(storiesFolder, { recursive: true });

    const storyId = 'S-0002';
    const storyFolder = path.join(storiesFolder, storyId);
    fs.mkdirSync(storyFolder, { recursive: true });

    const filePath = path.join(storyFolder, 'story.md');

    const content = `---
id: ${storyId}
title: Test Story without Ticket
slug: test-story-without-ticket
priority: 20
status: backlog
type: feature
created: '2024-01-01'
labels: []
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
---

# Test Story without Ticket

Test content
`;

    fs.writeFileSync(filePath, content);
    return filePath;
  }

  function createTestStoryWithPartialTicketFields(): string {
    const storiesFolder = path.join(sdlcRoot, 'stories');
    fs.mkdirSync(storiesFolder, { recursive: true });

    const storyId = 'S-0003';
    const storyFolder = path.join(storiesFolder, storyId);
    fs.mkdirSync(storyFolder, { recursive: true });

    const filePath = path.join(storyFolder, 'story.md');

    const content = `---
id: ${storyId}
title: Test Story with Partial Ticket
slug: test-story-with-partial-ticket
priority: 30
status: backlog
type: feature
created: '2024-01-01'
labels: []
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
ticket_provider: jira
ticket_id: 'PROJ-456'
---

# Test Story with Partial Ticket

Test content
`;

    fs.writeFileSync(filePath, content);
    return filePath;
  }

  describe('parseStory', () => {
    it('should parse story with all ticket fields', () => {
      const storyPath = createTestStoryWithTicketFields();
      const story = parseStory(storyPath);

      expect(story.frontmatter.ticket_provider).toBe('github');
      expect(story.frontmatter.ticket_id).toBe('123');
      expect(story.frontmatter.ticket_url).toBe('https://github.com/org/repo/issues/123');
      expect(story.frontmatter.ticket_synced_at).toBe('2026-01-19T10:00:00Z');
    });

    it('should parse story without ticket fields (backward compatibility)', () => {
      const storyPath = createTestStoryWithoutTicketFields();
      const story = parseStory(storyPath);

      expect(story.frontmatter.ticket_provider).toBeUndefined();
      expect(story.frontmatter.ticket_id).toBeUndefined();
      expect(story.frontmatter.ticket_url).toBeUndefined();
      expect(story.frontmatter.ticket_synced_at).toBeUndefined();
      // Verify other fields still parse correctly
      expect(story.frontmatter.id).toBe('S-0002');
      expect(story.frontmatter.title).toBe('Test Story without Ticket');
    });

    it('should parse story with partial ticket fields', () => {
      const storyPath = createTestStoryWithPartialTicketFields();
      const story = parseStory(storyPath);

      expect(story.frontmatter.ticket_provider).toBe('jira');
      expect(story.frontmatter.ticket_id).toBe('PROJ-456');
      expect(story.frontmatter.ticket_url).toBeUndefined();
      expect(story.frontmatter.ticket_synced_at).toBeUndefined();
    });

    it('should parse different ticket providers', () => {
      const storiesFolder = path.join(sdlcRoot, 'stories');
      fs.mkdirSync(storiesFolder, { recursive: true });

      // Test GitHub provider
      const githubStoryFolder = path.join(storiesFolder, 'S-0010');
      fs.mkdirSync(githubStoryFolder, { recursive: true });
      const githubPath = path.join(githubStoryFolder, 'story.md');
      fs.writeFileSync(githubPath, `---
id: S-0010
title: GitHub Story
slug: github-story
priority: 10
status: backlog
type: feature
created: '2024-01-01'
labels: []
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
ticket_provider: github
---
# GitHub Story
`);
      const githubStory = parseStory(githubPath);
      expect(githubStory.frontmatter.ticket_provider).toBe('github');

      // Test Jira provider
      const jiraStoryFolder = path.join(storiesFolder, 'S-0011');
      fs.mkdirSync(jiraStoryFolder, { recursive: true });
      const jiraPath = path.join(jiraStoryFolder, 'story.md');
      fs.writeFileSync(jiraPath, `---
id: S-0011
title: Jira Story
slug: jira-story
priority: 20
status: backlog
type: feature
created: '2024-01-01'
labels: []
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
ticket_provider: jira
---
# Jira Story
`);
      const jiraStory = parseStory(jiraPath);
      expect(jiraStory.frontmatter.ticket_provider).toBe('jira');

      // Test Linear provider
      const linearStoryFolder = path.join(storiesFolder, 'S-0012');
      fs.mkdirSync(linearStoryFolder, { recursive: true });
      const linearPath = path.join(linearStoryFolder, 'story.md');
      fs.writeFileSync(linearPath, `---
id: S-0012
title: Linear Story
slug: linear-story
priority: 30
status: backlog
type: feature
created: '2024-01-01'
labels: []
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
ticket_provider: linear
---
# Linear Story
`);
      const linearStory = parseStory(linearPath);
      expect(linearStory.frontmatter.ticket_provider).toBe('linear');
    });
  });

  describe('writeStory', () => {
    it('should preserve ticket fields when writing', async () => {
      const storyPath = createTestStoryWithTicketFields();
      let story = parseStory(storyPath);

      // Verify fields are present before write
      expect(story.frontmatter.ticket_provider).toBe('github');
      expect(story.frontmatter.ticket_id).toBe('123');

      // Write story back to disk
      await writeStory(story);

      // Re-read and verify fields are preserved
      const reloadedStory = parseStory(storyPath);
      expect(reloadedStory.frontmatter.ticket_provider).toBe('github');
      expect(reloadedStory.frontmatter.ticket_id).toBe('123');
      expect(reloadedStory.frontmatter.ticket_url).toBe('https://github.com/org/repo/issues/123');
      expect(reloadedStory.frontmatter.ticket_synced_at).toBe('2026-01-19T10:00:00Z');
    });

    it('should work without ticket fields (backward compatibility)', async () => {
      const storyPath = createTestStoryWithoutTicketFields();
      let story = parseStory(storyPath);

      // Verify no ticket fields
      expect(story.frontmatter.ticket_provider).toBeUndefined();

      // Write story back to disk
      await writeStory(story);

      // Re-read and verify still no ticket fields
      const reloadedStory = parseStory(storyPath);
      expect(reloadedStory.frontmatter.ticket_provider).toBeUndefined();
      expect(reloadedStory.frontmatter.ticket_id).toBeUndefined();
      expect(reloadedStory.frontmatter.ticket_url).toBeUndefined();
      expect(reloadedStory.frontmatter.ticket_synced_at).toBeUndefined();
      // Verify other fields are still correct
      expect(reloadedStory.frontmatter.id).toBe('S-0002');
      expect(reloadedStory.frontmatter.title).toBe('Test Story without Ticket');
    });

    it('should allow adding ticket fields to existing story', async () => {
      const storyPath = createTestStoryWithoutTicketFields();
      let story = parseStory(storyPath);

      // Initially no ticket fields
      expect(story.frontmatter.ticket_provider).toBeUndefined();

      // Add ticket fields
      story.frontmatter.ticket_provider = 'github';
      story.frontmatter.ticket_id = '999';
      story.frontmatter.ticket_url = 'https://github.com/org/repo/issues/999';
      story.frontmatter.ticket_synced_at = '2026-01-27T12:00:00Z';

      // Write story back
      await writeStory(story);

      // Re-read and verify fields were added
      const reloadedStory = parseStory(storyPath);
      expect(reloadedStory.frontmatter.ticket_provider).toBe('github');
      expect(reloadedStory.frontmatter.ticket_id).toBe('999');
      expect(reloadedStory.frontmatter.ticket_url).toBe('https://github.com/org/repo/issues/999');
      expect(reloadedStory.frontmatter.ticket_synced_at).toBe('2026-01-27T12:00:00Z');
    });

    it('should allow updating ticket fields', async () => {
      const storyPath = createTestStoryWithTicketFields();
      let story = parseStory(storyPath);

      // Update ticket fields
      story.frontmatter.ticket_id = '456';
      story.frontmatter.ticket_url = 'https://github.com/org/repo/issues/456';
      story.frontmatter.ticket_synced_at = '2026-01-27T14:00:00Z';

      // Write story back
      await writeStory(story);

      // Re-read and verify fields were updated
      const reloadedStory = parseStory(storyPath);
      expect(reloadedStory.frontmatter.ticket_provider).toBe('github'); // unchanged
      expect(reloadedStory.frontmatter.ticket_id).toBe('456'); // updated
      expect(reloadedStory.frontmatter.ticket_url).toBe('https://github.com/org/repo/issues/456'); // updated
      expect(reloadedStory.frontmatter.ticket_synced_at).toBe('2026-01-27T14:00:00Z'); // updated
    });

    it('should handle ISO timestamp format for ticket_synced_at', async () => {
      const storyPath = createTestStoryWithoutTicketFields();
      let story = parseStory(storyPath);

      // Add ticket with ISO timestamp
      const syncTime = new Date('2026-01-27T15:30:00.000Z').toISOString();
      story.frontmatter.ticket_provider = 'linear';
      story.frontmatter.ticket_id = 'LIN-789';
      story.frontmatter.ticket_synced_at = syncTime;

      await writeStory(story);

      // Re-read and verify timestamp is preserved as string
      const reloadedStory = parseStory(storyPath);
      expect(reloadedStory.frontmatter.ticket_synced_at).toBe(syncTime);
      // Verify it's a valid ISO timestamp
      const parsedDate = new Date(reloadedStory.frontmatter.ticket_synced_at!);
      expect(parsedDate.getTime()).toBeGreaterThan(0);
    });
  });

  describe('round-trip persistence', () => {
    it('should maintain ticket field values through multiple write cycles', async () => {
      const storyPath = createTestStoryWithTicketFields();
      let story = parseStory(storyPath);

      const originalProvider = story.frontmatter.ticket_provider;
      const originalId = story.frontmatter.ticket_id;
      const originalUrl = story.frontmatter.ticket_url;
      const originalSynced = story.frontmatter.ticket_synced_at;

      // Write and re-read 3 times
      for (let i = 0; i < 3; i++) {
        await writeStory(story);
        story = parseStory(storyPath);
      }

      // Verify fields are still identical
      expect(story.frontmatter.ticket_provider).toBe(originalProvider);
      expect(story.frontmatter.ticket_id).toBe(originalId);
      expect(story.frontmatter.ticket_url).toBe(originalUrl);
      expect(story.frontmatter.ticket_synced_at).toBe(originalSynced);
    });
  });
});
