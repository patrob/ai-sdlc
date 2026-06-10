import { type Config,type TechStack } from '../../types/index.js';
import { validateCostLimitConfig } from './validators.js';

/**
 * Security: Validate command string to prevent command injection
 * Whitelists common package managers and build tools
 */
function validateCommand(command: string, fieldName: string): boolean {
  if (!command || typeof command !== 'string') {
    return false;
  }

  // Whitelist of allowed executables
  const allowedExecutables = [
    // JavaScript/Node.js
    'npm', 'yarn', 'pnpm', 'node', 'npx', 'bun',
    // Build tools
    'make', 'mvn', 'gradle', './gradlew', 'gradlew',
    // Python
    'pip', 'pip3', 'python', 'python3', 'poetry', 'uv', 'pytest',
    // Rust
    'cargo', 'rustc',
    // Go
    'go',
    // Ruby
    'bundle', 'bundler', 'gem', 'ruby', 'rake', 'rspec',
    // .NET
    'dotnet',
  ];

  // Extract first word (executable name)
  const parts = command.trim().split(/\s+/);
  const executable = parts[0];

  // Check if executable is in whitelist
  if (!allowedExecutables.includes(executable)) {
    console.warn(`Warning: ${fieldName} uses non-whitelisted executable "${executable}". Allowed: ${allowedExecutables.join(', ')}`);
    return false;
  }

  // Check for dangerous shell metacharacters
  const dangerousPatterns = [
    /[;&|`$()]/,      // Shell operators
    /\$\{/,           // Variable substitution
    /\$\(/,           // Command substitution
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(command)) {
      console.warn(`Warning: ${fieldName} contains potentially dangerous shell metacharacters: ${command}`);
      return false;
    }
  }

  return true;
}

/**
 * Validate groupings configuration
 */
function validateGroupingsConfig(groupings: any): boolean {
  if (!Array.isArray(groupings)) {
    console.warn('Invalid groupings in config (must be array), ignoring');
    return false;
  }

  const validDimensions = ['thematic', 'temporal', 'structural'];
  const validCardinalities = ['single', 'many'];

  for (const grouping of groupings) {
    if (typeof grouping !== 'object' || grouping === null) {
      console.warn('Invalid grouping entry in config (must be object), ignoring groupings');
      return false;
    }

    // Validate dimension
    if (!validDimensions.includes(grouping.dimension)) {
      console.warn(
        `Invalid grouping dimension "${grouping.dimension}". Valid values: ${validDimensions.join(', ')}`
      );
      return false;
    }

    // Validate prefix
    if (typeof grouping.prefix !== 'string' || grouping.prefix === '') {
      console.warn('Invalid grouping prefix (must be non-empty string)');
      return false;
    }

    // Validate cardinality
    if (!validCardinalities.includes(grouping.cardinality)) {
      console.warn(
        `Invalid grouping cardinality "${grouping.cardinality}". Valid values: ${validCardinalities.join(', ')}`
      );
      return false;
    }

    // externalMapping is optional, but if present, validate structure
    if (grouping.externalMapping !== undefined) {
      if (typeof grouping.externalMapping !== 'object' || grouping.externalMapping === null) {
        console.warn('Invalid externalMapping (must be object), ignoring');
        return false;
      }

      if (typeof grouping.externalMapping.system !== 'string') {
        console.warn('Invalid externalMapping.system (must be string)');
        return false;
      }

      if (typeof grouping.externalMapping.field !== 'string') {
        console.warn('Invalid externalMapping.field (must be string)');
        return false;
      }
    }
  }

  return true;
}

/**
 * Valid tech stack values for project configuration
 */
const VALID_TECH_STACKS: TechStack[] = [
  'node-npm', 'node-yarn', 'node-pnpm', 'node-bun',
  'python-pip', 'python-poetry', 'python-uv',
  'rust-cargo', 'go-mod', 'ruby-bundler',
  'java-maven', 'java-gradle', 'dotnet',
  'unknown',
];

/**
 * Validate projects configuration
 */
function validateProjectsConfig(projects: any): boolean {
  if (!Array.isArray(projects)) {
    console.warn('Invalid projects in config (must be array), ignoring');
    return false;
  }

  for (const project of projects) {
    if (typeof project !== 'object' || project === null) {
      console.warn('Invalid project entry in config (must be object), ignoring projects');
      return false;
    }

    // Validate name
    if (typeof project.name !== 'string' || project.name === '') {
      console.warn('Invalid project name (must be non-empty string)');
      return false;
    }

    // Validate path
    if (typeof project.path !== 'string' || project.path === '') {
      console.warn('Invalid project path (must be non-empty string)');
      return false;
    }

    // Validate stack
    if (!VALID_TECH_STACKS.includes(project.stack)) {
      console.warn(
        `Invalid project stack "${project.stack}". Valid values: ${VALID_TECH_STACKS.join(', ')}`
      );
      return false;
    }

    // Validate commands object
    if (project.commands !== undefined) {
      if (typeof project.commands !== 'object' || project.commands === null) {
        console.warn('Invalid project commands (must be object)');
        return false;
      }

      // Validate each command in the project
      const commandFields = ['install', 'build', 'test', 'start', 'lint', 'verify'];
      for (const field of commandFields) {
        if (project.commands[field] !== undefined) {
          if (!validateCommand(project.commands[field], `projects[].commands.${field}`)) {
            return false;
          }
        }
      }
    }
  }

  return true;
}

// Private sanitization helpers
function sanitizeCommands(userConfig: any): void {
  const commandFields = ['testCommand', 'buildCommand', 'installCommand', 'startCommand', 'lintCommand', 'verifyCommand'] as const;
  for (const field of commandFields) {
    if (userConfig[field] !== undefined) {
      if (!validateCommand(userConfig[field], field)) {
        console.warn(`Invalid or unsafe ${field} in config, removing`);
        delete userConfig[field];
      }
    }
  }
}

function sanitizeTimeouts(userConfig: any): void {
  const MIN_TIMEOUT_MS = 5000;      // 5 seconds minimum
  const MAX_TIMEOUT_MS = 3600000;   // 1 hour maximum

  if (userConfig.timeouts !== undefined) {
    if (typeof userConfig.timeouts !== 'object' || userConfig.timeouts === null) {
      console.warn('Invalid timeouts in config (must be object), ignoring');
      delete userConfig.timeouts;
    } else {
      const timeoutFields = ['agentTimeout', 'buildTimeout', 'testTimeout'] as const;
      for (const field of timeoutFields) {
        if (userConfig.timeouts[field] !== undefined) {
          const value = userConfig.timeouts[field];
          if (typeof value !== 'number' || !Number.isFinite(value) || isNaN(value)) {
            console.warn(`Invalid ${field} in config (must be finite number), using default`);
            delete userConfig.timeouts[field];
          } else if (value < MIN_TIMEOUT_MS) {
            console.warn(`${field} is below minimum (${MIN_TIMEOUT_MS}ms), setting to minimum`);
            userConfig.timeouts[field] = MIN_TIMEOUT_MS;
          } else if (value > MAX_TIMEOUT_MS) {
            console.warn(`${field} exceeds maximum (${MAX_TIMEOUT_MS}ms), setting to maximum`);
            userConfig.timeouts[field] = MAX_TIMEOUT_MS;
          }
        }
      }
    }
  }
}

function sanitizeTddConfig(userConfig: any): void {
  if (userConfig.tdd !== undefined) {
    if (typeof userConfig.tdd !== 'object' || userConfig.tdd === null) {
      console.warn('Invalid tdd in config (must be object), ignoring');
      delete userConfig.tdd;
    } else {
      const booleanFields = ['enabled', 'strictMode', 'requireApprovalPerCycle', 'requirePassingTestsForComplete'] as const;
      for (const field of booleanFields) {
        if (userConfig.tdd[field] !== undefined && typeof userConfig.tdd[field] !== 'boolean') {
          console.warn(`Invalid tdd.${field} in config (must be boolean), using default`);
          delete userConfig.tdd[field];
        }
      }
      if (userConfig.tdd.maxCycles !== undefined) {
        if (typeof userConfig.tdd.maxCycles !== 'number' || !Number.isFinite(userConfig.tdd.maxCycles) || userConfig.tdd.maxCycles <= 0) {
          console.warn('Invalid tdd.maxCycles in config (must be positive number), using default');
          delete userConfig.tdd.maxCycles;
        }
      }
    }
  }
}

function sanitizeWorktreeConfig(userConfig: any): void {
  if (userConfig.worktree !== undefined) {
    if (typeof userConfig.worktree !== 'object' || userConfig.worktree === null) {
      console.warn('Invalid worktree in config (must be object), ignoring');
      delete userConfig.worktree;
    } else {
      if (userConfig.worktree.enabled !== undefined && typeof userConfig.worktree.enabled !== 'boolean') {
        console.warn('Invalid worktree.enabled in config (must be boolean), using default');
        delete userConfig.worktree.enabled;
      }
      if (userConfig.worktree.basePath !== undefined && typeof userConfig.worktree.basePath !== 'string') {
        console.warn('Invalid worktree.basePath in config (must be string), using default');
        delete userConfig.worktree.basePath;
      }
    }
  }
}

function sanitizeAiConfig(userConfig: any): void {
  if (userConfig.ai !== undefined) {
    if (typeof userConfig.ai !== 'object' || userConfig.ai === null) {
      console.warn('Invalid ai in config (must be object), ignoring');
      delete userConfig.ai;
    } else {
      if (userConfig.ai.provider !== undefined && typeof userConfig.ai.provider !== 'string') {
        console.warn('Invalid ai.provider in config (must be string), using default');
        delete userConfig.ai.provider;
      }
      if (userConfig.ai.model !== undefined && typeof userConfig.ai.model !== 'string') {
        console.warn('Invalid ai.model in config (must be string), ignoring');
        delete userConfig.ai.model;
      }
    }
  }
}

function sanitizeTicketingConfig(userConfig: any): void {
  if (userConfig.ticketing !== undefined) {
    if (typeof userConfig.ticketing !== 'object' || userConfig.ticketing === null) {
      console.warn('Invalid ticketing in config (must be object), ignoring');
      delete userConfig.ticketing;
    } else {
      const validProviders = ['none', 'github', 'jira'];
      if (userConfig.ticketing.provider !== undefined) {
        if (typeof userConfig.ticketing.provider !== 'string' || !validProviders.includes(userConfig.ticketing.provider)) {
          console.warn(`Invalid ticketing.provider "${userConfig.ticketing.provider}". Valid values: ${validProviders.join(', ')}`);
          userConfig.ticketing.provider = 'none';
        }
      }
      const booleanFields = ['syncOnRun', 'postProgressComments'] as const;
      for (const field of booleanFields) {
        if (userConfig.ticketing[field] !== undefined && typeof userConfig.ticketing[field] !== 'boolean') {
          console.warn(`Invalid ticketing.${field} in config (must be boolean), using default`);
          delete userConfig.ticketing[field];
        }
      }
      if (userConfig.ticketing.github !== undefined) {
        if (typeof userConfig.ticketing.github !== 'object' || userConfig.ticketing.github === null) {
          console.warn('Invalid ticketing.github in config (must be object), ignoring');
          delete userConfig.ticketing.github;
        } else {
          if (userConfig.ticketing.github.repo !== undefined && typeof userConfig.ticketing.github.repo !== 'string') {
            console.warn('Invalid ticketing.github.repo in config (must be string), ignoring');
            delete userConfig.ticketing.github.repo;
          }
          if (userConfig.ticketing.github.projectNumber !== undefined) {
            if (typeof userConfig.ticketing.github.projectNumber !== 'number' || !Number.isFinite(userConfig.ticketing.github.projectNumber)) {
              console.warn('Invalid ticketing.github.projectNumber in config (must be number), ignoring');
              delete userConfig.ticketing.github.projectNumber;
            }
          }
          if (userConfig.ticketing.github.statusLabels !== undefined) {
            if (typeof userConfig.ticketing.github.statusLabels !== 'object' || userConfig.ticketing.github.statusLabels === null) {
              console.warn('Invalid ticketing.github.statusLabels in config (must be object), ignoring');
              delete userConfig.ticketing.github.statusLabels;
            }
          }
        }
      }
    }
  }
}

/**
 * Validate and sanitize user configuration to prevent prototype pollution
 */
export function sanitizeUserConfig(userConfig: any): Partial<Config> {
  // Check for prototype pollution attempts
  if (
    Object.prototype.hasOwnProperty.call(userConfig, '__proto__') ||
    Object.prototype.hasOwnProperty.call(userConfig, 'constructor') ||
    Object.prototype.hasOwnProperty.call(userConfig, 'prototype')
  ) {
    throw new Error('Invalid configuration: prototype pollution attempt detected');
  }

  sanitizeCommands(userConfig);

  if (userConfig.projects !== undefined) {
    if (!validateProjectsConfig(userConfig.projects)) {
      console.warn('Invalid projects configuration, removing');
      delete userConfig.projects;
    }
  }

  if (userConfig.settingSources !== undefined) {
    if (!Array.isArray(userConfig.settingSources)) {
      console.warn('Invalid settingSources in config (must be array), ignoring');
      delete userConfig.settingSources;
    } else {
      const validSources = ['user', 'project', 'local'];
      const invalidSources = userConfig.settingSources.filter(
        (s: any) => typeof s !== 'string' || !validSources.includes(s)
      );
      if (invalidSources.length > 0) {
        console.warn(
          `Invalid settingSources values in config: ${invalidSources.join(', ')}. Valid values: ${validSources.join(', ')}`
        );
        userConfig.settingSources = userConfig.settingSources.filter((s: any) =>
          validSources.includes(s)
        );
      }
    }
  }

  sanitizeTimeouts(userConfig);
  sanitizeTddConfig(userConfig);
  sanitizeWorktreeConfig(userConfig);
  sanitizeAiConfig(userConfig);

  if (userConfig.groupings !== undefined) {
    if (!validateGroupingsConfig(userConfig.groupings)) {
      console.warn('Invalid groupings configuration, using defaults');
      delete userConfig.groupings;
    }
  }

  if (userConfig.costLimits !== undefined) {
    if (typeof userConfig.costLimits !== 'object' || userConfig.costLimits === null) {
      console.warn('Invalid costLimits in config (must be object), ignoring');
      delete userConfig.costLimits;
    } else {
      userConfig.costLimits = validateCostLimitConfig(userConfig.costLimits);
    }
  }

  sanitizeTicketingConfig(userConfig);

  return userConfig;
}
