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

Settings in `.ai-sdlc.json`:

```json
{
  "sdlcFolder": ".ai-sdlc",
  "stageGates": {
    "requireApprovalBeforeImplementation": false,
    "requireApprovalBeforePR": false
  },
  "tdd": {
    "enabled": false
  },
  "theme": "auto"
}
```

**TDD Mode**: Enable per-story with `tdd_enabled: true` in frontmatter, or globally via config.

## Authentication

Set your API key:

```bash
export ANTHROPIC_API_KEY=your-key-here
```

Get an API key at: https://console.anthropic.com/

## Releasing

Releases are automated via GitHub Actions using [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/) (OIDC - no tokens required).

| Release Type | How to Trigger | npm Tag | Version Example |
|--------------|----------------|---------|-----------------|
| **Alpha** | Automatic on push to `main` | `@alpha` | `0.2.0-alpha.28` → `0.2.0-alpha.29` |
| **Patch** | Manual: Actions → Publish → `patch` | `@latest` | `0.2.0-alpha.29` → `0.2.1` |
| **Minor** | Manual: Actions → Publish → `minor` | `@latest` | `0.2.0-alpha.29` → `0.3.0` |
| **Major** | Manual: Actions → Publish → `major` | `@latest` | `0.2.0-alpha.29` → `1.0.0` |

**To release a stable version:**
1. Go to GitHub → Actions → "Publish"
2. Click "Run workflow"
3. Select version type (`patch`, `minor`, or `major`)
4. Click "Run workflow"

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
