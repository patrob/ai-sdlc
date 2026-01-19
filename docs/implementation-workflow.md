# Implementation Workflow

## Completion Criteria

NEVER mark implementation as complete until:

1. `npm test` passes with 0 failures
2. `npm run build` succeeds
3. Story status accurately reflects current state (no conflicting "Complete" claims)

## Anti-Hallucination Rules

**CRITICAL**: The implementation phase requires MODIFYING SOURCE CODE, not writing documentation.

### What Implementation IS

- Modifying `.ts`/`.js` files in `src/`
- Writing new test files for the feature
- Running `npm test` and fixing failures
- Making actual code changes that show up in `git diff`

### What Implementation IS NOT

- Writing research notes in the story file
- Creating implementation plans or documentation
- Documenting what SHOULD be done without doing it
- Claiming completion based on existing passing tests

### If You Cannot Proceed

- **Lacking file permissions**: Set status to `blocked`, explain what access is needed
- **Requirements unclear**: Set status to `blocked`, list specific questions
- **Technical blocker**: Set status to `blocked`, describe the issue

### NEVER Do These

- Set `implementation_complete: true` without actual code changes
- Claim "tests passed" if you didn't write new tests for the feature
- Say "waiting for permission" then mark as complete
- Write 500 lines of documentation and call it implementation

### Self-Check Before Marking Complete

1. Did I modify files in `src/` (not just `.ai-sdlc/stories/`)?
2. Did I write new tests that verify the new functionality?
3. Would `git diff --name-only` show `.ts` or `.js` files I changed?
4. If I answer "no" to any of these, I have NOT completed implementation.

## Handling Test Failures

When tests fail after writing implementation code, DO NOT give up or mark as blocked. Instead:

1. **Analyze the failure output** — Read the error messages carefully to understand what's broken
2. **Identify root cause** — Is it a bug in production code, missing dependency injection, incorrect mock setup, or test logic error?
3. **Fix the implementation** — Usually the production code needs fixing, not the tests (tests caught a real bug)
4. **Re-run tests** — Verify the fix works
5. **Repeat** — Continue until all tests pass

### Only Escalate/Stop If

- You've made 3+ fix attempts without progress
- The failure requires external input (unclear requirements, architectural decision needed)
- Tests reveal a fundamental design flaw that needs discussion

### Common Failure Patterns and Fixes

| Error | Likely Fix |
|-------|-----------|
| "expected X to be Y" | Check the implementation logic, not the test expectation |
| "undefined is not a function" | Missing import, incorrect mock, or wrong function signature |
| Mock not called | Dependency injection not wired through (pass mocked deps to inner functions) |
| Timeout | Async code missing await, or infinite loop |
