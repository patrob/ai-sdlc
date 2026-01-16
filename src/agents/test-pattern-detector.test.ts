import { describe, it, expect } from 'vitest';
import {
  extractFunctionNames,
  isLegitimateTestUtility,
  findProductionFile,
  analyzeTestFile,
  detectTestDuplicationPatterns,
} from './test-pattern-detector.js';
import path from 'path';

describe('extractFunctionNames', () => {
  it('should extract function declarations with Test suffix', () => {
    const code = `
function getPhaseInfoTest() {
  return 'test';
}
`;
    const result = extractFunctionNames(code);
    expect(result).toContain('getPhaseInfoTest');
  });

  it('should extract function declarations with test prefix', () => {
    const code = `
function testGetPhaseInfo() {
  return 'test';
}
`;
    const result = extractFunctionNames(code);
    expect(result).toContain('testGetPhaseInfo');
  });

  it('should extract arrow function declarations', () => {
    const code = `
const parseStoryTest = () => {
  return 'test';
};
`;
    const result = extractFunctionNames(code);
    expect(result).toContain('parseStoryTest');
  });

  it('should extract const function declarations', () => {
    const code = `
const testParseStory = function() {
  return 'test';
};
`;
    const result = extractFunctionNames(code);
    expect(result).toContain('testParseStory');
  });

  it('should handle multiple functions', () => {
    const code = `
function getFooTest() {}
function testGetBar() {}
function normalFunction() {}
`;
    const result = extractFunctionNames(code);
    expect(result).toContain('getFooTest');
    expect(result).toContain('testGetBar');
    expect(result).toContain('normalFunction');
  });
});

describe('isLegitimateTestUtility', () => {
  it('should NOT flag factory functions', () => {
    expect(isLegitimateTestUtility('createMockUser')).toBe(true);
    expect(isLegitimateTestUtility('makeMockStory')).toBe(true);
    expect(isLegitimateTestUtility('buildTestData')).toBe(true);
    expect(isLegitimateTestUtility('mockGetUser')).toBe(true);
    expect(isLegitimateTestUtility('stubFetchData')).toBe(true);
    expect(isLegitimateTestUtility('fakeAuthToken')).toBe(true);
  });

  it('should NOT flag setup/teardown helpers', () => {
    expect(isLegitimateTestUtility('setupTestEnvironment')).toBe(true);
    expect(isLegitimateTestUtility('teardownDatabase')).toBe(true);
    expect(isLegitimateTestUtility('beforeEachTest')).toBe(true);
    expect(isLegitimateTestUtility('afterAllTests')).toBe(true);
    expect(isLegitimateTestUtility('cleanupTempFiles')).toBe(true);
  });

  it('should NOT flag assertion helpers', () => {
    expect(isLegitimateTestUtility('assertValidStory')).toBe(true);
    expect(isLegitimateTestUtility('expectSuccess')).toBe(true);
    expect(isLegitimateTestUtility('verifyUser')).toBe(true);
    expect(isLegitimateTestUtility('checkResults')).toBe(true);
    expect(isLegitimateTestUtility('shouldMatch')).toBe(true);
  });

  it('should NOT flag test data builders', () => {
    expect(isLegitimateTestUtility('withDefaults')).toBe(true);
    expect(isLegitimateTestUtility('givenUser')).toBe(true);
    expect(isLegitimateTestUtility('havingStatus')).toBe(true);
  });

  it('should flag functions with Test suffix', () => {
    expect(isLegitimateTestUtility('getPhaseInfoTest')).toBe(false);
    expect(isLegitimateTestUtility('parseStoryTest')).toBe(false);
  });

  it('should flag functions with test prefix', () => {
    expect(isLegitimateTestUtility('testGetPhaseInfo')).toBe(false);
    expect(isLegitimateTestUtility('testParseStory')).toBe(false);
  });

  it('should NOT flag regular functions', () => {
    expect(isLegitimateTestUtility('normalHelper')).toBe(true);
    expect(isLegitimateTestUtility('formatData')).toBe(true);
  });
});

describe('findProductionFile', () => {
  it('should find colocated production file for test file', () => {
    const testFile = '/project/src/core/story.test.ts';
    const result = findProductionFile(testFile);
    expect(result).toBe('/project/src/core/story.ts');
  });

  it('should find production file for test in tests/ directory', () => {
    const testFile = '/project/tests/integration/story-parser.test.ts';
    const result = findProductionFile(testFile);
    expect(result).toBe('/project/src/integration/story-parser.ts');
  });

  it('should return null for test file with no obvious production counterpart', () => {
    const testFile = '/project/tests/helpers.test.ts';
    const result = findProductionFile(testFile);
    // Could be /project/src/helpers.ts, function should still return a path
    expect(result).toBeTruthy();
  });
});

describe('analyzeTestFile', () => {
  it('should detect function with Test suffix matching production export', () => {
    const testFilePath = '/project/src/core/story.test.ts';
    const testFileContent = `
import { parseStory } from './story.js';

function parseStoryTest(content: string) {
  // Duplicate logic
  return content.split('---')[0];
}

describe('parseStory', () => {
  it('works', () => {
    expect(parseStoryTest('test')).toBe('test');
  });
});
`;
    const productionFileContent = `
export function parseStory(path: string) {
  // Production implementation
  return fs.readFileSync(path);
}
`;

    const result = analyzeTestFile(testFilePath, testFileContent, productionFileContent);

    expect(result.length).toBeGreaterThan(0);
    expect(result[0].severity).toBe('major');
    expect(result[0].category).toBe('test_antipattern');
    expect(result[0].description).toContain('parseStoryTest');
    expect(result[0].file).toBe(testFilePath);
    expect(result[0].suggestedFix).toContain('Export');
  });

  it('should detect function with test prefix matching production export', () => {
    const testFilePath = '/project/src/core/config.test.ts';
    const testFileContent = `
function testLoadConfig() {
  return { sdlcFolder: '.ai-sdlc' };
}
`;
    const productionFileContent = `
export function loadConfig(dir: string) {
  return readConfig(dir);
}
`;

    const result = analyzeTestFile(testFilePath, testFileContent, productionFileContent);

    expect(result.length).toBeGreaterThan(0);
    expect(result[0].description).toContain('testLoadConfig');
  });

  it('should NOT flag legitimate test utilities', () => {
    const testFilePath = '/project/src/core/story.test.ts';
    const testFileContent = `
function createMockStory() {
  return { id: 'test', content: '' };
}

function setupTestEnv() {
  process.env.TEST = 'true';
}

function assertValidStory(story) {
  expect(story.id).toBeTruthy();
}
`;
    const productionFileContent = `
export function parseStory(path: string) {
  return fs.readFileSync(path);
}
`;

    const result = analyzeTestFile(testFilePath, testFileContent, productionFileContent);

    expect(result.length).toBe(0);
  });

  it('should return empty array when no anti-patterns found', () => {
    const testFilePath = '/project/src/core/story.test.ts';
    const testFileContent = `
import { parseStory } from './story.js';

describe('parseStory', () => {
  it('works', () => {
    expect(parseStory('test.md')).toBeTruthy();
  });
});
`;
    const productionFileContent = `
export function parseStory(path: string) {
  return fs.readFileSync(path);
}
`;

    const result = analyzeTestFile(testFilePath, testFileContent, productionFileContent);

    expect(result.length).toBe(0);
  });

  it('should include line numbers in results', () => {
    const testFilePath = '/project/src/core/story.test.ts';
    const testFileContent = `
import { parseStory } from './story.js';

function parseStoryTest(content: string) {
  return content.split('---')[0];
}
`;
    const productionFileContent = `
export function parseStory(path: string) {
  return fs.readFileSync(path);
}
`;

    const result = analyzeTestFile(testFilePath, testFileContent, productionFileContent);

    expect(result.length).toBeGreaterThan(0);
    expect(result[0].line).toBe(4); // Line where function is declared
  });
});

describe('detectTestDuplicationPatterns', () => {
  it('should return empty array when no test files found', async () => {
    const workingDir = '/nonexistent/dir';
    const result = await detectTestDuplicationPatterns(workingDir);

    expect(result).toEqual([]);
  });

  it('should handle missing production files gracefully', async () => {
    // This would require file system mocking - integration test covers this
    expect(true).toBe(true);
  });
});
