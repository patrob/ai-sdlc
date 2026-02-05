# Debugging Patterns

Common debugging patterns for ai-sdlc development and workflow troubleshooting.

## CLI Syntax Verification

Always verify CLI syntax before running unfamiliar commands.

### Check Help First

```bash
# Before guessing syntax
ai-sdlc run --help
ai-sdlc list --help
```

### Flags vs Positional Arguments

Common gotcha: some commands use flags, others use positional arguments.

```bash
# Correct: --story flag
ai-sdlc run --story S-0001

# Wrong: positional argument (depends on command)
ai-sdlc run S-0001
```

### Common ai-sdlc CLI Patterns

| Command | Pattern | Example |
|---------|---------|---------|
| `run` | `--story <id>` | `ai-sdlc run --story S-0001` |
| `list` | no args or `--label` | `ai-sdlc list --label epic-auth` |
| `show` | positional story ID | `ai-sdlc show S-0001` |

### Debugging CLI Issues

1. **Check --help** - Always start here for correct syntax
2. **Verify story exists** - `ai-sdlc list` to see available stories
3. **Check story state** - `ai-sdlc show <id>` to see current phase/status
4. **Use verbose mode** - `ai-sdlc run --verbose` for detailed output

## Package Shadowing Debugging

When dependencies behave unexpectedly, check for package shadowing.

### Check Global vs Local

```bash
# Local package version
npm ls <package-name>

# Global package version
npm ls -g <package-name>

# Compare versions - mismatches cause issues
```

### Verify Resolution Path

```bash
# See exactly which file Node.js resolves to
node -e "console.log(require.resolve('<package-name>'))"

# Check which binary a command resolves to
npx which <command-name>
```

### Common Shadowing Scenarios

| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| "Command not found" after install | Global/local mismatch | Use `npx <cmd>` or install globally |
| Wrong version behavior | Multiple versions installed | `npm ls` to find duplicates |
| Type errors after update | Stale node_modules | Clear cache (see below) |
| Import errors | Resolution path wrong | Check `require.resolve()` |

### Clear Caches When Stuck

```bash
# Nuclear option - reset everything
rm -rf node_modules && npm install

# Also clear build artifacts
rm -rf dist && npm run build
```

### Multi-Agent Workflow Debugging

When debugging ai-sdlc multi-agent workflows:

1. **Check agent dependencies** - Agents may have different package resolutions
2. **Verify shared config** - All agents should use same tsconfig.json paths
3. **Watch for spawn issues** - Child processes inherit parent environment
4. **Log resolution paths** - Add temporary logging to track which packages load

## Quick Reference

### Before Running Unfamiliar Commands

```bash
<command> --help
```

### Before Debugging "Wrong Version" Issues

```bash
npm ls <package>
node -e "console.log(require.resolve('<package>'))"
```

### When Nothing Else Works

```bash
rm -rf node_modules dist && npm install && npm run build
```
