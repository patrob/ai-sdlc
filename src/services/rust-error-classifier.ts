import type { TechStack } from '../types/index.js';
import type {
  IErrorClassifier,
  ParsedError,
  ErrorClassification,
  ClassifiedErrors,
} from './error-classifier-types.js';

/**
 * Rust error classifier supporting compiler errors and cargo test output.
 */
export class RustErrorClassifier implements IErrorClassifier {
  readonly supportedStacks: TechStack[] = ['rust-cargo'];

  parseErrors(output: string): ParsedError[] {
    if (!output || output.trim() === '') {
      return [];
    }

    const errors: ParsedError[] = [];

    this.parseCompilerErrors(output, errors);
    this.parseTestFailures(output, errors);

    return errors;
  }

  classifyError(error: ParsedError): ErrorClassification {
    // Test failures are cascading
    if (error.code === 'cargo:test:FAILED') {
      return 'cascading';
    }

    // Type and borrow errors in src/ are source errors
    if (this.isTypeOrBorrowError(error) && this.isSrcFile(error.filePath)) {
      return 'source';
    }

    // Unresolved imports in src/ are source errors
    if (error.code.startsWith('E0432') && this.isSrcFile(error.filePath)) {
      return 'source';
    }

    // Undefined names in src/ are source errors
    if (error.code.startsWith('E0425') && this.isSrcFile(error.filePath)) {
      return 'source';
    }

    // Missing struct fields in src/ are source errors
    if (error.code.startsWith('E0063') && this.isSrcFile(error.filePath)) {
      return 'source';
    }

    // Errors in test files are cascading
    if (this.isTestFile(error.filePath)) {
      return 'cascading';
    }

    // Errors in src/ without a specific category are still source
    if (this.isSrcFile(error.filePath)) {
      return 'source';
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

  private parseCompilerErrors(output: string, errors: ParsedError[]): void {
    const lines = output.split('\n');

    for (let i = 0; i < lines.length; i++) {
      // Match: error[E0XXX]: message
      const errorMatch = /^error(?:\[(E\d{4})\])?:\s*(.+)$/.exec(lines[i]);
      if (errorMatch) {
        const [, errorCode, message] = errorMatch;

        // Look for location in subsequent lines: --> file:line:col
        let filePath = '';
        let line: number | undefined;
        let column: number | undefined;

        for (let j = i + 1; j < lines.length && j <= i + 5; j++) {
          const locMatch = /^\s*-->\s*(.+?):(\d+):(\d+)$/.exec(lines[j]);
          if (locMatch) {
            filePath = locMatch[1];
            line = parseInt(locMatch[2], 10);
            column = parseInt(locMatch[3], 10);
            break;
          }
        }

        errors.push({
          filePath,
          line,
          column,
          code: errorCode || 'error',
          message,
        });
      }
    }
  }

  private parseTestFailures(output: string, errors: ParsedError[]): void {
    // Match: test name ... FAILED
    const testPattern = /^test\s+(\S+)\s+\.\.\.\s+FAILED$/gm;

    let match;
    while ((match = testPattern.exec(output)) !== null) {
      const [, testName] = match;
      errors.push({
        filePath: '',
        code: 'cargo:test:FAILED',
        message: `test ${testName} failed`,
      });
    }
  }

  private isTypeOrBorrowError(error: ParsedError): boolean {
    // Type mismatch errors
    if (/^E030[0-9]$/.test(error.code) || /^E0308$/.test(error.code)) {
      return true;
    }
    // Borrow checker errors
    if (/^E050[0-9]$/.test(error.code) || /^E0515$/.test(error.code)) {
      return true;
    }
    // Lifetime errors
    if (/^E062[0-9]$/.test(error.code)) {
      return true;
    }
    return false;
  }

  private isSrcFile(filePath: string): boolean {
    return /(^|[\\/])src[\\/]/.test(filePath);
  }

  private isTestFile(filePath: string): boolean {
    // Rust test files in tests/ directory
    if (/(^|[\\/])tests[\\/]/.test(filePath)) {
      return true;
    }
    // Inline test modules (though these show up as src/ paths)
    return false;
  }
}
