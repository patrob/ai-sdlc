# Advanced Debugging

Systematic debugging workflows for complex issues.

## TDD Bug Fix Workflow

Use Test-Driven Development when fixing bugs to ensure fixes are verified and don't regress.

### The Process

1. **Write failing test first** - Reproduce the bug in a test
2. **Verify test fails** - Confirm the test catches the bug
3. **Fix the bug** - Make minimal changes to pass the test
4. **Verify all tests pass** - No regressions introduced
5. **Commit** - Bug fix with test included

### Bug Fix Prompt Template

When requesting a bug fix, provide:

```
## Bug Description
[What's happening vs what should happen]

## Steps to Reproduce
1. [Step 1]
2. [Step 2]
3. [Observe: ...]

## Expected Behavior
[What should happen instead]

## Relevant Files
- [file1.ts] - [why relevant]
- [file2.ts] - [why relevant]

## Acceptance Criteria
- [ ] Test reproduces the bug (fails before fix)
- [ ] Fix makes test pass
- [ ] All existing tests still pass
```

### Anti-Patterns

- **Fixing without test** - Bug may recur later
- **Writing test after fix** - Test might not actually catch the bug
- **Changing test to pass** - Masks the real issue

## Environment Isolation Debugging

Debug complex environment issues using parallel investigation threads.

### Parallel Investigation Strategy

When facing environment issues, investigate multiple dimensions simultaneously:

| Thread | What to Check | Commands |
|--------|---------------|----------|
| **Version** | Node, npm, package versions | `node -v`, `npm -v`, `npm ls` |
| **Config** | tsconfig, package.json, .env | Read config files, check paths |
| **Cache** | node_modules, dist, .cache | Delete and rebuild |

### Investigation Prompt Template

```
## Environment Issue

### Symptoms
[What's failing and how]

### Investigation Threads

#### Version Thread
- Node version: [output of node -v]
- npm version: [output of npm -v]
- Key package versions: [npm ls relevant-packages]

#### Config Thread
- tsconfig paths: [relevant paths]
- Package resolution: [any overrides]

#### Cache Thread
- Last clean install: [when]
- Build artifacts: [dist/ contents]

### Hypothesis
[What you think might be wrong]
```

### Common Environment Issues

| Issue | Version Check | Config Check | Cache Fix |
|-------|--------------|--------------|-----------|
| Type errors after update | `npm ls typescript` | tsconfig.json target | `rm -rf node_modules` |
| Import resolution | `node -e "require.resolve(...)"` | paths in tsconfig | Rebuild dist/ |
| Build failures | Check peer deps | Build script in package.json | Clear all caches |

## Autonomous Bug Fix Pipeline

Structured approach for systematic bug resolution.

### Pipeline Stages

```
Identify → Locate → Reproduce → Fix → Verify → Commit
```

### Stage Details

#### 1. Identify
- Read error message/stack trace completely
- Identify the symptom vs root cause
- Note affected functionality

#### 2. Locate
- Find relevant source files
- Trace execution path to failure point
- Check related tests for context

#### 3. Reproduce
- Write a failing test that triggers the bug
- Confirm test fails for the right reason
- Document reproduction steps

#### 4. Fix
- Make minimal changes to pass the test
- Follow existing code patterns
- Don't fix unrelated issues

#### 5. Verify
- Run the new test - must pass
- Run all tests - no regressions
- Run `make verify` - lint/build pass

#### 6. Commit
- Commit test and fix together
- Reference issue/story in message
- Keep commit focused

### Safety Limits

To prevent runaway debugging:

- **Max 3 fix attempts** - If third attempt fails, escalate for review
- **Preserve failing tests** - Never delete a test to make suite pass
- **Time-box investigation** - Set limits on exploration before asking for help
- **Document dead ends** - Record what didn't work to avoid repeating

### When to Escalate

Stop autonomous fixing and ask for help when:

- Same fix approach failed 3 times
- Fix requires architectural changes
- Bug is in third-party dependency
- Multiple tests start failing unexpectedly
