import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { parseStory } from '../core/story.js';
import { run } from './commands.js';

vi.mock('./daemon.js', () => ({
  startDaemon: vi.fn().mockResolvedValue(undefined),
}));

describe('run command feature request intake', () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ai-sdlc-run-request-')));
    fs.mkdirSync(path.join(tempDir, '.ai-sdlc', 'stories'), { recursive: true });
    process.chdir(tempDir);
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('creates a story from --request before starting daemon mode', async () => {
    const { startDaemon } = await import('./daemon.js');

    const result = await run({
      request: 'Add billing alerts when usage reaches 80 percent',
      watch: true,
      maxIterations: '7',
      verbose: true,
    });

    expect(result.success).toBe(true);
    expect(startDaemon).toHaveBeenCalledWith({ maxIterations: 7, verbose: true });

    const storiesFolder = path.join(tempDir, '.ai-sdlc', 'stories');
    const storyDirs = fs.readdirSync(storiesFolder);
    expect(storyDirs).toHaveLength(1);

    const story = parseStory(path.join(storiesFolder, storyDirs[0], 'story.md'));
    expect(story.frontmatter.title).toBe('Add billing alerts when usage reaches 80 percent');
    expect(story.content).toContain('## Feature Request');
  });

  it('rejects --grill-me without a feature request', async () => {
    const result = await run({ grillMe: true });

    expect(result.success).toBe(false);
  });
});
