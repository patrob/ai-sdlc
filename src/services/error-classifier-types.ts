import type { TechStack } from '../types/index.js';

/** Generic parsed error from any language/tool */
export interface ParsedError {
  filePath: string;
  line?: number;
  column?: number;
  code: string;
  message: string;
}

/** Classification result */
export interface ClassifiedErrors {
  source: ParsedError[];
  cascading: ParsedError[];
}

/** Error classification type */
export type ErrorClassification = 'source' | 'cascading';

/** Interface that all error classifiers must implement */
export interface IErrorClassifier {
  readonly supportedStacks: TechStack[];
  parseErrors(output: string): ParsedError[];
  classifyError(error: ParsedError): ErrorClassification;
  classifyAndSort(errors: ParsedError[]): ClassifiedErrors;
}
