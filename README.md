# AI SDLC

> **Alpha Release**: This is an early alpha. Expect breaking changes.
> Report issues at [GitHub Issues](https://github.com/patrob/agentic-workflow/issues)

Agent-first SDLC workflow manager using Claude Agent SDK. A Kanban-style board with AI-powered workflow automation for software development stories.

## Features

- 📋 Kanban-style story management (Backlog → Ready → In Progress → Done)
- 🤖 AI-powered agents for each workflow stage
- 🚀 **Full SDLC automation** for individual stories with `--auto --story` (refine → research → plan → implement → review)
- 🔄 **Resume workflows after interruption** with `--continue` flag
- 🎨 Customizable themes (auto, light, dark, none)
- 📊 Visual progress tracking with status flags
- ⚡ Automatic state assessment and action recommendations
- ♻️ Smart phase skipping (automatically skips completed phases)

## Installation

```bash
npm install
npm run build
```

## Quick Start

```bash
# Initialize the .ai-sdlc folder
ai-sdlc init

# Add a new story
ai-sdlc add "Implement user authentication"

# Run the workflow (process next action)
ai-sdlc run

# Process all pending actions automatically
ai-sdlc run --auto

# Resume workflow after interruption
ai-sdlc run --continue
```

## CLI Commands

### `init`
Initialize the `.ai-sdlc` folder structure with Kanban columns.

```bash
ai-sdlc init
```

### `status`
View all stories in a formatted table view with story IDs, truncated text, and uniform alignment.

```bash
ai-sdlc status
```

**Table View** (terminal width ≥ 100 columns):
```
┌──────────────────────┬────────────────────────────────────────────┬──────────────┬────────────────────┬────────┐
│ Story ID             │ Title                                      │ Status       │ Labels             │ Flags  │
├──────────────────────┼────────────────────────────────────────────┼──────────────┼────────────────────┼────────┤
│ story-mk68fjh7-fvbt  │ Improve status output: add story ID...    │ backlog      │ enhancement, ui    │ [R]    │
│ story-mk6a2jk9-xyzf  │ Add user authentication                    │ in-progress  │ feature, security  │ [RPI]  │
│ story-mk6b3lm1-abcd  │ Fix payment processing bug                 │ ready        │ bug, critical      │ [RP]   │
└──────────────────────┴────────────────────────────────────────────┴──────────────┴────────────────────┴────────┘
```

**Compact View** (terminal width < 100 columns):
```
ID: story-mk68fjh7-fvbt | Status: backlog
Title: Improve status output: add story ID column...
Labels: enhancement, ui, cli | Flags: [R]
────────────────────────────────────────────────
```

**Features:**
- **Story ID Column**: Quickly identify stories by their unique ID
- **Smart Truncation**: Titles and labels are truncated for readability with "..." indicator
- **Responsive Design**: Automatically switches between table and compact view based on terminal width
- **Color Coding**: Status and flags are color-coded for quick visual scanning
- **Workflow Flags**:
  - `[R]` - Research complete
  - `[P]` - Plan complete
  - `[I]` - Implementation complete
  - `[V]` - Reviews complete
  - `[!]` - Blocked

**Minimum Terminal Width**: 100 columns recommended for table view

**Disable Hints**: Set `AI_SDLC_NO_HINTS=1` to hide the compact view notification

### `add <title>`
Add a new story to the backlog.

```bash
ai-sdlc add "Add dark mode toggle"
```

### `details <id>` (alias: `d`)
Show detailed information about a specific story by ID or slug.

**Usage:**

```bash
# View by story ID
ai-sdlc details story-mk68fjh7-fvbt

# View by slug
ai-sdlc details add-dark-mode-toggle

# Use short alias
ai-sdlc d story-mk68fjh7-fvbt
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
- `--auto` - Process all pending actions automatically (combine with `--story` for full SDLC: refine → research → plan → implement → review)
- `--dry-run` - Show what would be executed without running
- `--continue` - Resume workflow from last checkpoint
- `--story <id-or-slug>` - Target a specific story by ID or slug
- `--step <phase>` - Run a specific phase (refine, research, plan, implement, review) - cannot be combined with `--auto --story`

**Examples:**

```bash
# Process the next recommended action
ai-sdlc run

# Process all pending actions
ai-sdlc run --auto

# Resume after interruption (Ctrl+C, error, etc.)
ai-sdlc run --continue

# Preview what would be executed
ai-sdlc run --dry-run

# Run full SDLC for a specific story (NEW!)
ai-sdlc run --auto --story my-feature

# Run specific phase for a story
ai-sdlc run --story my-feature --step research
```

### `config [key] [value]`
Manage configuration settings.

```bash
# View all configuration
ai-sdlc config

# View theme setting
ai-sdlc config theme

# Set theme
ai-sdlc config theme dark
```

## Full SDLC Automation (--auto --story)

The `--auto --story` combination provides complete end-to-end automation for individual stories, executing all five SDLC phases in sequence: **refine → research → plan → implement → review**.

### Quick Example

```bash
# Take a story from idea to reviewed implementation in one command
ai-sdlc run --auto --story my-feature
```

### How It Works

When you combine `--auto` with `--story`, the system:

1. **Identifies the target story** by ID or slug
2. **Assesses current state** to determine which phases are incomplete
3. **Generates complete phase sequence** (refine → research → plan → implement → review)
4. **Skips completed phases** automatically (idempotent - safe to re-run)
5. **Executes remaining phases** sequentially with progress tracking
6. **Saves checkpoints** after each phase for resume capability
7. **Stops on failure** with clear error messages

### Phase Progression

The full SDLC workflow follows this progression:

```
┌─────────┐    ┌──────────┐    ┌──────┐    ┌───────────┐    ┌────────┐
│ Refine  │ -> │ Research │ -> │ Plan │ -> │ Implement │ -> │ Review │
└─────────┘    └──────────┘    └──────┘    └───────────┘    └────────┘
  backlog        ready           ready       in-progress      in-progress
    → ready      (flags)        (flags)        (flags)          (done)
```

**Phase Details:**

1. **Refine** - Enhances story clarity and moves from backlog → ready
2. **Research** - Analyzes codebase and adds research findings
3. **Plan** - Creates implementation plan
4. **Implement** - Generates code changes
5. **Review** - Performs code, security, and product owner reviews

### Smart Phase Skipping

Already completed phases are automatically skipped:

```bash
# Story has research and plan complete
ai-sdlc run --auto --story my-feature

# Output:
# 🚀 Starting full SDLC for story: My Feature
#   ID: story-abc123
#   Status: ready
#   Skipping completed phases: refine, research, plan
#   Phases to execute: 2/5
#
# ═══ Phase 1/2: IMPLEMENT ═══
# ...
```

**Skipping Logic:**
- **Refine**: Skipped if story is not in backlog/
- **Research**: Skipped if `research_complete: true`
- **Plan**: Skipped if `plan_complete: true`
- **Implement**: Skipped if `implementation_complete: true`
- **Review**: Skipped if `reviews_complete: true`

### Progress Tracking

Clear progress indicators show current phase:

```bash
🚀 Starting full SDLC for story: Add dark mode toggle
  ID: story-mk68fjh7-fvbt
  Status: backlog
  Phases to execute: 5/5

═══ Phase 1/5: REFINE ═══
✓ Refine "add-dark-mode-toggle"
  → Story enhanced with acceptance criteria
  → Moved to ready/
  ✓ Progress saved (1 actions completed)

═══ Phase 2/5: RESEARCH ═══
✓ Research "add-dark-mode-toggle"
  → Research findings added
  ✓ Progress saved (2 actions completed)

═══ Phase 3/5: PLAN ═══
...

═══════════════════════════════════════════════════
✓ Full SDLC completed successfully!
═══════════════════════════════════════════════════
Completed phases: 5/5
Story is now ready for PR creation.
Checkpoint cleared.
```

### Error Handling

If any phase fails, the workflow stops immediately:

```bash
═══ Phase 3/5: PLAN ═══
✗ Phase plan failed

✗ Phase plan failed
Completed 2 of 5 phases
Fix the error above and use --continue to resume.
```

**Recovery:**
1. Fix the underlying issue
2. Resume with: `ai-sdlc run --continue`
3. Workflow continues from failed phase

### Resuming Full SDLC Workflows

Full SDLC mode integrates seamlessly with checkpoint/resume:

```bash
# Start full SDLC workflow
ai-sdlc run --auto --story my-feature

# (Interrupted during implementation phase)

# Resume automatically - full SDLC mode is restored
ai-sdlc run --continue

# Output:
# ⟳ Resuming workflow from checkpoint
#   Mode: Full SDLC (story: my-feature)
#   Completed actions: 3
#
# ⊘ Skipping completed actions:
#   ✓ Refine "my-feature"
#   ✓ Research "my-feature"
#   ✓ Plan "my-feature"
#
# ═══ Phase 4/5: IMPLEMENT ═══
# ...
```

### Stage Gates

Full SDLC mode respects configured stage gates:

```bash
# With requireApprovalBeforeImplementation enabled
ai-sdlc run --auto --story my-feature

# Output:
# ✓ Research complete
# ✓ Plan complete
# ⚠️ Stage gate: Implementation requires approval
# Run 'ai-sdlc run --continue' to proceed after approval
```

### Review Retry Logic

If review fails, the system automatically triggers the retry cycle:

```bash
═══ Phase 5/5: REVIEW ═══
✓ Review "my-feature"
  → Review decision: REJECTED

🔄 Review rejected. Restarting RPIV cycle (attempt 1/3)
Reason: Code review identified security concerns...

═══ Phase 3/5: PLAN ═══
# Workflow continues through plan → implement → review again
```

The system tracks retry attempts and stops if max retries are exceeded.

### Complete Example

```bash
# Add a new story
ai-sdlc add "Add user authentication"

# Run complete SDLC automation
ai-sdlc run --auto --story add-user-authentication

# Story progresses through all phases automatically:
# 1. Refine (backlog → ready)
# 2. Research (analyze codebase)
# 3. Plan (create implementation plan)
# 4. Implement (generate code)
# 5. Review (validate quality)

# Result: Story ready for PR creation in one command!
```

### Differences from Standard --auto

| Mode | Behavior |
|------|----------|
| `--auto` | Processes all recommended actions across all stories based on priority |
| `--auto --story` | Executes complete SDLC (5 phases) for one specific story only |

### Limitations

**Cannot combine with --step:**
```bash
# This will error:
ai-sdlc run --auto --story my-feature --step research

# Error: Cannot combine --auto --story with --step flag.
# Use either:
#   - ai-sdlc run --auto --story my-feature (full SDLC)
#   - ai-sdlc run --story my-feature --step research (single phase)
```

**All phases are executed in sequence:**
- You cannot skip phases in full SDLC mode
- To run a specific phase only, use `--story --step` instead

### Use Cases

**Perfect for:**
- ✅ Taking a single story from idea to implementation
- ✅ Fully automating individual features
- ✅ Batch processing during off-hours
- ✅ Demo workflows and testing

**Not ideal for:**
- ❌ Processing multiple stories at different phases (use `--auto` instead)
- ❌ Running just one specific phase (use `--story --step` instead)
- ❌ Interactive workflows requiring manual review between phases

## Resuming Workflows

The `--continue` flag enables resuming workflows after interruption. This is useful when:

- A workflow was interrupted by Ctrl+C
- An action failed and you fixed the issue
- Your system crashed or lost connection
- You want to continue from where you left off

### How It Works

1. **Automatic Checkpointing**: After each successful action, the workflow state is saved to `.ai-sdlc/.workflow-state.json`
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
ai-sdlc run --auto

# (Interrupted by Ctrl+C after research completes)

# Resume from checkpoint
ai-sdlc run --continue
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
ai-sdlc run --auto --continue
```

**Check for existing checkpoint:**

```bash
# Start a new workflow when checkpoint exists
ai-sdlc run
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
.ai-sdlc/.workflow-state.json
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
      "storyPath": ".ai-sdlc/in-progress/add-dark-mode.md",
      "completedAt": "2024-01-08T15:45:12.000Z"
    }
  ],
  "context": {
    "sdlcRoot": ".ai-sdlc",
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

When viewing stories with `ai-sdlc status`, you'll see progress flags:

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

Configuration is stored in `.ai-sdlc.json` at the project root.

**Default configuration:**
```json
{
  "sdlcFolder": ".ai-sdlc",
  "stageGates": {
    "requireApprovalBeforeImplementation": false,
    "requireApprovalBeforePR": false,
    "autoMergeOnApproval": false
  },
  "defaultLabels": [],
  "theme": "auto",
  "settingSources": []
}
```

### Project Settings with CLAUDE.md

The Agent SDK can automatically load custom instructions from a `CLAUDE.md` file in your project's `.claude/` directory. This feature allows teams to share consistent AI behavior across all team members without manually specifying custom instructions.

#### How to Enable

Add `"project"` to the `settingSources` array in your `.ai-sdlc.json`:

```json
{
  "settingSources": ["project"]
}
```

**Available setting sources:**
- `"user"` - Global user settings from `~/.claude/settings.json`
- `"project"` - Project settings from `.claude/settings.json` and `CLAUDE.md`
- `"local"` - Local settings from `.claude/settings.local.json`

You can specify multiple sources (e.g., `["user", "project"]`) to load settings from multiple locations.

#### Directory Structure

Create a `.claude/` directory in your project root:

```
your-project/
├── .claude/
│   ├── CLAUDE.md          # Custom instructions (you create this)
│   ├── settings.json      # Project settings (SDK managed)
│   └── settings.local.json # Local overrides (SDK managed, gitignored)
├── .ai-sdlc.json
└── ...
```

#### Creating CLAUDE.md

Create `.claude/CLAUDE.md` with your custom instructions:

```markdown
# Project-Specific Instructions

You are working on a React TypeScript project that follows these conventions:

## Code Style
- Use functional components with hooks
- Prefer named exports over default exports
- Use absolute imports with `@/` prefix

## Testing
- Write unit tests for all business logic
- Use React Testing Library for component tests
- Aim for 80%+ code coverage

## Documentation
- Add JSDoc comments for all exported functions
- Update README.md when adding new features
```

#### Priority Order

When multiple sources are configured, settings are applied in this order:

1. **Explicit configuration** (highest priority) - systemPrompt passed directly to the Agent SDK
2. **Local settings** - `.claude/settings.local.json`
3. **Project settings** - `.claude/settings.json` and `CLAUDE.md`
4. **User settings** (lowest priority) - `~/.claude/settings.json`

**Note:** Explicit `systemPrompt` configuration in your code always takes precedence over any settings files.

#### Debug Logging

When `settingSources` includes `"project"`, the application logs debug messages indicating whether CLAUDE.md exists in the project settings directory. These are application-level logs, not SDK logs:

```bash
Debug: Found CLAUDE.md in project settings
```

or

```bash
Debug: CLAUDE.md not found in project settings
```

These messages use `console.debug()` and help verify that your configuration is correct. The actual loading of CLAUDE.md content is handled internally by the Agent SDK.

**Note:** Debug logging is always enabled when `'project'` is in settingSources. To suppress output, redirect stderr or set your terminal's logging level.

#### Use Cases

**Team Collaboration:**
```json
{
  "settingSources": ["project"]
}
```
All team members share the same custom instructions from `.claude/CLAUDE.md`.

**Personal + Team Settings:**
```json
{
  "settingSources": ["user", "project"]
}
```
Use your personal preferences plus project-specific instructions.

**Local Development Overrides:**
```json
{
  "settingSources": ["project", "local"]
}
```
Project defaults with local overrides (`.claude/settings.local.json` is gitignored).

#### Security Considerations

The implementation includes several security measures to protect against malicious CLAUDE.md files:

**Path Validation:**
- Working directories are validated to prevent path traversal attacks
- Paths outside the project boundaries are rejected

**Symlink Protection:**
- Symlinks are resolved and validated to ensure they point within the project directory
- Symlinks pointing to system files or outside the project are rejected with a warning

**File Size Limits:**
- Files larger than 1MB trigger a warning (recommended maximum for performance)
- Files larger than 10MB are rejected completely
- Size warnings help prevent denial-of-service through memory exhaustion

**Content Validation:**
- Basic validation checks for unexpected control characters in CLAUDE.md
- Warnings are logged for suspicious content patterns

**Configuration Security:**
- Input validation prevents prototype pollution attacks
- Invalid `settingSources` values are filtered with warnings
- Environment variables are validated with bounds checking

**Troubleshooting:**

If you encounter issues:

```bash
# Permission errors
chmod 644 .claude/CLAUDE.md

# Symlink rejected
# Ensure symlink target is within your project directory
ls -la .claude/CLAUDE.md

# File too large warning
# Consider reducing CLAUDE.md size or splitting instructions
du -h .claude/CLAUDE.md
```

#### Backward Compatibility

The default configuration (`"settingSources": []`) maintains SDK isolation mode, ensuring existing workflows continue to work without changes. To enable project settings, you must explicitly add `"project"` to `settingSources`.

### Theme Configuration

Available themes:
- `auto` - Automatically detect based on terminal capabilities
- `light` - Light theme with colors
- `dark` - Dark theme with colors
- `none` - No colors (plain text)

```bash
# Set theme
ai-sdlc config theme dark
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
.ai-sdlc/
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
Error: Corrupted workflow state file at .ai-sdlc/.workflow-state.json.
Delete the file to start fresh: rm ".ai-sdlc/.workflow-state.json"
```

Solution:
```bash
rm .ai-sdlc/.workflow-state.json
ai-sdlc run  # Start fresh
```

### Multiple Workflows

Currently, only one workflow can run at a time. If you try to start a new workflow while a checkpoint exists, you'll see a suggestion to use `--continue`.

To start fresh (ignoring the checkpoint):
```bash
rm .ai-sdlc/.workflow-state.json
ai-sdlc run
```

## License

MIT
