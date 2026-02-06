import { describe, it, expect } from 'vitest';
import { GoErrorClassifier } from './go-error-classifier.js';
import type { ParsedError } from './error-classifier-types.js';

describe('GoErrorClassifier', () => {
  const classifier = new GoErrorClassifier();

  describe('supportedStacks', () => {
    it('should support go-mod stack', () => {
      expect(classifier.supportedStacks).toEqual(['go-mod']);
    });
  });

  describe('parseErrors', () => {
    it('should return empty array for empty input', () => {
      expect(classifier.parseErrors('')).toEqual([]);
      expect(classifier.parseErrors('   ')).toEqual([]);
    });

    it('should parse Go compiler errors with ./ prefix', () => {
      const output = `./main.go:15:3: undefined: Config
./main.go:22:10: cannot use x (variable of type string) as type int`;

      const errors = classifier.parseErrors(output);

      expect(errors).toHaveLength(2);
      expect(errors[0].filePath).toBe('main.go');
      expect(errors[0].line).toBe(15);
      expect(errors[0].column).toBe(3);
      expect(errors[0].code).toBe('go:undefined');
      expect(errors[0].message).toBe('undefined: Config');
      expect(errors[1].code).toBe('go:type');
    });

    it('should parse Go compiler errors without ./ prefix', () => {
      const output = `pkg/handler.go:8:2: could not import "missing/pkg"`;

      const errors = classifier.parseErrors(output);

      expect(errors).toHaveLength(1);
      expect(errors[0].filePath).toBe('pkg/handler.go');
      expect(errors[0].line).toBe(8);
      expect(errors[0].column).toBe(2);
      expect(errors[0].code).toBe('go:import');
    });

    it('should parse go test failures', () => {
      const output = `--- FAIL: TestCreateUser (0.01s)
--- FAIL: TestDeleteUser (0.03s)`;

      const errors = classifier.parseErrors(output);

      expect(errors).toHaveLength(2);
      expect(errors[0].code).toBe('go:test:FAIL');
      expect(errors[0].message).toBe('TestCreateUser (0.01s)');
      expect(errors[1].code).toBe('go:test:FAIL');
      expect(errors[1].message).toBe('TestDeleteUser (0.03s)');
    });

    it('should parse syntax errors', () => {
      const output = `./main.go:10:1: syntax error: unexpected EOF`;

      const errors = classifier.parseErrors(output);

      expect(errors).toHaveLength(1);
      expect(errors[0].code).toBe('go:syntax');
      expect(errors[0].message).toContain('syntax error');
    });

    it('should parse "imported and not used" errors', () => {
      const output = `./main.go:4:2: "fmt" imported and not used`;

      const errors = classifier.parseErrors(output);

      expect(errors).toHaveLength(1);
      expect(errors[0].code).toBe('go:import');
    });

    it('should parse expected token errors', () => {
      const output = `./main.go:25:1: expected '}', found 'EOF'`;

      const errors = classifier.parseErrors(output);

      expect(errors).toHaveLength(1);
      expect(errors[0].code).toBe('go:syntax');
    });

    it('should handle mixed compiler and test output', () => {
      const output = `./cmd/server.go:12:5: undefined: NewRouter
--- FAIL: TestServer (0.05s)`;

      const errors = classifier.parseErrors(output);

      expect(errors).toHaveLength(2);
      expect(errors[0].code).toBe('go:undefined');
      expect(errors[1].code).toBe('go:test:FAIL');
    });
  });

  describe('classifyError', () => {
    it('should classify test failures as cascading', () => {
      const error: ParsedError = {
        filePath: '',
        code: 'go:test:FAIL',
        message: 'TestCreateUser (0.01s)',
      };
      expect(classifier.classifyError(error)).toBe('cascading');
    });

    it('should classify undefined errors in non-test files as source', () => {
      const error: ParsedError = {
        filePath: 'cmd/main.go',
        line: 15,
        column: 3,
        code: 'go:undefined',
        message: 'undefined: Config',
      };
      expect(classifier.classifyError(error)).toBe('source');
    });

    it('should classify undefined errors in test files as cascading', () => {
      const error: ParsedError = {
        filePath: 'cmd/main_test.go',
        line: 10,
        column: 5,
        code: 'go:undefined',
        message: 'undefined: MockService',
      };
      expect(classifier.classifyError(error)).toBe('cascading');
    });

    it('should classify type errors in non-test files as source', () => {
      const error: ParsedError = {
        filePath: 'pkg/handler.go',
        line: 22,
        column: 10,
        code: 'go:type',
        message: 'cannot use x as type int',
      };
      expect(classifier.classifyError(error)).toBe('source');
    });

    it('should classify import errors in non-test files as source', () => {
      const error: ParsedError = {
        filePath: 'pkg/handler.go',
        line: 8,
        column: 2,
        code: 'go:import',
        message: 'could not import "missing/pkg"',
      };
      expect(classifier.classifyError(error)).toBe('source');
    });

    it('should classify syntax errors in non-test files as source', () => {
      const error: ParsedError = {
        filePath: 'main.go',
        line: 10,
        column: 1,
        code: 'go:syntax',
        message: 'syntax error: unexpected EOF',
      };
      expect(classifier.classifyError(error)).toBe('source');
    });

    it('should classify vet errors in non-test files as source', () => {
      const error: ParsedError = {
        filePath: 'pkg/handler.go',
        line: 30,
        code: 'go:vet',
        message: 'unreachable code',
      };
      expect(classifier.classifyError(error)).toBe('source');
    });

    it('should classify generic errors in test files as cascading', () => {
      const error: ParsedError = {
        filePath: 'pkg/handler_test.go',
        line: 15,
        code: 'go:error',
        message: 'some error',
      };
      expect(classifier.classifyError(error)).toBe('cascading');
    });
  });

  describe('classifyAndSort', () => {
    it('should separate source and cascading errors', () => {
      const errors: ParsedError[] = [
        { filePath: 'cmd/main.go', line: 15, column: 3, code: 'go:undefined', message: 'undefined: Config' },
        { filePath: '', code: 'go:test:FAIL', message: 'TestMain (0.01s)' },
        { filePath: 'pkg/handler.go', line: 8, column: 2, code: 'go:import', message: 'missing import' },
      ];

      const result = classifier.classifyAndSort(errors);

      expect(result.source).toHaveLength(2);
      expect(result.cascading).toHaveLength(1);
      expect(result.source[0].code).toBe('go:undefined');
      expect(result.source[1].code).toBe('go:import');
      expect(result.cascading[0].code).toBe('go:test:FAIL');
    });

    it('should handle empty array', () => {
      const result = classifier.classifyAndSort([]);
      expect(result.source).toEqual([]);
      expect(result.cascading).toEqual([]);
    });
  });
});
