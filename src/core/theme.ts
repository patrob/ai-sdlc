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
      // Background values 0-7 are dark, 8-15 are light (standard ANSI)
      // Security: validate range to prevent unexpected behavior
      if (!isNaN(bg) && bg >= 0 && bg <= 15) {
        // Standard 16-color ANSI palette
        return bg > 7 ? 'light' : 'dark';
      } else if (!isNaN(bg) && bg >= 16 && bg <= 231) {
        // 256-color palette: RGB cube (16-231)
        // Calculate luminance approximation from 6x6x6 RGB cube
        const colorIndex = bg - 16;
        const r = Math.floor(colorIndex / 36);
        const g = Math.floor((colorIndex % 36) / 6);
        const b = colorIndex % 6;
        // Simple luminance: if sum > 9 (out of 15), it's light
        return (r + g + b) > 9 ? 'light' : 'dark';
      } else if (!isNaN(bg) && bg >= 232 && bg <= 255) {
        // 256-color palette: grayscale ramp (232-255)
        // Values above 243 (midpoint) are light
        return bg > 243 ? 'light' : 'dark';
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
      blocked: (str: string) => str,
      // RPIV phase colors (no color)
      phaseRefine: (str: string) => str,
      phaseResearch: (str: string) => str,
      phasePlan: (str: string) => str,
      phaseImplement: (str: string) => str,
      phaseVerify: (str: string) => str,
      reviewAction: (str: string) => str,
      phaseComplete: (str: string) => str,
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
      blocked: chalk.red.bold,
      // RPIV phase colors (darker for light backgrounds)
      phaseRefine: chalk.hex('#9932CC').bold,    // Dark purple/magenta
      phaseResearch: chalk.blue.bold,            // Blue
      phasePlan: chalk.hex('#008B8B').bold,      // Dark cyan
      phaseImplement: chalk.hex('#CC6600').bold, // Dark orange
      phaseVerify: chalk.green.bold,             // Green
      reviewAction: chalk.hex('#008B8B').bold,   // Distinct cyan with bold
      phaseComplete: chalk.green.bold,           // Success green
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
    blocked: chalk.red,
    // RPIV phase colors (bright for dark backgrounds)
    phaseRefine: chalk.magenta,     // Magenta/purple
    phaseResearch: chalk.blue,      // Blue
    phasePlan: chalk.cyan,          // Cyan
    phaseImplement: chalk.yellow,   // Yellow
    phaseVerify: chalk.green,       // Green
    reviewAction: chalk.cyan.bold,  // Distinct cyan with bold
    phaseComplete: chalk.green,     // Success green
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
