---
*Generated: 2026-01-28*

Perfect! Now I have enough context to provide comprehensive research findings. Let me compile the research report.

---

# Research Findings: Create TicketProvider Abstraction with NullProvider

## Problem Summary

The goal is to create a foundational abstraction layer for external ticketing system integration. This involves:

1. Defining a `TicketProvider` interface that abstracts ticket operations (CRUD, status mapping, PR linking)
2. Implementing a `NullTicketProvider` that acts as a no-op default when ticketing is disabled
3. Adding configuration schema for ticketing providers (none, github, jira)
4. Creating a factory function to instantiate providers based on configuration
5. Ensuring zero regression to existing functionality (40+ `parseStory()` call sites remain unchanged)

The NullProvider ensures that when `ticketing.provider` is not configured or set to `"none"`, the system behaves exactly as it does today—local-only mode with no external ticket synchronization.

---

## Codebase Context

### Existing Configuration Architecture

**Pattern Reference**: `src/core/config.ts`

The codebase follows these configuration patterns:

1. **Nested configuration objects** with typed interfaces (e.g., `TDDConfig`, `WorktreeConfig`, `ReviewConfig`)
2. **Default constants exported separately** (e.g., `DEFAULT_TDD_CONFIG`, `DEFAULT_WORKTREE_CONFIG`)
3. **Deep merging in `loadConfig()`** to combine user config with defaults (see lines 458-608)
4. **Validation functions** for complex config sections (e.g., `validateMergeConfig`, `validateReviewConfig`, `validateImplementationConfig`)
5. **`sanitizeUserConfig()` security layer** that validates and rejects dangerous inputs (lines 298-453)

**Key Implementation Details**:
- Config validation happens in `loadConfig()` which calls individual validators
- Optional config sections use `config.section ?? DEFAULT_SECTION_CONFIG` pattern (line 847-851 for worktree example)
- Validation warnings logged to console when invalid values detected
- Security checks include prototype pollution prevention (lines 300-306)

### Existing Service Architecture

**Pattern Reference**: `src/services/error-classifier.ts`, `src/services/error-fingerprint.ts`

The `src/services/` directory contains stateless utility modules with:

1. **Interface definitions** for structured data (e.g., `TypeScriptError`, `ClassifiedErrors`)
2. **Pure functions** that operate on interfaces
3. **No class-based services** - all exports are functions or constants
4. **Co-located unit tests** (e.g., `error-classifier.test.ts`)

**Example pattern from error-classifier**:
\`\`\`typescript
// Interface definition
export interface TypeScriptError {
  filePath: string;
  line?: number;
  // ... other fields
}

// Pure function operating on interface
export function classifyError(error: TypeScriptError): ErrorClassification {
  // ... implementation
}
\`\`\`

### Type System Patterns

**Pattern Reference**: `src/types/index.ts`

The codebase centralizes types in `src/types/index.ts` with:

1. **Union types for enums** (e.g., `StoryStatus`, `ReviewIssueSeverity`)
2. **Interface-based data structures** (e.g., `StoryFrontmatter`, `ReviewIssue`)
3. **Optional fields with `?` suffix** (e.g., `ticket_provider?: 'github' | 'jira' | 'linear'`)
4. **Re-exports from other modules** (line 1146: `export * from './workflow-state.js'`)

**Existing ticket metadata fields** (lines 246-249):
\`\`\`typescript
// Already present in StoryFrontmatter - NO CHANGES NEEDED
ticket_provider?: 'github' | 'jira' | 'linear';
ticket_id?: string;
ticket_url?: string;
ticket_synced_at?: string;
\`\`\`

These fields are **already defined** and documented (see `docs/configuration.md` lines 830-896). The TicketProvider interface will use these existing fields.

### Testing Patterns

**Pattern Reference**: `docs/testing.md`, `src/services/error-fingerprint.test.ts`

Testing conventions:
1. **Co-located unit tests** using `.test.ts` suffix in same directory as source
2. **Vitest framework** with `describe`, `it`, `expect` structure
3. **Mock dates for deterministic tests** using `vi.useFakeTimers()` and `vi.setSystemTime()`
4. **Order-independent array assertions** for filesystem operations (sorting before comparison)
5. **Export testable functions** - never recreate production logic in tests

**Test file structure example** (`error-fingerprint.test.ts` lines 1-50):
\`\`\`typescript
import { describe, it, expect } from 'vitest';
import { normalizeErrorOutput, generateErrorFingerprint } from './error-fingerprint.js';

describe('normalizeErrorOutput', () => {
  it('should return empty string for empty input', () => {
    expect(normalizeErrorOutput('')).toBe('');
  });
  // ... more tests
});
\`\`\`

---

## Files Requiring Changes

### 1. **NEW FILE**: `src/services/ticket-provider/types.ts`

- **Change Type**: Create New
- **Reason**: Define the core TicketProvider interface and related types
- **Specific Changes**:
  - Define `Ticket` interface with fields: id, url, title, description, status, priority, labels, assignee
  - Define `TicketProvider` interface with methods:
    - `readonly name: string`
    - `list(filter?: TicketFilter): Promise<Ticket[]>`
    - `get(id: string): Promise<Ticket>`
    - `create(ticket: NewTicket): Promise<Ticket>`
    - `updateStatus(id: string, status: string): Promise<void>`
    - `addComment(id: string, body: string): Promise<void>`
    - `linkPR(id: string, prUrl: string): Promise<void>`
    - `mapStatusToExternal(status: StoryStatus): string`
    - `mapStatusFromExternal(externalStatus: string): StoryStatus`
  - Define `TicketFilter`, `NewTicket` helper types
- **Dependencies**: None (foundation layer)
- **Pattern to Follow**: Similar to `src/services/error-classifier.ts` - export interfaces and types without implementation

### 2. **NEW FILE**: `src/services/ticket-provider/null-provider.ts`

- **Change Type**: Create New
- **Reason**: Implement NullTicketProvider for local-only mode (no ticketing)
- **Specific Changes**:
  - Export class `NullTicketProvider implements TicketProvider`
  - `name = 'none'`
  - Read operations (`list`, `get`, `create`) throw "No ticket provider configured"
  - Write operations (`updateStatus`, `addComment`, `linkPR`) are no-ops (return void, no error)
  - Status mapping returns input unchanged (identity function)
- **Dependencies**: Depends on `types.ts` being created first
- **Pattern to Follow**: Functional service pattern - no external dependencies, pure class with async methods

### 3. **NEW FILE**: `src/services/ticket-provider/index.ts`

- **Change Type**: Create New
- **Reason**: Export types and provide factory function to create providers
- **Specific Changes**:
  - Re-export all types from `types.ts`
  - Export `NullTicketProvider` from `null-provider.ts`
  - Export `createTicketProvider(config: Config): TicketProvider` factory:
    \`\`\`typescript
    export function createTicketProvider(config: Config): TicketProvider {
      const provider = config.ticketing?.provider ?? 'none';
      switch (provider) {
        case 'none': return new NullTicketProvider();
        case 'github': throw new Error('GitHub provider not yet implemented');
        case 'jira': throw new Error('Jira provider not yet implemented');
        default: return new NullTicketProvider();
      }
    }
    \`\`\`
- **Dependencies**: Depends on types.ts and null-provider.ts
- **Pattern to Follow**: Similar to factory pattern in config.ts (e.g., `loadConfig()`)

### 4. **MODIFY**: `src/core/config.ts`

- **Change Type**: Modify Existing
- **Reason**: Add ticketing configuration schema to Config interface and defaults
- **Specific Changes**:
  - Add to `Config` interface (around line 742, before closing brace):
    \`\`\`typescript
    /**
     * Ticketing integration configuration.
     * Controls external ticket provider (GitHub, Jira, etc.)
     */
    ticketing?: {
      provider: 'none' | 'github' | 'jira';
      syncOnRun?: boolean;           // default: true
      postProgressComments?: boolean; // default: true
      github?: {
        repo?: string;
        projectNumber?: number;
        statusLabels?: Record<string, string>;
      };
    };
    \`\`\`
  - Add default constant after line 129 (after `DEFAULT_RETRY_CONFIG`):
    \`\`\`typescript
    export const DEFAULT_TICKETING_CONFIG = {
      provider: 'none' as const,
      syncOnRun: true,
      postProgressComments: true,
    };
    \`\`\`
  - Update `DEFAULT_CONFIG` object (around line 130-179) to include:
    \`\`\`typescript
    ticketing: { ...DEFAULT_TICKETING_CONFIG },
    \`\`\`
  - Add validation in `sanitizeUserConfig()` function (after line 450):
    \`\`\`typescript
    // Validate ticketing configuration if present
    if (userConfig.ticketing !== undefined) {
      if (typeof userConfig.ticketing !== 'object' || userConfig.ticketing === null) {
        console.warn('Invalid ticketing in config (must be object), ignoring');
        delete userConfig.ticketing;
      } else {
        const validProviders = ['none', 'github', 'jira'];
        if (userConfig.ticketing.provider && !validProviders.includes(userConfig.ticketing.provider)) {
          console.warn(`Invalid ticketing.provider "${userConfig.ticketing.provider}". Valid values: ${validProviders.join(', ')}`);
          userConfig.ticketing.provider = 'none';
        }
      }
    }
    \`\`\`
  - Update deep merge in `loadConfig()` (around line 530):
    \`\`\`typescript
    ticketing: userConfig.ticketing 
      ? { ...DEFAULT_TICKETING_CONFIG, ...userConfig.ticketing }
      : { ...DEFAULT_TICKETING_CONFIG },
    \`\`\`
- **Dependencies**: None (standalone config change)
- **Pattern to Follow**: Follow exact pattern of `tdd`, `worktree`, `merge` configuration sections

### 5. **MODIFY**: `src/types/index.ts`

- **Change Type**: Modify Existing
- **Reason**: Export ticketing config type definition (may already be sufficient via Config interface)
- **Specific Changes**:
  - Check if `Config` interface update in config.ts is sufficien