# Plan: Publish agentic-sdlc Alpha to NPM

## Goal
Publish `agentic-sdlc@0.1.0-alpha.1` to npm so it can be installed globally and used on other projects.

## Current State
- **Code**: Solid - 295 tests passing, clean TypeScript build
- **CLI**: Working - all commands functional (`init`, `status`, `add`, `run`, `details`, `config`)
- **Package**: 65-70% ready - needs config cleanup before publish

### Key Issues to Fix
| Issue | Current | Fix |
|-------|---------|-----|
| No `files` field | npm pack includes 203 files, 2.9MB | Whitelist only dist/, templates/, README, LICENSE |
| No `types` field | TypeScript users can't find types | Add `"types": "dist/index.d.ts"` |
| No `prepublishOnly` | Could publish broken code | Add script to lint/build/test |
| Version | `0.1.0` | Change to `0.1.0-alpha.1` |

---

## Implementation Steps

### Step 1: Update package.json for NPM Publishing
**Agent**: `utensils:refactorer`
**Files**: `package.json`

Add/update these fields:
```json
{
  "version": "0.1.0-alpha.1",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": [
    "dist",
    "templates",
    "README.md",
    "LICENSE"
  ],
  "scripts": {
    "prepublishOnly": "npm run lint && npm run build && npm test"
  }
}
```

### Step 2: Verify Package Contents
**Agent**: `utensils:runner`

Run these commands to verify:
```bash
npm pack --dry-run
# Should show ~10-15 files, <100KB compressed
# Should NOT include: .agentic-sdlc/, src/, tests/, .github/
```

### Step 3: Test Local Installation
**Agent**: `utensils:runner`

```bash
# Create tarball
npm pack

# Test install in temp location
mkdir -p /tmp/test-agentic-sdlc
cd /tmp/test-agentic-sdlc
npm init -y
npm install /path/to/agentic-sdlc-0.1.0-alpha.1.tgz

# Test CLI works
npx agentic-sdlc --help
npx agentic-sdlc --version
```

### Step 4: Update README for Alpha Release
**Agent**: `utensils:refactorer`
**Files**: `README.md`

Add alpha notice at top:
```markdown
> **Alpha Release**: This is an early alpha. Expect breaking changes.
> Report issues at [GitHub Issues](https://github.com/patrob/agentic-workflow/issues)
```

### Step 5: Create .npmignore (Belt and Suspenders)
**Agent**: `utensils:writer`
**Files**: `.npmignore`

Even with `files` field, create explicit .npmignore:
```
# Source (compiled code is in dist/)
src/

# Tests
tests/
*.test.ts
vitest.config.ts

# Development
.github/
.agentic-sdlc/
.agentic-sdlc.json
tsconfig.json
CLAUDE.md
CONTRIBUTING.md
REFINEMENT_LOOP.md
SECURITY.md

# Editor/IDE
.vscode/
.idea/
*.swp
*.swo

# Environment
.env*
```

### Step 6: Final Build and Test
**Agent**: `utensils:runner`

```bash
# Clean and rebuild
rm -rf dist/
npm run build
npm run lint
npm test
```

### Step 7: Publish to NPM
**Agent**: `utensils:runner`

```bash
# Login if needed
npm whoami || npm login

# Publish with alpha tag
npm publish --tag alpha --access public

# Verify
npm info agentic-sdlc
```

### Step 8: Test Global Install
**Agent**: `utensils:runner`

```bash
# Install globally from npm
npm install -g agentic-sdlc@alpha

# Test it works
agentic-sdlc --version
agentic-sdlc --help

# Test in a fresh project
cd /tmp
mkdir test-project && cd test-project
git init
agentic-sdlc init
agentic-sdlc status
```

---

## Verification Checklist

After all steps complete:
- [ ] `npm pack --dry-run` shows <20 files, <200KB
- [ ] Package installs globally without errors
- [ ] `agentic-sdlc --version` shows `0.1.0-alpha.1`
- [ ] `agentic-sdlc init` creates `.agentic-sdlc/` folder
- [ ] `agentic-sdlc status` works in initialized project
- [ ] Package visible on npmjs.com/package/agentic-sdlc

---

## Files to Modify

| File | Changes |
|------|---------|
| `package.json` | Add version, types, exports, files, prepublishOnly |
| `README.md` | Add alpha notice banner |
| `.npmignore` | Create new file |

---

## Rollback Plan

If publish has issues:
```bash
npm unpublish agentic-sdlc@0.1.0-alpha.1
```

Note: npm allows unpublish within 72 hours of publish.
