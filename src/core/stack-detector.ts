import { existsSync, readdirSync, statSync } from 'fs';
import path from 'path';
import { TechStack, ProjectConfig } from '../types/index.js';

/**
 * Stack detection configuration for each supported technology.
 * Defines marker files and default commands.
 */
interface StackDefinition {
  stack: TechStack;
  /** Primary marker file that must exist */
  primaryMarker: string;
  /** Optional secondary marker for disambiguation */
  secondaryMarker?: string;
  /** Files that indicate a different variant (for exclusion) */
  excludeMarkers?: string[];
  /** Default commands for this stack */
  commands: {
    install?: string;
    build?: string;
    test?: string;
    start?: string;
  };
}

/**
 * Stack definitions ordered by detection priority.
 * More specific stacks (with secondary markers) come before generic ones.
 */
const STACK_DEFINITIONS: StackDefinition[] = [
  // Node.js variants (order matters: check lock files first)
  {
    stack: 'node-bun',
    primaryMarker: 'package.json',
    secondaryMarker: 'bun.lockb',
    commands: {
      install: 'bun install',
      build: 'bun run build',
      test: 'bun test',
      start: 'bun start',
    },
  },
  {
    stack: 'node-pnpm',
    primaryMarker: 'package.json',
    secondaryMarker: 'pnpm-lock.yaml',
    commands: {
      install: 'pnpm install',
      build: 'pnpm run build',
      test: 'pnpm test',
      start: 'pnpm start',
    },
  },
  {
    stack: 'node-yarn',
    primaryMarker: 'package.json',
    secondaryMarker: 'yarn.lock',
    commands: {
      install: 'yarn install',
      build: 'yarn build',
      test: 'yarn test',
      start: 'yarn start',
    },
  },
  {
    stack: 'node-npm',
    primaryMarker: 'package.json',
    secondaryMarker: 'package-lock.json',
    commands: {
      install: 'npm install',
      build: 'npm run build',
      test: 'npm test',
      start: 'npm start',
    },
  },
  // Python variants
  {
    stack: 'python-poetry',
    primaryMarker: 'pyproject.toml',
    secondaryMarker: 'poetry.lock',
    commands: {
      install: 'poetry install',
      build: 'poetry build',
      test: 'poetry run pytest',
      start: 'poetry run python -m main',
    },
  },
  {
    stack: 'python-uv',
    primaryMarker: 'pyproject.toml',
    secondaryMarker: 'uv.lock',
    commands: {
      install: 'uv sync',
      build: 'uv build',
      test: 'uv run pytest',
      start: 'uv run python -m main',
    },
  },
  {
    stack: 'python-pip',
    primaryMarker: 'requirements.txt',
    commands: {
      install: 'pip install -r requirements.txt',
      test: 'pytest',
      start: 'python main.py',
    },
  },
  // Rust
  {
    stack: 'rust-cargo',
    primaryMarker: 'Cargo.toml',
    commands: {
      install: 'cargo fetch',
      build: 'cargo build',
      test: 'cargo test',
      start: 'cargo run',
    },
  },
  // Go
  {
    stack: 'go-mod',
    primaryMarker: 'go.mod',
    commands: {
      install: 'go mod download',
      build: 'go build ./...',
      test: 'go test ./...',
      start: 'go run .',
    },
  },
  // Ruby
  {
    stack: 'ruby-bundler',
    primaryMarker: 'Gemfile',
    commands: {
      install: 'bundle install',
      test: 'bundle exec rspec',
      start: 'bundle exec ruby main.rb',
    },
  },
  // Java variants
  {
    stack: 'java-gradle',
    primaryMarker: 'build.gradle',
    commands: {
      install: './gradlew dependencies',
      build: './gradlew build',
      test: './gradlew test',
      start: './gradlew run',
    },
  },
  {
    stack: 'java-maven',
    primaryMarker: 'pom.xml',
    commands: {
      install: 'mvn install -DskipTests',
      build: 'mvn compile',
      test: 'mvn test',
      start: 'mvn exec:java',
    },
  },
  // .NET
  {
    stack: 'dotnet',
    primaryMarker: '*.csproj',
    commands: {
      install: 'dotnet restore',
      build: 'dotnet build',
      test: 'dotnet test',
      start: 'dotnet run',
    },
  },
];

/**
 * Common subdirectory patterns to check for projects.
 * Includes monorepo patterns and common app directory names.
 */
const SUBDIRECTORY_PATTERNS = [
  // Common app directories
  'app',
  'src',
  'backend',
  'frontend',
  'api',
  'server',
  'client',
  'web',
  'mobile',
  'service',
  'services',
  // Monorepo patterns (glob-like, will be expanded)
  'packages/*',
  'apps/*',
  'projects/*',
  'libs/*',
  'modules/*',
];

/**
 * Check if a file or glob pattern exists in a directory.
 * Handles glob patterns like "*.csproj".
 */
function markerExists(dir: string, marker: string): boolean {
  if (marker.includes('*')) {
    // Handle glob pattern
    const pattern = marker.replace('*', '');
    try {
      const files = readdirSync(dir);
      return files.some(f => f.endsWith(pattern) || f.startsWith(pattern.replace('*', '')));
    } catch {
      return false;
    }
  }
  return existsSync(path.join(dir, marker));
}

/**
 * Detect the tech stack for a given directory.
 * Returns 'unknown' if no recognized stack is found.
 */
export function detectStack(dir: string): TechStack {
  for (const def of STACK_DEFINITIONS) {
    // Check primary marker
    if (!markerExists(dir, def.primaryMarker)) {
      continue;
    }

    // Check exclusion markers
    if (def.excludeMarkers?.some(m => markerExists(dir, m))) {
      continue;
    }

    // If we have a secondary marker requirement, check it
    if (def.secondaryMarker) {
      if (markerExists(dir, def.secondaryMarker)) {
        return def.stack;
      }
      // Continue to check next definition (might be a fallback)
      continue;
    }

    // No secondary marker required, this matches
    return def.stack;
  }

  // Check for package.json without any lock file (default to npm)
  if (markerExists(dir, 'package.json')) {
    return 'node-npm';
  }

  // Check for pyproject.toml without poetry.lock (default to pip)
  if (markerExists(dir, 'pyproject.toml')) {
    return 'python-pip';
  }

  return 'unknown';
}

/**
 * Get default commands for a given tech stack.
 */
export function getDefaultCommands(stack: TechStack): ProjectConfig['commands'] {
  const def = STACK_DEFINITIONS.find(d => d.stack === stack);
  return def?.commands ?? {};
}

/**
 * Generate a human-readable name for a project based on its path and stack.
 */
function generateProjectName(projectPath: string, stack: TechStack): string {
  if (projectPath === '.') {
    return 'Root Project';
  }

  // Use the directory name as the base
  const dirName = path.basename(projectPath);

  // Capitalize first letter
  const capitalizedName = dirName.charAt(0).toUpperCase() + dirName.slice(1);

  // Add stack context for clarity
  const stackLabels: Partial<Record<TechStack, string>> = {
    'node-npm': 'Node.js',
    'node-yarn': 'Node.js',
    'node-pnpm': 'Node.js',
    'node-bun': 'Bun',
    'python-pip': 'Python',
    'python-poetry': 'Python',
    'python-uv': 'Python',
    'rust-cargo': 'Rust',
    'go-mod': 'Go',
    'ruby-bundler': 'Ruby',
    'java-maven': 'Java',
    'java-gradle': 'Java',
    'dotnet': '.NET',
  };

  const stackLabel = stackLabels[stack];
  if (stackLabel) {
    return `${capitalizedName} (${stackLabel})`;
  }

  return capitalizedName;
}

/**
 * Expand glob-like patterns in subdirectory list.
 * For example, "packages/*" becomes ["packages/foo", "packages/bar", ...].
 */
function expandSubdirectories(baseDir: string, patterns: string[]): string[] {
  const result: string[] = [];

  for (const pattern of patterns) {
    if (pattern.includes('*')) {
      // Glob pattern - expand it
      const [parentDir] = pattern.split('/*');
      const fullParentPath = path.join(baseDir, parentDir);

      if (existsSync(fullParentPath)) {
        try {
          const entries = readdirSync(fullParentPath);
          for (const entry of entries) {
            const entryPath = path.join(fullParentPath, entry);
            if (statSync(entryPath).isDirectory()) {
              result.push(path.join(parentDir, entry));
            }
          }
        } catch {
          // Ignore permission errors
        }
      }
    } else {
      // Direct directory name
      result.push(pattern);
    }
  }

  return result;
}

/**
 * Scan a repository and detect all projects.
 * Checks both root and common subdirectories.
 *
 * @param repoRoot - Root directory of the repository
 * @returns Array of detected project configurations
 */
export function detectProjects(repoRoot: string): ProjectConfig[] {
  const projects: ProjectConfig[] = [];
  const processedPaths = new Set<string>();

  // Helper to add a project if it has a detectable stack
  const addProject = (projectPath: string): boolean => {
    const absolutePath = path.isAbsolute(projectPath)
      ? projectPath
      : path.join(repoRoot, projectPath);
    const relativePath = path.relative(repoRoot, absolutePath) || '.';

    // Skip if already processed
    if (processedPaths.has(relativePath)) {
      return false;
    }

    // Check if directory exists
    if (!existsSync(absolutePath)) {
      return false;
    }

    const stack = detectStack(absolutePath);
    if (stack === 'unknown') {
      return false;
    }

    processedPaths.add(relativePath);
    projects.push({
      name: generateProjectName(relativePath, stack),
      path: relativePath,
      stack,
      commands: getDefaultCommands(stack),
    });

    return true;
  };

  // First, check the root directory
  addProject(repoRoot);

  // Then check common subdirectories
  const subdirs = expandSubdirectories(repoRoot, SUBDIRECTORY_PATTERNS);
  for (const subdir of subdirs) {
    addProject(path.join(repoRoot, subdir));
  }

  return projects;
}

/**
 * Get the primary project from a list of detected projects.
 * Returns the root project if it exists, otherwise the first project.
 */
export function getPrimaryProject(projects: ProjectConfig[]): ProjectConfig | undefined {
  // Prefer root project
  const rootProject = projects.find(p => p.path === '.');
  if (rootProject) {
    return rootProject;
  }

  // Otherwise return first detected project
  return projects[0];
}

/**
 * Format detected projects for CLI display.
 */
export function formatDetectedProjects(projects: ProjectConfig[]): string {
  if (projects.length === 0) {
    return 'No projects detected.';
  }

  const lines = ['Detected project structure:'];
  for (const project of projects) {
    const stackDisplay = formatStackDisplay(project.stack);
    lines.push(`  - ${project.path}: ${stackDisplay}`);
  }

  return lines.join('\n');
}

/**
 * Format a tech stack for human-readable display.
 */
function formatStackDisplay(stack: TechStack): string {
  const labels: Record<TechStack, string> = {
    'node-npm': 'Node.js (npm)',
    'node-yarn': 'Node.js (Yarn)',
    'node-pnpm': 'Node.js (pnpm)',
    'node-bun': 'Bun',
    'python-pip': 'Python (pip)',
    'python-poetry': 'Python (Poetry)',
    'python-uv': 'Python (uv)',
    'rust-cargo': 'Rust (Cargo)',
    'go-mod': 'Go',
    'ruby-bundler': 'Ruby (Bundler)',
    'java-maven': 'Java (Maven)',
    'java-gradle': 'Java (Gradle)',
    'dotnet': '.NET',
    'unknown': 'Unknown',
  };

  return labels[stack] || stack;
}
