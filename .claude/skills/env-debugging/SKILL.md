---
name: env-debugging
description: Use when debugging environment issues like package version mismatches, resolution problems, build tool failures, or TypeScript configuration issues.
---

# Environment Debugging Skill

This skill provides systematic approaches to debugging environment and tooling issues.

## Overview

Environment issues are often caused by version mismatches, caching, or configuration problems. This skill provides parallel investigation strategies to quickly isolate root causes.

## Parallel Investigation Strategy

When facing environment issues, investigate all dimensions simultaneously rather than sequentially.

### Three Investigation Threads

| Thread | Focus | Key Commands |
|--------|-------|--------------|
| **Version** | Package and runtime versions | `node -v`, `npm ls`, version checks |
| **Config** | Configuration files and paths | Read configs, check paths |
| **Cache** | Stale artifacts and modules | Delete caches, rebuild |

### Investigation Template

```markdown
## Issue: [Brief description]

### Version Thread
- Node: [node -v]
- npm: [npm -v]
- Key packages: [npm ls package1 package2]
- TypeScript: [npx tsc --version]

### Config Thread
- tsconfig target: [read from tsconfig.json]
- module resolution: [moduleResolution setting]
- paths configured: [yes/no, list if yes]

### Cache Thread
- node_modules age: [when last installed]
- dist/ present: [yes/no]
- .cache directories: [list any]

### Hypothesis
[What you think is wrong based on above]
```

## Common Patterns

### Package Shadowing

**Symptom:** Behavior differs from documentation or expected version

**Investigation:**
```bash
# Check local version
npm ls <package>

# Check global version
npm ls -g <package>

# See actual resolution path
node -e "console.log(require.resolve('<package>'))"

# Check which binary resolves
npx which <command>
```

**Common Causes:**
- Global install shadowing local
- Multiple versions in node_modules
- Hoisted dependency using wrong version

### Build Tool Version Mismatches

**Symptom:** Build works locally but fails in CI, or vice versa

**Investigation:**
```bash
# Compare versions
node -v
npm -v
npx tsc --version
npx vitest --version

# Check package-lock.json for locked versions
cat package-lock.json | grep '"<package>"' -A 5
```

**Resolution:**
- Pin versions in package.json
- Ensure CI uses same Node version
- Check for peer dependency conflicts

### TypeScript Resolution Issues

**Symptom:** Imports fail or wrong types are used

**Investigation:**
```bash
# Check TS version
npx tsc --version

# Show resolution trace for a specific import
npx tsc --traceResolution 2>&1 | grep "import-name"

# Check compiled output
cat dist/<file>.js
```

**Config to Check:**
```json
{
  "compilerOptions": {
    "moduleResolution": "bundler",  // or "node", "node16"
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  }
}
```

## Anti-Patterns to Avoid

### 1. Sequential Investigation

**Bad:** Check version → then config → then cache
**Good:** Check all three in parallel, then correlate

### 2. Assuming Cache is Fresh

**Bad:** "I just installed, cache can't be the issue"
**Good:** Always verify cache state explicitly

### 3. Ignoring Peer Dependencies

**Bad:** Only checking direct dependencies
**Good:** `npm ls` shows the full tree including peer deps

### 4. Not Checking CI Environment

**Bad:** "Works on my machine"
**Good:** Compare exact versions between local and CI

## Quick Fixes

### Nuclear Reset

When nothing else works:

```bash
rm -rf node_modules dist .cache
npm install
npm run build
```

### Version Lock Check

Ensure reproducible builds:

```bash
# Verify lock file is committed
git status package-lock.json

# Install exact locked versions
npm ci  # instead of npm install
```

### TypeScript Cache Clear

```bash
rm -rf dist
rm -rf node_modules/.cache
npx tsc --build --clean
```

## Debugging Checklist

- [ ] Checked Node.js version matches expected
- [ ] Verified npm/package versions with `npm ls`
- [ ] Confirmed resolution paths with `require.resolve()`
- [ ] Reviewed relevant config files
- [ ] Cleared caches and rebuilt
- [ ] Compared with working environment (CI, teammate)
