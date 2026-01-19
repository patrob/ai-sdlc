# Code Conventions

## ActionType Pattern

When adding or modifying action types in `src/types/index.ts`:

1. **Update ActionType union** — Add the new action to the `ActionType` type
2. **Update actionVerbs** — Add the corresponding verb in `src/cli/commands.ts` `formatAction()` function
3. **Update executeAction** — Add the case handler in `src/cli/commands.ts` `executeAction()` function
4. **Update runner** — If using `src/cli/runner.ts`, add the handler there too

### Example: Adding a `rework` Action

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

Always run `npm run build` or `npm run lint` after modifying types to catch missing handlers. The `Record<ActionType, string>` pattern ensures TypeScript will error if a handler is missing.

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

- When changing an endpoint, service call, or interface, update ALL references—not just the initial area of concern
- Use grep/search to find all usages before making changes
- Verify no broken references remain after modifications

## Security Patterns

- Apply validation/sanitization at ALL display/output points, not just one function
- When adding security measures to one code path, audit all related code paths for consistency
