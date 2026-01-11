#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { init, status, add, run, details } from './cli/commands.js';
import { hasApiKey } from './core/auth.js';
import { loadConfig, saveConfig } from './core/config.js';
import { getThemedChalk } from './core/theme.js';
import { ThemePreference } from './types/index.js';

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
  .version('0.1.0');

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
  .command('add <title>')
  .description('Add a new story to the backlog')
  .action(add);

program
  .command('details <id>')
  .alias('d')
  .description('Show detailed information about a story by ID or slug')
  .action(details);

program
  .command('run')
  .description('Run the workflow (process next action)')
  .option('--auto', 'Process all pending actions (combine with --story for full SDLC: refine → research → plan → implement → review)')
  .option('--dry-run', 'Show what would be done without executing')
  .option('--continue', 'Resume workflow from last checkpoint')
  .option('--story <id-or-slug>', 'Target a specific story by ID or slug')
  .option('--step <phase>', 'Run a specific phase (refine, research, plan, implement, review) - cannot be combined with --auto --story')
  .option('--max-iterations <number>', 'Maximum retry iterations (default: infinite)')
  .action((options) => {
    if (!options.dryRun) {
      checkApiKey();
    }
    return run(options);
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

program.parse();
