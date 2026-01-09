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
