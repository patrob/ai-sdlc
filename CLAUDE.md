# Claude Code Instructions for agentic-sdlc

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
- Follow the Testing Pyramid: many unit tests, fewer integration tests, fewest E2E tests
- **Unit tests**: Colocate with the files they test (e.g., `src/core/story.ts` → `src/core/story.test.ts`)
- **Integration tests**: Place in `tests/integration/` when testing multiple components together
- The `tests/` directory is for integration tests, test utilities, helpers, and fixtures
- Do NOT create shell scripts for manual testing - use vitest instead

## File Hygiene
- Do NOT create temporary/scratch files in the project root (e.g., `verify-*.md`, `IMPLEMENTATION_SUMMARY.md`)
- Do NOT create shell scripts for manual testing or debugging
- Do NOT create documentation files unless explicitly requested
- Keep implementation notes within the story file itself, not in separate files
- The only markdown files in root should be: `README.md`, `CLAUDE.md`, `REFINEMENT_LOOP.md`
