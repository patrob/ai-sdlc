---
id: story-ui-daemon-tui
title: >-
  Redesign daemon terminal UI for cleaner, less cluttered output with real-time
  dashboard
priority: 9
status: backlog
type: enhancement
created: '2026-01-12'
labels:
  - ux
  - daemon
  - terminal-ui
  - PRD-daemon-workflow-engine
updated: '2026-01-12'
sequence_file: .ai-sdlc/docs/daemon-workflow-engine-sequence.md
sequence_order: 9
depends_on: [daemon-block-max-refinements, daemon-block-max-retries, daemon-exclude-blocked-folder, daemon-unblock-command, daemon-continuous-polling, daemon-single-story-startup, daemon-nearest-completion-priority, daemon-config-defaults]
---
# Redesign Daemon Terminal UI for Cleaner, Less Cluttered Output with Real-Time Dashboard

## User Story

**As a** developer using daemon mode with multiple stories  
**I want** a cleaner, more compact terminal UI that shows status at a glance  
**So that** I can monitor many stories without the output becoming cluttered and hard to read

## Context

The current daemon mode output becomes cluttered quickly when processing multiple stories. Key problems include:
- Repetitive "Queue empty, waiting..." messages after every story completion
- No visual hierarchy between story completions
- Excessive vertical space (3-4 lines per story)
- No overview of overall state (active/queued/done counts)
- Truncated filenames that are hard to read

Example: Processing 3 stories currently generates 20+ lines of output with repeated idle messages and no at-a-glance status summary.

## Acceptance Criteria

### Core Requirements (MVP)

- [ ] **Compact story display**: Each completed story shows on 1-2 lines maximum (not 4+)
- [ ] **Eliminate repeated idle messages**: "Queue empty" message appears only once when transitioning to idle state, not after every single story
- [ ] **Summary status line**: Display counts at a glance showing format: `X done | Y active | Z queued | W blocked`
- [ ] **Inline action progress**: Show completed actions inline with story, not as separate lines (format: `[5 actions · 42s]`)
- [ ] **Smart truncation**: Show meaningful part of story ID without unhelpful truncation
- [ ] **Clear visual separation**: Use whitespace or dividers to visually group related output
- [ ] **Verbose mode flag**: Add `--verbose` or `-v` flag to show full detailed output for debugging purposes

### Enhanced Features (Optional)

- [ ] **Live progress bar**: Show action progress with visual progress indicator (e.g., `████████░░ 8/10`)
- [ ] **Elapsed time per story**: Display how long each story took to process
- [ ] **Spinner during processing**: Use ora spinner to indicate active story processing
- [ ] **Color-coded status**: Green for done, yellow for active, gray for queued

### Testing Requirements

- [ ] Works correctly with `NO_COLOR` environment variable set
- [ ] Adapts to various terminal widths using `getTerminalWidth()`
- [ ] Output remains readable when piped to file or log aggregator
- [ ] Verbose flag properly toggles between compact and detailed output
- [ ] State counters accurately reflect done/active/queued stories
- [ ] Idle message appears exactly once per idle transition

## Design Options

Three design approaches are proposed (choose one during planning):

**Option A: Compact Log Mode** (Recommended)
- One line per completed story with inline metrics
- Summary footer with counts
- Clean separator lines

**Option B: Streaming Progress Mode**
- Progress bars for visual appeal
- Real-time progress during execution
- Minimal footer

**Option C: Dashboard Header**
- Most information-dense
- Clear visual boundaries with box drawing
- Status always visible at top

## Technical Constraints

- Must work with existing theme system (dark/light mode)
- Must respect `NO_COLOR` environment variable
- Must support terminals of various widths (auto-detect with `getTerminalWidth()`)
- Must not break existing daemon functionality
- Must remain readable when output is piped to files or log aggregators
- No new npm dependencies required (use existing: chalk, ora, cli-table3, string-width)

## Edge Cases to Consider

- **Terminal width changes**: Daemon runs for hours/days, terminal may be resized
- **Very long story IDs**: Truncation strategy must preserve meaningful information
- **Mixed TTY/non-TTY output**: Gracefully degrade features when not in interactive terminal
- **High-frequency story processing**: UI should not flicker or become unusable with rapid story completions
- **Zero stories processed**: Initial state should be clear and informative
- **Interrupted stories**: Handle stories that fail or are interrupted mid-processing
- **Color theme preference**: Must work in both dark and light terminal themes

## Files Likely Affected

- `src/cli/daemon.ts` - Main daemon log methods and state tracking
- `src/cli/formatting.ts` - Text processing and output formatting utilities
- `src/index.ts` - CLI entry point for `--verbose` flag
- `src/core/theme.ts` - Color theming (if daemon-specific colors needed)

## Out of Scope

- Interactive TUI with cursor movement (blessed/ink libraries)
- Web-based dashboard
- Real-time refresh of already-printed lines (requires terminal control codes)
- Integration with external logging/monitoring systems
- Full dashboard mode with real-time updating table view (htop-style)

---

**effort:** medium  
**labels:** ux, daemon, terminal-ui, developer-experience, enhancement
