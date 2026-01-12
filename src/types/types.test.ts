import { describe, it, expect } from 'vitest';
import type { TDDTestCycle, TDDConfig } from './index';

describe('TDD Type Definitions', () => {
  describe('TDDTestCycle interface', () => {
    it('should have all required properties', () => {
      const testCycle: TDDTestCycle = {
        test_name: 'should handle edge case',
        test_file: 'src/core/logic.test.ts',
        red_timestamp: '2025-01-12T10:00:00Z',
        test_output_red: 'Expected true but got false',
        all_tests_green: false,
        cycle_number: 1,
      };

      expect(testCycle.test_name).toBeDefined();
      expect(testCycle.test_file).toBeDefined();
      expect(testCycle.red_timestamp).toBeDefined();
      expect(testCycle.test_output_red).toBeDefined();
      expect(testCycle.all_tests_green).toBeDefined();
      expect(testCycle.cycle_number).toBeDefined();
    });

    it('should allow optional green_timestamp property', () => {
      const testCycle: TDDTestCycle = {
        test_name: 'should handle edge case',
        test_file: 'src/core/logic.test.ts',
        red_timestamp: '2025-01-12T10:00:00Z',
        green_timestamp: '2025-01-12T10:05:00Z',
        test_output_red: 'Expected true but got false',
        all_tests_green: false,
        cycle_number: 1,
      };

      expect(testCycle.green_timestamp).toBe('2025-01-12T10:05:00Z');
    });

    it('should allow optional refactor_timestamp property', () => {
      const testCycle: TDDTestCycle = {
        test_name: 'should handle edge case',
        test_file: 'src/core/logic.test.ts',
        red_timestamp: '2025-01-12T10:00:00Z',
        green_timestamp: '2025-01-12T10:05:00Z',
        refactor_timestamp: '2025-01-12T10:10:00Z',
        test_output_red: 'Expected true but got false',
        test_output_green: 'All tests passed',
        all_tests_green: true,
        cycle_number: 1,
      };

      expect(testCycle.refactor_timestamp).toBe('2025-01-12T10:10:00Z');
    });

    it('should allow optional test_output_green property', () => {
      const testCycle: TDDTestCycle = {
        test_name: 'should handle edge case',
        test_file: 'src/core/logic.test.ts',
        red_timestamp: '2025-01-12T10:00:00Z',
        test_output_red: 'Expected true but got false',
        test_output_green: 'All tests passed',
        all_tests_green: true,
        cycle_number: 1,
      };

      expect(testCycle.test_output_green).toBe('All tests passed');
    });
  });

  describe('TDDConfig interface', () => {
    it('should have all required properties', () => {
      const config: TDDConfig = {
        enabled: true,
        strictMode: false,
        maxCycles: 10,
        requireApprovalPerCycle: false,
      };

      expect(config.enabled).toBeDefined();
      expect(config.strictMode).toBeDefined();
      expect(config.maxCycles).toBeDefined();
      expect(config.requireApprovalPerCycle).toBeDefined();
    });

    it('should accept all boolean and number combinations', () => {
      const config: TDDConfig = {
        enabled: false,
        strictMode: true,
        maxCycles: 20,
        requireApprovalPerCycle: true,
      };

      expect(config.enabled).toBe(false);
      expect(config.strictMode).toBe(true);
      expect(config.maxCycles).toBe(20);
      expect(config.requireApprovalPerCycle).toBe(true);
    });
  });

  describe('StoryFrontmatter TDD fields', () => {
    it('should extend StoryFrontmatter with tdd_enabled field', () => {
      const frontmatter: any = {
        id: 'story-1',
        title: 'Test Story',
        priority: 1,
        status: 'in-progress',
        type: 'feature',
        created: '2025-01-12T10:00:00Z',
        labels: [],
        research_complete: true,
        plan_complete: true,
        implementation_complete: false,
        reviews_complete: false,
        tdd_enabled: true,
      };

      expect(frontmatter.tdd_enabled).toBeDefined();
      expect(frontmatter.tdd_enabled).toBe(true);
    });

    it('should extend StoryFrontmatter with tdd_current_test field', () => {
      const frontmatter: any = {
        id: 'story-1',
        title: 'Test Story',
        priority: 1,
        status: 'in-progress',
        type: 'feature',
        created: '2025-01-12T10:00:00Z',
        labels: [],
        research_complete: true,
        plan_complete: true,
        implementation_complete: false,
        reviews_complete: false,
        tdd_current_test: {
          test_name: 'should validate input',
          test_file: 'src/core/validator.test.ts',
          red_timestamp: '2025-01-12T10:00:00Z',
          test_output_red: 'ValidationError',
          all_tests_green: false,
          cycle_number: 1,
        },
      };

      expect(frontmatter.tdd_current_test).toBeDefined();
      expect(frontmatter.tdd_current_test.test_name).toBe('should validate input');
    });

    it('should extend StoryFrontmatter with tdd_test_history field', () => {
      const testCycle1: any = {
        test_name: 'should parse data',
        test_file: 'src/core/parser.test.ts',
        red_timestamp: '2025-01-12T09:00:00Z',
        green_timestamp: '2025-01-12T09:05:00Z',
        test_output_red: 'Parser not found',
        test_output_green: 'Parser initialized',
        all_tests_green: true,
        cycle_number: 1,
      };

      const testCycle2: any = {
        test_name: 'should handle edge case',
        test_file: 'src/core/parser.test.ts',
        red_timestamp: '2025-01-12T09:10:00Z',
        green_timestamp: '2025-01-12T09:15:00Z',
        test_output_red: 'Expected null got object',
        test_output_green: 'Edge case handled',
        all_tests_green: true,
        cycle_number: 2,
      };

      const frontmatter: any = {
        id: 'story-1',
        title: 'Test Story',
        priority: 1,
        status: 'in-progress',
        type: 'feature',
        created: '2025-01-12T10:00:00Z',
        labels: [],
        research_complete: true,
        plan_complete: true,
        implementation_complete: false,
        reviews_complete: false,
        tdd_test_history: [testCycle1, testCycle2],
      };

      expect(frontmatter.tdd_test_history).toBeDefined();
      expect(frontmatter.tdd_test_history).toHaveLength(2);
      expect(frontmatter.tdd_test_history[0].cycle_number).toBe(1);
      expect(frontmatter.tdd_test_history[1].cycle_number).toBe(2);
    });
  });
});
