import { describe, it, expect, beforeEach } from 'vitest';
import {
  ErrorClassifierRegistry,
  getErrorClassifierRegistry,
  resetErrorClassifierRegistry,
} from './error-classifier-registry.js';
import type { IErrorClassifier, ParsedError, ClassifiedErrors, ErrorClassification } from './error-classifier-types.js';
import type { TechStack } from '../types/index.js';

describe('ErrorClassifierRegistry', () => {
  describe('register and getClassifier', () => {
    it('should register and retrieve a classifier by stack', () => {
      const registry = new ErrorClassifierRegistry();
      const mockClassifier: IErrorClassifier = {
        supportedStacks: ['node-npm' as TechStack],
        parseErrors: () => [],
        classifyError: () => 'source' as ErrorClassification,
        classifyAndSort: () => ({ source: [], cascading: [] }),
      };

      registry.register(mockClassifier);

      expect(registry.getClassifier('node-npm')).toBe(mockClassifier);
    });

    it('should return undefined for unregistered stack', () => {
      const registry = new ErrorClassifierRegistry();

      expect(registry.getClassifier('ruby-bundler')).toBeUndefined();
    });

    it('should return the first matching classifier when multiple support same stack', () => {
      const registry = new ErrorClassifierRegistry();
      const first: IErrorClassifier = {
        supportedStacks: ['node-npm' as TechStack],
        parseErrors: () => [],
        classifyError: () => 'source' as ErrorClassification,
        classifyAndSort: () => ({ source: [], cascading: [] }),
      };
      const second: IErrorClassifier = {
        supportedStacks: ['node-npm' as TechStack],
        parseErrors: () => [{ filePath: '', code: '', message: '' }],
        classifyError: () => 'cascading' as ErrorClassification,
        classifyAndSort: () => ({ source: [], cascading: [] }),
      };

      registry.register(first);
      registry.register(second);

      expect(registry.getClassifier('node-npm')).toBe(first);
    });

    it('should match classifier supporting multiple stacks', () => {
      const registry = new ErrorClassifierRegistry();
      const classifier: IErrorClassifier = {
        supportedStacks: ['node-npm', 'node-yarn', 'node-pnpm'] as TechStack[],
        parseErrors: () => [],
        classifyError: () => 'source' as ErrorClassification,
        classifyAndSort: () => ({ source: [], cascading: [] }),
      };

      registry.register(classifier);

      expect(registry.getClassifier('node-npm')).toBe(classifier);
      expect(registry.getClassifier('node-yarn')).toBe(classifier);
      expect(registry.getClassifier('node-pnpm')).toBe(classifier);
    });
  });

  describe('getClassifiers', () => {
    it('should return all registered classifiers', () => {
      const registry = new ErrorClassifierRegistry();
      const c1: IErrorClassifier = {
        supportedStacks: ['node-npm' as TechStack],
        parseErrors: () => [],
        classifyError: () => 'source' as ErrorClassification,
        classifyAndSort: () => ({ source: [], cascading: [] }),
      };
      const c2: IErrorClassifier = {
        supportedStacks: ['python-pip' as TechStack],
        parseErrors: () => [],
        classifyError: () => 'source' as ErrorClassification,
        classifyAndSort: () => ({ source: [], cascading: [] }),
      };

      registry.register(c1);
      registry.register(c2);

      const all = registry.getClassifiers();
      expect(all).toHaveLength(2);
      expect(all).toContain(c1);
      expect(all).toContain(c2);
    });

    it('should return a copy of the classifiers array', () => {
      const registry = new ErrorClassifierRegistry();
      const c1: IErrorClassifier = {
        supportedStacks: ['node-npm' as TechStack],
        parseErrors: () => [],
        classifyError: () => 'source' as ErrorClassification,
        classifyAndSort: () => ({ source: [], cascading: [] }),
      };

      registry.register(c1);

      const all = registry.getClassifiers();
      all.push(c1); // mutate the returned array
      expect(registry.getClassifiers()).toHaveLength(1); // original unchanged
    });

    it('should return empty array when no classifiers registered', () => {
      const registry = new ErrorClassifierRegistry();
      expect(registry.getClassifiers()).toEqual([]);
    });
  });

  describe('getErrorClassifierRegistry (singleton)', () => {
    beforeEach(() => {
      resetErrorClassifierRegistry();
    });

    it('should return a registry with built-in classifiers', () => {
      const registry = getErrorClassifierRegistry();

      expect(registry.getClassifier('node-npm')).toBeDefined();
      expect(registry.getClassifier('python-pip')).toBeDefined();
      expect(registry.getClassifier('go-mod')).toBeDefined();
      expect(registry.getClassifier('rust-cargo')).toBeDefined();
    });

    it('should return the same instance on multiple calls', () => {
      const r1 = getErrorClassifierRegistry();
      const r2 = getErrorClassifierRegistry();

      expect(r1).toBe(r2);
    });

    it('should return a fresh instance after reset', () => {
      const r1 = getErrorClassifierRegistry();
      resetErrorClassifierRegistry();
      const r2 = getErrorClassifierRegistry();

      expect(r1).not.toBe(r2);
    });

    it('should have 4 built-in classifiers', () => {
      const registry = getErrorClassifierRegistry();
      expect(registry.getClassifiers()).toHaveLength(4);
    });

    it('should allow registering custom classifiers', () => {
      const registry = getErrorClassifierRegistry();
      const custom: IErrorClassifier = {
        supportedStacks: ['ruby-bundler' as TechStack],
        parseErrors: () => [],
        classifyError: () => 'source' as ErrorClassification,
        classifyAndSort: () => ({ source: [], cascading: [] }),
      };

      registry.register(custom);

      expect(registry.getClassifier('ruby-bundler')).toBe(custom);
      expect(registry.getClassifiers()).toHaveLength(5);
    });
  });
});
