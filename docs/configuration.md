# Configuration Reference

This document provides a complete reference for the `.ai-sdlc.json` configuration file.

## Table of Contents

- [Quick Start](#quick-start)
- [Configuration Reference](#configuration-reference)
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
- [Environment Variable Overrides](#environment-variable-overrides)
- [Validation Rules](#validation-rules)
- [Example Configurations](#example-configurations)
- [Troubleshooting](#troubleshooting)

---

## Quick Start

The `.ai-sdlc.json` configuration file should be placed in the root of your project directory. If no configuration file exists, ai-sdlc will use default values for all options.

**Minimal configuration** (uses all defaults):
```json
{}
```

**Basic customization**:
```json
{
  "sdlcFolder": ".ai-sdlc",
  "testCommand": "npm test",
  "buildCommand": "npm run build",
  "theme": "auto"
}
```

For complete examples, see the [Example Configurations](#example-configurations) section.

---

## Configuration Reference

### Core Options

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `sdlcFolder` | `string` | `".ai-sdlc"` | Root directory for ai-sdlc metadata and story files |
| `defaultLabels` | `string[]` | `[]` | Labels automatically applied to all new stories |
| `theme` | `"auto" \| "light" \| "dark" \| "none"` | `"auto"` | Terminal theme preference for output formatting. `"auto"` detects based on terminal, `"none"` disables all colors |
| `testCommand` | `string \| undefined` | `"npm test"` | Command executed to run project tests. If undefined, tests are skipped |
| `buildCommand` | `string \| undefined` | `"npm run build"` | Command executed to build the project. If undefined, build is skipped |
| `settingSources` | `SettingSource[]` | `["project"]` | Configuration precedence for Agent SDK filesystem settings. Valid values: `"user"` (global `~/.claude/settings.json`), `"project"` (`.claude/settings.json` and CLAUDE.md), `"local"` (`.claude/settings.local.json`). Empty array means SDK isolation mode with no filesystem settings |
| `useOrchestrator` | `boolean \| undefined` | `false` | Enable sequential task orchestrator for implementation. When true, implementation runs as separate agents orchestrated sequentially |

**Notes:**
- `testCommand` and `buildCommand` are validated against a whitelist of safe executables. See [Validation Rules](#validation-rules).
- `settingSources` controls which `.claude/` configuration files are loaded by the Agent SDK. Must include `"project"` to load CLAUDE.md files.

---

### Stage Gates (`stageGates`)

Stage gates control approval points in the workflow where user confirmation is required before proceeding.

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `stageGates.requireApprovalBeforeImplementation` | `boolean` | `false` | Require user approval before starting implementation phase (after plan is complete) |
| `stageGates.requireApprovalBeforePR` | `boolean` | `false` | Require user approval before creating pull request |
| `stageGates.autoMergeOnApproval` | `boolean` | `false` | Automatically merge PR when approved (requires GitHub integration and permissions) |

**Example:**
```json
{
  "stageGates": {
    "requireApprovalBeforeImplementation": true,
    "requireApprovalBeforePR": true,
    "autoMergeOnApproval": false
  }
}
```

---

### Refinement (`refinement`)

Controls the refinement loop behavior when clarifying story requirements.

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `refinement.maxIterations` | `number` | `3` | Maximum refinement loops before escalation |
| `refinement.escalateOnMaxAttempts` | `"error" \| "manual" \| "skip"` | `"manual"` | How to handle max iterations: `"error"` throws error, `"manual"` requires user input, `"skip"` proceeds anyway |
| `refinement.enableCircuitBreaker` | `boolean` | `true` | Stop refinement if repeated failures detected (prevents infinite loops) |

**Example:**
```json
{
  "refinement": {
    "maxIterations": 5,
    "escalateOnMaxAttempts": "manual",
    "enableCircuitBreaker": true
  }
}
```

---

### Review Configuration (`reviewConfig`)

Controls the review process and automatic retry behavior.

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `reviewConfig.maxRetries` | `number` | `3` | Maximum retry attempts when review fails before blocking. Set to `0` to disable auto-retry. Can be overridden by `AI_SDLC_MAX_RETRIES` environment variable |
| `reviewConfig.maxRetriesUpperBound` | `number` | `10` | Hard upper bound for maxRetries (safety limit to prevent resource exhaustion) |
| `reviewConfig.autoCompleteOnApproval` | `boolean` | `true` | Automatically complete story when review is approved. Can be overridden by `AI_SDLC_AUTO_COMPLETE` environment variable |
| `reviewConfig.autoRestartOnRejection` | `boolean` | `true` | Automatically restart implementation when review is rejected (within retry limits). Can be overridden by `AI_SDLC_AUTO_RESTART` environment variable |
| `reviewConfig.detectTestAntipatterns` | `boolean \| undefined` | `true` | Enable test anti-pattern detection (e.g., test duplication, missing assertions) |
| `reviewConfig.autoCreatePROnApproval` | `boolean \| undefined` | `false` | Automatically create PR after review approval in automated mode. Set to `true` when `--auto` flag is used |

**Example:**
```json
{
  "reviewConfig": {
    "maxRetries": 5,
    "maxRetriesUpperBound": 10,
    "autoCompleteOnApproval": true,
    "autoRestartOnRejection": true,
    "detectTestAntipatterns": true
  }
}
```

---

### Implementation (`implementation`)

Controls implementation retry behavior when tests or build fail.

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `implementation.maxRetries` | `number` | `3` | Maximum retry attempts when implementation fails (e.g., tests fail, build fails). Set to `0` to disable retry. Can be overridden by `AI_SDLC_IMPLEMENTATION_MAX_RETRIES` environment variable |
| `implementation.maxRetriesUpperBound` | `number` | `10` | Hard upper bound for maxRetries (safety limit to prevent resource exhaustion) |

**Example:**
```json
{
  "implementation": {
    "maxRetries": 5,
    "maxRetriesUpperBound": 10
  }
}
```

---

### Timeouts (`timeouts`)

Timeout configuration for various operations. All values are in milliseconds.

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `timeouts.agentTimeout` | `number` | `600000` (10 minutes) | Timeout for agent queries in milliseconds. Valid range: 5000-3600000 (5 seconds to 1 hour) |
| `timeouts.buildTimeout` | `number` | `120000` (2 minutes) | Timeout for build commands in milliseconds. Valid range: 5000-3600000 |
| `timeouts.testTimeout` | `number` | `300000` (5 minutes) | Timeout for test commands in milliseconds. Valid range: 5000-3600000 |

**Example:**
```json
{
  "timeouts": {
    "agentTimeout": 1800000,
    "buildTimeout": 180000,
    "testTimeout": 600000
  }
}
```

**Note:** Timeout values are validated and clamped to the 5000-3600000ms range. Invalid values trigger a warning and use the default.

---

### Retry Configuration (`retry`)

Controls automatic retry behavior for API calls (e.g., transient network failures, rate limits).

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `retry.maxRetries` | `number` | `3` | Maximum number of retry attempts for API calls |
| `retry.initialDelay` | `number` | `2000` (2 seconds) | Initial delay in milliseconds before first retry |
| `retry.maxDelay` | `number` | `32000` (32 seconds) | Maximum delay in milliseconds between retries (exponential backoff cap) |
| `retry.maxTotalDuration` | `number` | `60000` (60 seconds) | Maximum total duration in milliseconds for all retries combined |

**Example:**
```json
{
  "retry": {
    "maxRetries": 5,
    "initialDelay": 1000,
    "maxDelay": 60000,
    "maxTotalDuration": 120000
  }
}
```

---

### Daemon (`daemon`)

Controls daemon/watch mode for continuous backlog monitoring and automatic story processing.

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `daemon.enabled` | `boolean` | `false` | Enable daemon mode for continuous monitoring |
| `daemon.pollingInterval` | `number` | `5000` (5 seconds) | Polling interval fallback if file system watcher fails (milliseconds) |
| `daemon.watchPatterns` | `string[]` | `["stories/*/story.md"]` | Glob patterns to watch for new stories |
| `daemon.processDelay` | `number` | `500` (500ms) | Debounce delay for file changes (milliseconds) to avoid processing duplicate events |
| `daemon.shutdownTimeout` | `number` | `30000` (30 seconds) | Max time to wait for graceful shutdown (milliseconds) |
| `daemon.enableEscShutdown` | `boolean` | `false` | Enable Esc+Esc shutdown (Phase 2 feature, currently only Ctrl+C supported) |
| `daemon.escTimeout` | `number` | `500` (500ms) | Max time between Esc presses for shutdown (milliseconds) |

**Example:**
```json
{
  "daemon": {
    "enabled": true,
    "pollingInterval": 10000,
    "watchPatterns": ["stories/*/story.md", "backlog/*.md"],
    "processDelay": 1000,
    "shutdownTimeout": 60000
  }
}
```

---

### TDD Mode (`tdd`)

Controls test-driven development workflow with red-green-refactor cycles.

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `tdd.enabled` | `boolean` | `false` | Enable test-driven development workflow |
| `tdd.strictMode` | `boolean` | `true` | Enforce strict TDD rules (fail if test doesn't fail first in red phase) |
| `tdd.maxCycles` | `number` | `50` | Maximum number of red-green-refactor cycles before stopping |
| `tdd.requireApprovalPerCycle` | `boolean` | `false` | Require user approval after each red-green-refactor cycle |
| `tdd.requirePassingTestsForComplete` | `boolean` | `true` | Require all tests passing before marking story complete |

**Example:**
```json
{
  "tdd": {
    "enabled": true,
    "strictMode": true,
    "maxCycles": 30,
    "requireApprovalPerCycle": false,
    "requirePassingTestsForComplete": true
  }
}
```

---

### Worktree (`worktree`)

Controls git worktree usage for isolated story execution. Worktrees allow parallel development of multiple stories without branch switching.

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `worktree.enabled` | `boolean` | `false` | Enable worktrees by default for story execution |
| `worktree.basePath` | `string` | `".ai-sdlc/worktrees"` | Base path for worktree directories (relative to project root or absolute). Parent directory must exist |

**Example:**
```json
{
  "worktree": {
    "enabled": true,
    "basePath": ".ai-sdlc/worktrees"
  }
}
```

**Note:** When worktrees are enabled, each story is executed in an isolated git worktree, allowing multiple stories to be developed in parallel without conflicts.

---

### Logging (`logging`)

Controls logging behavior for diagnostics and debugging.

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `logging.enabled` | `boolean` | `true` | Enable logging to file |
| `logging.level` | `"debug" \| "info" \| "warn" \| "error"` | `"info"` | Minimum log level to record. Can be overridden by `AI_SDLC_LOG_LEVEL` environment variable |
| `logging.maxFileSizeMb` | `number` | `10` | Maximum log file size in MB before rotation |
| `logging.maxFiles` | `number` | `5` | Maximum number of log files to retain after rotation |

**Example:**
```json
{
  "logging": {
    "enabled": true,
    "level": "debug",
    "maxFileSizeMb": 20,
    "maxFiles": 10
  }
}
```

---

### GitHub Integration (`github`)

Controls GitHub PR creation behavior and integration settings.

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `github.createDraftPRs` | `boolean \| undefined` | `undefined` (uses GitHub CLI default) | Create PRs as drafts by default. When undefined, uses `gh` CLI default behavior |

**Example:**
```json
{
  "github": {
    "createDraftPRs": true
  }
}
```

---

### Ticketing Integration (`ticketing`)

Controls integration with external ticketing systems (GitHub Issues, Jira, etc.). The ticketing system provides a foundational abstraction layer for synchronizing ai-sdlc stories with external ticket tracking tools.

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `ticketing.provider` | `'none' \| 'github' \| 'jira'` | `'none'` | Ticket provider type. `'none'` means local-only mode with no external synchronization |
| `ticketing.syncOnRun` | `boolean` | `true` | Automatically sync ticket status when story status changes |
| `ticketing.postProgressComments` | `boolean` | `true` | Post progress updates as comments to external tickets |
| `ticketing.github.repo` | `string \| undefined` | `undefined` | GitHub repository in format `'owner/repo'`. If not set, uses git remote |
| `ticketing.github.projectNumber` | `number \| undefined` | `undefined` | GitHub Projects v2 project number for status synchronization |
| `ticketing.github.statusLabels` | `Record<string, string> \| undefined` | `undefined` | Map story statuses to GitHub labels (e.g., `{ "in-progress": "status:in-progress" }`) |

**Example:**
```json
{
  "ticketing": {
    "provider": "none",
    "syncOnRun": true,
    "postProgressComments": true
  }
}
```

**Example with GitHub provider:**
```json
{
  "ticketing": {
    "provider": "github",
    "syncOnRun": true,
    "postProgressComments": true,
    "github": {
      "repo": "owner/repo",
      "projectNumber": 1,
      "statusLabels": {
        "backlog": "status:backlog",
        "ready": "status:ready",
        "in-progress": "status:in-progress",
        "done": "status:done",
        "blocked": "status:blocked"
      }
    }
  }
}
```

**Notes:**
- **Default behavior**: When `provider` is `'none'` (default) or ticketing configuration is absent, ai-sdlc operates in local-only mode. The `NullTicketProvider` is used, which performs no external synchronization.
- **Provider implementations**:
  - `'none'`: NullProvider (no-op, local-only mode) - **available**
  - `'github'`: GitHub Issues integration (read operations: import, link, list, get) - **available** (write operations coming in S-0075)
  - `'jira'`: Jira integration - **planned for future**
- **GitHub CLI requirement**: The GitHub provider requires the `gh` CLI to be installed and authenticated. Install from https://cli.github.com/
- **Available commands**:
  - `ai-sdlc import <issue-url>` - Import a GitHub Issue as a new story
  - `ai-sdlc link <story-id> <issue-url>` - Link an existing story to a GitHub Issue
- **Graceful degradation**: Write operations (status updates, comments, PR links) are no-ops in the current implementation. Full synchronization will be available in S-0075.
- See [Story Frontmatter: External Ticket Integration](#story-frontmatter-external-ticket-integration) for details on ticket fields in story files.
- See [GitHub Integration](#github-integration-commands) section below for detailed command usage.

---

## Environment Variable Overrides

The ai-sdlc CLI supports overriding specific configuration options via environment variables. This is useful for:
- CI/CD pipelines where file-based config is inconvenient
- Temporary behavior changes without modifying `.ai-sdlc.json`
- User-specific settings that shouldn't be committed to the repository

### Naming Convention

Environment variables follow the pattern: `AI_SDLC_<CONFIG_PATH>`

For nested configuration fields, the path is flattened using underscores in SCREAMING_SNAKE_CASE.

**Examples:**
- `reviewConfig.maxRetries` → `AI_SDLC_MAX_RETRIES`
- `logging.level` → `AI_SDLC_LOG_LEVEL`
- `implementation.maxRetries` → `AI_SDLC_IMPLEMENTATION_MAX_RETRIES`

### Precedence Rules

Configuration is resolved in this order (highest to lowest precedence):

1. **Environment variables** (`AI_SDLC_*`)
2. **Project configuration** (`.ai-sdlc.json` in project root)
3. **Built-in defaults** (hardcoded in source)

⚠️ **Important**: Environment variables override ALL file-based configuration sources.

### Supported Variables

| Environment Variable | Config Property | Type | Valid Values | Description |
|---------------------|-----------------|------|--------------|-------------|
| `AI_SDLC_ROOT` | `sdlcFolder` | `string` | Valid path | **Testing only** - Override SDLC root folder. Not recommended for production use |
| `AI_SDLC_MAX_RETRIES` | `reviewConfig.maxRetries` | `number` | `0-10` | Maximum review retry attempts. Values outside range are rejected |
| `AI_SDLC_IMPLEMENTATION_MAX_RETRIES` | `implementation.maxRetries` | `number` | `0-10` | Maximum implementation retry attempts. Values outside range are rejected |
| `AI_SDLC_AUTO_COMPLETE` | `reviewConfig.autoCompleteOnApproval` | `boolean` | `"true"` or `"false"` | Auto-complete story on review approval. Must be string "true" or "false" |
| `AI_SDLC_AUTO_RESTART` | `reviewConfig.autoRestartOnRejection` | `boolean` | `"true"` or `"false"` | Auto-restart implementation on review rejection. Must be string "true" or "false" |
| `AI_SDLC_LOG_LEVEL` | `logging.level` | `string` | `"debug"`, `"info"`, `"warn"`, `"error"` | Logging verbosity (case-insensitive) |

### Usage Examples

**Bash/Zsh:**
```bash
export AI_SDLC_LOG_LEVEL=debug
export AI_SDLC_MAX_RETRIES=5
ai-sdlc start
```

**One-time override:**
```bash
AI_SDLC_AUTO_COMPLETE=true ai-sdlc review S-0001
```

**CI/CD (GitHub Actions):**
```yaml
- name: Run ai-sdlc
  env:
    AI_SDLC_LOG_LEVEL: info
    AI_SDLC_MAX_RETRIES: 3
    AI_SDLC_AUTO_COMPLETE: true
  run: ai-sdlc implement --auto
```

**Fish shell:**
```fish
set -x AI_SDLC_LOG_LEVEL debug
ai-sdlc status
```

---

## Validation Rules

The configuration system includes multiple layers of validation to prevent security issues and invalid configurations.

### Command Validation

`testCommand` and `buildCommand` are validated to prevent command injection attacks:

**Whitelist of allowed executables:**
- `npm`, `yarn`, `pnpm`, `node`, `npx`, `bun` (JavaScript package managers)
- `make`, `mvn`, `gradle` (Build tools)

**Blocked shell metacharacters:**
- `;`, `&`, `|` (command chaining)
- `` ` ``, `$()`, `${}` (command/variable substitution)

**Examples:**
- ✅ Valid: `"npm test"`, `"yarn run build"`, `"make test"`
- ❌ Invalid: `"npm test && echo 'done'"` (contains `&&`)
- ❌ Invalid: `"python test.py"` (not in whitelist)

If validation fails, a warning is logged and the command is ignored (uses default or skips execution).

### Timeout Validation

All timeout values must be within the range **5000-3600000 milliseconds** (5 seconds to 1 hour).

**Validation behavior:**
- Values below 5000ms → Clamped to 5000ms with warning
- Values above 3600000ms → Clamped to 3600000ms with warning
- Non-numeric or infinite values → Ignored, uses default value

**Example:**
```json
{
  "timeouts": {
    "agentTimeout": 2000  // ❌ Too low, clamped to 5000ms
  }
}
```

### Type Validation

All configuration fields are validated for correct types:

**Common type errors:**
- Boolean fields must be `true` or `false` (not string `"true"`)
- Numeric fields must be finite numbers (not strings or NaN)
- Array fields must be arrays (not strings or objects)

**Example:**
```json
{
  "tdd": {
    "enabled": "true"  // ❌ Wrong type (string instead of boolean)
  }
}
```

### Setting Sources Validation

`settingSources` must be an array of valid values: `"user"`, `"project"`, or `"local"`.

**Examples:**
- ✅ Valid: `["project"]`, `["user", "project", "local"]`, `[]`
- ❌ Invalid: `["global"]` (not a valid source)
- ❌ Invalid: `"project"` (not an array)

Invalid values are filtered out with a warning, and the array is updated to contain only valid sources.

### Security Features

**Prototype Pollution Prevention:**
The configuration loader rejects objects containing `__proto__`, `constructor`, or `prototype` properties to prevent prototype pollution attacks.

**Retry Limits:**
`maxRetries` fields are capped at 10 (via `maxRetriesUpperBound`) to prevent resource exhaustion from misconfiguration.

---

## Example Configurations

### Example 1: Minimal Configuration (Defaults)

For most projects, you can start with an empty configuration file to use all defaults:

```json
{}
```

**Behavior:**
- Uses `.ai-sdlc` folder for metadata
- No manual approval required before implementation or PR creation
- Runs `npm test` and `npm run build` before review
- 3 retry attempts for review and implementation failures
- 10-minute agent timeout, 2-minute build timeout, 5-minute test timeout

---

### Example 2: TDD Workflow

Enable test-driven development with automatic test execution:

```json
{
  "tdd": {
    "enabled": true,
    "strictMode": true,
    "maxCycles": 30,
    "requireApprovalPerCycle": false,
    "requirePassingTestsForComplete": true
  },
  "stageGates": {
    "requireApprovalBeforeImplementation": true,
    "requireApprovalBeforePR": true
  },
  "testCommand": "npm test",
  "buildCommand": "npm run build"
}
```

**Use case:** Projects following strict TDD methodology with red-green-refactor cycles.

---

### Example 3: Worktree Mode (Isolated Development)

Use worktrees for parallel story development with automatic processing:

```json
{
  "worktree": {
    "enabled": true,
    "basePath": ".ai-sdlc/worktrees"
  },
  "daemon": {
    "enabled": true,
    "pollingInterval": 5000,
    "watchPatterns": ["stories/*/story.md"],
    "processDelay": 500
  },
  "stageGates": {
    "requireApprovalBeforeImplementation": false,
    "requireApprovalBeforePR": false
  }
}
```

**Use case:** Teams working on multiple stories concurrently without branch switching overhead.

---

### Example 4: Custom Timeouts and Retry Limits

Extended timeouts for large projects with complex builds:

```json
{
  "timeouts": {
    "agentTimeout": 1800000,
    "buildTimeout": 600000,
    "testTimeout": 900000
  },
  "reviewConfig": {
    "maxRetries": 5,
    "maxRetriesUpperBound": 10,
    "autoCompleteOnApproval": true,
    "autoRestartOnRejection": true
  },
  "implementation": {
    "maxRetries": 5,
    "maxRetriesUpperBound": 10
  },
  "refinement": {
    "maxIterations": 5,
    "escalateOnMaxAttempts": "manual"
  }
}
```

**Use case:** Large monorepos or projects with slow builds/tests requiring extended timeouts and more retry attempts.

---

### Example 5: Production-Ready (Strict)

Full control with manual approvals and extended timeouts for production deployments:

```json
{
  "stageGates": {
    "requireApprovalBeforeImplementation": true,
    "requireApprovalBeforePR": true,
    "autoMergeOnApproval": false
  },
  "reviewConfig": {
    "maxRetries": 5,
    "maxRetriesUpperBound": 10,
    "autoCompleteOnApproval": false,
    "autoRestartOnRejection": false,
    "detectTestAntipatterns": true
  },
  "timeouts": {
    "agentTimeout": 1800000,
    "buildTimeout": 600000,
    "testTimeout": 900000
  },
  "refinement": {
    "maxIterations": 5,
    "escalateOnMaxAttempts": "manual",
    "enableCircuitBreaker": true
  },
  "logging": {
    "enabled": true,
    "level": "info",
    "maxFileSizeMb": 20,
    "maxFiles": 10
  },
  "github": {
    "createDraftPRs": true
  }
}
```

**Use case:** Production environments requiring strict human oversight, extended timeouts, and comprehensive logging.

---

## GitHub Integration Commands

### Prerequisites

Before using GitHub integration commands, ensure:

1. **gh CLI is installed**: Download from https://cli.github.com/
2. **gh CLI is authenticated**: Run `gh auth login` and follow the prompts
3. **GitHub provider is configured**: Set `ticketing.provider` to `"github"` in `.ai-sdlc.json`

```json
{
  "ticketing": {
    "provider": "github",
    "github": {
      "repo": "owner/repo"  // Optional, uses git remote if not set
    }
  }
}
```

### Import Command

Import a GitHub Issue as a new story in ai-sdlc.

**Syntax:**
```bash
ai-sdlc import <issue-url>
```

**Supported URL formats:**
- `https://github.com/owner/repo/issues/123`
- `https://github.com/owner/repo/issues/123#issuecomment-456`
- `github.com/owner/repo/issues/123`
- `owner/repo#123`

**Example:**
```bash
# Import issue #123 from owner/repo
ai-sdlc import https://github.com/owner/repo/issues/123

# Output:
# ✓ Created story: S-0042 - Add user authentication
#   Linked to: https://github.com/owner/repo/issues/123
#
# Next steps:
#   ai-sdlc details S-0042
#   ai-sdlc run --story S-0042
```

**Behavior:**
- Creates a new story with the issue title and description
- Sets `ticket_provider`, `ticket_id`, `ticket_url`, and `ticket_synced_at` fields
- Checks for duplicate imports (warns if issue is already linked to a story)
- Validates gh CLI availability before fetching issue details

**Error handling:**
- `GitHub provider not configured` - Set `ticketing.provider = "github"` in config
- `GitHub CLI (gh) is not installed or not authenticated` - Install gh CLI and run `gh auth login`
- `Invalid GitHub issue URL` - Use one of the supported URL formats
- `Issue #123 is already imported` - The issue is already linked to a story

### Link Command

Link an existing story to a GitHub Issue.

**Syntax:**
```bash
ai-sdlc link <story-id> <issue-url> [--no-sync]
```

**Parameters:**
- `<story-id>` - Story ID (e.g., `S-0042`) or slug (e.g., `add-user-authentication`)
- `<issue-url>` - GitHub issue URL in any supported format
- `--no-sync` - Skip prompt to sync title and description from the issue

**Example:**
```bash
# Link story S-0042 to issue #123
ai-sdlc link S-0042 https://github.com/owner/repo/issues/123

# Output:
# Issue details:
#   Title: Add user authentication
#   Status: open
#
# Current story:
#   Title: Add auth feature
#
# Do you want to sync the story title and description from the issue? (y/N): y
#
# ✓ Linked S-0042 to GitHub Issue #123
#   Issue URL: https://github.com/owner/repo/issues/123
#   Synced: title and description
```

**Example with --no-sync:**
```bash
# Link without syncing title/description
ai-sdlc link S-0042 owner/repo#123 --no-sync

# Output:
# ✓ Linked S-0042 to GitHub Issue #123
#   Issue URL: https://github.com/owner/repo/issues/123
```

**Behavior:**
- Updates story frontmatter with `ticket_provider`, `ticket_id`, `ticket_url`, and `ticket_synced_at`
- Optionally syncs title and description from the issue (requires user confirmation unless `--no-sync` is used)
- Warns if story is already linked to a different issue (requires confirmation to overwrite)
- Only updates story content if it's empty or very short (< 50 characters)

**Error handling:**
- `Story not found: S-0042` - Invalid story ID or slug
- `Story is already linked to issue #456` - Requires confirmation to overwrite existing link

### Common Troubleshooting

**Problem: "GitHub CLI (gh) is not installed"**

**Solution:**
```bash
# macOS
brew install gh

# Linux/WSL
curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null
sudo apt update
sudo apt install gh

# Windows
winget install GitHub.cli
```

**Problem: "Not authenticated to GitHub"**

**Solution:**
```bash
gh auth login
# Follow the interactive prompts to authenticate
```

**Problem: "GitHub provider not configured"**

**Solution:**
Add to `.ai-sdlc.json`:
```json
{
  "ticketing": {
    "provider": "github",
    "github": {
      "repo": "owner/repo"
    }
  }
}
```

**Problem: "Issue #123 not found in owner/repo"**

**Possible causes:**
- Issue doesn't exist
- Repository name is incorrect
- You don't have access to the repository
- Issue is in a private repository and you're not authenticated

**Solution:**
1. Verify the issue exists: Open the URL in a browser
2. Check repository configuration in `.ai-sdlc.json`
3. Ensure you have access: `gh repo view owner/repo`
4. Re-authenticate if needed: `gh auth login`

---

## Troubleshooting

### Problem: "Invalid or unsafe testCommand in config, removing"

**Cause:** The `testCommand` contains a disallowed executable or dangerous shell metacharacters.

**Solution:**
1. Ensure the executable is in the whitelist: `npm`, `yarn`, `pnpm`, `node`, `npx`, `bun`, `make`, `mvn`, `gradle`
2. Remove shell operators like `;`, `&&`, `|`, or `$()`

**Example fix:**
```json
// ❌ Bad
{
  "testCommand": "npm test && npm run lint"
}

// ✅ Good (use npm scripts instead)
{
  "testCommand": "npm run test-and-lint"
}
```

And in `package.json`:
```json
{
  "scripts": {
    "test-and-lint": "npm test && npm run lint"
  }
}
```

---

### Problem: "Invalid testCommand in config (must be object), ignoring"

**Cause:** The `testCommand` field is not a string.

**Solution:** Ensure `testCommand` is a string, not an object or array.

**Example fix:**
```json
// ❌ Bad
{
  "testCommand": ["npm", "test"]
}

// ✅ Good
{
  "testCommand": "npm test"
}
```

---

### Problem: "agentTimeout is below minimum (5000ms), setting to minimum"

**Cause:** A timeout value is below the minimum allowed threshold (5 seconds).

**Solution:** Increase the timeout to at least 5000ms (5 seconds).

**Example fix:**
```json
// ❌ Bad
{
  "timeouts": {
    "agentTimeout": 2000
  }
}

// ✅ Good
{
  "timeouts": {
    "agentTimeout": 30000
  }
}
```

---

### Problem: "Invalid settingSources values in config"

**Cause:** The `settingSources` array contains invalid values (not `"user"`, `"project"`, or `"local"`).

**Solution:** Use only valid setting sources.

**Example fix:**
```json
// ❌ Bad
{
  "settingSources": ["global", "workspace"]
}

// ✅ Good
{
  "settingSources": ["user", "project", "local"]
}
```

---

### Problem: "Invalid tdd.enabled in config (must be boolean), using default"

**Cause:** A boolean field contains a string value like `"true"` instead of the boolean `true`.

**Solution:** Remove the quotes around boolean values in your JSON.

**Example fix:**
```json
// ❌ Bad
{
  "tdd": {
    "enabled": "true"
  }
}

// ✅ Good
{
  "tdd": {
    "enabled": true
  }
}
```

---

### Problem: Configuration file not loading

**Cause:** JSON syntax error, wrong file name, or wrong location.

**Solution:**
1. Ensure the file is named exactly `.ai-sdlc.json` (with leading dot)
2. Place it in the project root directory (same level as `package.json`)
3. Validate JSON syntax using a validator (e.g., `jsonlint .ai-sdlc.json`)

**Check for common JSON errors:**
- Missing commas between properties
- Trailing commas after last property
- Unquoted property names
- Single quotes instead of double quotes

---

### Problem: Environment variable override not working

**Cause:** Invalid value format or unsupported environment variable.

**Solution:**
1. Check that the environment variable is in the [supported list](#supported-variables)
2. Ensure boolean values are strings `"true"` or `"false"` (not bare booleans)
3. Ensure numeric values are in the valid range (0-10 for retries)

**Example:**
```bash
# ❌ Bad (boolean without quotes)
export AI_SDLC_AUTO_COMPLETE=true  # Shell interprets as string "true", which works

# ✅ Good (explicitly quoted)
export AI_SDLC_AUTO_COMPLETE="true"

# ❌ Bad (out of range)
export AI_SDLC_MAX_RETRIES=50  # Rejected, must be 0-10

# ✅ Good
export AI_SDLC_MAX_RETRIES=5
```

---

### Problem: Worktree basePath validation fails

**Cause:** The parent directory of `worktree.basePath` does not exist.

**Solution:** Ensure the parent directory exists before enabling worktrees.

**Example:**
```json
{
  "worktree": {
    "enabled": true,
    "basePath": ".ai-sdlc/worktrees"
  }
}
```

**Ensure `.ai-sdlc/` directory exists:**
```bash
mkdir -p .ai-sdlc
```

---

## Story Frontmatter: External Ticket Integration

The ai-sdlc system supports optional fields in story frontmatter for linking stories to external ticketing systems like GitHub Issues, Jira, or Linear. These fields enable bi-directional synchronization between ai-sdlc stories and your existing ticket tracking tools.

### Ticket Fields Reference

All ticket integration fields are **optional**. Stories without these fields will continue to work normally as local-only stories.

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `ticket_provider` | `'github' \| 'jira' \| 'linear'` | The external ticketing system | `"github"` |
| `ticket_id` | `string` | The ticket identifier in the external system | `"123"` for GitHub<br>`"PROJ-456"` for Jira<br>`"LIN-789"` for Linear |
| `ticket_url` | `string` | Full URL to the external ticket | `"https://github.com/org/repo/issues/123"` |
| `ticket_synced_at` | `string` | ISO 8601 timestamp of last synchronization | `"2026-01-27T10:00:00Z"` |

### Example Story with Ticket Fields

```yaml
---
id: S-0042
title: Add user authentication
slug: add-user-authentication
priority: 20
status: in-progress
type: feature
created: '2026-01-20'
labels: [epic-auth, sprint-2026-q1]
research_complete: true
plan_complete: true
implementation_complete: false
reviews_complete: false
# External ticket integration
ticket_provider: github
ticket_id: '123'
ticket_url: https://github.com/org/repo/issues/123
ticket_synced_at: '2026-01-27T10:00:00Z'
---

# Add user authentication

...
```

### Usage Notes

- **Backward Compatibility**: Stories without ticket fields continue to work without modification. The fields are purely optional metadata.
- **No Behavior Changes**: These fields are for metadata storage only. They do not affect story execution or validation.
- **Future Integration**: Ticket provider implementations (S-0073+) will use these fields to enable synchronization with external systems.
- **Manual Updates**: Currently, these fields must be set manually. Future stories will add CLI commands for automatic synchronization.

### Provider-Specific ID Formats

Different ticketing systems use different ID formats:

- **GitHub**: Numeric issue number as string (e.g., `"123"`, `"4567"`)
- **Jira**: Project key + number (e.g., `"PROJ-456"`, `"AUTH-12"`)
- **Linear**: Team prefix + number (e.g., `"LIN-789"`, `"ENG-42"`)

### Timestamp Format

The `ticket_synced_at` field uses ISO 8601 format with timezone:

```yaml
ticket_synced_at: '2026-01-27T15:30:00.000Z'  # Full timestamp with milliseconds
ticket_synced_at: '2026-01-27T15:30:00Z'      # Without milliseconds (also valid)
```

---

## Additional Resources

- **Story Documents**: See `docs/story-documents.md` for guidance on writing story files
- **Testing Patterns**: See `docs/testing.md` for testing best practices
- **Implementation Workflow**: See `docs/implementation-workflow.md` for the development process
- **Code Conventions**: See `docs/code-conventions.md` for coding standards

---

**Last verified**: 2026-01-27 against `src/core/config.ts`, `src/types/index.ts`, and `src/core/story.ts`
