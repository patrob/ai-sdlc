/**
 * BAD TEST EXAMPLE: Contains test anti-patterns
 * Functions duplicate production logic instead of importing
 *
 * This is a test fixture that will be copied to bad-test.test.ts during integration tests.
 * The production counterpart is production.ts in the same directory.
 */
import { describe, it, expect } from 'vitest';

// ANTI-PATTERN: Function with Test suffix duplicating production logic
function parseStoryTest(content: string) {
  // This duplicates the logic from production.ts
  return { path: content, content: 'story content' };
}

// ANTI-PATTERN: Function with test prefix duplicating production logic
function testLoadConfig() {
  // This duplicates the logic from production.ts
  return { sdlcFolder: '.ai-sdlc' };
}

// ANTI-PATTERN: Arrow function with Test suffix
const formatDataTest = (data: any) => {
  // This duplicates the logic from production.ts
  return JSON.stringify(data);
};

describe('Story Parser', () => {
  it('should parse story', () => {
    const result = parseStoryTest('test content');
    expect(result).toBeTruthy();
  });

  it('should load config', () => {
    const result = testLoadConfig();
    expect(result).toBeTruthy();
  });

  it('should format data', () => {
    const result = formatDataTest({ test: true });
    expect(result).toBe('{"test":true}');
  });
});
