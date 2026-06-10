// eslint-disable-next-line @typescript-eslint/no-unused-vars
import chalk from 'chalk';
import ora from 'ora';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import path from 'path';
import * as readline from 'readline';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { getSdlcRoot, initConfig, loadConfig, saveConfig } from '../../core/config.js';
import { initializeKanban, kanbanExists } from '../../core/kanban.js';
import { detectProjects, formatDetectedProjects, getPrimaryProject } from '../../core/stack-detector.js';
import { getThemedChalk } from '../../core/theme.js';

/**
 * Options for the init command
 */
export interface InitOptions {
  /** Skip project detection for faster initialization */
  quick?: boolean;
}

/**
 * Initialize the .ai-sdlc folder structure
 */
export async function init(options: InitOptions = {}): Promise<void> {
  const spinner = ora('Initializing ai-sdlc...').start();

  try {
    const config = initConfig();
    const sdlcRoot = getSdlcRoot();
    const workingDir = process.cwd();
    const c = getThemedChalk(config);

    if (kanbanExists(sdlcRoot)) {
      spinner.info('ai-sdlc already initialized');
      return;
    }

    initializeKanban(sdlcRoot);

    spinner.succeed(c.success('Initialized .ai-sdlc/'));
    console.log(c.dim('  └── stories/'));
    console.log();

    // Skip detection if --quick flag is set
    if (options.quick) {
      console.log(c.info('Get started:'));
      console.log(c.dim(`  ai-sdlc add "Your first story"`));
      return;
    }

    // Detect project structure
    spinner.start('Detecting project structure...');
    const detectedProjects = detectProjects(workingDir);

    if (detectedProjects.length === 0) {
      spinner.info('No recognizable project structure detected');
      console.log(c.dim('  You can manually configure testCommand and buildCommand in .ai-sdlc.json'));
      console.log();
      console.log(c.info('Get started:'));
      console.log(c.dim(`  ai-sdlc add "Your first story"`));
      return;
    }

    spinner.succeed('Project structure detected');
    console.log();
    console.log(formatDetectedProjects(detectedProjects));
    console.log();

    // Prompt for confirmation
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const answer = await new Promise<string>((resolve) => {
      rl.question(c.info('Configure commands for these projects? [Y/n] '), (ans) => {
        rl.close();
        resolve(ans.trim().toLowerCase());
      });
    });

    if (answer === 'n' || answer === 'no') {
      console.log(c.dim('  Skipping project configuration'));
      console.log();
      console.log(c.info('Get started:'));
      console.log(c.dim(`  ai-sdlc add "Your first story"`));
      return;
    }

    // Update config with detected projects
    const updatedConfig = { ...config };

    // For single project at root, set top-level commands
    const primaryProject = getPrimaryProject(detectedProjects);
    if (primaryProject && primaryProject.path === '.') {
      updatedConfig.testCommand = primaryProject.commands.test;
      updatedConfig.buildCommand = primaryProject.commands.build;
      updatedConfig.installCommand = primaryProject.commands.install;
      updatedConfig.startCommand = primaryProject.commands.start;
    }

    // If there are subdirectory projects or multiple projects, save them
    if (detectedProjects.length > 1 || (primaryProject && primaryProject.path !== '.')) {
      updatedConfig.projects = detectedProjects;

      // For subdirectory projects, also set root-level commands from primary
      if (primaryProject) {
        updatedConfig.testCommand = primaryProject.commands.test;
        updatedConfig.buildCommand = primaryProject.commands.build;
        updatedConfig.installCommand = primaryProject.commands.install;
        updatedConfig.startCommand = primaryProject.commands.start;
      }
    }

    saveConfig(updatedConfig, workingDir);
    console.log(c.success('✓ Configuration saved to .ai-sdlc.json'));
    console.log();
    console.log(c.info('Get started:'));
    console.log(c.dim(`  ai-sdlc add "Your first story"`));
  } catch (error) {
    spinner.fail('Failed to initialize');
    console.error(error);
    process.exit(1);
  }
}
