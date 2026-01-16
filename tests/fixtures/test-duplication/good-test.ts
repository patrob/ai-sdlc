/**
 * GOOD TEST EXAMPLE: Legitimate test utilities only
 * No duplication of production logic
 *
 * This is a test fixture that will be copied during integration tests.
 * The production counterpart is production.ts in the same directory.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { parseStory, loadConfig, formatData } from './production.js';

// LEGITIMATE: Factory function creating test data
function createMockStory() {
  return {
    id: 'TEST-001',
    title: 'Test Story',
    content: 'Test content',
  };
}

// LEGITIMATE: Setup helper
function setupTestEnvironment() {
  process.env.TEST_MODE = 'true';
}

// LEGITIMATE: Teardown helper
function teardownTestEnvironment() {
  delete process.env.TEST_MODE;
}

// LEGITIMATE: Assertion helper
function assertValidStory(story: any) {
  expect(story).toBeTruthy();
  expect(story.id).toBeTruthy();
  expect(story.title).toBeTruthy();
}

// LEGITIMATE: Mock builder
function mockUser(overrides?: any) {
  return {
    id: 'user-1',
    name: 'Test User',
    ...overrides,
  };
}

// LEGITIMATE: Test data builder
function withDefaults(config?: any) {
  return {
    enabled: true,
    retries: 3,
    ...config,
  };
}

describe('Story Parser', () => {
  beforeEach(() => {
    setupTestEnvironment();
  });

  afterEach(() => {
    teardownTestEnvironment();
  });

  it('should parse story', () => {
    // Uses actual production function - GOOD!
    const result = parseStory('/test/path');
    assertValidStory(result);
  });

  it('should load config', () => {
    // Uses actual production function - GOOD!
    const result = loadConfig('/test/dir');
    expect(result).toBeTruthy();
  });

  it('should format data', () => {
    // Uses actual production function - GOOD!
    const mockData = createMockStory();
    const result = formatData(mockData);
    expect(result).toBeTruthy();
  });
});
