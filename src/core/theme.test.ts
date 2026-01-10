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

    it('should handle 256-color RGB cube values (16-231)', () => {
      // Test a light color in the RGB cube (high R, G, B values)
      process.env.COLORFGBG = '0;231'; // Max RGB value (5,5,5)
      expect(detectTerminalTheme()).toBe('light');

      // Test a dark color in the RGB cube (low R, G, B values)
      process.env.COLORFGBG = '15;16'; // Min RGB value (0,0,0)
      expect(detectTerminalTheme()).toBe('dark');
    });

    it('should handle 256-color grayscale ramp (232-255)', () => {
      // Test a light grayscale value
      process.env.COLORFGBG = '0;255'; // Brightest gray
      expect(detectTerminalTheme()).toBe('light');

      // Test a dark grayscale value
      process.env.COLORFGBG = '15;232'; // Darkest gray
      expect(detectTerminalTheme()).toBe('dark');

      // Test midpoint (should be dark as threshold is 243)
      process.env.COLORFGBG = '15;240';
      expect(detectTerminalTheme()).toBe('dark');

      // Just above threshold (should be light)
      process.env.COLORFGBG = '0;244';
      expect(detectTerminalTheme()).toBe('light');
    });

    it('should reject out-of-range COLORFGBG values (>255)', () => {
      process.env.COLORFGBG = '0;999999';
      expect(detectTerminalTheme()).toBe('dark'); // Should fall back to default
    });

    it('should handle standard 16-color palette correctly', () => {
      // Test boundary values
      process.env.COLORFGBG = '15;7'; // Highest dark value
      expect(detectTerminalTheme()).toBe('dark');

      process.env.COLORFGBG = '0;8'; // Lowest light value
      expect(detectTerminalTheme()).toBe('light');
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
        'phaseRefine',
        'phaseResearch',
        'phasePlan',
        'phaseImplement',
        'phaseVerify',
        'reviewAction',
        'phaseComplete',
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

  describe('RPIV phase colors', () => {
    it('should return colors for all phase methods in dark theme', () => {
      delete process.env.NO_COLOR;
      const colors = getThemeColors('dark');

      expect(typeof colors.phaseRefine('Refine')).toBe('string');
      expect(typeof colors.phaseResearch('Research')).toBe('string');
      expect(typeof colors.phasePlan('Plan')).toBe('string');
      expect(typeof colors.phaseImplement('Implement')).toBe('string');
      expect(typeof colors.phaseVerify('Verify')).toBe('string');
    });

    it('should return colors for all phase methods in light theme', () => {
      delete process.env.NO_COLOR;
      const colors = getThemeColors('light');

      expect(typeof colors.phaseRefine('Refine')).toBe('string');
      expect(typeof colors.phaseResearch('Research')).toBe('string');
      expect(typeof colors.phasePlan('Plan')).toBe('string');
      expect(typeof colors.phaseImplement('Implement')).toBe('string');
      expect(typeof colors.phaseVerify('Verify')).toBe('string');
    });

    it('should return unstyled text for phase methods when NO_COLOR is set', () => {
      process.env.NO_COLOR = '1';
      const colors = getThemeColors('dark');

      expect(colors.phaseRefine('Refine')).toBe('Refine');
      expect(colors.phaseResearch('Research')).toBe('Research');
      expect(colors.phasePlan('Plan')).toBe('Plan');
      expect(colors.phaseImplement('Implement')).toBe('Implement');
      expect(colors.phaseVerify('Verify')).toBe('Verify');

      delete process.env.NO_COLOR;
    });

    it('should return unstyled text for phase methods when theme is none', () => {
      const colors = getThemeColors('none');

      expect(colors.phaseRefine('Refine')).toBe('Refine');
      expect(colors.phaseResearch('Research')).toBe('Research');
      expect(colors.phasePlan('Plan')).toBe('Plan');
      expect(colors.phaseImplement('Implement')).toBe('Implement');
      expect(colors.phaseVerify('Verify')).toBe('Verify');
    });

    it('should provide reviewAction color method', () => {
      delete process.env.NO_COLOR;
      const colors = getThemeColors('dark');

      expect(typeof colors.reviewAction('Review')).toBe('string');
    });

    it('should return unstyled text for reviewAction when NO_COLOR is set', () => {
      process.env.NO_COLOR = '1';
      const colors = getThemeColors('dark');

      expect(colors.reviewAction('Review')).toBe('Review');

      delete process.env.NO_COLOR;
    });

    it('should provide phaseComplete color method', () => {
      delete process.env.NO_COLOR;
      const colors = getThemeColors('dark');

      expect(typeof colors.phaseComplete('Complete')).toBe('string');
    });

    it('should return unstyled text for phaseComplete when NO_COLOR is set', () => {
      process.env.NO_COLOR = '1';
      const colors = getThemeColors('dark');

      expect(colors.phaseComplete('Complete')).toBe('Complete');

      delete process.env.NO_COLOR;
    });
  });
});
