/**
 * Integration tests for test-alignment detection in review agent
 *
 * These tests verify that the review agent correctly:
 * 1. Detects when test files are missing
 * 2. Detects when tests exist but are misaligned with implementation
 * 3. Approves correctly aligned tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { hasTestFiles, getSourceCodeChanges } from '../../src/agents/review.js';
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

// Mock child_process at module level for ESM compatibility
vi.mock('child_process', () => ({
  spawnSync: vi.fn(),
  spawn: vi.fn(),
  execSync: vi.fn(),
}));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Review Agent Test Alignment Integration', () => {
  let tempDir: string;
  let fixtureDir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    // Create temp directory for git operations
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-alignment-'));
    fixtureDir = path.resolve(__dirname, './fixtures/test-alignment');
  });

  afterEach(() => {
    // Clean up temp directory
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('hasTestFiles helper', () => {
    it('should detect test files in async-mismatch fixture', () => {
      // Copy async-mismatch fixture to temp dir
      const srcDir = path.join(fixtureDir, 'async-mismatch');
      fs.cpSync(srcDir, tempDir, { recursive: true });

      // Mock git diff to return test files
      vi.mocked(spawnSync).mockReturnValue({
        status: 0,
        stdout: Buffer.from('config.ts\nconfig.test.ts\n'),
        stderr: Buffer.from(''),
        output: [],
        pid: 1,
        signal: null,
      } as any);

      const result = hasTestFiles(tempDir);
      expect(result).toBe(true);
    });

    it('should detect NO test files in no-tests fixture', () => {
      // Copy no-tests fixture to temp dir
      const srcDir = path.join(fixtureDir, 'no-tests');
      fs.cpSync(srcDir, tempDir, { recursive: true });

      // Mock git diff to return only calculator.ts (no test file)
      vi.mocked(spawnSync).mockReturnValue({
        status: 0,
        stdout: Buffer.from('calculator.ts\n'),
        stderr: Buffer.from(''),
        output: [],
        pid: 1,
        signal: null,
      } as any);

      const result = hasTestFiles(tempDir);
      expect(result).toBe(false);
    });

    it('should detect test files with various patterns', () => {
      const testCases = [
        { files: ['foo.test.ts'], expected: true, description: '.test.ts pattern' },
        { files: ['foo.spec.ts'], expected: true, description: '.spec.ts pattern' },
        { files: ['__tests__/foo.ts'], expected: true, description: '__tests__/ directory' },
        { files: ['src/utils.ts'], expected: false, description: 'non-test file' },
        { files: ['src/utils.ts', 'src/utils.test.ts'], expected: true, description: 'mixed files' },
      ];

      for (const testCase of testCases) {
        vi.mocked(spawnSync).mockReturnValue({
          status: 0,
          stdout: Buffer.from(testCase.files.join('\n')),
          stderr: Buffer.from(''),
          output: [],
          pid: 1,
          signal: null,
        } as any);

        const result = hasTestFiles(tempDir);
        expect(result).toBe(testCase.expected);
      }
    });

    it('should fail open when git command fails', () => {
      // Mock git failure
      vi.mocked(spawnSync).mockReturnValue({
        status: 1,
        stdout: Buffer.from(''),
        stderr: Buffer.from('git error'),
        output: [],
        pid: 1,
        signal: null,
      } as any);

      const result = hasTestFiles(tempDir);
      // Should fail open (assume tests exist) to avoid false blocks
      expect(result).toBe(true);
    });
  });

  describe('getSourceCodeChanges helper', () => {
    it('should filter out test files from source changes', () => {
      // Mock git diff to return mix of source and test files
      vi.mocked(spawnSync).mockReturnValue({
        status: 0,
        stdout: Buffer.from('src/config.ts\nsrc/config.test.ts\nsrc/utils.spec.ts\n.ai-sdlc/stories/S-001/story.md\n'),
        stderr: Buffer.from(''),
        output: [],
        pid: 1,
        signal: null,
      } as any);

      const result = getSourceCodeChanges(tempDir);

      // Should only include config.ts (exclude test files and story files)
      expect(result).toEqual(['src/config.ts']);
    });

    it('should return empty array when only tests changed', () => {
      // Mock git diff to return only test files
      vi.mocked(spawnSync).mockReturnValue({
        status: 0,
        stdout: Buffer.from('src/config.test.ts\nsrc/utils.spec.ts\n'),
        stderr: Buffer.from(''),
        output: [],
        pid: 1,
        signal: null,
      } as any);

      const result = getSourceCodeChanges(tempDir);
      expect(result).toEqual([]);
    });
  });

  describe('fixture validation', () => {
    it('async-mismatch fixture should have misaligned test', () => {
      const configFile = path.join(fixtureDir, 'async-mismatch', 'config.ts');
      const testFile = path.join(fixtureDir, 'async-mismatch', 'config.test.ts');

      expect(fs.existsSync(configFile)).toBe(true);
      expect(fs.existsSync(testFile)).toBe(true);

      const configContent = fs.readFileSync(configFile, 'utf-8');
      const testContent = fs.readFileSync(testFile, 'utf-8');

      // Verify production code is async
      expect(configContent).toContain('async function loadConfig()');
      expect(configContent).toContain('Promise<AppConfig>');

      // Verify test is missing await (misaligned)
      expect(testContent).toContain('const config = loadConfig()');
      expect(testContent).not.toContain('await loadConfig()');
      expect(testContent).toContain('Missing await!');
    });

    it('correct-alignment fixture should have properly aligned test', () => {
      const configFile = path.join(fixtureDir, 'correct-alignment', 'config.ts');
      const testFile = path.join(fixtureDir, 'correct-alignment', 'config.test.ts');

      expect(fs.existsSync(configFile)).toBe(true);
      expect(fs.existsSync(testFile)).toBe(true);

      const configContent = fs.readFileSync(configFile, 'utf-8');
      const testContent = fs.readFileSync(testFile, 'utf-8');

      // Verify production code is async
      expect(configContent).toContain('async function loadConfig()');
      expect(configContent).toContain('Promise<AppConfig>');

      // Verify test correctly uses await
      expect(testContent).toContain('const config = await loadConfig()');
      expect(testContent).toContain('test(\'loads config\', async () => {');
    });

    it('no-tests fixture should have no test files', () => {
      const calculatorFile = path.join(fixtureDir, 'no-tests', 'calculator.ts');
      const testFile = path.join(fixtureDir, 'no-tests', 'calculator.test.ts');

      expect(fs.existsSync(calculatorFile)).toBe(true);
      expect(fs.existsSync(testFile)).toBe(false);

      const files = fs.readdirSync(path.join(fixtureDir, 'no-tests'));
      const testFiles = files.filter(f => f.includes('.test.') || f.includes('.spec.'));
      expect(testFiles.length).toBe(0);
    });
  });
});
