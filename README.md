# Agentic SDLC

Agent-first SDLC workflow manager using Claude Agent SDK. A Kanban-style board with AI-powered workflow automation for software development stories.

## Features

- 📋 Kanban-style story management (Backlog → Ready → In Progress → Done)
- 🤖 AI-powered agents for each workflow stage
- 🔄 **Resume workflows after interruption** with `--continue` flag
- 🎨 Customizable themes (auto, light, dark, none)
- 📊 Visual progress tracking with status flags
- ⚡ Automatic state assessment and action recommendations

## Installation

```bash
npm install
npm run build
```

## Quick Start

```bash
# Initialize the .agentic-sdlc folder
agentic-sdlc init

# Add a new story
agentic-sdlc add "Implement user authentication"

# Run the workflow (process next action)
agentic-sdlc run

# Process all pending actions automatically
agentic-sdlc run --auto

# Resume workflow after interruption
agentic-sdlc run --continue
```

## CLI Commands

### `init`
Initialize the `.agentic-sdlc` folder structure with Kanban columns.

```bash
agentic-sdlc init
```

### `status`
Show the current board state with all stories and their progress.

```bash
agentic-sdlc status
```

### `add <title>`
Add a new story to the backlog.

```bash
agentic-sdlc add "Add dark mode toggle"
```

### `details <id>` (alias: `d`)
Show detailed information about a specific story by ID or slug.

**Usage:**

```bash
# View by story ID
agentic-sdlc details story-mk68fjh7-fvbt

# View by slug
agentic-sdlc details add-dark-mode-toggle

# Use short alias
agentic-sdlc d story-mk68fjh7-fvbt
```

**Displays:**
- All metadata (ID, slug, status, priority, type, effort, assignee, labels)
- Workflow status (research, planning, implementation, reviews)
- PR information (branch, URL)
- All content sections (summary, acceptance criteria, research, plan, review notes)
- Automatically hides empty sections

**Features:**
- Case-insensitive lookup
- Works with both story ID and slug
- Helpful error messages with suggestions
- Color-coded status indicators
- Formatted dates

### `run [options]`
Run the workflow and process actions.

**Options:**
- `--auto` - Process all pending actions automatically
- `--dry-run` - Show what would be executed without running
- `--continue` - Resume workflow from last checkpoint

**Examples:**

```bash
# Process the next recommended action
agentic-sdlc run

# Process all pending actions
agentic-sdlc run --auto

# Resume after interruption (Ctrl+C, error, etc.)
agentic-sdlc run --continue

# Preview what would be executed
agentic-sdlc run --dry-run
```

### `config [key] [value]`
Manage configuration settings.

```bash
# View all configuration
agentic-sdlc config

# View theme setting
agentic-sdlc config theme

# Set theme
agentic-sdlc config theme dark
```

## Resuming Workflows

The `--continue` flag enables resuming workflows after interruption. This is useful when:

- A workflow was interrupted by Ctrl+C
- An action failed and you fixed the issue
- Your system crashed or lost connection
- You want to continue from where you left off

### How It Works

1. **Automatic Checkpointing**: After each successful action, the workflow state is saved to `.agentic-sdlc/.workflow-state.json`
2. **Smart Resume**: When you use `--continue`, the system:
   - Loads the saved checkpoint
   - Shows which actions were already completed
   - Skips completed actions
   - Continues with remaining pending actions
3. **Automatic Cleanup**: When all actions complete, the checkpoint is automatically cleared

### Resume Examples

**Basic interruption and resume:**

```bash
# Start workflow
agentic-sdlc run --auto

# (Interrupted by Ctrl+C after research completes)

# Resume from checkpoint
agentic-sdlc run --continue
# Output:
# ⟳ Resuming workflow from checkpoint
#   Workflow ID: workflow-1234567890-abc123
#   Checkpoint: 1/8/2024, 3:45:12 PM
#   Completed actions: 1
#
# ⊘ Skipping completed actions:
#   ✓ Research "add-dark-mode"
#
# Planning "add-dark-mode"...
# ✓ Progress saved (2 actions completed)
```

**Resume with --auto flag:**

```bash
# Resume and complete all remaining actions
agentic-sdlc run --auto --continue
```

**Check for existing checkpoint:**

```bash
# Start a new workflow when checkpoint exists
agentic-sdlc run
# Output:
# Note: Found previous checkpoint. Use --continue to resume.
```

### Edge Cases & Warnings

The resume feature handles several edge cases:

**Story content changed:**
```bash
⟳ Resuming workflow from checkpoint
  ⚠ Warning: Story content changed since interruption
  Proceeding with current state...
```

**Stale checkpoint (>48 hours old):**
```bash
⟳ Resuming workflow from checkpoint
  ⚠ Warning: Checkpoint is more than 48 hours old
  Context may be stale. Consider starting fresh.
```

**No checkpoint found:**
```bash
Error: No checkpoint found.
Remove --continue flag to start a new workflow.
```

**All actions already completed:**
```bash
All actions from checkpoint already completed!
Checkpoint cleared.
```

### Checkpoint Files

Checkpoint files are stored at:
```
.agentic-sdlc/.workflow-state.json
```

**State file format:**
```json
{
  "version": "1.0",
  "workflowId": "workflow-1234567890-abc123",
  "timestamp": "2024-01-08T15:45:12.000Z",
  "currentAction": null,
  "completedActions": [
    {
      "type": "research",
      "storyId": "story-123",
      "storyPath": ".agentic-sdlc/in-progress/add-dark-mode.md",
      "completedAt": "2024-01-08T15:45:12.000Z"
    }
  ],
  "context": {
    "sdlcRoot": ".agentic-sdlc",
    "options": {
      "auto": true
    },
    "storyContentHash": "abc123..."
  }
}
```

**Note:** Checkpoint files are automatically added to `.gitignore` and should not be committed to version control.

## Workflow Stages

Each story progresses through these stages:

1. **Refine** - AI agent enhances the story description
2. **Research** - AI agent researches implementation approach
3. **Plan** - AI agent creates detailed implementation plan
4. **Implement** - AI agent implements the feature
5. **Review** - AI agent reviews the implementation
6. **Create PR** - Create pull request for review
7. **Move to Done** - Mark story as complete

## Story Status Flags

When viewing stories with `agentic-sdlc status`, you'll see progress flags:

- `R` - Research complete
- `P` - Plan complete
- `I` - Implementation complete
- `V` - Reviews complete
- `!` - Error occurred

Example:
```
IN-PROGRESS (1)
  [1] add-dark-mode - Add dark mode toggle [RP]
```

## Configuration

Configuration is stored in `.agentic-sdlc.json` at the project root.

**Default configuration:**
```json
{
  "sdlcFolder": ".agentic-sdlc",
  "stageGates": {
    "requireApprovalBeforeImplementation": false,
    "requireApprovalBeforePR": false,
    "autoMergeOnApproval": false
  },
  "defaultLabels": [],
  "theme": "auto"
}
```

### Theme Configuration

Available themes:
- `auto` - Automatically detect based on terminal capabilities
- `light` - Light theme with colors
- `dark` - Dark theme with colors
- `none` - No colors (plain text)

```bash
# Set theme
agentic-sdlc config theme dark
```

## Authentication

The system supports two authentication methods:

1. **Claude Code credentials** (stored in Keychain)
2. **Environment variable**: `ANTHROPIC_API_KEY`

Get an API key at: https://console.anthropic.com/

```bash
# Set via environment variable
export ANTHROPIC_API_KEY=your-key-here
```

## Folder Structure

```
.agentic-sdlc/
├── backlog/           # New stories
├── ready/             # Stories ready to start
├── in-progress/       # Active stories
├── done/              # Completed stories
└── .workflow-state.json  # Checkpoint file (auto-created, gitignored)
```

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build
npm run build

# Run tests
npm test

# Type check
npm run lint
```

## Testing

The project includes comprehensive tests for the workflow state persistence layer:

```bash
# Run all tests
npm test

# Run specific test file
npm test workflow-state.test.ts

# Run tests in watch mode
npm test -- --watch
```

## Troubleshooting

### Corrupted Checkpoint

If you encounter a corrupted checkpoint error:

```bash
Error: Corrupted workflow state file at .agentic-sdlc/.workflow-state.json.
Delete the file to start fresh: rm ".agentic-sdlc/.workflow-state.json"
```

Solution:
```bash
rm .agentic-sdlc/.workflow-state.json
agentic-sdlc run  # Start fresh
```

### Multiple Workflows

Currently, only one workflow can run at a time. If you try to start a new workflow while a checkpoint exists, you'll see a suggestion to use `--continue`.

To start fresh (ignoring the checkpoint):
```bash
rm .agentic-sdlc/.workflow-state.json
agentic-sdlc run
```

## License

MIT
