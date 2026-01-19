# Configuration Reference

## Introduction

The ai-sdlc CLI is configured via a `.ai-sdlc.json` file located in your project root directory. This file controls all aspects of the SDLC workflow, from story refinement to implementation and review processes.

**Quick Links:**
- [Core Options](#core-options)
- [Stage Gates](#stage-gates-stagegates)
- [Refinement](#refinement-refinement)
- [Review Configuration](#review-configuration-reviewconfig)
- [Implementation](#implementation-implementation)
- [Timeouts](#timeouts-timeouts)
- [Retry Configuration](#retry-configuration-retry)
- [Daemon](#daemon-daemon)
- [TDD Mode](#tdd-mode-tdd)
- [Worktree](#worktree-worktree)
- [Logging](#logging-logging)
- [GitHub Integration](#github-integration-github)
- [Environment Variables](#environment-variable-overrides)
- [Validation Rules](#validation-rules)
- [Examples](#example-configurations)
- [Troubleshooting](#troubleshooting)

## Configuration Reference

### Core Options

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `sdlcFolder` | `string` | `".ai-sdlc"` | Root directory for ai-sdlc metadata, story files, and worktrees |
| `defaultLabels` | `string[]` | `[]` | Labels automatically applied to all new stories |
| `theme` | `"auto" \| "light" \| "dark" \| "none"` | `"auto"` | Terminal theme preference for output formatting |
| `testCommand` | `string` | `"npm test"` | Command executed to run project tests |
| `buildCommand` | `string` | `"npm run build"` | Command executed to build the project |
| `settingSources` | `("user" \| "project" \| "local")[]` | `["project"]` | Configuration source precedence order |
| `useOrchestrator` | `boolean` | `false` | Enable orchestrator mode for multi-agent coordination |

### Stage Gates (`stageGates`)

Stage gates control approval requirements at key workflow transitions.

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `stageGates.requireApprovalBeforeImplementation` | `boolean` | `true` | Require user approval before starting implementation phase |
| `stageGates.requireApprovalBeforePR` | `boolean` | `true` | Require user approval before creating pull request |
| `stageGates.autoMergeOnApproval` | `boolean` | `false` | Automatically merge PR when approved (requires GitHub integration) |

### Refinement (`refinement`)

Controls the story refinement loop behavior.

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `refinement.maxIterations` | `number` | `3` | Maximum refinement loops before escalation |
| `refinement.escalateOnMaxAttempts` | `"manual" \| "auto"` | `"manual"` | How to handle max iterations: require user input (`manual`) or auto-proceed (`auto`) |
| `refinement.enableCircuitBreaker` | `boolean` | `true` | Stop refinement if repeated failures detected |

### Review Configuration (`reviewConfig`)

Controls the review phase behavior and retry logic.

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `reviewConfig.maxRetries` | `number` | `3` | Maximum review retry attempts before escalation |
| `reviewConfig.maxRetriesUpperBound` | `number` | `10` | Hard limit for maxRetries (cannot be exceeded) |
| `reviewConfig.autoCompleteOnApproval` | `boolean` | `true` | Automatically complete story when review is approved |
| `reviewConfig.autoRestartOnRejection` | `boolean` | `true` | Automatically restart implementation when review is rejected |
| `reviewConfig.requirePassingTests` | `boolean` | `true` | Require tests to pass before completing review |

### Implementation (`implementation`)

Controls implementation phase behavior.

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `implementation.maxRetries` | `number` | `3` | Maximum implementation retry attempts |
| `implementation.requirePassingTests` | `boolean` | `true` | Require tests to pass before marking implementation complete |
| `implementation.maxFilesToModify` | `number` | `50` | Maximum number of files that can be modified in a single implementation |

### Timeouts (`timeouts`)

All timeout values are in milliseconds. Valid range: 5000ms (5 seconds) to 3600000ms (1 hour).

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `timeouts.agentTimeout` | `number` | `600000` | Maximum time for agent operations (10 minutes) |
| `timeouts.networkTimeout` | `number` | `30000` | Maximum time for network requests (30 seconds) |
| `timeouts.commandTimeout` | `number` | `300000` | Maximum time for command execution (5 minutes) |
| `timeouts.testTimeout` | `number` | `300000` | Maximum time for test execution (5 minutes) |

### Retry Configuration (`retry`)

Controls exponential backoff retry behavior for failed operations.

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `retry.initialDelay` | `number` | `1000` | Initial delay before first retry (milliseconds) |
| `retry.maxDelay` | `number` | `30000` | Maximum delay between retries (milliseconds) |
| `retry.backoffMultiplier` | `number` | `2` | Multiplier for exponential backoff |
| `retry.maxRetries` | `number` | `3` | Maximum number of retry attempts |

### Daemon (`daemon`)

Controls the background daemon process for parallel story execution.

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `daemon.enabled` | `boolean` | `false` | Enable daemon mode for background processing |
| `daemon.port` | `number` | `3000` | Port for daemon HTTP server |
| `daemon.host` | `string` | `"localhost"` | Host address for daemon server |
| `daemon.autoStart` | `boolean` | `true` | Automatically start daemon if not running |
| `daemon.maxWorkers` | `number` | `3` | Maximum concurrent story workers |

### TDD Mode (`tdd`)

Controls test-driven development workflow features.

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `tdd.enabled` | `boolean` | `false` | Enable TDD mode with automatic test execution |
| `tdd.testCommand` | `string` | `"npm test"` | Command to run tests in TDD mode |
| `tdd.autoRun` | `boolean` | `true` | Automatically run tests after code changes |
| `tdd.watchMode` | `boolean` | `false` | Run tests in watch mode (if supported by test framework) |

### Worktree (`worktree`)

Controls git worktree usage for isolated story development.

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `worktree.enabled` | `boolean` | `false` | Enable worktree mode for parallel story branches |
| `worktree.basePath` | `string` | `".ai-sdlc/worktrees"` | Base directory for worktree checkouts |

### Logging (`logging`)

Controls log output and persistence.

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `logging.level` | `"debug" \| "info" \| "warn" \| "error"` | `"info"` | Minimum log level to output |
| `logging.file` | `string \| null` | `null` | Optional log file path (if null, logs to stdout only) |
| `logging.format` | `"json" \| "text"` | `"text"` | Log output format |
| `logging.timestamp` | `boolean` | `true` | Include timestamps in log output |

### GitHub Integration (`github`)

Controls GitHub API integration for PR and issue management.

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `github.token` | `string \| null` | `null` | GitHub personal access token (can also use GITHUB_TOKEN env var) |
| `github.org` | `string \| null` | `null` | GitHub organization name |
| `github.repo` | `string \| null` | `null` | GitHub repository name |

## Environment Variable Overrides

The ai-sdlc CLI supports overriding specific configuration options via environment variables. This is useful for:
- CI/CD pipelines where file-based config is inconvenient
- Temporary behavior changes without modifying `.ai-sdlc.json`
- User-specific settings that shouldn't be committed

### Naming Convention

Environment variables follow the pattern: `AI_SDLC_<OPTION_NAME>`

### Precedence Rules

Configuration is resolved in this order (highest to lowest precedence):
1. **Environment variables** (`AI_SDLC_*`)
2. **Local configuration** (`.ai-sdlc.local.json` - if `settingSources` includes `"local"`)
3. **Project configuration** (`.ai-sdlc.json` in project root - if `settingSources` includes `"project"`)
4. **User configuration** (`~/.ai-sdlc/config.json` - if `settingSources` includes `"user"`)
5. **Built-in defaults** (hardcoded in source)

⚠️ **Important**: Environment variables override ALL file-based configuration sources.

### Supported Environment Variables

| Environment Variable | Config Property | Type | Valid Values | Description |
|---------------------|-----------------|------|--------------|-------------|
| `AI_SDLC_ROOT` | `sdlcFolder` | `string` | Valid path | **Testing only** - Override SDLC root folder |
| `AI_SDLC_MAX_RETRIES` | `reviewConfig.maxRetries` | `number` | `0-10` | Maximum review retry attempts |
| `AI_SDLC_IMPLEMENTATION_MAX_RETRIES` | `implementation.maxRetries` | `number` | `0-10` | Maximum implementation retry attempts |
| `AI_SDLC_AUTO_COMPLETE` | `reviewConfig.autoCompleteOnApproval` | `boolean` | `"true"` or `"false"` | Auto-complete story on review approval |
| `AI_SDLC_AUTO_RESTART` | `reviewConfig.autoRestartOnRejection` | `boolean` | `"true"` or `"false"` | Auto-restart implementation on review rejection |
| `AI_SDLC_LOG_LEVEL` | `logging.level` | `string` | `"debug"`, `"info"`, `"warn"`, `"error"` | Logging verbosity |

### Usage Examples

**Bash/Zsh**:
```bash
export AI_SDLC_LOG_LEVEL=debug
export AI_SDLC_MAX_RETRIES=5
ai-sdlc start
```

**One-time override**:
```bash
AI_SDLC_AUTO_COMPLETE=true ai-sdlc review
```

**CI/CD (GitHub Actions)**:
```yaml
- name: Run ai-sdlc
  env:
    AI_SDLC_LOG_LEVEL: info
    AI_SDLC_MAX_RETRIES: 3
  run: ai-sdlc implement
```

## Validation Rules

The configuration system enforces strict validation to prevent security issues and invalid states.

### Command Validation

For security, only whitelisted executables are allowed in `testCommand` and `buildCommand`:

**Allowed executables**: `npm`, `yarn`, `pnpm`, `node`, `npx`, `bun`, `make`, `mvn`, `gradle`

**Blocked shell metacharacters**: `;`, `&`, `|`, `` ` ``, `$()`, `${}`, `>`, `<`, `\n`

**Example valid commands**:
```json
{
  "testCommand": "npm test",
  "buildCommand": "npm run build -- --prod"
}
```

**Example invalid commands**:
```json
{
  "testCommand": "npm test && echo done",  // Error: contains &&
  "buildCommand": "python build.py"        // Error: python not whitelisted
}
```

### Timeout Validation

All timeout values must be within this range:
- **Minimum**: 5000ms (5 seconds)
- **Maximum**: 3600000ms (1 hour)
- Must be finite numbers (not `Infinity` or `NaN`)

### Type Validation

Boolean fields must be actual booleans, not strings:
```json
{
  "tdd": {
    "enabled": true        // ✓ Correct
  }
}
```

```json
{
  "tdd": {
    "enabled": "true"      // ✗ Error: must be boolean, not string
  }
}
```

### Setting Sources Validation

The `settingSources` array must only contain valid values:
- Valid: `"user"`, `"project"`, `"local"`
- Order matters: earlier sources have lower precedence

### Security Features

1. **Prototype Pollution Prevention**: Configuration loading prevents prototype pollution attacks
2. **Command Injection Prevention**: Strict command whitelist and metacharacter blocking
3. **Path Traversal Prevention**: Paths are normalized and validated

## Example Configurations

### Example 1: Minimal Configuration (Defaults)

For most projects, you can start with an empty configuration file to use all defaults:

```json
{}
```

This uses all built-in defaults: manual approval gates, 3 retry attempts, 10-minute agent timeout, etc.

### Example 2: TDD Workflow

Enable test-driven development with automatic test execution and manual approval gates:

```json
{
  "tdd": {
    "enabled": true,
    "testCommand": "npm test",
    "autoRun": true
  },
  "stageGates": {
    "requireApprovalBeforeImplementation": true,
    "requireApprovalBeforePR": true
  },
  "reviewConfig": {
    "requirePassingTests": true,
    "autoCompleteOnApproval": false
  }
}
```

**Use case**: Projects where you want to see test results before each phase transition.

### Example 3: Worktree Mode (Parallel Development)

Use worktrees for isolated story branches with daemon mode for parallel execution:

```json
{
  "worktree": {
    "enabled": true,
    "basePath": ".ai-sdlc/worktrees"
  },
  "daemon": {
    "enabled": true,
    "port": 3000,
    "autoStart": true,
    "maxWorkers": 3
  },
  "stageGates": {
    "requireApprovalBeforeImplementation": false,
    "requireApprovalBeforePR": true
  }
}
```

**Use case**: Teams working on multiple stories simultaneously without branch conflicts.

### Example 4: Custom Timeouts and Retry Limits

Extended timeouts and increased retry limits for large codebases or slow tests:

```json
{
  "timeouts": {
    "agentTimeout": 1800000,
    "testTimeout": 600000,
    "commandTimeout": 600000
  },
  "reviewConfig": {
    "maxRetries": 5
  },
  "implementation": {
    "maxRetries": 5
  },
  "refinement": {
    "maxIterations": 5,
    "escalateOnMaxAttempts": "manual"
  }
}
```

**Use case**: Complex projects where operations need more time and retries.

### Example 5: Production-Ready (Strict)

Full control with manual approvals, no auto-actions, and extended timeouts:

```json
{
  "stageGates": {
    "requireApprovalBeforeImplementation": true,
    "requireApprovalBeforePR": true,
    "autoMergeOnApproval": false
  },
  "reviewConfig": {
    "maxRetries": 5,
    "autoCompleteOnApproval": false,
    "autoRestartOnRejection": false,
    "requirePassingTests": true
  },
  "implementation": {
    "requirePassingTests": true,
    "maxRetries": 5
  },
  "timeouts": {
    "agentTimeout": 1800000,
    "networkTimeout": 60000,
    "testTimeout": 600000,
    "commandTimeout": 600000
  },
  "refinement": {
    "maxIterations": 5,
    "escalateOnMaxAttempts": "manual",
    "enableCircuitBreaker": true
  },
  "logging": {
    "level": "info",
    "file": ".ai-sdlc/logs/ai-sdlc.log",
    "format": "json",
    "timestamp": true
  }
}
```

**Use case**: Production environments where you want maximum control and audit trail.

## Troubleshooting

### Error: "Invalid command: contains disallowed characters"

**Cause**: Your `testCommand` or `buildCommand` contains shell metacharacters that are blocked for security.

**Solution**: Remove shell operators like `&&`, `||`, `;`, `&`, or pipes. Chain commands using npm scripts instead:

```json
// ✗ Wrong
{
  "testCommand": "npm run lint && npm test"
}

// ✓ Correct - use npm script
{
  "testCommand": "npm run test:all"
}
```

Then in `package.json`:
```json
{
  "scripts": {
    "test:all": "npm run lint && npm test"
  }
}
```

### Error: "Invalid command: executable not whitelisted"

**Cause**: Your command uses an executable that's not in the security whitelist.

**Solution**: Use a whitelisted executable (`npm`, `yarn`, `pnpm`, `node`, `npx`, `bun`, `make`, `mvn`, `gradle`):

```json
// ✗ Wrong
{
  "testCommand": "python -m pytest"
}

// ✓ Correct - use npm/npx wrapper
{
  "testCommand": "npx pytest"
}
```

### Error: "Timeout must be between 5000 and 3600000"

**Cause**: A timeout value is outside the valid range (5 seconds to 1 hour).

**Solution**: Adjust timeout to be within bounds:

```json
// ✗ Wrong
{
  "timeouts": {
    "agentTimeout": 999999999
  }
}

// ✓ Correct
{
  "timeouts": {
    "agentTimeout": 1800000  // 30 minutes
  }
}
```

### Error: "Invalid setting source"

**Cause**: `settingSources` contains an invalid value.

**Solution**: Use only valid sources: `"user"`, `"project"`, `"local"`:

```json
// ✗ Wrong
{
  "settingSources": ["global", "project"]
}

// ✓ Correct
{
  "settingSources": ["user", "project", "local"]
}
```

### Error: "Expected boolean, received string"

**Cause**: A boolean field contains a string value like `"true"` instead of actual boolean `true`.

**Solution**: Remove quotes from boolean values:

```json
// ✗ Wrong
{
  "tdd": {
    "enabled": "true"
  }
}

// ✓ Correct
{
  "tdd": {
    "enabled": true
  }
}
```

### Configuration not loading / Using defaults

**Cause**: Configuration file not found or has syntax errors.

**Solution**:
1. Verify `.ai-sdlc.json` exists in project root
2. Validate JSON syntax using `cat .ai-sdlc.json | jq .`
3. Check file permissions (must be readable)
4. Review logs for parsing errors: `ai-sdlc status --verbose`

### Environment variable override not working

**Cause**: Variable name incorrect or precedence misunderstanding.

**Solution**:
1. Verify variable name matches exactly: `AI_SDLC_LOG_LEVEL` not `AI_SDLC_LOGLEVEL`
2. Check variable is exported: `echo $AI_SDLC_LOG_LEVEL`
3. Remember env vars override ALL file-based config
4. Boolean values must be strings: `AI_SDLC_AUTO_COMPLETE="true"` not `AI_SDLC_AUTO_COMPLETE=true`

---

**Last updated**: 2025-01-19
**Verified against**: `src/core/config.ts` and `src/types/index.ts`
