---
id: S-0091
title: Add Provider Configuration to .ai-sdlc.json
priority: 14
status: backlog
type: feature
created: '2026-01-19'
labels:
  - architecture
  - provider-abstraction
  - configuration
  - epic-modular-architecture
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
slug: provider-configuration
dependencies:
  - S-0078
  - S-0079
  - S-0080
---
# Add Provider Configuration to .ai-sdlc.json

## User Story

**As a** developer using ai-sdlc
**I want** to configure AI providers in my project configuration
**So that** I can switch providers or customize provider settings without code changes

## Summary

This story adds provider configuration support to `.ai-sdlc.json`. Users can specify which provider to use, configure provider-specific settings, and define fallback behavior.

## Technical Context

**Current State:**
- No provider configuration in `.ai-sdlc.json`
- Provider selection only via environment variable
- No provider-specific settings

**Target State:**
- Provider configuration section in `.ai-sdlc.json`
- Per-provider settings (model, timeout, etc.)
- Fallback provider configuration
- Environment variable override support

## Acceptance Criteria

### Configuration Schema

- [ ] Add `provider` section to config schema
- [ ] Validate provider configuration on load
- [ ] Support environment variable overrides

### Configuration Structure

```json
{
  "provider": {
    "default": "claude",
    "fallback": ["openai"],
    "providers": {
      "claude": {
        "model": "claude-sonnet-4-5-20250929",
        "timeout": 300000,
        "maxRetries": 3,
        "settingSources": ["project"]
      },
      "copilot": {
        "model": "gpt-4",
        "timeout": 300000
      }
    }
  }
}
```

### Configuration Loading

- [ ] Load provider config from `.ai-sdlc.json`
- [ ] Apply defaults for missing values
- [ ] Validate provider names against registered providers
- [ ] Log warning for unknown providers

### Environment Overrides

- [ ] `AI_SDLC_PROVIDER` overrides `default`
- [ ] `AI_SDLC_PROVIDER_MODEL` overrides model for default provider
- [ ] `AI_SDLC_PROVIDER_TIMEOUT` overrides timeout

### Provider Resolution

- [ ] `ProviderRegistry.getDefault()` uses config
- [ ] Provider-specific config passed to provider constructor
- [ ] Config validated before provider instantiation

### Type Definitions

```typescript
interface ProviderConfig {
  default: string;
  fallback?: string[];
  providers: Record<string, ProviderSettings>;
}

interface ProviderSettings {
  model?: string;
  timeout?: number;
  maxRetries?: number;
  // Provider-specific settings
  [key: string]: unknown;
}
```

### CLI Integration

- [ ] `npm run agent config provider` shows current provider config
- [ ] `npm run agent config provider set <name>` changes default provider

## Files to Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/core/config.ts` | Modify | Add ProviderConfig type and loading |
| `src/providers/registry.ts` | Modify | Use config for provider resolution |
| `src/types/index.ts` | Modify | Export ProviderConfig types |
| `.ai-sdlc.json.example` | Modify | Add provider config example |

## Testing Requirements

- [ ] Unit test: Config loading with provider section
- [ ] Unit test: Environment variable overrides
- [ ] Unit test: Unknown provider warning
- [ ] Integration test: Provider resolution from config
- [ ] `npm test` passes
- [ ] `npm run build` succeeds

## Definition of Done

- [ ] Provider config schema defined
- [ ] Config loading updated
- [ ] Environment overrides working
- [ ] CLI commands for config viewing
- [ ] All tests pass
- [ ] Build succeeds

## References

- Architecture Analysis: `docs/architecture-analysis.md` Section 6
