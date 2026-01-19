# AI SDLC

> **Alpha Release**: Expect breaking changes. Report issues at [GitHub Issues](https://github.com/patrob/ai-sdlc/issues)

Agent-first SDLC workflow manager using Claude Agent SDK. A Kanban-style board with AI-powered workflow automation for software development stories.

## Features

- **Kanban-style story management** (Backlog → Ready → In Progress → Done)
- **AI-powered agents** for each workflow stage (refine, research, plan, implement, review)
- **Full SDLC automation** with `--auto --story` - takes a story from idea to reviewed code
- **TDD Mode** - Optional Test-Driven Development with Red-Green-Refactor cycles
- **Resume workflows** after interruption with `--continue`
- **Daemon mode** - Watch for and process new stories with `--watch`

## Installation

```bash
npm install -g ai-sdlc
```

## Quick Start

```bash
# Initialize the project
ai-sdlc init

# Add a story to the backlog
ai-sdlc add "Implement user authentication"

# View your board
ai-sdlc status

# Run the full SDLC for a story
ai-sdlc run --auto --story implement-user-authentication
```

## Commands

| Command | Description |
|---------|-------------|
| `ai-sdlc init` | Initialize `.ai-sdlc` folder structure |
| `ai-sdlc status` | View stories in Kanban board |
| `ai-sdlc add "title"` | Add a new story to backlog |
| `ai-sdlc run` | Process next recommended action |
| `ai-sdlc run --auto` | Process all pending actions |
| `ai-sdlc run --auto --story <id>` | Full SDLC for one story |
| `ai-sdlc run --story <id> --step <phase>` | Run specific phase (refine/research/plan/implement/review) |
| `ai-sdlc run --continue` | Resume after interruption |
| `ai-sdlc run --watch` | Daemon mode - watch for new stories |
| `ai-sdlc details <id>` | Show story details |
| `ai-sdlc config [key] [value]` | View/set configuration |

## Workflow Phases

Stories progress through these phases:

```
Refine → Research → Plan → Implement → Review → Create PR → Done
```

**Status flags** shown in `ai-sdlc status`:
- `[R]` Research complete
- `[P]` Plan complete
- `[I]` Implementation complete
- `[V]` Reviews complete
- `[!]` Blocked

## Configuration

Configure ai-sdlc behavior via a `.ai-sdlc.json` file in your project root. If no configuration file exists, ai-sdlc uses sensible defaults.

**Key configuration areas:**
- **Stage gates** - Control approval requirements before implementation and PR creation
- **Timeouts** - Configure operation timeouts (agent, build, test)
- **Retry policies** - Control automatic retry behavior for review and implementation failures
- **TDD mode** - Enable test-driven development with red-green-refactor cycles
- **Worktree isolation** - Use git worktrees for parallel story development
- **Environment variable overrides** - Use `AI_SDLC_*` variables for CI/CD or temporary changes

**Minimal example** (uses all defaults):
```json
{}
```

**Basic customization**:
```json
{
  "sdlcFolder": ".ai-sdlc",
  "stageGates": {
    "requireApprovalBeforeImplementation": true
  },
  "timeouts": {
    "agentTimeout": 1800000
  },
  "theme": "auto"
}
```

📖 **[Complete Configuration Reference](docs/configuration.md)** - Detailed documentation of all configuration options, validation rules, environment variables, and 5 complete example configurations.

## Authentication

Set your API key:

```bash
export ANTHROPIC_API_KEY=your-key-here
```

Get an API key at: https://console.anthropic.com/

## Releasing

Releases are automated via GitHub Actions using [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/) (OIDC - no tokens required).

| Release Type | How to Trigger | npm Tag |
|--------------|----------------|---------|
| **Alpha** | Automatic on push to `main` | `@alpha` |
| **Stable** | Push a git tag (`v1.2.3`) | `@latest` |

**Alpha releases** happen automatically when you push to `main`. The version is auto-incremented based on the latest alpha on npm.

**Stable releases** are triggered by pushing a semver git tag:

```bash
# Patch release (bug fixes)
git tag v0.2.1
git push origin v0.2.1

# Minor release (new features)
git tag v0.3.0
git push origin v0.3.0

# Major release (breaking changes)
git tag v1.0.0
git push origin v1.0.0
```

Stable releases automatically create a GitHub Release with generated notes.

## Development

```bash
npm install
npm run build
npm test
npm run lint
```

## License

MIT
