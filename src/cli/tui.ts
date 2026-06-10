import * as readline from 'readline';

import { loadConfig } from '../core/config.js';
import { getThemedChalk } from '../core/theme.js';
import { ProviderRegistry } from '../providers/index.js';
import { add, details, run, type RunResult,status } from './commands.js';

export interface TuiRunOptions {
  auto?: boolean;
  dryRun?: boolean;
  continue?: boolean;
  story?: string;
  step?: string;
  maxIterations?: string;
  watch?: boolean;
  verbose?: boolean;
  force?: boolean;
}

export type TuiCommand =
  | { kind: 'noop' }
  | { kind: 'help' }
  | { kind: 'exit' }
  | { kind: 'status'; options: { active?: boolean } }
  | { kind: 'details'; id: string }
  | { kind: 'add'; title: string; grillMe: boolean }
  | { kind: 'run'; options: TuiRunOptions };

export type TuiParseResult =
  | { ok: true; command: TuiCommand }
  | { ok: false; error: string };

export interface TuiCommandHandlers {
  add(title: string, options: { grillMe?: boolean }): Promise<void>;
  run(options: TuiRunOptions): Promise<RunResult | void>;
  status(options: { active?: boolean }): Promise<void>;
  details(id: string): Promise<void>;
  checkProviderConfiguration?(): boolean;
}

export interface TuiOutput {
  writeLine(line: string): void;
}

const SLASH_COMMANDS = [
  '/help',
  '/status',
  '/add',
  '/grill-me',
  '/run',
  '/work',
  '/details',
  '/exit',
  '/quit',
];

function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let quote: '"' | '\'' | undefined;

  for (let index = 0; index < input.length; index++) {
    const char = input[index];

    if (quote) {
      if (char === quote) {
        quote = undefined;
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"' || char === '\'') {
      quote = char;
      continue;
    }

    if (/\s/.test(char)) {
      if (current.length > 0) {
        tokens.push(current);
        current = '';
      }
      continue;
    }

    current += char;
  }

  if (current.length > 0) {
    tokens.push(current);
  }

  return tokens;
}

function requireText(command: string, args: string[], label: string): TuiParseResult | string {
  const text = args.join(' ').trim();
  if (!text) {
    return {
      ok: false,
      error: `${command} requires ${label}. Type /help for usage.`,
    };
  }
  return text;
}

function parseRunOptions(command: string, args: string[]): TuiParseResult {
  const options: TuiRunOptions = {};

  for (let index = 0; index < args.length; index++) {
    const token = args[index];

    switch (token) {
      case '--auto':
        options.auto = true;
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--continue':
        options.continue = true;
        break;
      case '--watch':
        options.watch = true;
        break;
      case '--verbose':
      case '-v':
        options.verbose = true;
        break;
      case '--force':
        options.force = true;
        break;
      case '--story':
      case '--step':
      case '--max-iterations': {
        const value = args[index + 1];
        if (!value || value.startsWith('--')) {
          return {
            ok: false,
            error: `${token} requires a value.`,
          };
        }

        if (token === '--story') {
          options.story = value;
        } else if (token === '--step') {
          options.step = value;
        } else {
          options.maxIterations = value;
        }
        index++;
        break;
      }
      default:
        return {
          ok: false,
          error: `Unknown ${command} option "${token}". Type /help for usage.`,
        };
    }
  }

  return { ok: true, command: { kind: 'run', options } };
}

export function parseTuiInput(input: string): TuiParseResult {
  const trimmed = input.trim();

  if (!trimmed) {
    return { ok: true, command: { kind: 'noop' } };
  }

  if (!trimmed.startsWith('/')) {
    return {
      ok: false,
      error: 'TUI commands start with /. Type /help for available commands.',
    };
  }

  const [rawCommand, ...args] = tokenize(trimmed);
  const command = rawCommand.toLowerCase();

  switch (command) {
    case '/help':
    case '/?':
      return { ok: true, command: { kind: 'help' } };
    case '/exit':
    case '/quit':
      return { ok: true, command: { kind: 'exit' } };
    case '/status': {
      if (args.some((arg) => arg !== '--active')) {
        return {
          ok: false,
          error: 'Unknown /status option. Usage: /status [--active]',
        };
      }
      return {
        ok: true,
        command: {
          kind: 'status',
          options: { active: args.includes('--active') || undefined },
        },
      };
    }
    case '/details':
    case '/d': {
      const id = requireText('/details', args, '<story-id>');
      if (typeof id !== 'string') {
        return id;
      }
      return { ok: true, command: { kind: 'details', id } };
    }
    case '/add': {
      const title = requireText('/add', args, '<title>');
      if (typeof title !== 'string') {
        return title;
      }
      return { ok: true, command: { kind: 'add', title, grillMe: false } };
    }
    case '/grill-me': {
      const title = requireText('/grill-me', args, '<feature request>');
      if (typeof title !== 'string') {
        return title;
      }
      return { ok: true, command: { kind: 'add', title, grillMe: true } };
    }
    case '/run':
      return parseRunOptions('/run', args);
    case '/work': {
      if (args.length > 1) {
        return {
          ok: false,
          error: 'Usage: /work [story-id]',
        };
      }
      const options: TuiRunOptions = { auto: true };
      if (args[0]) {
        options.story = args[0];
      }
      return { ok: true, command: { kind: 'run', options } };
    }
    default:
      return {
        ok: false,
        error: `Unknown command "${rawCommand}". Type /help for available commands.`,
      };
  }
}

export function formatTuiHelp(): string {
  return [
    'AI-SDLC interactive commands:',
    '  /status [--active]              Show the board',
    '  /add <title>                    Add a story to the backlog',
    '  /grill-me <feature request>     Clarify a request and add it as a story',
    '  /run [--auto] [--story <id>]    Process workflow actions',
    '  /work [story-id]                Run full SDLC mode for one story, or all pending work',
    '  /details <story-id>             Show story details',
    '  /help                           Show this help',
    '  /exit                           Leave the TUI',
  ].join('\n');
}

export function completeTuiInput(line: string): [string[], string] {
  const hits = SLASH_COMMANDS.filter((command) => command.startsWith(line));
  return [hits.length > 0 ? hits : SLASH_COMMANDS, line];
}

export class TuiSession {
  constructor(
    private readonly handlers: TuiCommandHandlers,
    private readonly output: TuiOutput
  ) {}

  async handleLine(input: string): Promise<boolean> {
    const parsed = parseTuiInput(input);
    if (!parsed.ok) {
      this.output.writeLine(parsed.error);
      return true;
    }

    switch (parsed.command.kind) {
      case 'noop':
        return true;
      case 'help':
        this.output.writeLine(formatTuiHelp());
        return true;
      case 'exit':
        this.output.writeLine('Bye.');
        return false;
      case 'status':
        await this.handlers.status(parsed.command.options);
        return true;
      case 'details':
        await this.handlers.details(parsed.command.id);
        return true;
      case 'add':
        if (parsed.command.grillMe) {
          this.handlers.checkProviderConfiguration?.();
        }
        await this.handlers.add(parsed.command.title, { grillMe: parsed.command.grillMe });
        return true;
      case 'run':
        if (!parsed.command.options.dryRun) {
          this.handlers.checkProviderConfiguration?.();
        }
        await this.handlers.run(parsed.command.options);
        return true;
    }
  }
}

export function checkTuiProviderConfiguration(): boolean {
  const config = loadConfig();
  const c = getThemedChalk(config);

  try {
    const provider = ProviderRegistry.getDefault(config);
    const authenticator = provider.getAuthenticator();

    if (authenticator.isConfigured()) {
      return true;
    }

    console.log(c.warning(`Warning: AI provider "${provider.name}" is not configured.`));
    console.log(c.dim('Agent commands require provider credentials.'));
    console.log(c.dim(`Configure provider "${provider.name}" credentials or set ai.provider / AI_SDLC_PROVIDER to a configured provider.`));
    console.log();
    return false;
  } catch (error) {
    console.log(c.warning('Warning: Could not resolve AI provider.'));
    console.log(c.dim(error instanceof Error ? error.message : String(error)));
    console.log();
    return false;
  }
}

export function createDefaultTuiCommandHandlers(): TuiCommandHandlers {
  return {
    add,
    run,
    status,
    details,
    checkProviderConfiguration: checkTuiProviderConfiguration,
  };
}

export interface StartTuiOptions {
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
  handlers?: TuiCommandHandlers;
}

export async function startTui(options: StartTuiOptions = {}): Promise<void> {
  const input = options.input ?? process.stdin;
  const output = options.output ?? process.stdout;
  const handlers = options.handlers ?? createDefaultTuiCommandHandlers();
  const session = new TuiSession(handlers, {
    writeLine: (line) => output.write(`${line}\n`),
  });

  const rl = readline.createInterface({
    input,
    output,
    prompt: 'ai-sdlc> ',
    completer: completeTuiInput,
  });

  output.write('AI-SDLC TUI\n');
  output.write('Type /help for commands.\n\n');
  rl.prompt();

  await new Promise<void>((resolve) => {
    rl.on('line', (line) => {
      rl.pause();
      void session.handleLine(line)
        .then((shouldContinue) => {
          if (!shouldContinue) {
            rl.close();
            return;
          }
          rl.resume();
          rl.prompt();
        })
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : String(error);
          output.write(`Error: ${message}\n`);
          rl.resume();
          rl.prompt();
        });
    });

    rl.on('SIGINT', () => {
      output.write('\nBye.\n');
      rl.close();
    });

    rl.on('close', resolve);
  });
}
