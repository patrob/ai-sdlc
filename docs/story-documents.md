# Story Document Accuracy

## Folder Structure

Each story lives in its own folder under `stories/`:

```
stories/
└── S-0001/
    ├── story.md      # Core story: summary + acceptance criteria
    ├── research.md   # Research findings (populated by research agent)
    ├── plan.md       # Implementation plan (populated by planning agent)
    └── review.md     # Review notes (populated by review agent)
```

### File Purposes

- **story.md**: Lean file containing frontmatter, summary, and acceptance criteria. Status and metadata tracked in frontmatter.
- **research.md**: Codebase analysis and web research findings. Includes iteration headers for rework scenarios.
- **plan.md**: Step-by-step implementation plan with tasks. Includes iteration headers for refinement.
- **review.md**: Review feedback from code, security, and PO perspectives. Includes iteration headers for retries.

### Backward Compatibility

Existing stories with Research, Implementation Plan, and Review Notes sections in story.md continue to work. The system reads from section files first, falling back to story.md sections.

## Status Tracking

- Keep ONE current status section—remove or clearly mark outdated "Implementation Complete" claims
- Update build/test results after fixing issues—don't leave stale failure information
- Run `npm test` and verify output before claiming tests pass

## Implementation Notes

- Research, plan, and review outputs go to their respective files (research.md, plan.md, review.md)
- Do NOT create separate documentation files for implementation details beyond the story folder
