import type { TechStack } from '../types/index.js';
import type { IErrorClassifier } from './error-classifier-types.js';
import { TypeScriptErrorClassifier } from './typescript-error-classifier.js';
import { PythonErrorClassifier } from './python-error-classifier.js';
import { GoErrorClassifier } from './go-error-classifier.js';
import { RustErrorClassifier } from './rust-error-classifier.js';

/**
 * Registry for language-specific error classifiers.
 * Looks up the appropriate classifier based on the project's tech stack.
 */
export class ErrorClassifierRegistry {
  private classifiers: IErrorClassifier[] = [];

  register(classifier: IErrorClassifier): void {
    this.classifiers.push(classifier);
  }

  getClassifier(stack: TechStack): IErrorClassifier | undefined {
    return this.classifiers.find((c) => c.supportedStacks.includes(stack));
  }

  getClassifiers(): IErrorClassifier[] {
    return [...this.classifiers];
  }
}

let instance: ErrorClassifierRegistry | undefined;

export function getErrorClassifierRegistry(): ErrorClassifierRegistry {
  if (!instance) {
    instance = new ErrorClassifierRegistry();
    instance.register(new TypeScriptErrorClassifier());
    instance.register(new PythonErrorClassifier());
    instance.register(new GoErrorClassifier());
    instance.register(new RustErrorClassifier());
  }
  return instance;
}

export function resetErrorClassifierRegistry(): void {
  instance = undefined;
}
