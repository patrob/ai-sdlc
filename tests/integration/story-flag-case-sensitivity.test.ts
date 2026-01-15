import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { run } from '../../src/cli/commands.js';
import { getSdlcRoot } from '../../src/core/config.js';
import { initializeKanban } from '../../src/core/kanban.js';
import { findStoryById } from '../../src/core/story.js';
import { STORIES_FOLDER } from '../../src/types/index.js';
import { globSync } from 'glob';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test fixture directory
const TEST_FIXTURE_DIR = path.join(__dirname, '../fixtures/story-flag-case-test');

describe('Story Flag Case Sensitivity Integration', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Clean up test fixtures
    if (fs.existsSync(TEST_FIXTURE_DIR)) {
      fs.rmSync(TEST_FIXTURE_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(TEST_FIXTURE_DIR, { recursive: true });

    // Set SDLC root for testing
    process.env.AI_SDLC_ROOT = TEST_FIXTURE_DIR;

    const sdlcRoot = getSdlcRoot();

    // Initialize kanban structure
    initializeKanban(sdlcRoot);

    // Mock console.log to capture output
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore console.log
    consoleLogSpy.mockRestore();

    // Clean up test directory
    if (fs.existsSync(TEST_FIXTURE_DIR)) {
      fs.rmSync(TEST_FIXTURE_DIR, { recursive: true, force: true });
    }

    // Clear environment variable
    delete process.env.AI_SDLC_ROOT;
  });

  describe('findStoryById path matching with glob', () => {
    it('should return path that matches glob.sync output for uppercase directory', () => {
      const sdlcRoot = getSdlcRoot();

      // Create story with uppercase directory name
      const storyId = 'S-TEST-UPPER';
      const storyDir = path.join(sdlcRoot, STORIES_FOLDER, storyId);
      fs.mkdirSync(storyDir, { recursive: true });
      const storyContent = `---
id: ${storyId}
title: Test Case Sensitivity
slug: test-case-sensitivity
priority: 10
status: in-progress
type: feature
created: 2024-01-01
labels: []
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
---

# Test Case Sensitivity
`;
      fs.writeFileSync(path.join(storyDir, 'story.md'), storyContent);

      // Query with lowercase input
      const story = findStoryById(sdlcRoot, 's-test-upper');

      // Get paths from glob (simulating what assessState does)
      const globPattern = path.join(sdlcRoot, STORIES_FOLDER, '*', 'story.md');
      const globPaths = globSync(globPattern);

      // Verify story was found
      expect(story).not.toBeNull();

      // Verify the returned path matches the glob path EXACTLY
      // This is the critical assertion - the bug was that these paths differed
      const matchingGlobPath = globPaths.find(p => p.includes('S-TEST-UPPER'));
      expect(matchingGlobPath).toBeDefined();
      expect(story!.path).toBe(matchingGlobPath);
    });

    it('should find story with lowercase input when directory is uppercase', () => {
      const sdlcRoot = getSdlcRoot();

      // Create story with uppercase directory
      const storyId = 'S-0099';
      const storyDir = path.join(sdlcRoot, STORIES_FOLDER, storyId);
      fs.mkdirSync(storyDir, { recursive: true });
      const storyContent = `---
id: ${storyId}
title: Uppercase Directory Test
slug: uppercase-directory-test
priority: 10
status: ready
type: feature
created: 2024-01-01
labels: []
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
---

# Uppercase Directory Test
`;
      fs.writeFileSync(path.join(storyDir, 'story.md'), storyContent);

      // Query with lowercase
      const story = findStoryById(sdlcRoot, 's-0099');

      expect(story).not.toBeNull();
      expect(story!.frontmatter.id).toBe('S-0099');
      // Path should contain the actual filesystem casing
      expect(story!.path).toContain('S-0099');
    });
  });

  describe('run command with --story flag validation', () => {
    it('should show error for invalid story ID format with path traversal', async () => {
      // Call run with invalid story ID containing path traversal
      await run({ story: '../etc/passwd', force: false });

      const output = consoleLogSpy.mock.calls
        .map((call: unknown[]) => String(call[0] || ''))
        .join('\n');
      expect(output).toContain('Invalid story ID format');
    });

    it('should show error for story ID with special characters', async () => {
      // Call run with invalid story ID containing special chars
      await run({ story: 'story;rm -rf', force: false });

      const output = consoleLogSpy.mock.calls
        .map((call: unknown[]) => String(call[0] || ''))
        .join('\n');
      expect(output).toContain('Invalid story ID format');
    });
  });

  describe('security - path traversal prevention', () => {
    it('should reject story ID with path traversal sequences', () => {
      const sdlcRoot = getSdlcRoot();

      // These should all return null (rejected by validation)
      expect(findStoryById(sdlcRoot, '../../../etc/passwd')).toBeNull();
      expect(findStoryById(sdlcRoot, '..\\..\\windows\\system32')).toBeNull();
      expect(findStoryById(sdlcRoot, 'story/../other')).toBeNull();
      expect(findStoryById(sdlcRoot, '/etc/passwd')).toBeNull();
    });

    it('should reject empty story ID', () => {
      const sdlcRoot = getSdlcRoot();
      expect(findStoryById(sdlcRoot, '')).toBeNull();
    });
  });
});
