import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { PassThrough } from 'stream';
import {
  createDefaultTuiCommandHandlers,
  startTui,
  TuiSession,
  type TuiCommandHandlers,
} from '../../src/cli/tui.js';
import { getSdlcRoot } from '../../src/core/config.js';
import { initializeKanban } from '../../src/core/kanban.js';
import { parseStory } from '../../src/core/story.js';

function createHandlers(): TuiCommandHandlers {
  return {
    add: vi.fn().mockResolvedValue(undefined),
    run: vi.fn().mockResolvedValue({ success: true }),
    status: vi.fn().mockResolvedValue(undefined),
    details: vi.fn().mockResolvedValue(undefined),
    checkProviderConfiguration: vi.fn().mockReturnValue(true),
  };
}

describe.sequential('TUI integration', () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ai-sdlc-tui-')));
    process.chdir(tempDir);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('runs an interactive slash-command session over stdin and stdout streams', async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const handlers = createHandlers();
    let rendered = '';

    output.on('data', (chunk) => {
      rendered += chunk.toString();
    });

    const session = startTui({ input, output, handlers });

    input.write('/add Stream story\n');
    input.write('/work stream-story\n');
    input.write('/exit\n');
    input.end();

    await session;

    expect(handlers.add).toHaveBeenCalledWith('Stream story', { grillMe: false });
    expect(handlers.run).toHaveBeenCalledWith({ auto: true, story: 'stream-story' });
    expect(rendered).toContain('AI-SDLC TUI');
    expect(rendered).toContain('ai-sdlc>');
    expect(rendered).toContain('Bye.');
  });

  it('reports parser errors and keeps the session alive for the next command', async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    let rendered = '';

    output.on('data', (chunk) => {
      rendered += chunk.toString();
    });

    const session = startTui({ input, output, handlers: createHandlers() });

    input.write('/unknown\n');
    input.write('/exit\n');
    input.end();

    await session;

    expect(rendered).toContain('Unknown command "/unknown". Type /help for available commands.');
    expect(rendered).toContain('Bye.');
  });

  it('creates a real story and dry-runs workflow processing from slash commands', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    initializeKanban(getSdlcRoot());

    const output: string[] = [];
    const session = new TuiSession(createDefaultTuiCommandHandlers(), {
      writeLine: (line) => output.push(line),
    });

    await session.handleLine('/add TUI created story');
    await session.handleLine('/run --auto --dry-run');
    const shouldContinue = await session.handleLine('/quit');

    const storyDirs = fs.readdirSync(path.join(tempDir, '.ai-sdlc', 'stories'));
    expect(storyDirs).toHaveLength(1);

    const story = parseStory(path.join(tempDir, '.ai-sdlc', 'stories', storyDirs[0], 'story.md'));
    expect(story.frontmatter.title).toBe('TUI created story');
    expect(shouldContinue).toBe(false);
    expect(output).toContain('Bye.');
  });
});
