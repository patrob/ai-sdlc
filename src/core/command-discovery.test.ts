import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  discoverCommands,
  discoverFromMakefile,
  discoverFromPackageJson,
  buildSingleTestCommand,
  parseCommand,
  detectPackageManager,
  detectTechStack,
  getStackDefaultCommands,
  clearCommandCache,
  getTestCommand,
  getBuildCommand,
  getLintCommand,
} from './command-discovery.js';

// Mock fs module
vi.mock('fs');
const mockFs = vi.mocked(fs);

// Mock config module
vi.mock('./config.js', () => ({
  loadConfig: vi.fn(() => ({})),
}));

describe('command-discovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearCommandCache();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('parseCommand', () => {
    it('should parse simple command', () => {
      const result = parseCommand('npm test');
      expect(result.executable).toBe('npm');
      expect(result.args).toEqual(['test']);
    });

    it('should parse command with multiple arguments', () => {
      const result = parseCommand('npm test -- --coverage');
      expect(result.executable).toBe('npm');
      expect(result.args).toEqual(['test', '--', '--coverage']);
    });

    it('should handle empty command', () => {
      const result = parseCommand('');
      expect(result.executable).toBe('');
      expect(result.args).toEqual([]);
    });

    it('should handle whitespace-only command', () => {
      const result = parseCommand('   ');
      expect(result.executable).toBe('');
      expect(result.args).toEqual([]);
    });

    it('should trim whitespace', () => {
      const result = parseCommand('  npm   test  ');
      expect(result.executable).toBe('npm');
      expect(result.args).toEqual(['test']);
    });

    it('should parse make command', () => {
      const result = parseCommand('make test');
      expect(result.executable).toBe('make');
      expect(result.args).toEqual(['test']);
    });

    it('should parse pytest command', () => {
      const result = parseCommand('pytest src/tests');
      expect(result.executable).toBe('pytest');
      expect(result.args).toEqual(['src/tests']);
    });
  });

  describe('buildSingleTestCommand', () => {
    it('should use {file} placeholder if present', () => {
      const result = buildSingleTestCommand('npm test -- {file}', 'src/foo.test.ts');
      expect(result).toBe('npm test -- src/foo.test.ts');
    });

    it('should append -- for npm test', () => {
      const result = buildSingleTestCommand('npm test', 'src/foo.test.ts');
      expect(result).toBe('npm test -- src/foo.test.ts');
    });

    it('should append -- for npm run test', () => {
      const result = buildSingleTestCommand('npm run test', 'src/foo.test.ts');
      expect(result).toBe('npm run test -- src/foo.test.ts');
    });

    it('should append directly for yarn test', () => {
      const result = buildSingleTestCommand('yarn test', 'src/foo.test.ts');
      expect(result).toBe('yarn test src/foo.test.ts');
    });

    it('should append directly for pnpm test', () => {
      const result = buildSingleTestCommand('pnpm test', 'src/foo.test.ts');
      // pnpm test behaves like npm test, needs -- separator
      expect(result).toBe('pnpm test -- src/foo.test.ts');
    });

    it('should append directly for bun test', () => {
      const result = buildSingleTestCommand('bun test', 'src/foo.test.ts');
      expect(result).toBe('bun test src/foo.test.ts');
    });

    it('should append directly for vitest', () => {
      const result = buildSingleTestCommand('npx vitest', 'src/foo.test.ts');
      expect(result).toBe('npx vitest src/foo.test.ts');
    });

    it('should append directly for jest', () => {
      const result = buildSingleTestCommand('npx jest', 'src/foo.test.ts');
      expect(result).toBe('npx jest src/foo.test.ts');
    });

    it('should append directly for pytest', () => {
      const result = buildSingleTestCommand('pytest', 'tests/test_foo.py');
      expect(result).toBe('pytest tests/test_foo.py');
    });

    it('should use --test for cargo test', () => {
      const result = buildSingleTestCommand('cargo test', 'test_foo');
      expect(result).toBe('cargo test --test test_foo');
    });

    it('should use -run for go test', () => {
      const result = buildSingleTestCommand('go test ./...', 'TestFoo');
      expect(result).toBe('go test ./... -run TestFoo');
    });

    it('should use FILE= for make', () => {
      const result = buildSingleTestCommand('make test', 'src/foo.test.ts');
      expect(result).toBe('make test FILE=src/foo.test.ts');
    });

    it('should default to appending file', () => {
      const result = buildSingleTestCommand('rspec', 'spec/foo_spec.rb');
      expect(result).toBe('rspec spec/foo_spec.rb');
    });
  });

  describe('detectPackageManager', () => {
    it('should detect bun from lockfile', () => {
      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        return p.toString().endsWith('bun.lockb');
      });

      const result = detectPackageManager('/project');
      expect(result).toBe('bun');
    });

    it('should detect pnpm from lockfile', () => {
      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        return p.toString().endsWith('pnpm-lock.yaml');
      });

      const result = detectPackageManager('/project');
      expect(result).toBe('pnpm');
    });

    it('should detect yarn from lockfile', () => {
      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        return p.toString().endsWith('yarn.lock');
      });

      const result = detectPackageManager('/project');
      expect(result).toBe('yarn');
    });

    it('should default to npm', () => {
      mockFs.existsSync.mockReturnValue(false);

      const result = detectPackageManager('/project');
      expect(result).toBe('npm');
    });

    it('should prioritize bun over other lockfiles', () => {
      mockFs.existsSync.mockReturnValue(true);

      const result = detectPackageManager('/project');
      expect(result).toBe('bun');
    });
  });

  describe('detectTechStack', () => {
    it('should detect node-npm from package.json', () => {
      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        return p.toString().endsWith('package.json');
      });

      const result = detectTechStack('/project');
      expect(result).toBe('node-npm');
    });

    it('should detect python-pip from requirements.txt', () => {
      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        return p.toString().endsWith('requirements.txt');
      });

      const result = detectTechStack('/project');
      expect(result).toBe('python-pip');
    });

    it('should detect python-poetry from poetry.lock', () => {
      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const pathStr = p.toString();
        return pathStr.endsWith('pyproject.toml') || pathStr.endsWith('poetry.lock');
      });

      const result = detectTechStack('/project');
      expect(result).toBe('python-poetry');
    });

    it('should detect rust-cargo from Cargo.toml', () => {
      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        return p.toString().endsWith('Cargo.toml');
      });

      const result = detectTechStack('/project');
      expect(result).toBe('rust-cargo');
    });

    it('should detect go-mod from go.mod', () => {
      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        return p.toString().endsWith('go.mod');
      });

      const result = detectTechStack('/project');
      expect(result).toBe('go-mod');
    });

    it('should detect java-maven from pom.xml', () => {
      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        return p.toString().endsWith('pom.xml');
      });

      const result = detectTechStack('/project');
      expect(result).toBe('java-maven');
    });

    it('should detect java-gradle from build.gradle', () => {
      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        return p.toString().endsWith('build.gradle');
      });

      const result = detectTechStack('/project');
      expect(result).toBe('java-gradle');
    });

    it('should return unknown for unrecognized projects', () => {
      mockFs.existsSync.mockReturnValue(false);

      const result = detectTechStack('/project');
      expect(result).toBe('unknown');
    });
  });

  describe('getStackDefaultCommands', () => {
    it('should return npm commands for node-npm', () => {
      const commands = getStackDefaultCommands('node-npm');
      expect(commands.test).toBe('npm test');
      expect(commands.build).toBe('npm run build');
      expect(commands.install).toBe('npm install');
    });

    it('should return yarn commands for node-yarn', () => {
      const commands = getStackDefaultCommands('node-yarn');
      expect(commands.test).toBe('yarn test');
      expect(commands.build).toBe('yarn build');
      expect(commands.install).toBe('yarn install');
    });

    it('should return pytest commands for python-pip', () => {
      const commands = getStackDefaultCommands('python-pip');
      expect(commands.test).toBe('pytest');
      expect(commands.lint).toBe('ruff check .');
    });

    it('should return cargo commands for rust-cargo', () => {
      const commands = getStackDefaultCommands('rust-cargo');
      expect(commands.test).toBe('cargo test');
      expect(commands.build).toBe('cargo build');
      expect(commands.lint).toBe('cargo clippy');
    });

    it('should return empty object for unknown stack', () => {
      const commands = getStackDefaultCommands('unknown');
      expect(commands).toEqual({});
    });
  });

  describe('discoverFromMakefile', () => {
    it('should discover test target', () => {
      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        return p.toString().endsWith('Makefile');
      });
      mockFs.readFileSync.mockReturnValue(`
.PHONY: test build

test:
	npm test

build:
	npm run build
`);

      const result = discoverFromMakefile('/project');
      expect(result).not.toBeNull();
      expect(result?.commands.test).toBe('make test');
      expect(result?.commands.build).toBe('make build');
      expect(result?.source).toBe('makefile');
    });

    it('should discover verify target', () => {
      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        return p.toString().endsWith('Makefile');
      });
      mockFs.readFileSync.mockReturnValue(`
verify:
	npm run lint && npm test
`);

      const result = discoverFromMakefile('/project');
      expect(result).not.toBeNull();
      expect(result?.commands.verify).toBe('make verify');
    });

    it('should return null if no Makefile exists', () => {
      mockFs.existsSync.mockReturnValue(false);

      const result = discoverFromMakefile('/project');
      expect(result).toBeNull();
    });

    it('should return null if no recognized targets', () => {
      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        return p.toString().endsWith('Makefile');
      });
      mockFs.readFileSync.mockReturnValue(`
custom-target:
	echo "hello"
`);

      const result = discoverFromMakefile('/project');
      expect(result).toBeNull();
    });
  });

  describe('discoverFromPackageJson', () => {
    it('should discover npm scripts', () => {
      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const pathStr = p.toString();
        return pathStr.endsWith('package.json');
      });
      mockFs.readFileSync.mockReturnValue(
        JSON.stringify({
          scripts: {
            test: 'vitest',
            build: 'tsc',
            lint: 'eslint .',
          },
        })
      );

      const result = discoverFromPackageJson('/project');
      expect(result).not.toBeNull();
      // npm run test is the canonical form for npm scripts
      expect(result?.commands.test).toBe('npm run test');
      expect(result?.commands.build).toBe('npm run build');
      expect(result?.commands.lint).toBe('npm run lint');
      expect(result?.source).toBe('package.json');
    });

    it('should detect yarn from lockfile', () => {
      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const pathStr = p.toString();
        return pathStr.endsWith('package.json') || pathStr.endsWith('yarn.lock');
      });
      mockFs.readFileSync.mockReturnValue(
        JSON.stringify({
          scripts: {
            test: 'jest',
          },
        })
      );

      const result = discoverFromPackageJson('/project');
      expect(result).not.toBeNull();
      // yarn run test is the canonical form (yarn test is just shorthand)
      expect(result?.commands.test).toBe('yarn run test');
    });

    it('should return null if no package.json', () => {
      mockFs.existsSync.mockReturnValue(false);

      const result = discoverFromPackageJson('/project');
      expect(result).toBeNull();
    });

    it('should return null if no scripts', () => {
      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        return p.toString().endsWith('package.json');
      });
      mockFs.readFileSync.mockReturnValue(JSON.stringify({ name: 'test' }));

      const result = discoverFromPackageJson('/project');
      expect(result).toBeNull();
    });
  });

  describe('discoverCommands', () => {
    it('should cache results', () => {
      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        return p.toString().endsWith('package.json');
      });
      mockFs.readFileSync.mockReturnValue(
        JSON.stringify({
          scripts: { test: 'jest' },
        })
      );

      // First call
      const result1 = discoverCommands('/project');

      // Second call should use cache
      const result2 = discoverCommands('/project');

      expect(result1).toBe(result2);
      // readFileSync should only be called once (for package.json)
      expect(mockFs.readFileSync).toHaveBeenCalledTimes(1);
    });

    it('should return empty commands when nothing found', () => {
      mockFs.existsSync.mockReturnValue(false);

      const result = discoverCommands('/project');
      expect(result.commands).toEqual({});
      expect(result.source).toBe('none');
    });
  });

  describe('convenience functions', () => {
    beforeEach(() => {
      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        return p.toString().endsWith('package.json');
      });
      mockFs.readFileSync.mockReturnValue(
        JSON.stringify({
          scripts: {
            test: 'vitest',
            build: 'tsc',
            lint: 'eslint .',
          },
        })
      );
    });

    it('getTestCommand should return test command', () => {
      const result = getTestCommand('/project');
      // npm run test is the canonical form for npm scripts
      expect(result).toBe('npm run test');
    });

    it('getBuildCommand should return build command', () => {
      const result = getBuildCommand('/project');
      expect(result).toBe('npm run build');
    });

    it('getLintCommand should return lint command', () => {
      const result = getLintCommand('/project');
      expect(result).toBe('npm run lint');
    });

    it('getTestCommand should return default when not found', () => {
      mockFs.existsSync.mockReturnValue(false);
      clearCommandCache();

      const result = getTestCommand('/project');
      expect(result).toBe('npm test');
    });
  });
});
