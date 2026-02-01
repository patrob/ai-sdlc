import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { detectStack, detectProjects, getDefaultCommands, formatDetectedProjects, getPrimaryProject } from './stack-detector.js';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import path from 'path';
import os from 'os';

describe('stack-detector', () => {
  let tempDir: string;

  beforeEach(() => {
    // Create a unique temp directory for each test
    tempDir = path.join(os.tmpdir(), `stack-detector-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    // Clean up temp directory
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('detectStack', () => {
    it('detects node-npm from package.json + package-lock.json', () => {
      writeFileSync(path.join(tempDir, 'package.json'), '{}');
      writeFileSync(path.join(tempDir, 'package-lock.json'), '{}');

      expect(detectStack(tempDir)).toBe('node-npm');
    });

    it('detects node-yarn from package.json + yarn.lock', () => {
      writeFileSync(path.join(tempDir, 'package.json'), '{}');
      writeFileSync(path.join(tempDir, 'yarn.lock'), '');

      expect(detectStack(tempDir)).toBe('node-yarn');
    });

    it('detects node-pnpm from package.json + pnpm-lock.yaml', () => {
      writeFileSync(path.join(tempDir, 'package.json'), '{}');
      writeFileSync(path.join(tempDir, 'pnpm-lock.yaml'), '');

      expect(detectStack(tempDir)).toBe('node-pnpm');
    });

    it('detects node-bun from package.json + bun.lockb', () => {
      writeFileSync(path.join(tempDir, 'package.json'), '{}');
      writeFileSync(path.join(tempDir, 'bun.lockb'), '');

      expect(detectStack(tempDir)).toBe('node-bun');
    });

    it('defaults to node-npm for package.json without lock file', () => {
      writeFileSync(path.join(tempDir, 'package.json'), '{}');

      expect(detectStack(tempDir)).toBe('node-npm');
    });

    it('detects python-poetry from pyproject.toml + poetry.lock', () => {
      writeFileSync(path.join(tempDir, 'pyproject.toml'), '');
      writeFileSync(path.join(tempDir, 'poetry.lock'), '');

      expect(detectStack(tempDir)).toBe('python-poetry');
    });

    it('detects python-uv from pyproject.toml + uv.lock', () => {
      writeFileSync(path.join(tempDir, 'pyproject.toml'), '');
      writeFileSync(path.join(tempDir, 'uv.lock'), '');

      expect(detectStack(tempDir)).toBe('python-uv');
    });

    it('detects python-pip from requirements.txt', () => {
      writeFileSync(path.join(tempDir, 'requirements.txt'), '');

      expect(detectStack(tempDir)).toBe('python-pip');
    });

    it('defaults to python-pip for pyproject.toml without lock file', () => {
      writeFileSync(path.join(tempDir, 'pyproject.toml'), '');

      expect(detectStack(tempDir)).toBe('python-pip');
    });

    it('detects rust-cargo from Cargo.toml', () => {
      writeFileSync(path.join(tempDir, 'Cargo.toml'), '');

      expect(detectStack(tempDir)).toBe('rust-cargo');
    });

    it('detects go-mod from go.mod', () => {
      writeFileSync(path.join(tempDir, 'go.mod'), '');

      expect(detectStack(tempDir)).toBe('go-mod');
    });

    it('detects ruby-bundler from Gemfile', () => {
      writeFileSync(path.join(tempDir, 'Gemfile'), '');

      expect(detectStack(tempDir)).toBe('ruby-bundler');
    });

    it('detects java-maven from pom.xml', () => {
      writeFileSync(path.join(tempDir, 'pom.xml'), '');

      expect(detectStack(tempDir)).toBe('java-maven');
    });

    it('detects java-gradle from build.gradle', () => {
      writeFileSync(path.join(tempDir, 'build.gradle'), '');

      expect(detectStack(tempDir)).toBe('java-gradle');
    });

    it('detects dotnet from .csproj file', () => {
      writeFileSync(path.join(tempDir, 'MyProject.csproj'), '');

      expect(detectStack(tempDir)).toBe('dotnet');
    });

    it('returns unknown for empty directory', () => {
      expect(detectStack(tempDir)).toBe('unknown');
    });

    it('returns unknown for directory with no recognized files', () => {
      writeFileSync(path.join(tempDir, 'README.md'), '');
      writeFileSync(path.join(tempDir, 'random.txt'), '');

      expect(detectStack(tempDir)).toBe('unknown');
    });
  });

  describe('getDefaultCommands', () => {
    it('returns npm commands for node-npm', () => {
      const commands = getDefaultCommands('node-npm');
      expect(commands.install).toBe('npm install');
      expect(commands.test).toBe('npm test');
      expect(commands.build).toBe('npm run build');
    });

    it('returns yarn commands for node-yarn', () => {
      const commands = getDefaultCommands('node-yarn');
      expect(commands.install).toBe('yarn install');
      expect(commands.test).toBe('yarn test');
    });

    it('returns poetry commands for python-poetry', () => {
      const commands = getDefaultCommands('python-poetry');
      expect(commands.install).toBe('poetry install');
      expect(commands.test).toBe('poetry run pytest');
    });

    it('returns cargo commands for rust-cargo', () => {
      const commands = getDefaultCommands('rust-cargo');
      expect(commands.build).toBe('cargo build');
      expect(commands.test).toBe('cargo test');
    });

    it('returns go commands for go-mod', () => {
      const commands = getDefaultCommands('go-mod');
      expect(commands.build).toBe('go build ./...');
      expect(commands.test).toBe('go test ./...');
    });

    it('returns empty object for unknown stack', () => {
      const commands = getDefaultCommands('unknown');
      expect(commands).toEqual({});
    });
  });

  describe('detectProjects', () => {
    it('detects project at root', () => {
      writeFileSync(path.join(tempDir, 'package.json'), '{}');
      writeFileSync(path.join(tempDir, 'package-lock.json'), '{}');

      const projects = detectProjects(tempDir);

      expect(projects).toHaveLength(1);
      expect(projects[0].path).toBe('.');
      expect(projects[0].stack).toBe('node-npm');
    });

    it('detects project in app/ subdirectory', () => {
      mkdirSync(path.join(tempDir, 'app'));
      writeFileSync(path.join(tempDir, 'app', 'package.json'), '{}');
      writeFileSync(path.join(tempDir, 'app', 'package-lock.json'), '{}');

      const projects = detectProjects(tempDir);

      expect(projects).toHaveLength(1);
      expect(projects[0].path).toBe('app');
      expect(projects[0].stack).toBe('node-npm');
    });

    it('detects multiple projects in packages/* monorepo', () => {
      mkdirSync(path.join(tempDir, 'packages', 'frontend'), { recursive: true });
      mkdirSync(path.join(tempDir, 'packages', 'backend'), { recursive: true });

      writeFileSync(path.join(tempDir, 'packages', 'frontend', 'package.json'), '{}');
      writeFileSync(path.join(tempDir, 'packages', 'frontend', 'yarn.lock'), '');

      writeFileSync(path.join(tempDir, 'packages', 'backend', 'package.json'), '{}');
      writeFileSync(path.join(tempDir, 'packages', 'backend', 'package-lock.json'), '{}');

      const projects = detectProjects(tempDir);

      expect(projects).toHaveLength(2);
      const paths = projects.map(p => p.path).sort();
      expect(paths).toEqual(['packages/backend', 'packages/frontend']);
    });

    it('detects both root and subdirectory projects', () => {
      // Root project
      writeFileSync(path.join(tempDir, 'package.json'), '{}');
      writeFileSync(path.join(tempDir, 'package-lock.json'), '{}');

      // Subdirectory project
      mkdirSync(path.join(tempDir, 'api'));
      writeFileSync(path.join(tempDir, 'api', 'go.mod'), '');

      const projects = detectProjects(tempDir);

      expect(projects).toHaveLength(2);
      const stacks = projects.map(p => p.stack).sort();
      expect(stacks).toEqual(['go-mod', 'node-npm']);
    });

    it('handles mixed tech stacks in monorepo', () => {
      mkdirSync(path.join(tempDir, 'frontend'));
      writeFileSync(path.join(tempDir, 'frontend', 'package.json'), '{}');

      mkdirSync(path.join(tempDir, 'backend'));
      writeFileSync(path.join(tempDir, 'backend', 'Cargo.toml'), '');

      const projects = detectProjects(tempDir);

      expect(projects).toHaveLength(2);
      const stacks = projects.map(p => p.stack).sort();
      expect(stacks).toEqual(['node-npm', 'rust-cargo']);
    });

    it('returns empty array for directory with no projects', () => {
      const projects = detectProjects(tempDir);
      expect(projects).toEqual([]);
    });

    it('generates descriptive project names', () => {
      mkdirSync(path.join(tempDir, 'api'));
      writeFileSync(path.join(tempDir, 'api', 'package.json'), '{}');

      const projects = detectProjects(tempDir);

      expect(projects[0].name).toBe('Api (Node.js)');
    });
  });

  describe('getPrimaryProject', () => {
    it('returns root project when present', () => {
      const projects = [
        { name: 'API', path: 'api', stack: 'node-npm' as const, commands: {} },
        { name: 'Root', path: '.', stack: 'node-npm' as const, commands: {} },
      ];

      const primary = getPrimaryProject(projects);
      expect(primary?.path).toBe('.');
    });

    it('returns first project when no root', () => {
      const projects = [
        { name: 'API', path: 'api', stack: 'node-npm' as const, commands: {} },
        { name: 'Frontend', path: 'frontend', stack: 'node-yarn' as const, commands: {} },
      ];

      const primary = getPrimaryProject(projects);
      expect(primary?.path).toBe('api');
    });

    it('returns undefined for empty array', () => {
      const primary = getPrimaryProject([]);
      expect(primary).toBeUndefined();
    });
  });

  describe('formatDetectedProjects', () => {
    it('formats single project', () => {
      const projects = [
        { name: 'Root', path: '.', stack: 'node-npm' as const, commands: {} },
      ];

      const output = formatDetectedProjects(projects);

      expect(output).toContain('Detected project structure:');
      expect(output).toContain('.: Node.js (npm)');
    });

    it('formats multiple projects', () => {
      const projects = [
        { name: 'Frontend', path: 'frontend', stack: 'node-yarn' as const, commands: {} },
        { name: 'Backend', path: 'backend', stack: 'rust-cargo' as const, commands: {} },
      ];

      const output = formatDetectedProjects(projects);

      expect(output).toContain('frontend: Node.js (Yarn)');
      expect(output).toContain('backend: Rust (Cargo)');
    });

    it('handles empty projects array', () => {
      const output = formatDetectedProjects([]);
      expect(output).toBe('No projects detected.');
    });
  });
});
