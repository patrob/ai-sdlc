# Example CLAUDE.md

This is an example `CLAUDE.md` file that you can place in your project's `.claude/` directory to provide custom instructions to the Agent SDK.

## Location

Create this file at: `.claude/CLAUDE.md`

## Example Content

```markdown
# Project-Specific Instructions

You are working on a TypeScript Node.js project that follows these conventions:

## Code Style

- Use ESM (import/export) syntax, not CommonJS
- Prefer `const` over `let`, avoid `var`
- Use meaningful variable names (no single-letter variables except in loops)
- Add JSDoc comments for all exported functions and classes

## Error Handling

- Always handle errors explicitly
- Use try-catch blocks for async operations
- Provide helpful error messages with context

## Testing

- Write unit tests for all business logic using Vitest
- Place test files adjacent to source files with `.test.ts` extension
- Aim for 80%+ code coverage
- Mock external dependencies in tests

## Documentation

- Keep README.md up to date
- Document all public APIs
- Include code examples in documentation
- Update CHANGELOG.md for notable changes

## Git Workflow

- Write clear, descriptive commit messages
- Use conventional commit format: `type(scope): description`
- Keep commits atomic and focused
- Reference issue/story numbers in commit messages
```

## Configuration

To enable automatic loading of this file, add to your `.ai-sdlc.json`:

```json
{
  "settingSources": ["project"]
}
```

## Testing

After creating `.claude/CLAUDE.md`, you can verify it's being loaded by checking for debug messages:

```bash
Debug: Found CLAUDE.md in project settings (.claude/CLAUDE.md)
```

## Best Practices

1. **Keep it focused**: Include only project-specific instructions that differ from general best practices
2. **Be specific**: Provide concrete examples rather than vague guidance
3. **Update regularly**: Review and update as project conventions evolve
4. **Version control**: Commit CLAUDE.md to your repository so all team members use the same instructions
5. **Reasonable size**: Keep the file under 1MB for optimal performance

## Priority

Remember that explicit `systemPrompt` configuration in code takes precedence over CLAUDE.md. The priority order is:

1. Explicit systemPrompt in code (highest)
2. Local settings (`.claude/settings.local.json`)
3. Project settings (`.claude/settings.json` and `CLAUDE.md`)
4. User settings (`~/.claude/settings.json`) (lowest)
