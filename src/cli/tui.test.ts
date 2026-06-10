import { describe, expect, it, vi } from 'vitest';

import {
  completeTuiInput,
  formatTuiHelp,
  parseTuiInput,
  type TuiCommandHandlers,
  TuiSession,
} from './tui.js';

function createHandlers(): TuiCommandHandlers {
  return {
    add: vi.fn().mockResolvedValue(undefined),
    run: vi.fn().mockResolvedValue({ success: true }),
    status: vi.fn().mockResolvedValue(undefined),
    details: vi.fn().mockResolvedValue(undefined),
    checkProviderConfiguration: vi.fn().mockReturnValue(true),
  };
}

describe('TUI command parser', () => {
  it('parses /add with a multi-word story title', () => {
    expect(parseTuiInput('/add Add billing usage alerts')).toEqual({
      ok: true,
      command: {
        kind: 'add',
        title: 'Add billing usage alerts',
        grillMe: false,
      },
    });
  });

  it('parses /grill-me as clarified story intake', () => {
    expect(parseTuiInput('/grill-me Customers need API key rotation')).toEqual({
      ok: true,
      command: {
        kind: 'add',
        title: 'Customers need API key rotation',
        grillMe: true,
      },
    });
  });

  it('parses /run flags used for day-to-day story work', () => {
    expect(parseTuiInput('/run --auto --story S-0001 --dry-run')).toEqual({
      ok: true,
      command: {
        kind: 'run',
        options: {
          auto: true,
          story: 'S-0001',
          dryRun: true,
        },
      },
    });
  });

  it('parses /work as the shortcut for full SDLC execution', () => {
    expect(parseTuiInput('/work implement-login')).toEqual({
      ok: true,
      command: {
        kind: 'run',
        options: {
          auto: true,
          story: 'implement-login',
        },
      },
    });
  });

  it('rejects unknown commands with a useful message', () => {
    expect(parseTuiInput('/nope')).toEqual({
      ok: false,
      error: 'Unknown command "/nope". Type /help for available commands.',
    });
  });
});

describe('TUI session', () => {
  it('ignores empty lines without printing help or invoking handlers', async () => {
    const handlers = createHandlers();
    const lines: string[] = [];
    const session = new TuiSession(handlers, {
      writeLine: (line) => lines.push(line),
    });

    const shouldContinue = await session.handleLine('   ');

    expect(shouldContinue).toBe(true);
    expect(lines).toEqual([]);
    expect(handlers.add).not.toHaveBeenCalled();
    expect(handlers.run).not.toHaveBeenCalled();
    expect(handlers.status).not.toHaveBeenCalled();
    expect(handlers.details).not.toHaveBeenCalled();
  });

  it('executes slash commands through injected CLI handlers', async () => {
    const handlers = createHandlers();
    const lines: string[] = [];
    const session = new TuiSession(handlers, {
      writeLine: (line) => lines.push(line),
    });

    await session.handleLine('/add Add usage alerts');
    await session.handleLine('/run --auto --story S-0001');
    const shouldContinue = await session.handleLine('/exit');

    expect(handlers.add).toHaveBeenCalledWith('Add usage alerts', { grillMe: false });
    expect(handlers.run).toHaveBeenCalledWith({ auto: true, story: 'S-0001' });
    expect(shouldContinue).toBe(false);
    expect(lines).toContain('Bye.');
  });

  it('checks provider configuration before AI-backed commands', async () => {
    const handlers = createHandlers();
    const session = new TuiSession(handlers, {
      writeLine: vi.fn(),
    });

    await session.handleLine('/grill-me Add self-service invoices');
    await session.handleLine('/run --auto --story S-0001');
    await session.handleLine('/run --dry-run');

    expect(handlers.checkProviderConfiguration).toHaveBeenCalledTimes(2);
  });

  it('renders help and tab completions for slash commands', async () => {
    const help = formatTuiHelp();
    expect(help).toContain('/add <title>');
    expect(help).toContain('/work [story-id]');

    expect(completeTuiInput('/r')).toEqual([['/run'], '/r']);
  });
});
