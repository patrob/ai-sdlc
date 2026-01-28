#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { createRequire } from 'module';
import { init, status, add, run, details, unblock, migrate, listWorktrees, addWorktree, removeWorktree } from './cli/commands.js';
import { hasApiKey } from './core/auth.js';
import { loadConfig, saveConfig, DEFAULT_LOGGING_CONFIG, getSdlcRoot } from './core/config.js';
import { getThemedChalk } from './core/theme.js';
import { ThemePreference, LogConfig } from './types/index.js';
import { initLogger, getLogger } from './core/logger.js';
import { getLatestLogPath, readLastLines, tailLog } from './core/story-logger.js';
import { setupGlobalCleanupHandlers } from './core/process-manager.js';
import fs from 'fs';
import path from 'path';

setupGlobalCleanupHandlers();

const require = createRequire(import.meta.url);
const packageJson = require('../package.json');

// Check for API key when running commands that need it
function checkApiKey(): boolean {
  if (!hasApiKey()) {
    const config = loadConfig();
    const c = getThemedChalk(config);
    console.log(c.warning('Warning: No API key found.'));
    console.log(c.dim('Agent commands require authentication.'));
    console.log(c.dim('Options:'));
    console.log(c.dim('  1. Sign in to Claude Code (credentials stored in Keychain)'));
    console.log(c.dim('  2. Set ANTHROPIC_API_KEY environment variable'));
    console.log(c.dim('Get a key at: https://console.anthropic.com/'));
    console.log();
    return false;
  }

  return true;
}

const program = new Command();

program
  .name('ai-sdlc')
  .description('Agent-first SDLC workflow manager')
  .version(packageJson.version);

program
  .command('init')
  .description('Initialize .ai-sdlc folder structure')
  .action(init);

program
  .command('status')
  .description('Show current board state')
  .option('--active', 'Hide done stories from output')
  .action((options) => status(options));

program
  .command('add [title]')
  .description('Add a new story to the backlog')
  .option('-f, --file <path>', 'Create story from file (supports .md, .txt, .markdown)')
  .action((title, options) => add(title, options));

program
  .command('details <id>')
  .alias('d')
  .description('Show detailed information about a story by ID or slug')
  .action(details);

program
  .command('unblock <story-id>')
  .description('Unblock a story from the blocked folder and return it to the workflow')
  .option('--reset-retries', 'Reset retry_count and refinement_count to 0')
  .action((storyId, options) => unblock(storyId, options));

program
  .command('migrate')
  .description('Migrate stories from old kanban folder structure to folder-per-story architecture')
  .option('--dry-run', 'Show migration plan without making changes')
  .option('--no-backup', 'Skip backup creation (use with caution)')
  .option('--force', 'Force migration even with uncommitted git changes')
  .action((options) => migrate(options));

program
  .command('run')
  .description('Run the workflow (process next action)')
  .option('--auto', 'Process all pending actions (combine with --story for full SDLC: refine → research → plan → implement → review)')
  .option('--dry-run', 'Show what would be done without executing')
  .option('--continue', 'Resume workflow from last checkpoint')
  .option('--story <id-or-slug>', 'Target a specific story by ID or slug')
  .option('--batch <story-ids>', 'Process multiple stories sequentially (comma-separated list, e.g., S-001,S-002,S-003)')
  .option('--epic <epic-id>', 'Process all stories labeled epic-{epic-id} with parallel execution (e.g., --epic ticketing matches epic-ticketing)')
  .option('--max-concurrent <n>', 'Maximum parallel stories for --epic (default: 3)', '3')
  .option('--concurrent <n>', 'Run N ready stories concurrently in isolated worktrees (default: 1)', '1')
  .option('--step <phase>', 'Run a specific phase (refine, research, plan, implement, review) - cannot be combined with --auto --story')
  .option('--max-iterations <number>', 'Maximum retry iterations (default: infinite)')
  .option('--watch', 'Run in daemon mode, continuously processing backlog')
  .option('-v, --verbose', 'Show detailed daemon output (use with --watch)')
  .option('--force', 'Skip git validation and conflict checks (use with caution)')
  .option('--worktree', 'Create isolated git worktree for story execution (requires --story)')
  .option('--no-worktree', 'Disable worktree even when enabled in config')
  .option('--keep-worktrees', 'Preserve worktrees after completion for debugging (requires --epic)')
  .option('--clean', 'Clean existing worktree and restart from scratch (requires --story)')
  .option('--log-level <level>', 'Set log verbosity (debug, info, warn, error)', 'info')
  .action((options) => {
    if (!options.dryRun && !options.watch) {
      checkApiKey();
    }

    // Initialize logger with config and CLI override
    const config = loadConfig();
    const logConfig: LogConfig = {
      ...DEFAULT_LOGGING_CONFIG,
      ...config.logging,
    };

    // CLI --log-level overrides config
    if (options.logLevel) {
      const validLevels = ['debug', 'info', 'warn', 'error'];
      if (validLevels.includes(options.logLevel)) {
        logConfig.level = options.logLevel as LogConfig['level'];
      } else {
        const c = getThemedChalk(config);
        console.log(c.warning(`Invalid log level "${options.logLevel}", using "${logConfig.level}"`));
      }
    }

    initLogger(process.cwd(), logConfig);

    // Log startup information
    const logger = getLogger();
    logger.info('cli', 'ai-sdlc started', {
      version: packageJson.version,
      command: 'run',
      options: {
        auto: options.auto,
        dryRun: options.dryRun,
        continue: options.continue,
        story: options.story,
        step: options.step,
        worktree: options.worktree,
        clean: options.clean,
        watch: options.watch,
        logLevel: logConfig.level,
      },
    });

    // Validate --epic mutual exclusivity
    if (options.epic) {
      if (options.story) {
        const c = getThemedChalk(config);
        console.log(c.error('Error: --epic cannot be used with --story'));
        process.exit(1);
      }
      if (options.batch) {
        const c = getThemedChalk(config);
        console.log(c.error('Error: --epic cannot be used with --batch'));
        process.exit(1);
      }
      if (options.watch) {
        const c = getThemedChalk(config);
        console.log(c.error('Error: --epic cannot be used with --watch'));
        process.exit(1);
      }
    }

    // Validate --worktree requires --story
    if (options.worktree && !options.story) {
      const c = getThemedChalk(config);
      console.log(c.error('Error: --worktree requires --story flag'));
      process.exit(1);
    }

    // Validate --clean requires --story
    if (options.clean && !options.story) {
      const c = getThemedChalk(config);
      console.log(c.error('Error: --clean requires --story flag'));
      process.exit(1);
    }

    // Validate --keep-worktrees with --epic or --concurrent
    const concurrentValue = options.concurrent ? parseInt(options.concurrent, 10) : 1;
    if (options.keepWorktrees && !options.epic && concurrentValue <= 1) {
      const c = getThemedChalk(config);
      console.log(c.error('Error: --keep-worktrees requires --epic or --concurrent > 1 flag'));
      process.exit(1);
    }

    // Validate --concurrent mutual exclusivity
    if (options.concurrent && parseInt(options.concurrent, 10) > 1) {
      if (options.story) {
        const c = getThemedChalk(config);
        console.log(c.error('Error: --concurrent cannot be used with --story'));
        process.exit(1);
      }
      if (options.epic) {
        const c = getThemedChalk(config);
        console.log(c.error('Error: --concurrent cannot be used with --epic'));
        process.exit(1);
      }
      if (options.batch) {
        const c = getThemedChalk(config);
        console.log(c.error('Error: --concurrent cannot be used with --batch'));
        process.exit(1);
      }
      if (options.watch) {
        const c = getThemedChalk(config);
        console.log(c.error('Error: --concurrent cannot be used with --watch'));
        process.exit(1);
      }
    }

    // Run returns a result object but CLI doesn't need it - just await for completion
    return run(options).then(() => {});
  });

program
  .command('config')
  .description('Manage configuration settings')
  .argument('[key]', 'Configuration key to view or modify (e.g., "theme")')
  .argument('[value]', 'Value to set (leave empty to view current value)')
  .action((key?: string, value?: string) => {
    const config = loadConfig();
    const c = getThemedChalk(config);

    // Show all config if no key provided
    if (!key) {
      console.log(c.bold('Current Configuration:'));
      console.log(JSON.stringify(config, null, 2));
      return;
    }

    // Handle theme configuration
    if (key === 'theme') {
      if (!value) {
        console.log(c.info(`Current theme: ${config.theme}`));
        console.log(c.dim('Available themes: auto, light, dark, none'));
        return;
      }

      // Validate theme preference
      const validThemes: ThemePreference[] = ['auto', 'light', 'dark', 'none'];
      if (!validThemes.includes(value as ThemePreference)) {
        console.log(c.error(`Invalid theme: ${value}`));
        console.log(c.dim('Valid options: auto, light, dark, none'));
        process.exit(1);
      }

      // Update theme
      config.theme = value as ThemePreference;
      saveConfig(config);

      // Get new themed chalk with updated config
      const newC = getThemedChalk(config);
      console.log(newC.success(`Theme updated to: ${value}`));
      console.log(newC.dim('Theme changes take effect immediately.'));
    } else {
      console.log(c.warning(`Unknown configuration key: ${key}`));
      console.log(c.dim('Available keys: theme'));
    }
  });

// Logs command
program
  .command('logs <storyId>')
  .description('View logs for a story')
  .option('-t, --tail', 'Follow log output (like tail -f)')
  .option('-n, --lines <n>', 'Number of lines to show', '50')
  .option('-f, --file <timestamp>', 'View specific log file by timestamp (e.g., 2026-01-15T10-30-00)')
  .action(async (storyId: string, options: { tail?: boolean; lines?: string; file?: string }) => {
    try {
      const config = loadConfig();
      const c = getThemedChalk(config);
      const sdlcRoot = getSdlcRoot();

      // Determine which log file to view
      let logPath: string | null;

      if (options.file) {
        // View specific log file by timestamp
        const sanitizedStoryId = storyId; // Will be sanitized by getLatestLogPath
        const logDir = path.join(sdlcRoot, 'stories', sanitizedStoryId, 'logs');
        logPath = path.join(logDir, `${options.file}.log`);

        if (!fs.existsSync(logPath)) {
          console.log(c.error(`Log file not found: ${options.file}.log`));
          console.log(c.dim(`  Story: ${storyId}`));
          console.log(c.dim(`  Expected path: ${logPath}`));
          process.exit(1);
        }
      } else {
        // Get latest log file
        logPath = getLatestLogPath(sdlcRoot, storyId);

        if (!logPath) {
          console.log(c.error(`No logs found for story: ${storyId}`));
          console.log(c.dim('  Logs are created when running actions with `ai-sdlc run`'));
          process.exit(1);
        }
      }

      // Display logs
      if (options.tail) {
        // Follow mode (tail -f)
        console.log(c.dim(`Following log: ${path.basename(logPath)}`));
        console.log(c.dim(`Press Ctrl+C to exit\n`));
        tailLog(logPath);
      } else {
        // Show last N lines
        const numLines = parseInt(options.lines || '50', 10);
        const content = await readLastLines(logPath, numLines);

        console.log(c.dim(`Log file: ${path.basename(logPath)}`));
        console.log(c.dim(`Showing last ${numLines} lines\n`));
        console.log(content);
      }
    } catch (error) {
      const config = loadConfig();
      const c = getThemedChalk(config);

      if (error instanceof Error && error.message.includes('Invalid story ID')) {
        console.log(c.error(`Invalid story ID: ${storyId}`));
        console.log(c.dim('  Story IDs cannot contain path traversal sequences or separators'));
      } else {
        console.log(c.error(`Error viewing logs: ${error instanceof Error ? error.message : String(error)}`));
      }
      process.exit(1);
    }
  });

// Worktree management commands
program
  .command('worktrees')
  .description('List managed worktrees')
  .action(listWorktrees);

program
  .command('worktrees:add <story-id>')
  .description('Create a worktree for a story')
  .action(addWorktree);

program
  .command('worktrees:remove <story-id>')
  .description('Remove a worktree for a story')
  .option('--force', 'Skip confirmation prompt')
  .action((storyId, options) => removeWorktree(storyId, options));

program.parse();
