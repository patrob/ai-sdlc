# Claude Code Instructions for ai-sdlc

## Pre-Commit Requirements
- Run `make verify` before committing ANY changes
- If errors occur, fix them immediately before proceeding
- Never commit code that fails verification

## Code Principles

### DRY (Don't Repeat Yourself)
- If you write the same or similar code 3+ times, extract it into a service or utility
- Look for existing abstractions before creating new ones
- Consolidate duplicate logic into shared functions

### SOLID Principles
- **Single Responsibility**: Each module/class should have one reason to change
- **Open/Closed**: Open for extension, closed for modification
- **Liskov Substitution**: Subtypes must be substitutable for their base types
- **Interface Segregation**: Prefer small, focused interfaces over large ones
- **Dependency Inversion**: Depend on abstractions, not concrete implementations

### Update All References
- When changing an endpoint, service call, or interface, update ALL references - not just the initial area of concern
- Use grep/search to find all usages before making changes
- Verify no broken references remain after modifications

### Tidy First
- Always leave the codebase better than you found it
- Small improvements (rename unclear variables, add missing types, fix minor issues) are encouraged
- Keep scope creep under control: tidying should not increase the scope of work by more than 10%

## Code Conventions

### Action Types
When adding or modifying action types in `src/types/index.ts`:

1. **Update ActionType union** - Add the new action to the `ActionType` type
2. **Update actionVerbs** - Add the corresponding verb in `src/cli/commands.ts` `formatAction()` function
3. **Update executeAction** - Add the case handler in `src/cli/commands.ts` `executeAction()` function
4. **Update runner** - If using `src/cli/runner.ts`, add the handler there too

Example - adding a `rework` action:
```typescript
// 1. src/types/index.ts
export type ActionType =
  | 'refine'
  | 'research'
  | 'plan'
  | 'implement'
  | 'review'
  | 'rework'    // <-- add here
  | 'create_pr'
  | 'move_to_done';

// 2. src/cli/commands.ts - formatAction()
const actionVerbs: Record<Action['type'], string> = {
  refine: 'Refine',
  research: 'Research',
  plan: 'Plan',
  implement: 'Implement',
  review: 'Review',
  rework: 'Rework',  // <-- add here
  create_pr: 'Create PR for',
  move_to_done: 'Move to done',
};

// 3. src/cli/commands.ts - executeAction()
case 'rework':
  // handler implementation
  break;
```

### Type Safety
- Always run `npm run build` or `npm run lint` after modifying types to catch missing handlers
- The `Record<ActionType, string>` pattern ensures TypeScript will error if a handler is missing

## Testing
- Run `npm test` before completing implementation
- Run `npm run build` to verify TypeScript compilation succeeds
- Do NOT create shell scripts for manual testing - use vitest instead
- Do NOT test frameworks or SDKs - trust that they work as documented (e.g., don't test that the Claude Agent SDK discovers CLAUDE.md)

### Test Pyramid
Follow the Testing Pyramid: **many unit tests, fewer integration tests, fewest E2E tests**.

```
        /\
       /  \      E2E Tests (fewest)
      /----\     - Full system workflows
     /      \
    /--------\   Integration Tests (some)
   /          \  - Component boundaries
  /------------\
 /              \ Unit Tests (many)
/________________\ - Individual functions/modules
```

**Unit tests** (the foundation):
- Test individual functions, classes, and modules in isolation
- Fast, deterministic, no external dependencies
- Colocate with the files they test (e.g., `src/core/story.ts` → `src/core/story.test.ts`)
- Mock external dependencies (file system, network, etc.)
- Should cover edge cases, error conditions, and happy paths

**Integration tests** (the middle layer):
- Place in `tests/integration/` when testing multiple components together
- The `tests/` directory is for integration tests, test utilities, helpers, and fixtures
- Test that components work together correctly at boundaries
- More expensive to run, so be selective

**When to write an integration test:**
- Testing CLI command execution flow (mocking ora, verifying spinner behavior)
- Testing file system operations across multiple services
- Testing that configuration loading integrates with dependent components
- Testing error propagation across module boundaries
- Verifying that mocked dependencies are called with correct arguments during real execution flows

**When NOT to write an integration test:**
- Testing pure logic that can be unit tested
- Testing return values or types (that's a unit test)
- Testing third-party libraries or frameworks
- Testing individual function behavior in isolation

## File Hygiene
- Do NOT create temporary/scratch files in the project root (e.g., `verify-*.md`, `IMPLEMENTATION_SUMMARY.md`)
- Do NOT create shell scripts for manual testing or debugging
- Do NOT create documentation files unless explicitly requested
- Keep implementation notes within the story file itself, not in separate files
- The only markdown files in root should be: `README.md`, `CLAUDE.md`, `REFINEMENT_LOOP.md`

## Completion Criteria
NEVER mark implementation as complete until:
1. `npm test` passes with 0 failures
2. `npm run build` succeeds
3. Story status accurately reflects current state (no conflicting "Complete" claims)

## Testing (Critical Rules)
- **Export testable functions**: Never recreate production logic in tests. Export functions from production code and import them in tests
- **Integration tests must test integration**: Tests in `tests/integration/` must mock dependencies and verify actual execution flows (e.g., mock `ora`, call `executeAction()`, verify spinner methods called). Tests that only check types/return values are unit tests - name them accordingly
- **Mock dates in tests**: When testing code that uses `Date` or timestamps, always use mocked dates (e.g., `vi.useFakeTimers()`, `vi.setSystemTime()`). Each test should have its own isolated mocked date to prevent timing-related flakiness and ensure deterministic results

## Security Patterns
- Apply validation/sanitization at ALL display/output points, not just one function
- When adding security measures to one code path, audit all related code paths for consistency

## Story Document Accuracy
- Keep ONE current status section - remove or clearly mark outdated "Implementation Complete" claims
- Update build/test results after fixing issues - don't leave stale failure information
- Run `npm test` and verify output before claiming tests pass
