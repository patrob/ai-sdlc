import { describe, it, expect } from 'vitest';
import {
  parseTypeScriptErrors,
  isTestFile,
  isTypeDefinitionFile,
  classifyError,
  classifyAndSortErrors,
  type TypeScriptError,
} from './error-classifier.js';

describe('parseTypeScriptErrors', () => {
  it('should parse standard TypeScript error format', () => {
    const output = "src/app.tsx(59,12): error TS2322: Type 'string' is not assignable to type 'number'.";
    const errors = parseTypeScriptErrors(output);

    expect(errors).toEqual([
      {
        filePath: 'src/app.tsx',
        line: 59,
        column: 12,
        code: 'TS2322',
        message: "Type 'string' is not assignable to type 'number'.",
      },
    ]);
  });

  it('should parse multiple errors in output', () => {
    const output = `
src/app.tsx(59,12): error TS2322: Type 'string' is not assignable to type 'number'.
tests/app.test.ts(60,1): error TS2307: Cannot find module '../app'.
src/types/foo.d.ts(10,5): error TS2304: Cannot find name 'Foo'.
    `.trim();

    const errors = parseTypeScriptErrors(output);

    expect(errors).toHaveLength(3);
    expect(errors[0].code).toBe('TS2322');
    expect(errors[0].filePath).toBe('src/app.tsx');
    expect(errors[1].code).toBe('TS2307');
    expect(errors[1].filePath).toBe('tests/app.test.ts');
    expect(errors[2].code).toBe('TS2304');
    expect(errors[2].filePath).toBe('src/types/foo.d.ts');
  });

  it('should return empty array for output without TypeScript errors', () => {
    const output = 'Build succeeded with 0 errors';
    expect(parseTypeScriptErrors(output)).toEqual([]);
  });

  it('should return empty array for empty string', () => {
    expect(parseTypeScriptErrors('')).toEqual([]);
  });

  it('should handle Windows-style paths', () => {
    const output = "C:\\Users\\dev\\src\\app.tsx(59,12): error TS2322: Type error.";
    const errors = parseTypeScriptErrors(output);

    expect(errors).toHaveLength(1);
    expect(errors[0].filePath).toBe('C:\\Users\\dev\\src\\app.tsx');
    expect(errors[0].line).toBe(59);
    expect(errors[0].column).toBe(12);
  });

  it('should handle Unix-style paths with forward slashes', () => {
    const output = "/home/dev/project/src/app.tsx(59,12): error TS2322: Type error.";
    const errors = parseTypeScriptErrors(output);

    expect(errors).toHaveLength(1);
    expect(errors[0].filePath).toBe('/home/dev/project/src/app.tsx');
  });

  it('should extract only the first line of multiline error messages', () => {
    const output = `
src/app.tsx(59,12): error TS2322: Type 'string' is not assignable to type 'number'.
  Type 'string' is not compatible with 'number'.
  Consider using type assertion or type guard.
    `.trim();

    const errors = parseTypeScriptErrors(output);

    expect(errors).toHaveLength(1);
    expect(errors[0].message).toBe("Type 'string' is not assignable to type 'number'.");
    expect(errors[0].message).not.toContain('Consider using');
  });

  it('should handle malformed error lines gracefully', () => {
    const output = `
src/app.tsx(59,12): error TS2322: Valid error.
This is not a valid error line
src/types.ts(10,5): error TS2304: Another valid error.
    `.trim();

    const errors = parseTypeScriptErrors(output);

    // Should only parse the valid error lines
    expect(errors).toHaveLength(2);
    expect(errors[0].code).toBe('TS2322');
    expect(errors[1].code).toBe('TS2304');
  });

  it('should handle errors with special characters in messages', () => {
    const output = "src/app.tsx(59,12): error TS2322: Type '{ foo: \"bar\" }' is not assignable.";
    const errors = parseTypeScriptErrors(output);

    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('{ foo: "bar" }');
  });

  it('should parse errors with different error codes', () => {
    const output = `
src/app.tsx(1,1): error TS2304: Cannot find name 'Foo'.
src/app.tsx(2,2): error TS2307: Cannot find module './missing'.
src/app.tsx(3,3): error TS2339: Property 'bar' does not exist.
src/app.tsx(4,4): error TS2345: Argument of type 'string' is not assignable.
    `.trim();

    const errors = parseTypeScriptErrors(output);

    expect(errors).toHaveLength(4);
    expect(errors.map((e) => e.code)).toEqual(['TS2304', 'TS2307', 'TS2339', 'TS2345']);
  });
});

describe('isTestFile', () => {
  it('should detect .test.ts files', () => {
    expect(isTestFile('src/app.test.ts')).toBe(true);
    expect(isTestFile('src/components/button.test.ts')).toBe(true);
  });

  it('should detect .test.tsx files', () => {
    expect(isTestFile('src/app.test.tsx')).toBe(true);
  });

  it('should detect .spec.ts files', () => {
    expect(isTestFile('src/app.spec.ts')).toBe(true);
    expect(isTestFile('src/components/button.spec.tsx')).toBe(true);
  });

  it('should detect files in tests/ directory', () => {
    expect(isTestFile('tests/integration/app.ts')).toBe(true);
    expect(isTestFile('tests/unit/button.tsx')).toBe(true);
  });

  it('should detect files in test/ directory (singular)', () => {
    expect(isTestFile('test/app.ts')).toBe(true);
  });

  it('should detect files in __tests__/ directory', () => {
    expect(isTestFile('src/__tests__/app.ts')).toBe(true);
    expect(isTestFile('__tests__/integration/app.ts')).toBe(true);
  });

  it('should handle Windows-style paths', () => {
    expect(isTestFile('C:\\project\\tests\\app.ts')).toBe(true);
    expect(isTestFile('C:\\project\\src\\app.test.ts')).toBe(true);
  });

  it('should return false for regular source files', () => {
    expect(isTestFile('src/app.ts')).toBe(false);
    expect(isTestFile('src/components/button.tsx')).toBe(false);
    expect(isTestFile('src/utils/helper.ts')).toBe(false);
  });

  it('should return false for type definition files', () => {
    expect(isTestFile('src/types/index.d.ts')).toBe(false);
  });

  it('should not be confused by "test" in regular filenames', () => {
    expect(isTestFile('src/testament.ts')).toBe(false);
    expect(isTestFile('src/latest.ts')).toBe(false);
  });
});

describe('isTypeDefinitionFile', () => {
  it('should detect .d.ts files', () => {
    expect(isTypeDefinitionFile('src/types/index.d.ts')).toBe(true);
    expect(isTypeDefinitionFile('src/app.d.ts')).toBe(true);
  });

  it('should detect files in types/ directory', () => {
    expect(isTypeDefinitionFile('src/types/user.ts')).toBe(true);
    expect(isTypeDefinitionFile('types/global.ts')).toBe(true);
  });

  it('should detect files in @types/ directory', () => {
    expect(isTypeDefinitionFile('node_modules/@types/react/index.d.ts')).toBe(true);
    expect(isTypeDefinitionFile('@types/custom/foo.ts')).toBe(true);
  });

  it('should handle Windows-style paths', () => {
    expect(isTypeDefinitionFile('C:\\project\\src\\types\\index.d.ts')).toBe(true);
    expect(isTypeDefinitionFile('C:\\project\\types\\global.ts')).toBe(true);
  });

  it('should return false for regular source files', () => {
    expect(isTypeDefinitionFile('src/app.ts')).toBe(false);
    expect(isTypeDefinitionFile('src/components/button.tsx')).toBe(false);
  });

  it('should return false for test files', () => {
    expect(isTypeDefinitionFile('src/app.test.ts')).toBe(false);
    expect(isTypeDefinitionFile('tests/integration/app.ts')).toBe(false);
  });
});

describe('classifyError', () => {
  describe('TS2304 - Cannot find name', () => {
    it('should classify as source in src files', () => {
      const error: TypeScriptError = {
        code: 'TS2304',
        filePath: 'src/app.ts',
        message: "Cannot find name 'Foo'.",
      };
      expect(classifyError(error)).toBe('source');
    });

    it('should classify as cascading in test files', () => {
      const error: TypeScriptError = {
        code: 'TS2304',
        filePath: 'tests/app.test.ts',
        message: "Cannot find name 'Foo'.",
      };
      expect(classifyError(error)).toBe('cascading');
    });
  });

  describe('TS2307 - Cannot find module', () => {
    it('should classify as source in src files', () => {
      const error: TypeScriptError = {
        code: 'TS2307',
        filePath: 'src/app.ts',
        message: "Cannot find module './missing'.",
      };
      expect(classifyError(error)).toBe('source');
    });

    it('should classify as cascading in test files', () => {
      const error: TypeScriptError = {
        code: 'TS2307',
        filePath: 'tests/app.test.ts',
        message: "Cannot find module '../app'.",
      };
      expect(classifyError(error)).toBe('cascading');
    });

    it('should classify as cascading in spec files', () => {
      const error: TypeScriptError = {
        code: 'TS2307',
        filePath: 'src/app.spec.ts',
        message: "Cannot find module './app'.",
      };
      expect(classifyError(error)).toBe('cascading');
    });
  });

  describe('TS2322 - Type mismatch', () => {
    it('should classify as source in type definition files', () => {
      const error: TypeScriptError = {
        code: 'TS2322',
        filePath: 'src/types/index.d.ts',
        message: "Type 'string' is not assignable to type 'number'.",
      };
      expect(classifyError(error)).toBe('source');
    });

    it('should classify as source in types/ directory', () => {
      const error: TypeScriptError = {
        code: 'TS2322',
        filePath: 'types/global.ts',
        message: "Type mismatch.",
      };
      expect(classifyError(error)).toBe('source');
    });

    it('should classify as cascading in regular src files', () => {
      const error: TypeScriptError = {
        code: 'TS2322',
        filePath: 'src/app.ts',
        message: "Type 'string' is not assignable to type 'number'.",
      };
      expect(classifyError(error)).toBe('cascading');
    });

    it('should classify as cascading in test files', () => {
      const error: TypeScriptError = {
        code: 'TS2322',
        filePath: 'tests/app.test.ts',
        message: "Type mismatch.",
      };
      expect(classifyError(error)).toBe('cascading');
    });
  });

  describe('TS2339 - Property does not exist', () => {
    it('should classify as source in src files', () => {
      const error: TypeScriptError = {
        code: 'TS2339',
        filePath: 'src/app.ts',
        message: "Property 'foo' does not exist on type 'Bar'.",
      };
      expect(classifyError(error)).toBe('source');
    });

    it('should classify as cascading in test files', () => {
      const error: TypeScriptError = {
        code: 'TS2339',
        filePath: 'tests/app.test.ts',
        message: "Property 'foo' does not exist.",
      };
      expect(classifyError(error)).toBe('cascading');
    });
  });

  describe('TS2345 - Argument type mismatch', () => {
    it('should always classify as cascading', () => {
      const error1: TypeScriptError = {
        code: 'TS2345',
        filePath: 'src/app.ts',
        message: "Argument of type 'string' is not assignable.",
      };
      expect(classifyError(error1)).toBe('cascading');

      const error2: TypeScriptError = {
        code: 'TS2345',
        filePath: 'tests/app.test.ts',
        message: "Argument of type 'string' is not assignable.",
      };
      expect(classifyError(error2)).toBe('cascading');
    });
  });

  describe('Unknown error codes', () => {
    it('should default to cascading for unknown error codes', () => {
      const error: TypeScriptError = {
        code: 'TS9999',
        filePath: 'src/app.ts',
        message: 'Unknown error.',
      };
      expect(classifyError(error)).toBe('cascading');
    });
  });
});

describe('classifyAndSortErrors', () => {
  it('should separate source and cascading errors', () => {
    const errors: TypeScriptError[] = [
      { code: 'TS2304', filePath: 'src/app.ts', message: 'Cannot find name Foo.' },
      { code: 'TS2307', filePath: 'tests/app.test.ts', message: 'Cannot find module.' },
      { code: 'TS2339', filePath: 'src/types.ts', message: 'Property does not exist.' },
      { code: 'TS2345', filePath: 'src/utils.ts', message: 'Argument type mismatch.' },
    ];

    const classified = classifyAndSortErrors(errors);

    expect(classified.source).toHaveLength(2);
    expect(classified.source.map((e) => e.code)).toEqual(['TS2304', 'TS2339']);

    expect(classified.cascading).toHaveLength(2);
    expect(classified.cascading.map((e) => e.code)).toEqual(['TS2307', 'TS2345']);
  });

  it('should preserve error details in classification', () => {
    const errors: TypeScriptError[] = [
      {
        code: 'TS2304',
        filePath: 'src/app.ts',
        line: 59,
        column: 12,
        message: 'Cannot find name Foo.',
      },
    ];

    const classified = classifyAndSortErrors(errors);

    expect(classified.source[0]).toEqual({
      code: 'TS2304',
      filePath: 'src/app.ts',
      line: 59,
      column: 12,
      message: 'Cannot find name Foo.',
    });
  });

  it('should handle empty error array', () => {
    const classified = classifyAndSortErrors([]);

    expect(classified.source).toEqual([]);
    expect(classified.cascading).toEqual([]);
  });

  it('should handle all source errors', () => {
    const errors: TypeScriptError[] = [
      { code: 'TS2304', filePath: 'src/app.ts', message: 'Error 1.' },
      { code: 'TS2339', filePath: 'src/types.ts', message: 'Error 2.' },
    ];

    const classified = classifyAndSortErrors(errors);

    expect(classified.source).toHaveLength(2);
    expect(classified.cascading).toHaveLength(0);
  });

  it('should handle all cascading errors', () => {
    const errors: TypeScriptError[] = [
      { code: 'TS2345', filePath: 'src/app.ts', message: 'Error 1.' },
      { code: 'TS2307', filePath: 'tests/app.test.ts', message: 'Error 2.' },
    ];

    const classified = classifyAndSortErrors(errors);

    expect(classified.source).toHaveLength(0);
    expect(classified.cascading).toHaveLength(2);
  });

  it('should classify each error independently', () => {
    const errors: TypeScriptError[] = [
      { code: 'TS2307', filePath: 'src/app.ts', message: 'Missing module in src.' },
      { code: 'TS2307', filePath: 'tests/app.test.ts', message: 'Missing module in test.' },
    ];

    const classified = classifyAndSortErrors(errors);

    expect(classified.source).toHaveLength(1);
    expect(classified.source[0].filePath).toBe('src/app.ts');

    expect(classified.cascading).toHaveLength(1);
    expect(classified.cascading[0].filePath).toBe('tests/app.test.ts');
  });

  it('should maintain original order within each category', () => {
    const errors: TypeScriptError[] = [
      { code: 'TS2304', filePath: 'src/c.ts', message: 'Error C.' },
      { code: 'TS2304', filePath: 'src/a.ts', message: 'Error A.' },
      { code: 'TS2304', filePath: 'src/b.ts', message: 'Error B.' },
    ];

    const classified = classifyAndSortErrors(errors);

    expect(classified.source.map((e) => e.filePath)).toEqual([
      'src/c.ts',
      'src/a.ts',
      'src/b.ts',
    ]);
  });
});
