import type { TechStack } from '../types/index.js';
import type {
  IErrorClassifier,
  ParsedError,
  ErrorClassification,
  ClassifiedErrors,
} from './error-classifier-types.js';
import {
  parseTypeScriptErrors,
  classifyError,
  classifyAndSortErrors,
} from './error-classifier.js';

/**
 * TypeScript error classifier wrapping the existing functions
 * from error-classifier.ts into the IErrorClassifier interface.
 */
export class TypeScriptErrorClassifier implements IErrorClassifier {
  readonly supportedStacks: TechStack[] = ['node-npm', 'node-yarn', 'node-pnpm', 'node-bun'];

  parseErrors(output: string): ParsedError[] {
    return parseTypeScriptErrors(output);
  }

  classifyError(error: ParsedError): ErrorClassification {
    return classifyError(error);
  }

  classifyAndSort(errors: ParsedError[]): ClassifiedErrors {
    return classifyAndSortErrors(errors);
  }
}
