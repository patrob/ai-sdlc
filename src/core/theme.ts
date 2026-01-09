import chalk, { ChalkInstance } from 'chalk';
import { Config, ThemePreference, ThemeColors } from '../types/index.js';
import { loadConfig } from './config.js';

/**
 * Detect terminal background theme by checking environment variables
 * Returns 'light' or 'dark' based on terminal settings
 */
export function detectTerminalTheme(): 'light' | 'dark' {
  // Check COLORFGBG environment variable
  // Format: "foreground;background" where high values (>7) = light background
  const colorFgBg = process.env.COLORFGBG;

  if (colorFgBg) {
    const parts = colorFgBg.split(';');
    if (parts.length >= 2) {
      const bg = parseInt(parts[1], 10);
      // Background values 0-7 are dark, 8-15 are light
      if (!isNaN(bg)) {
        return bg > 7 ? 'light' : 'dark';
      }
    }
  }

  // Check TERM_PROGRAM for known terminal types
  const termProgram = process.env.TERM_PROGRAM;
  if (termProgram === 'Apple_Terminal') {
    // macOS Terminal.app defaults to light
    return 'light';
  }

  // Default to dark (safer - bright colors work better on dark backgrounds)
  return 'dark';
}

/**
 * Get color scheme for a specific theme preference
 * Returns an object with semantic color methods
 */
export function getThemeColors(preference: ThemePreference): ThemeColors {
  // Handle NO_COLOR environment variable (standard)
  if (process.env.NO_COLOR !== undefined || preference === 'none') {
    return {
      success: (str: string) => str,
      error: (str: string) => str,
      warning: (str: string) => str,
      info: (str: string) => str,
      dim: (str: string) => str,
      bold: (str: string) => str,
      backlog: (str: string) => str,
      ready: (str: string) => str,
      inProgress: (str: string) => str,
      done: (str: string) => str,
    };
  }

  // Determine actual theme to use
  let actualTheme: 'light' | 'dark';
  if (preference === 'auto') {
    actualTheme = detectTerminalTheme();
  } else {
    actualTheme = preference as 'light' | 'dark';
  }

  // Light terminal optimized colors (darker, bolder colors)
  if (actualTheme === 'light') {
    return {
      success: chalk.green.bold,
      error: chalk.red.bold,
      warning: chalk.hex('#CC6600'), // Darker orange
      info: chalk.blue.bold,
      dim: chalk.gray,
      bold: chalk.bold,
      backlog: chalk.gray.bold,
      ready: chalk.blue.bold,
      inProgress: chalk.hex('#CC6600'), // Darker orange instead of yellow
      done: chalk.green.bold,
    };
  }

  // Dark terminal optimized colors (bright, vibrant colors)
  return {
    success: chalk.green,
    error: chalk.red,
    warning: chalk.yellow,
    info: chalk.cyan,
    dim: chalk.dim,
    bold: chalk.bold,
    backlog: chalk.gray,
    ready: chalk.blue,
    inProgress: chalk.yellow,
    done: chalk.green,
  };
}

/**
 * Get themed chalk instance based on configuration
 * This is the main function to use in CLI commands
 */
export function getThemedChalk(config?: Config): ThemeColors {
  const actualConfig = config || loadConfig();
  return getThemeColors(actualConfig.theme);
}
