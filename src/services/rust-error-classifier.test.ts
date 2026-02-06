import { describe, it, expect } from 'vitest';
import { RustErrorClassifier } from './rust-error-classifier.js';
import type { ParsedError } from './error-classifier-types.js';

describe('RustErrorClassifier', () => {
  const classifier = new RustErrorClassifier();

  describe('supportedStacks', () => {
    it('should support rust-cargo stack', () => {
      expect(classifier.supportedStacks).toEqual(['rust-cargo']);
    });
  });

  describe('parseErrors', () => {
    it('should return empty array for empty input', () => {
      expect(classifier.parseErrors('')).toEqual([]);
      expect(classifier.parseErrors('   ')).toEqual([]);
    });

    it('should parse Rust compiler error with error code', () => {
      const output = `error[E0308]: mismatched types
  --> src/main.rs:15:5
   |
15 |     x
   |     ^ expected i32, found &str`;

      const errors = classifier.parseErrors(output);

      expect(errors).toHaveLength(1);
      expect(errors[0].code).toBe('E0308');
      expect(errors[0].message).toBe('mismatched types');
      expect(errors[0].filePath).toBe('src/main.rs');
      expect(errors[0].line).toBe(15);
      expect(errors[0].column).toBe(5);
    });

    it('should parse multiple Rust compiler errors', () => {
      const output = `error[E0425]: cannot find value \`x\` in this scope
  --> src/lib.rs:10:5

error[E0308]: mismatched types
  --> src/main.rs:20:12`;

      const errors = classifier.parseErrors(output);

      expect(errors).toHaveLength(2);
      expect(errors[0].code).toBe('E0425');
      expect(errors[0].filePath).toBe('src/lib.rs');
      expect(errors[0].line).toBe(10);
      expect(errors[1].code).toBe('E0308');
      expect(errors[1].filePath).toBe('src/main.rs');
      expect(errors[1].line).toBe(20);
    });

    it('should parse error without error code', () => {
      const output = `error: expected one of \`!\`, \`(\`, found \`}\`
  --> src/main.rs:5:1`;

      const errors = classifier.parseErrors(output);

      expect(errors).toHaveLength(1);
      expect(errors[0].code).toBe('error');
      expect(errors[0].filePath).toBe('src/main.rs');
    });

    it('should parse cargo test failures', () => {
      const output = `test tests::test_add ... ok
test tests::test_subtract ... FAILED
test tests::test_multiply ... FAILED
test tests::test_divide ... ok`;

      const errors = classifier.parseErrors(output);

      expect(errors).toHaveLength(2);
      expect(errors[0].code).toBe('cargo:test:FAILED');
      expect(errors[0].message).toBe('test tests::test_subtract failed');
      expect(errors[1].code).toBe('cargo:test:FAILED');
      expect(errors[1].message).toBe('test tests::test_multiply failed');
    });

    it('should parse borrow checker error', () => {
      const output = `error[E0505]: cannot move out of \`x\` because it is borrowed
  --> src/handler.rs:30:10`;

      const errors = classifier.parseErrors(output);

      expect(errors).toHaveLength(1);
      expect(errors[0].code).toBe('E0505');
      expect(errors[0].message).toContain('cannot move out');
    });

    it('should parse unresolved import error', () => {
      const output = `error[E0432]: unresolved import \`crate::missing\`
  --> src/lib.rs:3:5`;

      const errors = classifier.parseErrors(output);

      expect(errors).toHaveLength(1);
      expect(errors[0].code).toBe('E0432');
      expect(errors[0].filePath).toBe('src/lib.rs');
    });

    it('should handle mixed compiler and test output', () => {
      const output = `error[E0308]: mismatched types
  --> src/lib.rs:10:5

test integration::test_api ... FAILED`;

      const errors = classifier.parseErrors(output);

      expect(errors).toHaveLength(2);
      expect(errors[0].code).toBe('E0308');
      expect(errors[1].code).toBe('cargo:test:FAILED');
    });
  });

  describe('classifyError', () => {
    it('should classify test failures as cascading', () => {
      const error: ParsedError = {
        filePath: '',
        code: 'cargo:test:FAILED',
        message: 'test tests::test_add failed',
      };
      expect(classifier.classifyError(error)).toBe('cascading');
    });

    it('should classify type mismatch in src/ as source', () => {
      const error: ParsedError = {
        filePath: 'src/main.rs',
        line: 15,
        column: 5,
        code: 'E0308',
        message: 'mismatched types',
      };
      expect(classifier.classifyError(error)).toBe('source');
    });

    it('should classify borrow error in src/ as source', () => {
      const error: ParsedError = {
        filePath: 'src/handler.rs',
        line: 30,
        column: 10,
        code: 'E0505',
        message: 'cannot move out of `x` because it is borrowed',
      };
      expect(classifier.classifyError(error)).toBe('source');
    });

    it('should classify unresolved import in src/ as source', () => {
      const error: ParsedError = {
        filePath: 'src/lib.rs',
        line: 3,
        column: 5,
        code: 'E0432',
        message: 'unresolved import `crate::missing`',
      };
      expect(classifier.classifyError(error)).toBe('source');
    });

    it('should classify undefined name in src/ as source', () => {
      const error: ParsedError = {
        filePath: 'src/lib.rs',
        line: 10,
        column: 5,
        code: 'E0425',
        message: 'cannot find value `x` in this scope',
      };
      expect(classifier.classifyError(error)).toBe('source');
    });

    it('should classify errors in tests/ as cascading', () => {
      const error: ParsedError = {
        filePath: 'tests/integration.rs',
        line: 20,
        column: 5,
        code: 'E0308',
        message: 'mismatched types',
      };
      expect(classifier.classifyError(error)).toBe('cascading');
    });

    it('should classify generic errors in src/ as source', () => {
      const error: ParsedError = {
        filePath: 'src/main.rs',
        line: 5,
        column: 1,
        code: 'error',
        message: 'expected one of `!`, `(`, found `}`',
      };
      expect(classifier.classifyError(error)).toBe('source');
    });

    it('should classify errors without file path as cascading', () => {
      const error: ParsedError = {
        filePath: '',
        code: 'E0308',
        message: 'mismatched types',
      };
      expect(classifier.classifyError(error)).toBe('cascading');
    });
  });

  describe('classifyAndSort', () => {
    it('should separate source and cascading errors', () => {
      const errors: ParsedError[] = [
        { filePath: 'src/main.rs', line: 15, column: 5, code: 'E0308', message: 'mismatched types' },
        { filePath: '', code: 'cargo:test:FAILED', message: 'test tests::test_add failed' },
        { filePath: 'src/lib.rs', line: 3, column: 5, code: 'E0432', message: 'unresolved import' },
      ];

      const result = classifier.classifyAndSort(errors);

      expect(result.source).toHaveLength(2);
      expect(result.cascading).toHaveLength(1);
      expect(result.source[0].code).toBe('E0308');
      expect(result.source[1].code).toBe('E0432');
      expect(result.cascading[0].code).toBe('cargo:test:FAILED');
    });

    it('should handle empty array', () => {
      const result = classifier.classifyAndSort([]);
      expect(result.source).toEqual([]);
      expect(result.cascading).toEqual([]);
    });
  });
});
