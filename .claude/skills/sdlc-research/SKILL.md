---
name: sdlc-research
description: Use when researching how to implement a feature, analyzing codebase patterns, investigating existing implementations, exploring dependencies, or finding relevant code for a user story.
---

# SDLC Research Skill

This skill provides guidance for conducting effective codebase research during the SDLC research phase.

## Overview

Research is the foundation of quality implementation. The goal is to deeply understand the codebase before writing any code, ensuring your implementation follows existing patterns and integrates seamlessly.

## Research Methodology

### Phase 1: Problem Understanding

Before exploring code, clarify what you're solving:

1. **Parse the requirements** - Extract the core need from the user story
2. **Identify key terms** - What domain concepts map to code elements?
3. **Clarify scope** - What IS being asked vs what is NOT being asked?

### Phase 2: Codebase Exploration

Use a codebase-first approach:

1. **Start at entry points** - Find where similar features begin (CLI commands, API routes, event handlers)
2. **Trace the data flow** - Follow how data moves through the system
3. **Identify boundaries** - Where does your feature touch existing modules?
4. **Find templates** - Look for similar implementations to use as patterns

### Phase 3: Pattern Recognition

Document patterns you discover:

- **Naming conventions** - How are files, functions, and variables named?
- **Error handling** - How do similar features handle errors?
- **Testing patterns** - How are similar features tested?
- **Configuration** - How are similar features configured?

### Phase 4: Dependency Mapping

Map what your changes will affect:

- **Direct dependencies** - What does your code need to import?
- **Reverse dependencies** - What existing code might need to change?
- **External dependencies** - Any npm packages or APIs needed?

### Phase 5: Knowledge Gap Documentation

Be explicit about uncertainties:

- What aspects need clarification from stakeholders?
- What existing code do you not fully understand?
- What alternative approaches might be worth considering?

## Output Structure

When documenting research findings, organize them as:

### Problem Summary
Restate the problem in your own words. What is the core goal?

### Codebase Context
Describe relevant architecture, patterns, and existing implementations. Reference specific files and line numbers.

### Files Requiring Changes

For each file that needs modification:
- **Path**: `path/to/file.ts:42`
- **Change Type**: Create New | Modify Existing | Delete
- **Reason**: Why this file needs to change
- **Specific Changes**: What aspects need modification
- **Dependencies**: What other changes must happen first

### Testing Strategy
- **Test Files to Modify**: Existing test files that need updates
- **New Tests Needed**: New test files or test cases required
- **Test Scenarios**: Specific scenarios to cover

### Additional Context
- Relevant patterns to follow
- Potential risks and breaking changes
- Performance considerations (if applicable)
- Security implications (if applicable)

## Quality Checklist

Before completing research:

- [ ] Identified at least 3-5 relevant files in the codebase
- [ ] Referenced specific line numbers, not just file names
- [ ] Found existing patterns to follow for consistency
- [ ] Documented the change surface area (all affected files)
- [ ] Considered test coverage requirements
- [ ] Noted potential risks or breaking changes

## Anti-Patterns to Avoid

1. **Abstract research** - Avoid vague statements like "the auth module handles this." Be specific: `src/auth/middleware.ts:45` handles JWT validation.

2. **Incomplete dependency mapping** - Don't miss reverse dependencies. If you change an interface, find all implementers.

3. **Skipping test analysis** - Always include testing strategy. How are similar features tested?

4. **Ignoring existing patterns** - Don't reinvent. Find how similar features were built and follow the pattern.

5. **Research without exploration** - Actually read the code, don't just grep for keywords.

## Tips for Effective Research

- **Use specific file references** - `src/core/story.ts:42-65` not "the story module"
- **Include code snippets** - Show the relevant patterns you found
- **Map the call chain** - Entry point → Service → Repository → Database
- **Document decisions** - Why this approach over alternatives?
- **Note tech debt** - Flag any issues you discover along the way
