import { describe, it, expect } from 'vitest';
import { PythonErrorClassifier } from './python-error-classifier.js';
import type { ParsedError } from './error-classifier-types.js';

describe('PythonErrorClassifier', () => {
  const classifier = new PythonErrorClassifier();

  describe('supportedStacks', () => {
    it('should support Python stacks', () => {
      expect(classifier.supportedStacks).toEqual(['python-pip', 'python-poetry', 'python-uv']);
    });
  });

  describe('parseErrors', () => {
    it('should return empty array for empty input', () => {
      expect(classifier.parseErrors('')).toEqual([]);
      expect(classifier.parseErrors('   ')).toEqual([]);
    });

    it('should parse Python traceback format', () => {
      const output = `Traceback (most recent call last):
  File "src/app.py", line 42, in main
    from missing_module import something
ImportError: No module named 'missing_module'`;

      const errors = classifier.parseErrors(output);

      expect(errors).toHaveLength(1);
      expect(errors[0].filePath).toBe('src/app.py');
      expect(errors[0].line).toBe(42);
      expect(errors[0].code).toBe('ImportError');
      expect(errors[0].message).toBe("No module named 'missing_module'");
    });

    it('should parse ModuleNotFoundError traceback', () => {
      const output = `Traceback (most recent call last):
  File "src/utils.py", line 5, in load_config
    import yaml
ModuleNotFoundError: No module named 'yaml'`;

      const errors = classifier.parseErrors(output);

      expect(errors).toHaveLength(1);
      expect(errors[0].code).toBe('ModuleNotFoundError');
      expect(errors[0].filePath).toBe('src/utils.py');
    });

    it('should parse pytest FAILED output', () => {
      const output = `FAILED tests/test_app.py::test_login - AssertionError: expected True got False
FAILED tests/test_utils.py::test_parse - ValueError: invalid literal`;

      const errors = classifier.parseErrors(output);

      expect(errors).toHaveLength(2);
      expect(errors[0].filePath).toBe('tests/test_app.py');
      expect(errors[0].code).toBe('pytest:FAILED');
      expect(errors[0].message).toContain('test_login');
      expect(errors[1].filePath).toBe('tests/test_utils.py');
      expect(errors[1].code).toBe('pytest:FAILED');
    });

    it('should parse mypy error output', () => {
      const output = `src/app.py:42: error: Incompatible return value type (got "str", expected "int") [return-value]
src/utils.py:10: error: Name "undefined_var" is not defined [name-defined]`;

      const errors = classifier.parseErrors(output);

      expect(errors).toHaveLength(2);
      expect(errors[0].filePath).toBe('src/app.py');
      expect(errors[0].line).toBe(42);
      expect(errors[0].code).toBe('mypy:return-value');
      expect(errors[0].message).toContain('Incompatible return value type');
      expect(errors[1].code).toBe('mypy:name-defined');
    });

    it('should parse mypy error without bracketed code', () => {
      const output = `src/app.py:10: error: Missing return statement`;

      const errors = classifier.parseErrors(output);

      expect(errors).toHaveLength(1);
      expect(errors[0].code).toBe('mypy:error');
      expect(errors[0].message).toBe('Missing return statement');
    });

    it('should handle mixed output formats', () => {
      const output = `src/models.py:5: error: Missing type annotation [no-untyped-def]
FAILED tests/test_models.py::test_create - TypeError: unexpected keyword argument`;

      const errors = classifier.parseErrors(output);

      expect(errors).toHaveLength(2);
      // parsePytest runs before parseMypy, so pytest match comes first
      expect(errors[0].code).toBe('pytest:FAILED');
      expect(errors[1].code).toBe('mypy:no-untyped-def');
    });

    it('should parse SyntaxError traceback', () => {
      const output = `Traceback (most recent call last):
  File "src/parser.py", line 20, in parse
    eval(user_input)
SyntaxError: invalid syntax`;

      const errors = classifier.parseErrors(output);

      expect(errors).toHaveLength(1);
      expect(errors[0].code).toBe('SyntaxError');
      expect(errors[0].filePath).toBe('src/parser.py');
    });
  });

  describe('classifyError', () => {
    it('should classify ImportError in src/ as source', () => {
      const error: ParsedError = {
        filePath: 'src/app.py',
        line: 5,
        code: 'ImportError',
        message: "No module named 'foo'",
      };
      expect(classifier.classifyError(error)).toBe('source');
    });

    it('should classify ModuleNotFoundError in src/ as source', () => {
      const error: ParsedError = {
        filePath: 'src/utils.py',
        line: 1,
        code: 'ModuleNotFoundError',
        message: "No module named 'bar'",
      };
      expect(classifier.classifyError(error)).toBe('source');
    });

    it('should classify ImportError in test file as cascading', () => {
      const error: ParsedError = {
        filePath: 'tests/test_app.py',
        line: 3,
        code: 'ImportError',
        message: "cannot import name 'MyClass'",
      };
      expect(classifier.classifyError(error)).toBe('cascading');
    });

    it('should classify pytest failures as cascading', () => {
      const error: ParsedError = {
        filePath: 'tests/test_app.py',
        code: 'pytest:FAILED',
        message: 'test_login - AssertionError',
      };
      expect(classifier.classifyError(error)).toBe('cascading');
    });

    it('should classify mypy errors in src/ as source', () => {
      const error: ParsedError = {
        filePath: 'src/app.py',
        line: 42,
        code: 'mypy:return-value',
        message: 'Incompatible return value type',
      };
      expect(classifier.classifyError(error)).toBe('source');
    });

    it('should classify mypy errors in test files as cascading', () => {
      const error: ParsedError = {
        filePath: 'tests/test_app.py',
        line: 10,
        code: 'mypy:arg-type',
        message: 'Argument type error',
      };
      expect(classifier.classifyError(error)).toBe('cascading');
    });

    it('should classify SyntaxError in src/ as source', () => {
      const error: ParsedError = {
        filePath: 'src/parser.py',
        line: 20,
        code: 'SyntaxError',
        message: 'invalid syntax',
      };
      expect(classifier.classifyError(error)).toBe('source');
    });

    it('should classify unknown errors as cascading by default', () => {
      const error: ParsedError = {
        filePath: 'src/app.py',
        line: 10,
        code: 'RuntimeError',
        message: 'something went wrong',
      };
      expect(classifier.classifyError(error)).toBe('cascading');
    });
  });

  describe('classifyAndSort', () => {
    it('should separate source and cascading errors', () => {
      const errors: ParsedError[] = [
        { filePath: 'src/app.py', line: 5, code: 'ImportError', message: 'missing module' },
        { filePath: 'tests/test_app.py', code: 'pytest:FAILED', message: 'test failed' },
        { filePath: 'src/utils.py', line: 10, code: 'mypy:return-value', message: 'type error' },
      ];

      const result = classifier.classifyAndSort(errors);

      expect(result.source).toHaveLength(2);
      expect(result.cascading).toHaveLength(1);
      expect(result.source[0].code).toBe('ImportError');
      expect(result.source[1].code).toBe('mypy:return-value');
      expect(result.cascading[0].code).toBe('pytest:FAILED');
    });

    it('should handle empty array', () => {
      const result = classifier.classifyAndSort([]);
      expect(result.source).toEqual([]);
      expect(result.cascading).toEqual([]);
    });
  });
});
