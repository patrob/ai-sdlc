---
id: story-mk6xixmr-cwrg
title: >-
  Add daemon/watch mode: process runs continuously, listens for new backlog
  items, auto-picks them up. MVP: Ctrl+C to quit. Future: graceful shutdown with
  Esc+Esc within 500ms
priority: 5
status: ready
type: feature
created: '2026-01-09'
labels:
  - s
research_complete: true
plan_complete: false
implementation_complete: false
reviews_complete: false
updated: '2026-01-09'
---
# Add daemon/watch mode for continuous backlog processing

## Summary

**As a** product team member  
**I want** the system to run in daemon/watch mode that continuously monitors for new backlog items  
**So that** stories are automatically processed without manual intervention, improving workflow efficiency

## Acceptance Criteria

### MVP (Phase 1)
- [ ] Process starts in daemon mode with a `--watch` or `--daemon` flag
- [ ] System continuously polls/watches the backlog directory for new story files
- [ ] New backlog items are automatically detected and picked up for processing
- [ ] Processing follows the same workflow as manual mode (refine → plan → implement → review)
- [ ] Daemon logs activity to console (startup, file detection, processing status)
- [ ] Process can be terminated with Ctrl+C (SIGINT)
- [ ] Clean shutdown on Ctrl+C (completes current story processing before exit)
- [ ] System handles the case where no backlog items exist (waits without crashing)

### Future Enhancement (Phase 2)
- [ ] Graceful shutdown triggered by Esc+Esc pressed within 500ms
- [ ] Visual feedback when Esc is pressed once (e.g., "Press Esc again to quit")
- [ ] Timeout resets if 500ms elapses between Esc presses
- [ ] Shutdown completes current story before exiting (same as Ctrl+C behavior)

## Constraints & Edge Cases

**Performance Considerations:**
- Polling interval should be configurable (default: 5-10 seconds) to avoid excessive file system reads
- Consider using file system watchers (e.g., `chokidar`, `fs.watch`) instead of polling for better performance

**Error Handling:**
- If a story processing fails, daemon should log the error and continue running
- Failed stories should be marked/moved to prevent infinite reprocessing
- Handle file system permission errors gracefully

**Edge Cases:**
- Multiple files added simultaneously (queue processing vs. parallel)
- Story file added while another is being processed (queue management)
- Story file deleted/modified during processing
- Process restart with partially processed stories (idempotency/resume logic)
- Long-running story processing during shutdown (timeout vs. wait indefinitely)

**Technical Notes:**
- Esc key detection requires raw terminal mode (tty manipulation)
- Double-Esc pattern may conflict with terminal/shell shortcuts
- Consider signal handling for SIGTERM in addition to SIGINT

## Research

<!-- Populated by research agent -->

Perfect! Now I have enough context to provide comprehensive research findings. Let me compile the research report:

# Research Findings: Daemon/Watch Mode Implementation

## 1. Relevant Existing Patterns and Code to Reference

### Current Architecture

The codebase has a well-structured CLI architecture that we can extend for daemon mode:

**Entry Point & CLI Structure:**
- **`src/index.ts`**: Main entry point with Commander.js for CLI parsing
- **`src/cli/commands.ts`**: Contains command implementations (`init`, `status`, `add`, `run`, `details`)
- **`src/cli/runner.ts`**: Contains `WorkflowRunner` class that orchestrates workflow execution

**Key Workflow Components:**
- **`WorkflowRunner.run()`** (lines 39-61): Main workflow execution logic
- **`WorkflowRunner.runAutoMode()`** (lines 95-127): Already implements continuous processing with a safety limit (max 100 actions)
- **`assessState()`** from `src/core/kanban.ts`: Evaluates board state and returns recommended actions
- **`getStoriesInFolder()`** from `src/core/kanban.ts`: Reads story files from filesystem

**Existing Patterns to Leverage:**
1. **Auto mode flag**: The `--auto` flag already enables continuous processing until all actions complete
2. **Polling loop structure**: `runAutoMode()` demonstrates the pattern of re-assessing state after each action
3. **Story file reading**: `parseStory()` and `getStoriesInFolder()` show how to read markdown story files
4. **Error handling**: Agents return `AgentResult` with success/failure status, allowing graceful error handling
5. **Configuration system**: `src/core/config.ts` provides a robust config system we can extend

## 2. Files/Modules That Need Modification

### New Files to Create:

1. **`src/cli/daemon.ts`** (NEW)
   - Core daemon implementation
   - File system watcher setup
   - Signal handler management
   - Keyboard input handling for Esc+Esc

2. **`src/core/daemon-config.ts`** (NEW)  
   - Daemon-specific configuration
   - Polling interval settings
   - Watch patterns/filters

### Existing Files to Modify:

3. **`src/index.ts`** (MODIFY)
   - Add new `--watch` or `--daemon` flag to the `run` command
   - Example: `.option('--watch', 'Run in daemon mode, continuously processing backlog')`

4. **`src/cli/runner.ts`** (MODIFY - Optional)
   - May need minor adjustments to support being called repeatedly by daemon
   - Current `runAutoMode()` already handles multiple actions, but daemon will wrap it

5. **`src/types/index.ts`** (MODIFY)
   - Add `DaemonConfig` interface
   - Add daemon-related options to `RunOptions` interface

6. **`src/core/config.ts`** (MODIFY)
   - Extend `Config` interface with optional `daemon` settings
   - Add daemon config to `DEFAULT_CONFIG`

7. **`package.json`** (MODIFY - dependencies)
   - Add `chokidar` for file system watching (recommended over `fs.watch`)
   - Consider adding `keypress` or using native `readline` with raw mode for Esc detection

## 3. External Best Practices and Resources

### File System Watching

**Recommended Library: `chokidar`**
- Battle-tested, cross-platform file system watcher
- Handles edge cases (file locks, rapid changes, symlinks)
- Events: `add`, `change`, `unlink`
- Supports debouncing and initial scan control

**Installation:**
```bash
npm install chokidar
npm install --save-dev @types/chokidar
```

**Basic Pattern:**
```typescript
import chokidar from 'chokidar';

const watcher = chokidar.watch('.agentic-sdlc/backlog/*.md', {
  persistent: true,
  ignoreInitial: false, // Process existing files on startup
  awaitWriteFinish: {
    stabilityThreshold: 500,
    pollInterval: 100
  }
});

watcher.on('add', (filePath) => {
  // Trigger workflow processing
});
```

### Signal Handling (SIGINT/SIGTERM)

**Pattern for Graceful Shutdown:**
```typescript
let isShuttingDown = false;
let currentProcessing: Promise<void> | null = null;

process.on('SIGINT', async () => {
  if (isShuttingDown) {
    console.log('Force shutdown...');
    process.exit(1);
  }
  
  isShuttingDown = true;
  console.log('Shutting down gracefully...');
  
  if (currentProcessing) {
    await currentProcessing;
  }
  
  process.exit(0);
});
```

### Terminal Raw Mode for Esc+Esc Detection

**Using Node.js `readline` and `process.stdin`:**
```typescript
import readline from 'readline';

readline.emitKeypressEvents(process.stdin);
if (process.stdin.isTTY) {
  process.stdin.setRawMode(true);
}

let lastEscPress = 0;
const ESC_TIMEOUT = 500; // ms

process.stdin.on('keypress', (str, key) => {
  if (key.name === 'escape') {
    const now = Date.now();
    if (now - lastEscPress < ESC_TIMEOUT) {
      // Double Esc detected
      gracefulShutdown();
    } else {
      console.log('Press Esc again to quit');
      lastEscPress = now;
    }
  }
});
```

### Logging Best Practices

Consider adding structured logging for daemon mode:
- Log daemon startup with configuration
- Log file detection events
- Log workflow start/completion
- Log errors without stopping daemon
- Consider using `winston` or `pino` for structured logs

## 4. Potential Challenges and Risks

### Technical Challenges:

1. **Race Conditions**
   - Multiple files added simultaneously could trigger parallel workflows
   - **Mitigation**: Implement a queue with sequential processing
   - Use `async.queue` or similar to serialize story processing

2. **Infinite Processing Loops**
   - If story processing creates/modifies files that trigger re-processing
   - **Mitigation**: 
     - Track processed story IDs within a session
     - Only watch `backlog/` folder, not `ready/` or `in-progress/`
     - Use file path hashing to detect duplicate triggers

3. **File System Lock Issues**
   - Story file may be written/modified while being read
   - **Mitigation**: 
     - Use `chokidar`'s `awaitWriteFinish` option
     - Implement retry logic with exponential backoff
     - Catch and log file read errors gracefully

4. **Long-Running Story During Shutdown**
   - Agent might be mid-implementation when shutdown requested
   - **Mitigation**:
     - Set a reasonable timeout (e.g., 30 seconds)
     - Allow force-quit on second Ctrl+C
     - Leverage existing workflow checkpointing (if implemented)

5. **Terminal State Management**
   - Raw mode for Esc detection can interfere with agent output
   - **Mitigation**:
     - Restore terminal state on exit
     - Consider making Esc+Esc a Phase 2 feature
     - Use `process.on('exit')` to cleanup terminal state

6. **Cross-Platform Compatibility**
   - Terminal raw mode behavior varies (Windows vs Unix)
   - **Mitigation**:
     - Test on multiple platforms
     - Provide fallback to Ctrl+C only if raw mode fails
     - Document platform-specific behavior

### Edge Cases:

1. **Empty Backlog at Startup**
   - Daemon should idle gracefully
   - **Solution**: Log "Waiting for stories..." and continue watching

2. **Story File Deleted During Processing**
   - File might be removed between detection and processing
   - **Solution**: Wrap file operations in try-catch, log and continue

3. **Malformed Story Files**
   - Invalid YAML frontmatter could crash parser
   - **Solution**: Agent's error handling should catch this, log, and continue daemon

4. **Network/API Failures**
   - Anthropic API might be down or rate-limited
   - **Solution**: 
     - Log error, mark story with error flag
     - Continue daemon (don't crash)
     - Consider exponential backoff for transient failures

## 5. Dependencies and Prerequisites

### NPM Packages Required:

**Production Dependencies:**
```json
{
  "chokidar": "^4.0.0"  // File system watching
}
```

**Optional Enhancements:**
```json
{
  "winston": "^3.11.0",    // Structured logging (optional but recommended)
  "async": "^3.2.5"        // Queue management for concurrent events
}
```

### Configuration Schema Extension:

```typescript
interface DaemonConfig {
  enabled: boolean;
  pollingInterval: number;        // Fallback if not using chokidar
  watchPatterns: string[];        // Glob patterns to watch
  processDelay: number;           // Debounce delay (ms)
  shutdownTimeout: number;        // Max time to wait for graceful shutdown (ms)
  enableEscShutdown: boolean;     // Enable Esc+Esc shutdown (Phase 2)
  escTimeout: number;             // Max time between Esc presses (ms)
}
```

### System Requirements:

- **Node.js**: >=18.0.0 (already specified in package.json)
- **File System**: Needs read/write access to `.agentic-sdlc/` folder
- **TTY Support**: Required for Esc+Esc detection (optional feature)
- **API Key**: ANTHROPIC_API_KEY must be configured (already required)

## 6. Implementation Approach Recommendations

### Phase 1 (MVP) Priority:

1. **Start Simple**: Basic polling approach before adding chokidar
   - Implement `--watch` flag that runs assessment loop every N seconds
   - This minimizes dependencies and complexity for MVP

2. **Graceful Shutdown**: Focus on Ctrl+C handling first
   - Use `process.on('SIGINT')` and `process.on('SIGTERM')`
   - Implement clean shutdown after current story completes

3. **Error Isolation**: Ensure daemon continues on individual story failures
   - Wrap story processing in try-catch
   - Log errors but don't stop daemon
   - Mark failed stories appropriately

### Phase 2 (Enhancements):

4. **Add File System Watching**: Replace polling with `chokidar`
   - More efficient than polling
   - Real-time response to new files

5. **Esc+Esc Shutdown**: Add keyboard input handling
   - Terminal raw mode
   - Escape key timing detection
   - Restore terminal on exit

6. **Advanced Features**: Consider later additions
   - Web dashboard for daemon status
   - Metrics/telemetry
   - Multiple daemon instances
   - Auto-restart on crashes (systemd/pm2 integration)

## 7. Testing Considerations

### Manual Testing Scenarios:

- [ ] Daemon starts with empty backlog (waits gracefully)
- [ ] New story file added (picked up automatically)
- [ ] Multiple stories added quickly (queued properly)
- [ ] Story fails processing (daemon continues)
- [ ] Ctrl+C during idle (exits immediately)
- [ ] Ctrl+C during processing (waits for completion)
- [ ] Second Ctrl+C (force quits)
- [ ] Story file deleted mid-processing (handled gracefully)
- [ ] API key missing (reports error but doesn't crash)

### Automated Testing:

- Unit tests for daemon logic (file detection, shutdown)
- Integration tests with mock file system
- Signal handler tests
- Timeout tests for graceful shutdown

---

## Summary

The implementation is feasible with the existing architecture. The `WorkflowRunner` class already handles continuous processing via `--auto` mode, so daemon mode is essentially wrapping this with:
1. Continuous file system watching
2. Signal handling for graceful shutdown  
3. Error resilience to keep daemon running

**Recommended MVP approach:**
- Simple polling loop (5-10 second intervals)
- Ctrl+C shutdown with graceful completion
- Robust error handling to prevent daemon crashes

**Phase 2 enhancements:**
- Chokidar for real-time file watching
- Esc+Esc shutdown with terminal raw mode
- Advanced logging and monitoring

This design leverages existing patterns while adding minimal complexity for a production-ready daemon mode.

---

**Sources:**
- Existing codebase patterns from `src/cli/runner.ts`, `src/core/kanban.ts`, `src/core/story.ts`
- chokidar documentation: https://github.com/paulmillr/chokidar
- Node.js process signals: https://nodejs.org/api/process.html#signal-events
- Node.js readline keypress: https://nodejs.org/api/readline.html#readline_emitkeypressevents_stream

## Implementation Plan

<!-- Populated by planning agent -->

## Review Notes

<!-- Populated by review agents -->

---

**Effort:** medium  
**Labels:** enhancement, daemon-mode, automation, developer-experience, mvp
