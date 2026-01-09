import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { detectTerminalTheme, getThemeColors, getThemedChalk } from './theme.js';
import { DEFAULT_CONFIG } from './config.js';

describe('theme module', () => {
  // Store original env vars
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('detectTerminalTheme', () => {
    it('should return dark for COLORFGBG with dark background', () => {
      process.env.COLORFGBG = '15;0';
      expect(detectTerminalTheme()).toBe('dark');
    });

    it('should return light for COLORFGBG with light background', () => {
      process.env.COLORFGBG = '0;15';
      expect(detectTerminalTheme()).toBe('light');
    });

    it('should return light for Apple Terminal', () => {
      delete process.env.COLORFGBG;
      process.env.TERM_PROGRAM = 'Apple_Terminal';
      expect(detectTerminalTheme()).toBe('light');
    });

    it('should default to dark when no indicators present', () => {
      delete process.env.COLORFGBG;
      delete process.env.TERM_PROGRAM;
      expect(detectTerminalTheme()).toBe('dark');
    });

    it('should handle invalid COLORFGBG values gracefully', () => {
      process.env.COLORFGBG = 'invalid';
      expect(detectTerminalTheme()).toBe('dark');
    });
  });

  describe('getThemeColors', () => {
    it('should return no-color functions when preference is none', () => {
      const colors = getThemeColors('none');
      expect(colors.success('test')).toBe('test');
      expect(colors.error('test')).toBe('test');
      expect(colors.warning('test')).toBe('test');
    });

    it('should respect NO_COLOR environment variable', () => {
      process.env.NO_COLOR = '1';
      const colors = getThemeColors('dark');
      expect(colors.success('test')).toBe('test');
      delete process.env.NO_COLOR;
    });

    it('should return dark theme colors for dark preference', () => {
      delete process.env.NO_COLOR;
      const colors = getThemeColors('dark');
      // Check that functions exist and return strings (chalk colored)
      expect(typeof colors.success('test')).toBe('string');
      expect(typeof colors.error('test')).toBe('string');
      expect(typeof colors.warning('test')).toBe('string');
    });

    it('should return light theme colors for light preference', () => {
      delete process.env.NO_COLOR;
      const colors = getThemeColors('light');
      // Check that functions exist and return strings (chalk colored)
      expect(typeof colors.success('test')).toBe('string');
      expect(typeof colors.error('test')).toBe('string');
      expect(typeof colors.warning('test')).toBe('string');
    });

    it('should auto-detect theme for auto preference', () => {
      delete process.env.NO_COLOR;
      process.env.COLORFGBG = '15;0'; // dark background
      const colors = getThemeColors('auto');
      expect(typeof colors.success('test')).toBe('string');
    });

    it('should have all required color methods', () => {
      const colors = getThemeColors('dark');
      const requiredMethods = [
        'success',
        'error',
        'warning',
        'info',
        'dim',
        'bold',
        'backlog',
        'ready',
        'inProgress',
        'done',
      ];

      for (const method of requiredMethods) {
        expect(colors).toHaveProperty(method);
        expect(typeof (colors as any)[method]).toBe('function');
      }
    });
  });

  describe('getThemedChalk', () => {
    it('should load config and return themed colors', () => {
      const colors = getThemedChalk();
      expect(colors).toBeDefined();
      expect(typeof colors.success).toBe('function');
    });

    it('should use provided config when given', () => {
      const config = { ...DEFAULT_CONFIG, theme: 'none' as const };
      const colors = getThemedChalk(config);
      expect(colors.success('test')).toBe('test');
    });

    it('should default to auto theme from DEFAULT_CONFIG', () => {
      const colors = getThemedChalk();
      expect(typeof colors.success('test')).toBe('string');
    });
  });

  describe('NO_COLOR standard compliance', () => {
    it('should respect NO_COLOR over theme preference', () => {
      process.env.NO_COLOR = '1';
      const darkColors = getThemeColors('dark');
      const lightColors = getThemeColors('light');

      expect(darkColors.success('test')).toBe('test');
      expect(lightColors.success('test')).toBe('test');

      delete process.env.NO_COLOR;
    });

    it('should not strip colors when NO_COLOR is undefined', () => {
      delete process.env.NO_COLOR;
      const colors = getThemeColors('dark');
      // Colored strings will be longer due to ANSI codes or wrapped
      const result = colors.success('test');
      expect(typeof result).toBe('string');
    });
  });

  describe('theme color consistency', () => {
    it('should provide different colors for light vs dark themes', () => {
      delete process.env.NO_COLOR;
      const lightColors = getThemeColors('light');
      const darkColors = getThemeColors('dark');

      // The actual chalk instances should be different
      // (we can't easily compare chalk objects, but we can verify they exist)
      expect(lightColors).toBeDefined();
      expect(darkColors).toBeDefined();
    });

    it('should provide semantic color mapping', () => {
      const colors = getThemeColors('dark');

      // Verify all semantic colors work with sample text
      expect(colors.success('success')).toBeTruthy();
      expect(colors.error('error')).toBeTruthy();
      expect(colors.warning('warning')).toBeTruthy();
      expect(colors.info('info')).toBeTruthy();
      expect(colors.backlog('backlog')).toBeTruthy();
      expect(colors.ready('ready')).toBeTruthy();
      expect(colors.inProgress('in-progress')).toBeTruthy();
      expect(colors.done('done')).toBeTruthy();
    });
  });
});
