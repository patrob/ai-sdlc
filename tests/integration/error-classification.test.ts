import { describe, it, expect } from 'vitest';
import { buildRetryPrompt } from '../../src/agents/implementation.js';

/**
 * Integration tests for TypeScript error classification in the implementation agent.
 *
 * These tests verify that the full error classification flow works correctly:
 * 1. TypeScript errors are parsed from build output
 * 2. Errors are classified into source vs cascading
 * 3. The retry prompt includes classified errors with guidance
 */
describe('Error Classification Integration', () => {
  it('should integrate error classification into buildRetryPrompt', () => {
    // Simulate a build output with mixed TypeScript errors
    const buildOutput = `
Build started at 2024-01-01T12:00:00Z

src/app.tsx(59,12): error TS2304: Cannot find name 'Foo'.
tests/app.test.ts(60,1): error TS2307: Cannot find module '../app'.
src/types/user.d.ts(10,5): error TS2322: Type 'string' is not assignable to type 'number'.
src/utils.ts(20,3): error TS2345: Argument of type 'string' is not assignable to parameter of type 'number'.

Build completed with 4 errors
    `.trim();

    const prompt = buildRetryPrompt('', buildOutput, 1, 3);

    // Verify prompt contains classification sections
    expect(prompt).toContain('TYPESCRIPT ERROR CLASSIFICATION');
    expect(prompt).toContain('SOURCE ERRORS');
    expect(prompt).toContain('CASCADING ERRORS');

    // Verify source errors are listed
    expect(prompt).toContain('TS2304 in src/app.tsx:59');
    expect(prompt).toContain("Cannot find name 'Foo'");
    expect(prompt).toContain('TS2322 in src/types/user.d.ts:10');

    // Verify cascading errors are listed
    expect(prompt).toContain('TS2307 in tests/app.test.ts:60');
    expect(prompt).toContain('TS2345 in src/utils.ts:20');

    // Verify guidance is included
    expect(prompt).toContain('Fix source errors first');
    expect(prompt).toContain('may automatically resolve');
  });

  it('should show source errors before cascading errors', () => {
    const buildOutput = `
tests/app.test.ts(1,1): error TS2307: Cannot find module '../app'.
src/app.ts(2,2): error TS2304: Cannot find name 'Foo'.
src/utils.ts(3,3): error TS2345: Argument type mismatch.
    `.trim();

    const prompt = buildRetryPrompt('', buildOutput, 2, 3);

    const sourceIndex = prompt.indexOf('SOURCE ERRORS');
    const cascadingIndex = prompt.indexOf('CASCADING ERRORS');

    expect(sourceIndex).toBeGreaterThan(0);
    expect(cascadingIndex).toBeGreaterThan(0);
    expect(sourceIndex).toBeLessThan(cascadingIndex);
  });

  it('should handle real-world TypeScript error output format', () => {
    // Real TypeScript compiler output format
    const buildOutput = `
node_modules/.bin/tsc --noEmit

src/services/error-classifier.ts(45,10): error TS2304: Cannot find name 'TypeScriptError'.
src/services/error-classifier.ts(67,25): error TS2339: Property 'filePath' does not exist on type '{ code: string; message: string; }'.
tests/services/error-classifier.test.ts(15,1): error TS2307: Cannot find module '../services/error-classifier'.

Found 3 errors in 2 files.
    `.trim();

    const prompt = buildRetryPrompt('', buildOutput, 1, 3);

    // Should correctly classify based on real format
    expect(prompt).toContain('SOURCE ERRORS');
    expect(prompt).toContain('TS2304 in src/services/error-classifier.ts:45');
    expect(prompt).toContain('TS2339 in src/services/error-classifier.ts:67');

    expect(prompt).toContain('CASCADING ERRORS');
    expect(prompt).toContain('TS2307 in tests/services/error-classifier.test.ts:15');
  });

  it('should preserve original build output alongside classification', () => {
    const buildOutput = `
Build starting...
src/app.ts(1,1): error TS2304: Cannot find name 'Foo'.
Warning: Unused import
Build completed
    `.trim();

    const prompt = buildRetryPrompt('', buildOutput, 1, 3);

    // Should have classification section
    expect(prompt).toContain('TYPESCRIPT ERROR CLASSIFICATION');
    expect(prompt).toContain('SOURCE ERRORS');

    // Should also have full build output for context
    expect(prompt).toContain('Build Output:');
    expect(prompt).toContain('Build starting');
    expect(prompt).toContain('Warning: Unused import');
  });

  it('should handle empty build output gracefully', () => {
    const buildOutput = '';

    const prompt = buildRetryPrompt('', buildOutput, 1, 3);

    // Should not error or include empty classification sections
    expect(prompt).not.toContain('TYPESCRIPT ERROR CLASSIFICATION');
    expect(prompt).not.toContain('SOURCE ERRORS');
    expect(prompt).not.toContain('CASCADING ERRORS');

    // Should still have retry prompt structure
    expect(prompt).toContain('CRITICAL: Tests are failing');
  });

  it('should handle build output with no TypeScript errors', () => {
    const buildOutput = 'Build successful with 0 errors';

    const prompt = buildRetryPrompt('', buildOutput, 1, 3);

    expect(prompt).not.toContain('TYPESCRIPT ERROR CLASSIFICATION');
    expect(prompt).toContain('Build Output:');
    expect(prompt).toContain('Build successful');
  });

  it('should combine classification with dependency detection', () => {
    const buildOutput = `
src/app.ts(1,1): error TS2304: Cannot find name 'Foo'.
Cannot find module 'proper-lockfile'
tests/app.test.ts(2,2): error TS2307: Cannot find module '../app'.
    `.trim();

    const prompt = buildRetryPrompt('', buildOutput, 1, 3);

    // Should have both dependency detection and error classification
    expect(prompt).toContain('DEPENDENCY ISSUE DETECTED');
    expect(prompt).toContain('proper-lockfile');

    expect(prompt).toContain('TYPESCRIPT ERROR CLASSIFICATION');
    expect(prompt).toContain('SOURCE ERRORS');
    expect(prompt).toContain('TS2304');
  });

  it('should classify errors with different file path patterns', () => {
    const buildOutput = `
src/types/index.d.ts(1,1): error TS2322: Type error in definition file.
src/app.ts(2,2): error TS2322: Type error in regular file.
tests/__tests__/app.test.ts(3,3): error TS2307: Module not found in test.
src/__tests__/helper.spec.ts(4,4): error TS2307: Module not found in test.
    `.trim();

    const prompt = buildRetryPrompt('', buildOutput, 1, 3);

    // Type definition file TS2322 should be source
    const sourceSection = prompt.substring(
      prompt.indexOf('SOURCE ERRORS'),
      prompt.indexOf('CASCADING ERRORS')
    );
    expect(sourceSection).toContain('src/types/index.d.ts');

    // Test file TS2307 errors should be cascading
    const cascadingSection = prompt.substring(prompt.indexOf('CASCADING ERRORS'));
    expect(cascadingSection).toContain('tests/__tests__/app.test.ts');
    expect(cascadingSection).toContain('src/__tests__/helper.spec.ts');
  });

  it('should handle Windows-style paths in TypeScript errors', () => {
    const buildOutput = `
C:\\Users\\dev\\project\\src\\app.ts(59,12): error TS2304: Cannot find name 'Foo'.
C:\\Users\\dev\\project\\tests\\app.test.ts(60,1): error TS2307: Cannot find module.
    `.trim();

    const prompt = buildRetryPrompt('', buildOutput, 1, 3);

    expect(prompt).toContain('SOURCE ERRORS');
    expect(prompt).toContain('C:\\Users\\dev\\project\\src\\app.ts');
    expect(prompt).toContain('CASCADING ERRORS');
    expect(prompt).toContain('C:\\Users\\dev\\project\\tests\\app.test.ts');
  });

  it('should include error codes and messages in classification output', () => {
    const buildOutput = `
src/app.ts(59,12): error TS2304: Cannot find name 'UserInterface'.
    `.trim();

    const prompt = buildRetryPrompt('', buildOutput, 1, 3);

    // Should include all error details
    expect(prompt).toContain('TS2304'); // Error code
    expect(prompt).toContain('src/app.ts'); // File path
    expect(prompt).toContain('59'); // Line number
    expect(prompt).toContain("Cannot find name 'UserInterface'"); // Message
  });

  it('should maintain retry context information', () => {
    const buildOutput = `
src/app.ts(1,1): error TS2304: Cannot find name 'Foo'.
    `.trim();

    const prompt = buildRetryPrompt('', buildOutput, 2, 3);

    // Should include retry information
    expect(prompt).toContain('retry attempt 2 of 3');
    expect(prompt).toContain('CRITICAL: Tests are failing');

    // Should include analysis instructions
    expect(prompt).toContain('ANALYZE the test/build output');
    expect(prompt).toContain('Fix ONLY the production code');
  });

  it('should handle multiple source errors and multiple cascading errors', () => {
    const buildOutput = `
src/app.ts(1,1): error TS2304: Cannot find name 'Foo'.
src/types.ts(2,2): error TS2339: Property 'bar' does not exist.
src/utils.ts(3,3): error TS2304: Cannot find name 'Baz'.
tests/app.test.ts(4,4): error TS2307: Cannot find module '../app'.
tests/types.test.ts(5,5): error TS2345: Argument type mismatch.
tests/utils.test.ts(6,6): error TS2307: Cannot find module '../utils'.
    `.trim();

    const prompt = buildRetryPrompt('', buildOutput, 1, 3);

    // Count source errors
    const sourceSection = prompt.substring(
      prompt.indexOf('SOURCE ERRORS'),
      prompt.indexOf('CASCADING ERRORS')
    );
    expect(sourceSection.match(/TS2304/g)?.length).toBe(2);
    expect(sourceSection.match(/TS2339/g)?.length).toBe(1);

    // Count cascading errors (only in the classification section, before the Build Output)
    const cascadingStart = prompt.indexOf('CASCADING ERRORS');
    const buildOutputStart = prompt.indexOf('Build Output:');
    const cascadingSection = prompt.substring(
      cascadingStart,
      buildOutputStart !== -1 ? buildOutputStart : prompt.length
    );
    expect(cascadingSection.match(/TS2307/g)?.length).toBe(2);
    expect(cascadingSection.match(/TS2345/g)?.length).toBe(1);
  });
});
