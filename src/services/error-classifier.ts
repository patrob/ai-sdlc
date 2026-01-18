/**
 * TypeScript Error Classification Service
 *
 * Classifies TypeScript compiler errors into two categories:
 * - Source errors: Root causes in production code (e.g., missing type definitions)
 * - Cascading errors: Downstream effects caused by source errors (e.g., test file imports failing)
 *
 * This enables the implementation agent to prioritize fixing root causes first,
 * which often resolves multiple cascading errors automatically.
 */

/**
 * Structured representation of a TypeScript compiler error
 */
export interface TypeScriptError {
  /** The file path where the error occurred */
  filePath: string;
  /** The line number (1-indexed) where the error occurred */
  line?: number;
  /** The column number (1-indexed) where the error occurred */
  column?: number;
  /** The TypeScript error code (e.g., "TS2322") */
  code: string;
  /** The error message text */
  message: string;
}

/**
 * Result of classifying and sorting TypeScript errors
 */
export interface ClassifiedErrors {
  /** Source errors that are root causes and should be fixed first */
  source: TypeScriptError[];
  /** Cascading errors that may resolve automatically when source errors are fixed */
  cascading: TypeScriptError[];
}

/**
 * Error classification type
 */
export type ErrorClassification = 'source' | 'cascading';

/**
 * Parses TypeScript compiler output and extracts structured error information.
 *
 * Expected format: `<filePath>(<line>,<col>): error <code>: <message>`
 * Example: `src/app.tsx(59,12): error TS2322: Type 'string' is not assignable to type 'number'.`
 *
 * @param buildOutput - Raw output from TypeScript compiler (tsc)
 * @returns Array of structured TypeScript errors
 *
 * @example
 * ```typescript
 * const output = "src/app.tsx(59,12): error TS2322: Type 'string' is not assignable to type 'number'.";
 * const errors = parseTypeScriptErrors(output);
 * // errors[0] = { filePath: 'src/app.tsx', line: 59, column: 12, code: 'TS2322', message: '...' }
 * ```
 */
export function parseTypeScriptErrors(buildOutput: string): TypeScriptError[] {
  if (!buildOutput || buildOutput.trim() === '') {
    return [];
  }

  const errors: TypeScriptError[] = [];
  // Regex pattern to match TypeScript error format:
  // <filePath>(<line>,<col>): error <code>: <message>
  // Supports both Windows (C:\...) and Unix (/...) paths
  const tsErrorPattern = /^(.+?)\((\d+),(\d+)\):\s*error\s+(TS\d+):\s*(.+)$/gm;

  let match;
  while ((match = tsErrorPattern.exec(buildOutput)) !== null) {
    const [, filePath, lineStr, colStr, code, message] = match;

    errors.push({
      filePath: filePath.trim(),
      line: parseInt(lineStr, 10),
      column: parseInt(colStr, 10),
      code: code.trim(),
      message: message.trim(),
    });
  }

  return errors;
}

/**
 * Determines if a file path points to a test file.
 *
 * Test files are identified by:
 * - File extension: .test.ts, .test.tsx, .spec.ts, .spec.tsx, .test.js, .test.jsx, .spec.js, .spec.jsx
 * - Directory patterns: tests/, __tests__/
 *
 * @param filePath - The file path to check
 * @returns true if the file is a test file, false otherwise
 */
export function isTestFile(filePath: string): boolean {
  // Check for test file extensions
  if (/\.(test|spec)\.(ts|tsx|js|jsx)$/.test(filePath)) {
    return true;
  }

  // Check for test directories (handle both Windows and Unix path separators)
  // Also handle paths that start with the directory name (e.g., "tests/app.ts")
  if (/(^|[\\/])tests?[\\/]/.test(filePath)) {
    return true;
  }

  // Check for __tests__ directory
  // Also handle paths that start with __tests__ (e.g., "__tests__/app.ts")
  if (/(^|[\\/])__tests__[\\/]/.test(filePath)) {
    return true;
  }

  return false;
}

/**
 * Determines if a file path points to a type definition file.
 *
 * Type definition files are identified by:
 * - File extension: .d.ts
 * - Directory patterns: types/, @types/
 *
 * @param filePath - The file path to check
 * @returns true if the file is a type definition file, false otherwise
 */
export function isTypeDefinitionFile(filePath: string): boolean {
  // Check for .d.ts extension
  if (filePath.endsWith('.d.ts')) {
    return true;
  }

  // Check for types/ directory (handle both Windows and Unix path separators)
  // Also handle paths that start with types/ (e.g., "types/global.ts")
  if (/(^|[\\/])types[\\/]/.test(filePath)) {
    return true;
  }

  // Check for @types/ directory
  // Also handle paths that start with @types/ (e.g., "@types/custom/foo.ts")
  if (/(^|[\\/])@types[\\/]/.test(filePath)) {
    return true;
  }

  return false;
}

/**
 * Classifies a single TypeScript error as either a source error (root cause)
 * or a cascading error (downstream effect).
 *
 * Classification logic:
 * 1. Known cascading-only codes (TS2345) → cascading
 * 2. Known source codes (TS2304, TS2339) in non-test files → source
 * 3. Context-dependent codes (TS2307, TS2322) → analyze file path
 * 4. Conservative default → cascading
 *
 * @param error - The TypeScript error to classify
 * @returns 'source' if root cause, 'cascading' if downstream effect
 *
 * @example
 * ```typescript
 * const error = { code: 'TS2304', filePath: 'src/app.ts', message: 'Cannot find name Foo' };
 * const classification = classifyError(error); // 'source'
 * ```
 */
export function classifyError(error: TypeScriptError): ErrorClassification {
  const { code, filePath } = error;

  // Known cascading-only error codes
  const CASCADING_ONLY_CODES = ['TS2345']; // Argument type mismatch

  // Known source error codes (when in non-test files)
  const SOURCE_ERROR_CODES = ['TS2304', 'TS2339']; // Cannot find name, Property does not exist

  // Priority 1: Known cascading-only codes
  if (CASCADING_ONLY_CODES.includes(code)) {
    return 'cascading';
  }

  // Priority 2: Known source codes in non-test files
  if (SOURCE_ERROR_CODES.includes(code) && !isTestFile(filePath)) {
    return 'source';
  }

  // Priority 3: Context-dependent codes need path analysis
  if (code === 'TS2307') {
    // Module not found: source in src, cascading in tests
    return isTestFile(filePath) ? 'cascading' : 'source';
  }

  if (code === 'TS2322') {
    // Type mismatch: source in type definitions, cascading elsewhere
    return isTypeDefinitionFile(filePath) ? 'source' : 'cascading';
  }

  // Priority 4: Conservative default (when uncertain)
  return 'cascading';
}

/**
 * Classifies and sorts multiple TypeScript errors into source and cascading categories.
 *
 * Source errors are prioritized for fixing as they may automatically resolve
 * multiple cascading errors.
 *
 * @param errors - Array of TypeScript errors to classify
 * @returns Object with separated source and cascading error arrays
 *
 * @example
 * ```typescript
 * const errors = [
 *   { code: 'TS2304', filePath: 'src/app.ts', message: '...' },
 *   { code: 'TS2307', filePath: 'tests/app.test.ts', message: '...' }
 * ];
 * const classified = classifyAndSortErrors(errors);
 * // classified.source = [{ code: 'TS2304', ... }]
 * // classified.cascading = [{ code: 'TS2307', ... }]
 * ```
 */
export function classifyAndSortErrors(errors: TypeScriptError[]): ClassifiedErrors {
  const source: TypeScriptError[] = [];
  const cascading: TypeScriptError[] = [];

  for (const error of errors) {
    const classification = classifyError(error);
    if (classification === 'source') {
      source.push(error);
    } else {
      cascading.push(error);
    }
  }

  return { source, cascading };
}
