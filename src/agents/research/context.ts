import fs from 'fs';
import { glob } from 'glob';
import path from 'path';

/**
 * Gather context about the codebase for research.
 *
 * Collects information about:
 * - Project configuration files (package.json, tsconfig.json, etc.)
 * - Directory structure
 * - Source files
 * - Test files (for understanding testing patterns)
 * - Configuration files (for discovering config patterns)
 *
 * @param sdlcRoot - Path to the .ai-sdlc directory
 * @returns Formatted context string with codebase information
 */
export async function gatherCodebaseContext(sdlcRoot: string): Promise<string> {
  const workingDir = path.dirname(sdlcRoot);
  const context: string[] = [];

  // Check for common project files
  const projectFiles = [
    'package.json',
    'tsconfig.json',
    'pyproject.toml',
    'Cargo.toml',
    'go.mod',
  ];

  for (const file of projectFiles) {
    const filePath = path.join(workingDir, file);
    if (fs.existsSync(filePath)) {
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        context.push(`=== ${file} ===\n${content.substring(0, 1000)}`);
      } catch {
        // Ignore read errors
      }
    }
  }

  // Get directory structure (top level)
  try {
    const entries = fs.readdirSync(workingDir, { withFileTypes: true });
    const dirs = entries
      .filter(e => e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules')
      .map(e => e.name);
    const files = entries
      .filter(e => e.isFile() && !e.name.startsWith('.'))
      .map(e => e.name);

    context.push(`=== Directory Structure ===\nDirectories: ${dirs.join(', ')}\nFiles: ${files.join(', ')}`);
  } catch {
    // Ignore errors
  }

  // Look for source files
  try {
    const sourceFiles = await glob('src/**/*.{ts,js,py,go,rs}', {
      cwd: workingDir,
      ignore: ['node_modules/**', 'dist/**', 'build/**'],
    });

    if (sourceFiles.length > 0) {
      context.push(`=== Source Files ===\n${sourceFiles.slice(0, 20).join('\n')}`);
    }
  } catch {
    // Ignore glob errors
  }

  // Look for test files (helps identify testing patterns)
  try {
    const testFiles = await glob('**/*.test.{ts,js,tsx,jsx}', {
      cwd: workingDir,
      ignore: ['node_modules/**', 'dist/**', 'build/**'],
    });

    // Also look for tests in dedicated test directories
    const testDirFiles = await glob('{tests,test,__tests__}/**/*.{ts,js,tsx,jsx}', {
      cwd: workingDir,
      ignore: ['node_modules/**'],
    });

    const allTestFiles = [...new Set([...testFiles, ...testDirFiles])];

    if (allTestFiles.length > 0) {
      context.push(`=== Test Files ===\n${allTestFiles.slice(0, 15).join('\n')}`);
    }
  } catch {
    // Ignore glob errors
  }

  // Look for configuration files (helps identify config patterns)
  try {
    const configFiles = await glob('**/*.config.{ts,js,json,mjs,cjs}', {
      cwd: workingDir,
      ignore: ['node_modules/**', 'dist/**'],
    });

    // Also look for common config file patterns
    const commonConfigs = await glob('{.eslintrc*,.prettierrc*,jest.config.*,vitest.config.*,vite.config.*}', {
      cwd: workingDir,
      dot: true,
    });

    const allConfigFiles = [...new Set([...configFiles, ...commonConfigs])];

    if (allConfigFiles.length > 0) {
      context.push(`=== Config Files ===\n${allConfigFiles.slice(0, 10).join('\n')}`);
    }
  } catch {
    // Ignore glob errors
  }

  return context.join('\n\n') || 'No codebase context available.';
}
