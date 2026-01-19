---
id: S-0098
title: Create Basic TUI Shell with Ink Framework
priority: 2
status: backlog
type: feature
created: '2026-01-19'
labels:
  - tui
  - ink
  - epic-conversational-tui
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
slug: basic-tui-shell
dependencies:
  - S-0097
---
# Create Basic TUI Shell with Ink Framework

## User Story

**As a** developer using ai-sdlc
**I want** to launch a TUI interface with `ai-sdlc tui`
**So that** I can interact with ai-sdlc in a rich terminal interface

## Summary

Create the foundational TUI application using Ink (React for CLI). This establishes the basic shell with header, main content area, and footer that will host all TUI components. The TUI should launch, display a basic interface, and exit cleanly.

## Technical Context

**Current State:**
- No TUI framework in project
- CLI uses commander.js with basic output (chalk, ora)
- S-0097 establishes `packages/tui/` location

**Target State:**
- Ink 5.x installed in `packages/tui/`
- Basic TUI shell renders with header/content/footer layout
- `ai-sdlc tui` command launches the interface
- Clean shutdown on Ctrl+C

## Acceptance Criteria

### Dependencies

- [ ] Add to `packages/tui/package.json`:
  ```json
  {
    "dependencies": {
      "ink": "^5.0.0",
      "react": "^18.0.0",
      "@ai-sdlc/core": "workspace:*"
    },
    "devDependencies": {
      "@types/react": "^18.0.0",
      "ink-testing-library": "^4.0.0"
    }
  }
  ```

### Application Shell

- [ ] Create `App.tsx` component with layout:
  ```
  ┌─────────────────────────────────────────────────┐
  │ [Header: Logo, version, status, time]           │
  ├─────────────────────────────────────────────────┤
  │                                                 │
  │ [Main Content Area]                             │
  │                                                 │
  │                                                 │
  ├─────────────────────────────────────────────────┤
  │ [Footer: Branding, help text]                   │
  └─────────────────────────────────────────────────┘
  ```

- [ ] Header displays:
  - ASCII art logo (placeholder)
  - Version number from package.json
  - Status indicator (● READY / ● BUSY)
  - Current time (updates every second)

- [ ] Footer displays:
  - "AI-SDLC • Orchestrated Software Development Life Cycle"
  - "Type your request in natural language to begin"

### CLI Command

- [ ] Add `tui` command to CLI package:
  ```typescript
  program
    .command('tui')
    .description('Launch interactive TUI')
    .action(async () => {
      const { render } = await import('@ai-sdlc/tui');
      render();
    });
  ```

### Lifecycle Management

- [ ] Clean startup (no flickering)
- [ ] Graceful shutdown on Ctrl+C
- [ ] Restore terminal state on exit
- [ ] Handle terminal resize events

### Theming

- [ ] Use colors consistent with existing CLI theme (`src/core/theme.ts`)
- [ ] Dark background assumed (most terminal defaults)
- [ ] Support NO_COLOR environment variable

## Files to Create

| File | Purpose |
|------|---------|
| `packages/tui/src/index.tsx` | Entry point, render function |
| `packages/tui/src/App.tsx` | Main application component |
| `packages/tui/src/components/Header.tsx` | Header with logo, status, time |
| `packages/tui/src/components/Footer.tsx` | Footer with branding |
| `packages/tui/src/components/Layout.tsx` | Flex layout container |
| `packages/tui/src/hooks/useTerminalSize.ts` | Terminal dimensions hook |
| `packages/tui/src/hooks/useClock.ts` | Real-time clock hook |
| `packages/tui/tests/App.test.tsx` | Basic render tests |

## Implementation Notes

```tsx
// packages/tui/src/App.tsx
import React from 'react';
import { Box, Text } from 'ink';
import { Header } from './components/Header.js';
import { Footer } from './components/Footer.js';

export function App() {
  return (
    <Box flexDirection="column" height="100%">
      <Header />
      <Box flexGrow={1} flexDirection="column" padding={1}>
        {/* Main content will go here */}
        <Text>Welcome to AI-SDLC TUI</Text>
      </Box>
      <Footer />
    </Box>
  );
}
```

```tsx
// packages/tui/src/index.tsx
import React from 'react';
import { render as inkRender } from 'ink';
import { App } from './App.js';

export function render() {
  const { unmount, waitUntilExit } = inkRender(<App />);

  process.on('SIGINT', () => {
    unmount();
    process.exit(0);
  });

  return waitUntilExit();
}
```

### ASCII Logo Placeholder

```
    _    ___      ____  ____  _     ____
   / \  |_ _|    / ___||  _ \| |   / ___|
  / _ \  | |_____\___ \| | | | |  | |
 / ___ \ | |_____|___) | |_| | |__| |___
/_/   \_\___|   |____/|____/|_____\____|
```

## Testing Requirements

- [ ] Unit test: App renders without crashing
- [ ] Unit test: Header displays version
- [ ] Unit test: Status indicator shows correct state
- [ ] Unit test: Clock updates
- [ ] Manual test: `ai-sdlc tui` launches
- [ ] Manual test: Ctrl+C exits cleanly
- [ ] Manual test: Terminal resizes handled
- [ ] `npm test` passes
- [ ] `npm run build` succeeds

## Definition of Done

- [ ] Ink dependencies installed
- [ ] Basic TUI shell renders
- [ ] `ai-sdlc tui` command works
- [ ] Clean shutdown on Ctrl+C
- [ ] All tests pass
- [ ] `make verify` passes

## References

- Ink documentation: https://github.com/vadimdemedes/ink
- Design mockup: User-provided screenshot
- Related: S-0097 (Monorepo structure)
