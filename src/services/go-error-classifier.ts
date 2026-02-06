import type { TechStack } from '../types/index.js';
import type {
  IErrorClassifier,
  ParsedError,
  ErrorClassification,
  ClassifiedErrors,
} from './error-classifier-types.js';

/**
 * Go error classifier supporting compiler, go test, and go vet output formats.
 */
export class GoErrorClassifier implements IErrorClassifier {
  readonly supportedStacks: TechStack[] = ['go-mod'];

  parseErrors(output: string): ParsedError[] {
    if (!output || output.trim() === '') {
      return [];
    }

    const errors: ParsedError[] = [];

    this.parseCompilerErrors(output, errors);
    this.parseTestFailures(output, errors);
    this.parseVetErrors(output, errors);

    return errors;
  }

  classifyError(error: ParsedError): ErrorClassification {
    // Test failures are cascading
    if (error.code === 'go:test:FAIL') {
      return 'cascading';
    }

    // Undefined variable/type in non-test files are source errors
    if (this.isUndefinedError(error) && !this.isTestFile(error.filePath)) {
      return 'source';
    }

    // Syntax errors in non-test files are source errors
    if (error.code === 'go:syntax' && !this.isTestFile(error.filePath)) {
      return 'source';
    }

    // Type errors in non-test files are source errors
    if (error.code === 'go:type' && !this.isTestFile(error.filePath)) {
      return 'source';
    }

    // Import errors in non-test files are source errors
    if (error.code === 'go:import' && !this.isTestFile(error.filePath)) {
      return 'source';
    }

    // Vet errors in non-test files are source errors
    if (error.code === 'go:vet' && !this.isTestFile(error.filePath)) {
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
    // Match: ./file.go:line:col: message
    // Also handles: file.go:line:col: message (without ./)
    const compilerPattern = /^\.?\/?([\w./\\-]+\.go):(\d+):(\d+):\s*(.+)$/gm;

    let match;
    while ((match = compilerPattern.exec(output)) !== null) {
      const [, filePath, lineStr, colStr, message] = match;
      errors.push({
        filePath,
        line: parseInt(lineStr, 10),
        column: parseInt(colStr, 10),
        code: this.categorizeGoError(message),
        message,
      });
    }
  }

  private parseTestFailures(output: string, errors: ParsedError[]): void {
    // Match: --- FAIL: TestName (duration)
    const testPattern = /^--- FAIL:\s+(\S+)\s+\((.+?)\)$/gm;

    let match;
    while ((match = testPattern.exec(output)) !== null) {
      const [, testName, duration] = match;
      errors.push({
        filePath: '',
        code: 'go:test:FAIL',
        message: `${testName} (${duration})`,
      });
    }
  }

  private parseVetErrors(output: string, errors: ParsedError[]): void {
    // Match: # package\nvet: ./file.go:line:col: message
    // Or: vet: ./file.go:line: message
    const vetPattern = /^(?:vet:\s+)?\.?\/?(\S+\.go):(\d+):(?:(\d+):)?\s*(.+)$/gm;
    const lines = output.split('\n');

    let inVetSection = false;
    for (const line of lines) {
      if (line.startsWith('# ') || line.includes('go vet')) {
        inVetSection = true;
        continue;
      }

      if (inVetSection) {
        vetPattern.lastIndex = 0;
        const match = vetPattern.exec(line);
        if (match) {
          const [, filePath, lineStr, colStr, message] = match;
          // Skip if already captured by compiler error parser
          const isDuplicate = errors.some(
            (e) => e.filePath === filePath && e.line === parseInt(lineStr, 10) && e.message === message,
          );
          if (!isDuplicate) {
            errors.push({
              filePath,
              line: parseInt(lineStr, 10),
              column: colStr ? parseInt(colStr, 10) : undefined,
              code: 'go:vet',
              message,
            });
          }
        }
      }
    }
  }

  private categorizeGoError(message: string): string {
    if (/undefined:/.test(message) || /undeclared name:/.test(message)) {
      return 'go:undefined';
    }
    if (/cannot use|cannot convert|incompatible type/.test(message)) {
      return 'go:type';
    }
    if (/syntax error/.test(message) || /expected/.test(message)) {
      return 'go:syntax';
    }
    if (/could not import|imported and not used/.test(message)) {
      return 'go:import';
    }
    return 'go:error';
  }

  private isUndefinedError(error: ParsedError): boolean {
    return error.code === 'go:undefined';
  }

  private isTestFile(filePath: string): boolean {
    return /_test\.go$/.test(filePath);
  }
}
