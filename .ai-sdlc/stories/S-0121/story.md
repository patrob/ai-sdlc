---
id: S-0121
title: Copilot Subscription Authenticator
priority: 3
status: backlog
type: feature
created: '2026-02-01'
labels:
  - provider-integration
  - copilot
  - epic-copilot-integration
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
slug: copilot-authenticator
dependencies:
  - S-0078
---
# Copilot Subscription Authenticator

## User Story

**As a** developer using ai-sdlc with GitHub Copilot
**I want** seamless authentication via my existing GitHub subscription
**So that** I can use Copilot without additional API keys

## Summary

This story implements the `CopilotAuthenticator` that validates GitHub Copilot subscription status via the `gh` CLI. Unlike API key-based providers, Copilot uses GitHub OAuth and subscription verification.

## Technical Context

**Current State:**
- Only API key authentication exists
- No OAuth/subscription-based authentication

**Target State:**
- Validate Copilot subscription via `gh` CLI
- Check for active Copilot license
- Verify `gh copilot` extension is installed
- Provide helpful guidance for setup

## Acceptance Criteria

### CopilotAuthenticator Class

- [ ] Create `src/providers/copilot/copilot-authenticator.ts` implementing `IAuthenticator`:
  - [ ] `isConfigured()` - Check if `gh` CLI is authenticated and Copilot enabled
  - [ ] `getCredentialType()` - Return 'oauth'
  - [ ] `configure()` - Guide user through `gh auth login` if needed
  - [ ] `validateCredentials()` - Verify Copilot subscription is active

### Validation Steps

- [ ] Check `gh` CLI is installed
- [ ] Check `gh` CLI is authenticated (`gh auth status`)
- [ ] Check Copilot extension is installed (`gh extension list`)
- [ ] Verify Copilot subscription is active (`gh copilot --version` or similar)

### Error Guidance

- [ ] Missing `gh` CLI → "Install GitHub CLI: https://cli.github.com"
- [ ] Not authenticated → "Run: `gh auth login`"
- [ ] Missing extension → "Run: `gh extension install github/gh-copilot`"
- [ ] No subscription → "Copilot subscription required: https://github.com/features/copilot"

### Token Expiration

- [ ] Implement `getTokenExpirationInfo()` for OAuth token status
- [ ] Check token expiration via `gh auth token`

## Files to Create

| File | Purpose |
|------|---------|
| `src/providers/copilot/copilot-authenticator.ts` | Subscription validation |

## Implementation Specification

```typescript
// src/providers/copilot/copilot-authenticator.ts

import { exec } from 'child_process';
import { promisify } from 'util';
import { IAuthenticator } from '../types.js';

const execAsync = promisify(exec);

export class CopilotAuthenticator implements IAuthenticator {
  isConfigured(): boolean {
    // Quick sync check - gh CLI exists and has auth
    try {
      require('child_process').execSync('gh auth status', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  getCredentialType(): 'oauth' {
    return 'oauth';
  }

  async configure(): Promise<void> {
    // Check prerequisites
    if (!(await this.checkGhCli())) {
      console.log('GitHub CLI not found.');
      console.log('Install from: https://cli.github.com');
      return;
    }

    if (!(await this.checkGhAuth())) {
      console.log('GitHub CLI not authenticated.');
      console.log('Run: gh auth login');
      return;
    }

    if (!(await this.checkCopilotExtension())) {
      console.log('Copilot extension not installed.');
      console.log('Run: gh extension install github/gh-copilot');
      return;
    }

    console.log('GitHub Copilot is configured and ready.');
  }

  async validateCredentials(): Promise<boolean> {
    try {
      // Verify full chain: gh CLI → auth → extension → subscription
      if (!(await this.checkGhCli())) return false;
      if (!(await this.checkGhAuth())) return false;
      if (!(await this.checkCopilotExtension())) return false;
      if (!(await this.checkCopilotSubscription())) return false;

      return true;
    } catch {
      return false;
    }
  }

  getTokenExpirationInfo(): { isExpired: boolean; expiresInMs: number | null } {
    // GitHub OAuth tokens don't typically expire, but may be revoked
    return { isExpired: false, expiresInMs: null };
  }

  private async checkGhCli(): Promise<boolean> {
    try {
      await execAsync('gh --version');
      return true;
    } catch {
      return false;
    }
  }

  private async checkGhAuth(): Promise<boolean> {
    try {
      await execAsync('gh auth status');
      return true;
    } catch {
      return false;
    }
  }

  private async checkCopilotExtension(): Promise<boolean> {
    try {
      const { stdout } = await execAsync('gh extension list');
      return stdout.includes('copilot');
    } catch {
      return false;
    }
  }

  private async checkCopilotSubscription(): Promise<boolean> {
    try {
      await execAsync('gh copilot --version');
      return true;
    } catch {
      return false;
    }
  }
}
```

## Testing Requirements

- [ ] Unit test: `isConfigured()` with mocked exec
- [ ] Unit test: `validateCredentials()` success path
- [ ] Unit test: `validateCredentials()` failure paths (all check types)
- [ ] Unit test: `configure()` output messages
- [ ] `npm test` passes
- [ ] `npm run build` succeeds

## Definition of Done

- [ ] `CopilotAuthenticator` class implemented
- [ ] All prerequisite checks implemented
- [ ] Helpful error messages for each failure mode
- [ ] Unit tests with mocked exec
- [ ] `make verify` passes

## References

- GitHub CLI: https://cli.github.com
- Copilot CLI Extension: https://docs.github.com/en/copilot/github-copilot-in-the-cli
- Depends on: S-0078 (IAuthenticator interface)
