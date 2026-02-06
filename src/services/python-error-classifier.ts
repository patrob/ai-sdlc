import type { TechStack } from '../types/index.js';
import type {
  IErrorClassifier,
  ParsedError,
  ErrorClassification,
  ClassifiedErrors,
} from './error-classifier-types.js';

/**
 * Python error classifier supporting traceback, pytest, and mypy output formats.
 */
export class PythonErrorClassifier implements IErrorClassifier {
  readonly supportedStacks: TechStack[] = ['python-pip', 'python-poetry', 'python-uv'];

  parseErrors(output: string): ParsedError[] {
    if (!output || output.trim() === '') {
      return [];
    }

    const errors: ParsedError[] = [];

    this.parseTracebacks(output, errors);
    this.parsePytest(output, errors);
    this.parseMypy(output, errors);

    return errors;
  }

  classifyError(error: ParsedError): ErrorClassification {
    // Import errors in non-test files are source errors
    if (this.isImportError(error) && !this.isTestFile(error.filePath)) {
      return 'source';
    }

    // Syntax errors in non-test files are source errors
    if (error.code === 'SyntaxError' && !this.isTestFile(error.filePath)) {
      return 'source';
    }

    // Mypy type errors in non-test files are source errors
    if (error.code.startsWith('mypy:') && !this.isTestFile(error.filePath)) {
      return 'source';
    }

    // Test failures are cascading
    if (error.code === 'pytest:FAILED' || this.isTestFile(error.filePath)) {
      return 'cascading';
    }

    // Conservative default
    return 'cascading';
  }

  classifyAndSort(errors: ParsedError[]): ClassifiedErrors {
    const source: ParsedError[] = [];
    const cascading: ParsedError[] = [];

    for (const error of errors) {
      if (this.classifyError(error) === 'source') {
        source.push(error);
      } else {
        cascading.push(error);
      }
    }

    return { source, cascading };
  }

  private parseTracebacks(output: string, errors: ParsedError[]): void {
    // Match: File "path", line N, in func
    const tracebackPattern = /^\s*File "(.+?)", line (\d+)(?:, in .+)?$/gm;
    // Look for the error line that follows the traceback
    const lines = output.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const match = tracebackPattern.exec(lines[i]);
      if (match) {
        const [, filePath, lineStr] = match;
        // Look ahead for the error type line (e.g., "ImportError: ...")
        let errorCode = 'Error';
        let errorMessage = '';

        for (let j = i + 1; j < lines.length && j <= i + 5; j++) {
          const errorMatch = /^(\w+Error|\w+Exception):\s*(.+)$/.exec(lines[j].trim());
          if (errorMatch) {
            errorCode = errorMatch[1];
            errorMessage = errorMatch[2];
            break;
          }
        }

        if (errorMessage) {
          errors.push({
            filePath,
            line: parseInt(lineStr, 10),
            code: errorCode,
            message: errorMessage,
          });
        }
      }
      // Reset regex lastIndex since we use it in a loop
      tracebackPattern.lastIndex = 0;
    }
  }

  private parsePytest(output: string, errors: ParsedError[]): void {
    // Match: FAILED path::test_name - ErrorType: message
    const pytestPattern = /^FAILED\s+(.+?)::(\S+)\s+-\s+(\w+(?:Error|Exception)?):?\s*(.+)$/gm;

    let match;
    while ((match = pytestPattern.exec(output)) !== null) {
      const [, filePath, testName, errorType, message] = match;
      errors.push({
        filePath,
        code: 'pytest:FAILED',
        message: `${testName} - ${errorType}: ${message}`,
      });
    }
  }

  private parseMypy(output: string, errors: ParsedError[]): void {
    // Match: path:line: error: message [code]
    const mypyPattern = /^(.+?):(\d+):\s*error:\s*(.+?)(?:\s+\[(.+?)\])?$/gm;

    let match;
    while ((match = mypyPattern.exec(output)) !== null) {
      const [, filePath, lineStr, message, code] = match;
      errors.push({
        filePath,
        line: parseInt(lineStr, 10),
        code: code ? `mypy:${code}` : 'mypy:error',
        message,
      });
    }
  }

  private isImportError(error: ParsedError): boolean {
    return error.code === 'ImportError' || error.code === 'ModuleNotFoundError';
  }

  private isTestFile(filePath: string): boolean {
    // Python test file patterns
    if (/test_\w+\.py$/.test(filePath) || /_test\.py$/.test(filePath)) {
      return true;
    }
    if (/(^|[\\/])tests?[\\/]/.test(filePath)) {
      return true;
    }
    return false;
  }
}
