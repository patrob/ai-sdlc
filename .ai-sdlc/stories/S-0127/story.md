---
id: S-0127
title: Local Provider Auto-Discovery and Configuration
priority: 4
status: backlog
type: feature
created: '2026-02-01'
labels:
  - provider-integration
  - local-llm
  - cli
  - epic-local-llm
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
slug: local-provider-discovery
dependencies:
  - S-0125
  - S-0126
---
# Local Provider Auto-Discovery and Configuration

## User Story

**As a** user of ai-sdlc
**I want** the tool to automatically detect running local LLM servers
**So that** setup is effortless and I don't need to manually configure endpoints

## Summary

This story implements automatic discovery of local LLM servers and integrates local provider configuration into the CLI. Users can run `ai-sdlc providers discover` to find available servers and use `--provider local` to use them.

## Technical Context

**Current State:**
- Ollama provider exists (S-0125)
- OpenAI-compatible provider exists (S-0126)
- No auto-discovery mechanism
- No CLI integration for local providers

**Target State:**
- `discoverLocalProviders()` function probes common ports
- `ai-sdlc providers discover` CLI command
- `--provider local` flag for run command
- Configuration in `.ai-sdlc.json`

## Acceptance Criteria

### Discovery Function

- [ ] Create `src/providers/local/discovery.ts` with:
  - [ ] `discoverLocalProviders()` - Probe common endpoints
  - [ ] Check Ollama on port 11434
  - [ ] Check LM Studio on port 1234
  - [ ] Check llama.cpp on port 8080
  - [ ] Return discovered providers with status

### Configuration Schema

- [ ] Add `providers.local` section to `.ai-sdlc.json` schema:
  ```json
  {
    "providers": {
      "local": {
        "type": "ollama",
        "host": "http://localhost:11434",
        "model": "llama3.1",
        "timeout": 120000
      }
    }
  }
  ```

### CLI Commands

- [ ] Add `ai-sdlc providers discover` command:
  - [ ] Scan for running local servers
  - [ ] Display found servers with status
  - [ ] Show available models on each server
  - [ ] Offer to save configuration

- [ ] Add `ai-sdlc providers list` command:
  - [ ] List all registered providers
  - [ ] Show configuration status
  - [ ] Show authentication status

### Provider Flag

- [ ] Add `--provider local` support to run command
- [ ] Resolve local provider from configuration
- [ ] Auto-discover if not configured

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/providers/local/discovery.ts` | Create | Auto-discovery logic |
| `src/cli/commands.ts` | Modify | Add providers commands |
| `src/core/config.ts` | Modify | Add local provider config schema |

## Implementation Specification

```typescript
// src/providers/local/discovery.ts

import { LocalLLMType, LocalProviderStatus } from './types.js';

export interface DiscoveredProvider {
  type: LocalLLMType;
  host: string;
  port: number;
  status: LocalProviderStatus;
}

const COMMON_ENDPOINTS = [
  { type: 'ollama' as LocalLLMType, port: 11434, probe: '/api/tags' },
  { type: 'lm-studio' as LocalLLMType, port: 1234, probe: '/v1/models' },
  { type: 'llama-cpp' as LocalLLMType, port: 8080, probe: '/v1/models' },
];

/**
 * Discover running local LLM servers
 */
export async function discoverLocalProviders(): Promise<DiscoveredProvider[]> {
  const discovered: DiscoveredProvider[] = [];

  for (const endpoint of COMMON_ENDPOINTS) {
    const host = 'http://localhost';
    const url = `${host}:${endpoint.port}${endpoint.probe}`;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);

      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);

      if (response.ok) {
        const data = await response.json();
        discovered.push({
          type: endpoint.type,
          host,
          port: endpoint.port,
          status: {
            isConnected: true,
            availableModels: extractModels(endpoint.type, data),
          },
        });
      }
    } catch {
      // Server not running on this port - skip
    }
  }

  return discovered;
}

function extractModels(type: LocalLLMType, data: unknown): string[] {
  if (type === 'ollama' && data && typeof data === 'object' && 'models' in data) {
    return (data as { models: Array<{ name: string }> }).models.map((m) => m.name);
  }

  if (type !== 'ollama' && data && typeof data === 'object' && 'data' in data) {
    return (data as { data: Array<{ id: string }> }).data.map((m) => m.id);
  }

  return [];
}

/**
 * Get the best available local provider
 */
export async function getBestLocalProvider(): Promise<DiscoveredProvider | null> {
  const providers = await discoverLocalProviders();

  // Prefer Ollama, then LM Studio, then llama.cpp
  const priority: LocalLLMType[] = ['ollama', 'lm-studio', 'llama-cpp'];

  for (const type of priority) {
    const provider = providers.find((p) => p.type === type);
    if (provider) return provider;
  }

  return null;
}
```

```typescript
// CLI additions (in src/cli/commands.ts)

import { discoverLocalProviders, getBestLocalProvider } from '../providers/local/discovery.js';

program
  .command('providers')
  .description('Manage AI providers')
  .addCommand(
    new Command('discover')
      .description('Discover local LLM servers')
      .action(async () => {
        console.log('Scanning for local LLM servers...\n');

        const providers = await discoverLocalProviders();

        if (providers.length === 0) {
          console.log('No local LLM servers found.');
          console.log('\nTo get started:');
          console.log('  Ollama:    ollama serve');
          console.log('  LM Studio: Launch the application');
          return;
        }

        for (const provider of providers) {
          console.log(`✓ ${provider.type} at ${provider.host}:${provider.port}`);
          if (provider.status.availableModels?.length) {
            console.log(`  Models: ${provider.status.availableModels.join(', ')}`);
          }
        }
      })
  )
  .addCommand(
    new Command('list')
      .description('List registered providers')
      .action(() => {
        const providers = ProviderRegistry.listProviders();
        console.log('Registered providers:', providers.join(', '));
      })
  );
```

## Testing Requirements

- [ ] Unit test: Discovery with mocked fetch
- [ ] Unit test: Port probing logic
- [ ] Unit test: Model extraction for each provider type
- [ ] Unit test: `getBestLocalProvider()` priority order
- [ ] Unit test: CLI command output
- [ ] `npm test` passes
- [ ] `npm run build` succeeds

## Definition of Done

- [ ] `discoverLocalProviders()` function implemented
- [ ] `ai-sdlc providers discover` command working
- [ ] `ai-sdlc providers list` command working
- [ ] `--provider local` flag integrated
- [ ] Configuration schema updated
- [ ] Unit tests with mocked network calls
- [ ] `make verify` passes

## References

- Commander.js subcommands: https://github.com/tj/commander.js#commands
- Depends on: S-0125, S-0126
