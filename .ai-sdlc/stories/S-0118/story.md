---
id: S-0118
title: OpenAI Provider CLI Integration
priority: 5
status: backlog
type: feature
created: '2026-02-01'
labels:
  - provider-integration
  - openai
  - cli
  - epic-openai-integration
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
slug: openai-cli-integration
dependencies:
  - S-0116
  - S-0117
---
# OpenAI Provider CLI Integration

## User Story

**As a** developer using ai-sdlc
**I want** to select OpenAI as my provider from the CLI
**So that** I can easily switch between AI providers for different use cases

## Summary

This story integrates the OpenAI provider with ai-sdlc's CLI, enabling provider selection via command-line flags and configuration. It includes registration with the ProviderRegistry and updates to relevant commands.

## Technical Context

**Current State:**
- CLI uses Claude provider directly
- No provider selection mechanism

**Target State:**
- `--provider openai` flag on run command
- Provider selection in config file
- `ai-sdlc auth openai` for authentication setup
- Provider status in `ai-sdlc status`

## Acceptance Criteria

### CLI Provider Flag

- [ ] Add `--provider <name>` flag to `ai-sdlc run` command
- [ ] Add `-p` shorthand for `--provider`
- [ ] Default to configured provider or 'claude'
- [ ] Validate provider name against registered providers

### Provider Registration

- [ ] Register `OpenAIProvider` with `ProviderRegistry` on startup
- [ ] Lazy initialization (only create when selected)

### Authentication Command

- [ ] Add `ai-sdlc auth openai` subcommand
- [ ] Interactive API key configuration
- [ ] Validation of entered credentials
- [ ] Storage in config file

### Status Command

- [ ] Show OpenAI provider status in `ai-sdlc status`
- [ ] Display authentication state
- [ ] Show configured model

### Configuration

- [ ] Add `provider` field to `.ai-sdlc.json` schema:
  ```json
  {
    "provider": "openai",
    "providers": {
      "openai": {
        "model": "gpt-4o"
      }
    }
  }
  ```

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/cli/commands.ts` | Modify | Add provider flag and auth subcommand |
| `src/providers/openai/index.ts` | Modify | Export registration function |
| `src/index.ts` | Modify | Register OpenAI provider on startup |

## Implementation Specification

```typescript
// In src/cli/commands.ts - additions

import { ProviderRegistry } from '../providers/registry.js';

// Add to run command options
interface RunOptions {
  // ... existing options
  provider?: string;
}

// In run command handler
async function runCommand(storyId: string, options: RunOptions) {
  const providerName = options.provider || config.provider || 'claude';
  const provider = ProviderRegistry.get(providerName);
  // ... use provider for agent execution
}

// New auth subcommand
program
  .command('auth <provider>')
  .description('Configure authentication for a provider')
  .action(async (providerName: string) => {
    const provider = ProviderRegistry.get(providerName);
    const auth = provider.getAuthenticator();

    if (auth.isConfigured()) {
      console.log(`${providerName} is already configured.`);
      const valid = await auth.validateCredentials();
      console.log(valid ? 'Credentials are valid.' : 'Credentials are invalid.');
    } else {
      await auth.configure();
    }
  });
```

```typescript
// In src/providers/openai/index.ts

import { ProviderRegistry } from '../registry.js';
import { OpenAIProvider } from './openai-provider.js';

export function registerOpenAIProvider(): void {
  ProviderRegistry.register('openai', () => new OpenAIProvider());
}

export * from './openai-provider.js';
export * from './openai-authenticator.js';
export * from './tool-mapper.js';
export * from './types.js';
```

## Testing Requirements

- [ ] Unit test: Provider flag parsing
- [ ] Unit test: Provider resolution from flag
- [ ] Unit test: Auth command flow
- [ ] Integration test: End-to-end provider selection
- [ ] `npm test` passes
- [ ] `npm run build` succeeds

## Definition of Done

- [ ] `--provider openai` flag working on run command
- [ ] `ai-sdlc auth openai` command implemented
- [ ] OpenAI provider registered on startup
- [ ] Status command shows OpenAI status
- [ ] Config file provider selection works
- [ ] Help text updated for new options
- [ ] `make verify` passes

## References

- Commander.js: https://github.com/tj/commander.js
- Depends on: S-0116, S-0117
