---
id: S-0099
title: Implement Natural Language Input Component
priority: 3
status: backlog
type: feature
created: '2026-01-19'
labels:
  - tui
  - input
  - epic-conversational-tui
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
slug: nl-input-component
dependencies:
  - S-0098
---
# Implement Natural Language Input Component

## User Story

**As a** developer using the ai-sdlc TUI
**I want** a natural language input field at the bottom of the screen
**So that** I can describe what I want to build in plain English

## Summary

Create the input component shown in the design mockup: a multi-line text input with placeholder text, send button, and keyboard hints. This component captures user intent and submits it for processing.

## Technical Context

**Current State:**
- Basic TUI shell exists (S-0098)
- No input handling in TUI
- CLI uses commander flags, not interactive input

**Target State:**
- Multi-line input component with placeholder
- Submit on Enter, newline on Shift+Enter
- Visual send button (decorative, Enter to submit)
- Input disabled during processing

## Acceptance Criteria

### Input Component

- [ ] Renders input area matching design:
  ```
  ┌─────────────────────────────────────────────────────────┐
  │ › Describe what you want to build... (e.g., 'Add       │
  │   user authentication with OAuth')                  [→] │
  └─────────────────────────────────────────────────────────┘
  Press Enter to send • Shift+Enter for new line
  ```

- [ ] Placeholder text: "Describe what you want to build... (e.g., 'Add user authentication with OAuth')"
- [ ] Placeholder disappears when typing
- [ ] Multi-line input supported (Shift+Enter for newline)
- [ ] Submit on Enter (single press)
- [ ] Visual send button icon [→] (click not required, Enter submits)

### Keyboard Handling

- [ ] Enter: Submit input (if not empty)
- [ ] Shift+Enter: Insert newline
- [ ] Ctrl+C: Exit TUI (propagate to app)
- [ ] Up Arrow: Navigate input history (if implemented)
- [ ] Escape: Clear input

### State Management

- [ ] `isDisabled` prop to prevent input during processing
- [ ] `onSubmit` callback with input text
- [ ] Clear input after successful submit
- [ ] Preserve input on failed submit

### Visual States

- [ ] Default: Border color neutral, placeholder visible
- [ ] Focused: Border color highlight (purple from design)
- [ ] Disabled: Dimmed, cursor hidden
- [ ] Error: Border color red (if validation fails)

### Accessibility

- [ ] Focus indicator visible
- [ ] Screen reader compatible (aria labels)

## Files to Create

| File | Purpose |
|------|---------|
| `packages/tui/src/components/InputPrompt.tsx` | Main input component |
| `packages/tui/src/components/InputHint.tsx` | Keyboard hint text |
| `packages/tui/src/hooks/useInputHistory.ts` | Input history navigation |
| `packages/tui/tests/InputPrompt.test.tsx` | Input component tests |

## Implementation Notes

```tsx
// packages/tui/src/components/InputPrompt.tsx
import React, { useState } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';

interface InputPromptProps {
  onSubmit: (value: string) => void;
  isDisabled?: boolean;
  placeholder?: string;
}

export function InputPrompt({ onSubmit, isDisabled, placeholder }: InputPromptProps) {
  const [value, setValue] = useState('');

  const handleSubmit = (input: string) => {
    if (input.trim() && !isDisabled) {
      onSubmit(input.trim());
      setValue('');
    }
  };

  return (
    <Box flexDirection="column">
      <Box
        borderStyle="round"
        borderColor={isDisabled ? 'gray' : 'magenta'}
        paddingX={1}
      >
        <Text color="gray">› </Text>
        <TextInput
          value={value}
          onChange={setValue}
          onSubmit={handleSubmit}
          placeholder={placeholder}
          isDisabled={isDisabled}
        />
        <Box marginLeft={1}>
          <Text color={isDisabled ? 'gray' : 'magenta'}>[→]</Text>
        </Box>
      </Box>
      <InputHint />
    </Box>
  );
}
```

```tsx
// packages/tui/src/components/InputHint.tsx
import React from 'react';
import { Text } from 'ink';

export function InputHint() {
  return (
    <Text dimColor>
      Press Enter to send • Shift+Enter for new line
    </Text>
  );
}
```

### Dependencies

Add to `packages/tui/package.json`:
```json
{
  "dependencies": {
    "ink-text-input": "^6.0.0"
  }
}
```

## Testing Requirements

- [ ] Unit test: Renders placeholder when empty
- [ ] Unit test: Placeholder hidden when typing
- [ ] Unit test: onSubmit called with correct value
- [ ] Unit test: Input cleared after submit
- [ ] Unit test: Enter submits, Shift+Enter doesn't
- [ ] Unit test: Disabled state prevents submission
- [ ] Integration test: Input visible in TUI
- [ ] `npm test` passes
- [ ] `npm run build` succeeds

## Definition of Done

- [ ] Input component renders matching design
- [ ] Enter submits, Shift+Enter adds newline
- [ ] Disabled state works during processing
- [ ] Keyboard hints displayed
- [ ] All tests pass
- [ ] `make verify` passes

## References

- ink-text-input: https://github.com/vadimdemedes/ink-text-input
- Design mockup: User-provided screenshot
- Related: S-0098 (TUI shell)
