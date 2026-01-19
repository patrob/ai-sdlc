---
id: S-0071
title: Document existing configuration options
priority: 10
status: backlog
type: documentation
created: '2026-01-19'
labels:
  - documentation
  - configuration
  - onboarding
  - epic-ticketing-integration
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
slug: document-existing-configuration-options
---
# Document existing configuration options

## User Story

**As a** new user of ai-sdlc
**I want** comprehensive documentation of all configuration options
**So that** I can properly configure the tool for my project without trial-and-error

## Summary

The ai-sdlc tool has a rich configuration system via `.ai-sdlc.json`, but lacks comprehensive user documentation. This story creates the foundational documentation that subsequent ticketing integration stories will build upon. This is a prerequisite for the ticketing integration epic.

## Context

Currently, configuration options are defined in `src/core/config.ts` with TypeScript types, but users must read source code to understand available options. This creates a barrier to adoption and makes it difficult for teams to properly configure the tool.

Documentation should cover:
1. All current `.ai-sdlc.json` options with examples
2. Environment variable overrides
3. Common configuration patterns
4. Troubleshooting configuration issues

## Acceptance Criteria

### Documentation Files

- [ ] Create `docs/configuration.md` with comprehensive configuration reference
  - [ ] Document all fields in `Config` interface from `src/core/config.ts`
  - [ ] Include type, default value, and description for each option
  - [ ] Provide examples for common use cases
  - [ ] Document environment variable overrides (AI_SDLC_*)

- [ ] Update `README.md` to link to configuration docs
  - [ ] Add "Configuration" section with brief overview
  - [ ] Link to `docs/configuration.md` for details

### Content Requirements

- [ ] Configuration reference table format:
  ```markdown
  | Option | Type | Default | Description |
  |--------|------|---------|-------------|
  | `stageGates.requireResearch` | boolean | true | Require research phase |
  ```

- [ ] Include example configurations:
  - [ ] Minimal configuration (defaults)
  - [ ] TDD-enabled configuration
  - [ ] Worktree-enabled configuration
  - [ ] Custom retry limits configuration

- [ ] Document validation rules and error messages

- [ ] Include troubleshooting section for common configuration errors

### Technical Requirements

- [ ] Documentation must be accurate against current `src/core/config.ts`
- [ ] All examples must be valid JSON that passes config validation
- [ ] No placeholder or TODO sections - complete documentation only

## Out of Scope

- Ticketing integration configuration (covered in later stories)
- API documentation or code-level docs
- Tutorial/getting-started content (separate story if needed)

## Definition of Done

- [ ] `docs/configuration.md` exists with complete configuration reference
- [ ] README.md links to configuration documentation
- [ ] All configuration examples are valid and tested
- [ ] Documentation reviewed for accuracy against source code
- [ ] `make verify` passes (no lint errors in markdown)
