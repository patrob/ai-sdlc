import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';
import { ReviewIssue } from '../types/index.js';

/**
 * Extract function names from file content using regex patterns
 * Supports: function declarations, arrow functions, const functions
 *
 * @param fileContent - Source code to analyze
 * @returns Array of function names found in the file
 */
export function extractFunctionNames(fileContent: string): string[] {
  const functionNames: string[] = [];

  // Pattern 1: function declarations (function foo() {})
  const functionDeclPattern = /function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g;
  let match;
  while ((match = functionDeclPattern.exec(fileContent)) !== null) {
    functionNames.push(match[1]);
  }

  // Pattern 2: arrow functions (const foo = () => {})
  const arrowFunctionPattern = /const\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*\(/g;
  while ((match = arrowFunctionPattern.exec(fileContent)) !== null) {
    functionNames.push(match[1]);
  }

  // Pattern 3: function expressions (const foo = function() {})
  const functionExprPattern = /const\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*function/g;
  while ((match = functionExprPattern.exec(fileContent)) !== null) {
    functionNames.push(match[1]);
  }

  return functionNames;
}

/**
 * Check if a function name matches legitimate test utility patterns
 * Returns true if the function is a legitimate test helper (should NOT be flagged)
 *
 * Legitimate patterns:
 * - Factory functions: create*, make*, build*, mock*, stub*, fake*
 * - Setup/teardown: setup*, teardown*, before*, after*, cleanup*
 * - Assertion helpers: assert*, expect*, verify*, check*, should*
 * - Test data builders: with*, given*, having*
 *
 * @param functionName - Name of the function to check
 * @returns true if legitimate test utility, false if potential anti-pattern
 */
export function isLegitimateTestUtility(functionName: string): boolean {
  const legitimatePatterns = [
    // Factory functions
    /^(create|make|build|mock|stub|fake)/i,
    // Setup/teardown helpers
    /^(setup|teardown|before|after|cleanup)/i,
    // Assertion helpers
    /^(assert|expect|verify|check|should)/i,
    // Test data builders
    /^(with|given|having)/i,
  ];

  // Check if function matches any legitimate pattern
  for (const pattern of legitimatePatterns) {
    if (pattern.test(functionName)) {
      return true;
    }
  }

  // Check for anti-pattern indicators
  const antiPatterns = [
    /Test$/, // Ends with "Test"
    /^test[A-Z]/, // Starts with "test" followed by capital letter
  ];

  for (const pattern of antiPatterns) {
    if (pattern.test(functionName)) {
      return false; // This is a potential anti-pattern
    }
  }

  // Default: consider it legitimate (avoid false positives)
  return true;
}

/**
 * Find the corresponding production file for a test file
 * Handles both colocated tests and centralized test directories
 *
 * @param testFilePath - Absolute path to test file
 * @returns Absolute path to production file, or null if not found
 */
export function findProductionFile(testFilePath: string): string | null {
  // Remove .test.ts or .test.js extension
  const withoutTestExt = testFilePath.replace(/\.test\.(ts|tsx|js|jsx)$/, '.$1');

  // Case 1: Colocated test (src/core/story.test.ts -> src/core/story.ts)
  if (fs.existsSync(withoutTestExt)) {
    return withoutTestExt;
  }

  // Case 2: Test in tests/ directory (tests/integration/foo.test.ts -> src/integration/foo.ts)
  if (testFilePath.includes('/tests/')) {
    const relativePath = testFilePath.split('/tests/')[1];
    const srcPath = testFilePath.split('/tests/')[0] + '/src/' + relativePath.replace(/\.test\.(ts|tsx|js|jsx)$/, '.$1');
    if (fs.existsSync(srcPath)) {
      return srcPath;
    }
  }

  // Case 3: Try replacing tests/ with src/ in path
  const srcReplaced = testFilePath.replace('/tests/', '/src/').replace(/\.test\.(ts|tsx|js|jsx)$/, '.$1');
  if (fs.existsSync(srcReplaced)) {
    return srcReplaced;
  }

  // Fallback: return the properly transformed path even if it doesn't exist
  // For tests/ directory files, return the src/ mapped path
  // Caller can handle missing files
  if (testFilePath.includes('/tests/')) {
    const relativePath = testFilePath.split('/tests/')[1];
    return testFilePath.split('/tests/')[0] + '/src/' + relativePath.replace(/\.test\.(ts|tsx|js|jsx)$/, '.$1');
  }
  return withoutTestExt;
}

/**
 * Get line number for a function in source code
 *
 * @param fileContent - Source code
 * @param functionName - Function to find
 * @returns Line number (1-indexed) or undefined if not found
 */
function getFunctionLineNumber(fileContent: string, functionName: string): number | undefined {
  const lines = fileContent.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Match function declaration with the exact function name
    if (
      line.includes(`function ${functionName}(`) ||
      line.includes(`function ${functionName} (`) ||
      line.includes(`const ${functionName} =`)
    ) {
      return i + 1; // 1-indexed
    }
  }
  return undefined;
}

/**
 * Analyze a single test file for duplication patterns
 *
 * @param testFilePath - Absolute path to test file
 * @param testFileContent - Content of the test file
 * @param productionFileContent - Content of the corresponding production file
 * @returns Array of ReviewIssue objects for detected anti-patterns
 */
export function analyzeTestFile(
  testFilePath: string,
  testFileContent: string,
  productionFileContent: string
): ReviewIssue[] {
  const issues: ReviewIssue[] = [];

  // Extract function names from test file
  const testFunctions = extractFunctionNames(testFileContent);

  // Extract exported functions from production file
  const productionExports = extractProductionExports(productionFileContent);

  // Check each test function for anti-patterns
  for (const functionName of testFunctions) {
    // Skip legitimate test utilities
    if (isLegitimateTestUtility(functionName)) {
      continue;
    }

    // Check if this looks like a duplicated production function
    const matchingExport = findMatchingProductionExport(functionName, productionExports);

    if (matchingExport) {
      const lineNumber = getFunctionLineNumber(testFileContent, functionName);
      const productionFile = findProductionFile(testFilePath);

      issues.push({
        severity: 'major',
        category: 'test_antipattern',
        description: `Test helper function "${functionName}" appears to duplicate production logic. Tests should import actual functions instead of reimplementing them.`,
        file: testFilePath,
        line: lineNumber,
        suggestedFix: productionFile
          ? `Export "${matchingExport}" from "${path.basename(productionFile)}" and import it in tests instead of duplicating the logic.`
          : `Export the production version of "${matchingExport}" and import it in tests instead of duplicating the logic.`,
      });
    }
  }

  return issues;
}

/**
 * Extract exported function names from production file content
 *
 * @param fileContent - Production file source code
 * @returns Array of exported function names
 */
function extractProductionExports(fileContent: string): string[] {
  const exports: string[] = [];

  // Pattern 1: export function foo() {}
  const exportFunctionPattern = /export\s+function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g;
  let match;
  while ((match = exportFunctionPattern.exec(fileContent)) !== null) {
    exports.push(match[1]);
  }

  // Pattern 2: export const foo = () => {}
  const exportConstPattern = /export\s+const\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=/g;
  while ((match = exportConstPattern.exec(fileContent)) !== null) {
    exports.push(match[1]);
  }

  // Pattern 3: export { foo, bar }
  const exportBlockPattern = /export\s*\{\s*([^}]+)\s*\}/g;
  while ((match = exportBlockPattern.exec(fileContent)) !== null) {
    const names = match[1].split(',').map(n => n.trim().split(/\s+as\s+/)[0].trim());
    exports.push(...names);
  }

  return exports;
}

/**
 * Find matching production export for a test function name
 * Handles naming patterns: fooTest -> foo, testFoo -> foo
 *
 * @param testFunctionName - Name of test helper function
 * @param productionExports - Array of exported function names from production
 * @returns Matching export name or null
 */
function findMatchingProductionExport(testFunctionName: string, productionExports: string[]): string | null {
  // Pattern 1: fooTest -> foo
  if (testFunctionName.endsWith('Test')) {
    const baseName = testFunctionName.slice(0, -4); // Remove "Test" suffix
    if (productionExports.includes(baseName)) {
      return baseName;
    }
  }

  // Pattern 2: testFoo -> foo
  if (testFunctionName.startsWith('test') && testFunctionName.length > 4) {
    const baseName = testFunctionName.charAt(4).toLowerCase() + testFunctionName.slice(5);
    if (productionExports.includes(baseName)) {
      return baseName;
    }
  }

  return null;
}

/**
 * Detect test duplication patterns across all test files in working directory
 * Main entry point for the detection system
 *
 * @param workingDir - Project root directory
 * @returns Array of ReviewIssue objects for all detected anti-patterns
 */
export async function detectTestDuplicationPatterns(workingDir: string): Promise<ReviewIssue[]> {
  const allIssues: ReviewIssue[] = [];

  try {
    // Find all test files using glob patterns
    const testPatterns = ['**/*.test.ts', '**/*.test.tsx', '**/*.test.js', '**/*.test.jsx'];
    const testFiles: string[] = [];

    for (const pattern of testPatterns) {
      const matches = await glob(pattern, {
        cwd: workingDir,
        absolute: true,
        ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.git/**'],
      });
      testFiles.push(...matches);
    }

    // Analyze each test file
    for (const testFilePath of testFiles) {
      try {
        // Read test file
        const testFileContent = fs.readFileSync(testFilePath, 'utf-8');

        // Find corresponding production file
        const productionFilePath = findProductionFile(testFilePath);
        if (!productionFilePath || !fs.existsSync(productionFilePath)) {
          // No production file found - skip (might be integration test or test utilities)
          continue;
        }

        // Read production file
        const productionFileContent = fs.readFileSync(productionFilePath, 'utf-8');

        // Analyze for anti-patterns
        const issues = analyzeTestFile(testFilePath, testFileContent, productionFileContent);
        allIssues.push(...issues);
      } catch (error) {
        // Skip files that can't be read (permissions, encoding issues, etc.)
        console.debug(`Skipping test file ${testFilePath}: ${error}`);
        continue;
      }
    }
  } catch (error) {
    // If glob fails or directory doesn't exist, return empty array
    console.debug(`Test pattern detection failed: ${error}`);
    return [];
  }

  return allIssues;
}
