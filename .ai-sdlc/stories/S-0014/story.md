---
id: S-0014
title: Enhance research agent with codebase-first approach
priority: 5
status: in-progress
type: feature
created: '2026-01-10'
labels:
  - s
research_complete: true
plan_complete: true
implementation_complete: false
reviews_complete: false
updated: '2026-01-16'
slug: enhance-research-agent-with-codebase-first-approac
worktree_path: >-
  /Users/probinson/Repos/on-par/pocs/ai-sdlc/.ai-sdlc/worktrees/S-0014-enhance-research-agent-with-codebase-first-approac
branch: ai-sdlc/enhance-research-agent-with-codebase-first-approac
last_test_run:
  passed: true
  failures: 0
  timestamp: '2026-01-16T16:30:51.759Z'
implementation_retry_count: 0
---
I'll refine this story into a well-defined, actionable user story with clear acceptance criteria and testable outcomes.

---

# Enhance research agent with codebase-first approach

## User Story

**As a** developer using the ai-sdlc workflow,  
**I want** the research agent to deeply analyze the existing codebase using structured investigation patterns,  
**So that** I get comprehensive, actionable research output that identifies all relevant files, dependencies, and patterns before implementation begins.

## Summary

The current research agent provides basic codebase context. This enhancement will adopt sophisticated prompting patterns from the `codebase-solution-researcher` agent (RPI plugin) to produce structured, thorough research output that traces dependencies, identifies affected files, and provides a clear foundation for planning and implementation.

**Reference**: `/Users/probinson/.claude/plugins/cache/on-par/rpi/0.6.0/agents/codebase-solution-researcher.md`

## Acceptance Criteria

- [ ] Research agent's system prompt is updated with codebase-solution-researcher patterns (structured investigation approach, comprehensive file analysis)
- [ ] Research output includes all required structured sections:
  - [ ] Problem Summary (clear statement of what needs to be researched)
  - [ ] Codebase Context (existing patterns, architecture, related implementations)
  - [ ] Files Requiring Changes (identified files with rationale for each)
  - [ ] Testing Strategy (relevant test files, patterns to follow)
  - [ ] Additional Context (constraints, dependencies, edge cases)
- [ ] `gatherCodebaseContext()` function performs deeper analysis:
  - [ ] Traces import/export dependencies for relevant files
  - [ ] Identifies architectural patterns used in similar features
  - [ ] Locates related test files and testing patterns
  - [ ] Discovers configuration files or constants that may be affected
- [ ] Research output is written to story file's `## Research` section (maintains existing behavior)
- [ ] All existing tests pass (`npm test` with 0 failures)
- [ ] New unit tests cover enhanced `gatherCodebaseContext()` functionality
- [ ] `npm run build` succeeds with no type errors

Excellent! Now I have a great understanding of the structure used in RPI research documents. Let me compile a comprehensive research report:

# Research: Enhance research agent with codebase-first approach

## 1. Problem Overview

### Problem Statement
The current research agent (`src/agents/research.ts`) provides basic codebase context by reading project files (package.json, tsconfig.json, directory structure) and source file lists. However, it lacks the depth and structured analysis needed to produce comprehensive, actionable research output that fully prepares downstream agents (planning, implementation) for their work.

### Key Objectives
- Enhance the research agent's system prompt with sophisticated investigation patterns from the `codebase-solution-researcher` agent
- Implement deeper codebase analysis in `gatherCodebaseContext()` function to trace dependencies, identify patterns, and discover related files
- Structure research output into clear sections: Problem Summary, Codebase Context, Files Requiring Changes, Testing Strategy, Additional Context
- Maintain backward compatibility with existing story file format and downstream agent expectations

### Success Criteria
- Research output includes all structured sections as defined in acceptance criteria
- `gatherCodebaseContext()` performs dependency tracing, pattern identification, and related file discovery
- All existing tests continue to pass (`npm test` with 0 failures)
- New unit tests cover enhanced functionality
- TypeScript compilation succeeds (`npm run build`)
- Research completes within reasonable time (<2 minutes for typical stories)

## 2. Codebase Analysis

### Current Research Agent Implementation

**File: `src/agents/research.ts`**

**Current System Prompt** (lines 9-18):
\`\`\`typescript
const RESEARCH_SYSTEM_PROMPT = `You are a technical research specialist. Your job is to research how to implement a user story by analyzing the existing codebase and external best practices.

When researching a story, you should:
1. Identify relevant existing code patterns in the codebase
2. Suggest which files/modules need to be modified
3. Research external best practices if applicable
4. Identify potential challenges or risks
5. Note any dependencies or prerequisites

Output your research findings in markdown format. Be specific about file paths and code patterns.`;
\`\`\`

**Current gatherCodebaseContext()** (lines 259-314):
The function currently:
- Reads common project files (package.json, tsconfig.json, pyproject.toml, etc.) - first 1000 chars only
- Lists top-level directories and files (excluding hidden dirs and node_modules)
- Globs source files (`src/**/*.{ts,js,py,go,rs}`) and returns first 20 file paths
- Returns concatenated context string

**Limitations:**
- No dependency tracing (imports/exports)
- No pattern identification from existing code
- No test file discovery
- No configuration file analysis beyond project metadata
- Shallow analysis (1000 char limit, 20 file limit)
- No architectural insights

### Affected Files

| File | Change Type | Purpose |
|------|-------------|---------|
| `src/agents/research.ts` | **Modify** | Update `RESEARCH_SYSTEM_PROMPT` with structured investigation instructions |
| `src/agents/research.ts` | **Modify** | Enhance `gatherCodebaseContext()` with dependency tracing, pattern discovery |
| `src/agents/research.test.ts` | **Modify** | Add unit tests for enhanced context gathering |
| `tests/integration/research-web.test.ts` | **Review** | Verify integration tests still pass with enhanced output |

### Existing Patterns to Follow

**1. Agent System Prompt Pattern** (Reference: `src/agents/planning.ts`, lines 11-20):
\`\`\`typescript
export const PLANNING_SYSTEM_PROMPT = `You are a technical planning specialist. Your job is to create detailed, step-by-step implementation plans for user stories.

When creating a plan, you should:
1. Break the work into phases (setup, implementation, testing, etc.)
2. Create specific, actionable tasks within each phase
3. Use checkbox format for tracking progress
4. Consider test-driven development (write tests first)
5. Include verification steps

Output your plan in markdown format with checkboxes. Each task should be small enough to complete in one focused session.`;
\`\`\`

**Pattern to adopt:** Clear role definition, numbered instructions, specific output format requirements

**2. Structured Research Output Pattern** (Reference: RPI research files):
From `rpi/worktree-config/research.md` and `rpi/daemon-security-fixes/research.md`, the structure is:
- **Section 1: Problem Overview** - Clear problem statement, objectives, success criteria
- **Section 2: Web Research Findings** (optional for codebase-only research)
- **Section 3: Codebase Analysis** - Affected files table, existing patterns, problem areas
- **Section 4: Proposed Solution Approach** - High-level strategy, implementation order
- **Section 5: Example Code Snippets** - Concrete examples when helpful

**3. File System Analysis Pattern** (Reference: `src/agents/research.ts`, lines 263-314):
Current pattern uses:
- `fs.existsSync()` and `fs.readFileSync()` for file reading
- `glob()` from 'glob' package for pattern matching
- Try-catch blocks to gracefully handle missing files

**Enhancement opportunities:**
- Use `Grep` tool for finding imports/references
- Use `Read` tool for deeper file analysis
- Use `Glob` with more sophisticated patterns to find test files

**4. Security Pattern** (Reference: `src/agents/research.ts`, lines 390-498):
- `sanitizeCodebaseContext()` - Escapes triple backticks, removes ANSI codes, validates UTF-8 boundaries
- `sanitizeWebResearchContent()` - Removes ANSI, control chars, normalizes Unicode
- `sanitizeForLogging()` - Replaces newlines, truncates for log safety

**Pattern to follow:** Sanitize all external content before including in prompts or storing in files

### Technology Stack Available

**File System Operations:**
- `fs` (Node.js built-in) - Currently used for file reading
- `glob` package - Currently used for pattern matching
- `path` (Node.js built-in) - Path manipulation

**Agent SDK Tools** (Available via `runAgentQuery`):
- `Glob` - Pattern-based file discovery
- `Grep` - Content search for imports/exports/patterns
- `Read` - Read specific files for analysis
- `LSP` - Language server protocol for symbol navigation (if available)

**Note:** The research agent itself doesn't directly call these tools - it provides context to the LLM agent which has access to these tools via the Claude Agent SDK.

## 3. Enhanced Research Approach

### Structured System Prompt Enhancement

**New System Prompt Structure:**
\`\`\`typescript
const RESEARCH_SYSTEM_PROMPT = `You are a technical research specialist. Your job is to deeply analyze the existing codebase and produce comprehensive, structured research findings that prepare downstream agents for implementation.

## Investigation Methodology

### Phase 1: Understand the Problem
1. Parse the story requirements and acceptance criteria
2. Identify the core technical challenge
3. Determine scope and affected systems

### Phase 2: Codebase Analysis (Use SDK Tools)
1. **Pattern Discovery** - Find similar existing implementations
   - Use Glob to find files matching patterns (e.g., "**/*agent*.ts")
   - Use Grep to search for relevant functions, classes, interfaces
   - Read 3-5 most relevant files to understand patterns

2. **Dependency Analysis** - Trace import/export relationships
   - Grep for imports of key modules (e.g., "import.*from.*story")
   - Identify shared utilities and types
   - Map dependency chains for affected files

3. **Test Pattern Discovery** - Locate related tests
   - Glob for test files (e.g., "**/*.test.ts", "tests/**/*.ts")
   - Read test files to understand testing patterns
   - Identify test utilities and fixtures

4. **Configuration Discovery** - Find relevant config files
   - Check for type definitions, constants, validation functions
   - Identify configuration patterns to follow

### Phase 3: Architecture Understanding
1. Identify architectural patterns (e.g., agent pattern, config pattern)
2. Note conventions (naming, file organization, error handling)
3. Discover constraints (security, performance, compatibility)

## Output Format (REQUIRED STRUCTURE)

Your research MUST be structured with these sections:

### 1. Problem Overview
- **Problem Statement**: Clear summary of what needs to be researched
- **Key Objectives**: Bulleted list of goals
- **Success Criteria**: How to verify the research is complete

### 2. Codebase Analysis
- **Affected Files**: Table with columns: File | Change Type | Purpose
- **Existing Patterns to Follow**: Code examples with line references
- **Technology Stack**: List relevant libraries/tools/patterns

### 3. Files Requiring Changes
For each file:
- **File path**: Exact location
- **Change rationale**: Why this file needs modification
- **Modification type**: Create | Modify | Review
- **Complexity estimate**: Trivial | Simple | Moderate | Complex

### 4. Testing Strategy
- **Existing Test Patterns**: Describe test structure in codebase
- **Test Files to Create/Modify**: List with purpose
- **Test Coverage Targets**: What to test

### 5. Additional Context
- **Dependencies**: External libraries or internal modules needed
- **Edge Cases**: Potential gotchas or special conditions
- **Performance Considerations**: If relevant
- **Security Considerations**: If handling user input, external data, etc.

## Tool Usage Guidelines

- **Glob**: Use for pattern-based file discovery (e.g., "**/*config*.ts")
- **Grep**: Use for content search (imports, function definitions, usage patterns)
- **Read**: Use to analyze 3-5 most relevant files in depth
- **LSP**: Use if available for precise symbol navigation

## Quality Standards

- Include specific file paths with line numbers when referencing code
- Provide concrete code examples from the codebase
- Identify at least 3-5 relevant existing files
- Refere

## Constraints & Edge Cases

**Constraints:**
- Must maintain compatibility with existing story file format (markdown sections)
- Research output must remain machine-readable for downstream agents (planning, implementation)
- Cannot introduce external dependencies beyond existing stack (Claude Agent SDK, existing tools)
- Must respect project file hygiene rules (no temp files, no shell scripts)

**Edge Cases:**
- Story requests research on new feature with no existing similar code → Research should acknowledge this and suggest starting patterns from closest analogous features
- Very large codebases → May need to limit depth of dependency tracing or use sampling strategies
- Research for modifications to core types/interfaces → Must identify all downstream consumers
- External dependencies without source → Document API surface from usage patterns

## Technical Considerations

1. **Prompting Strategy**: Study the referenced `codebase-solution-researcher.md` for:
   - Instruction structure and ordering
   - Output format specifications
   - Depth-of-analysis directives

2. **Tool Usage**: Leverage existing CLI tools effectively:
   - `Glob` for pattern-based file discovery
   - `Grep` for usage/reference tracing
   - `Read` for in-depth file analysis
   - `LSP` (if available) for symbol navigation

3. **Testing Approach**: 
   - Unit test `gatherCodebaseContext()` with fixture codebases
   - Integration test full research execution flow with mocked file system
   - Verify structured output format is parseable and complete

4. **Performance**: Research should complete in reasonable time (<2 minutes for typical stories)

## Definition of Done

- [ ] Code review completed
- [ ] All tests passing (`npm test` shows 0 failures)
- [ ] TypeScript compilation succeeds (`npm run build`)
- [ ] Manual verification: Research output for a sample story includes all structured sections
- [ ] No temporary files created during development

---

**effort:** medium

**labels:** enhancement, agent-improvement, research-agent, code-quality

## Implementation Plan

# Implementation Plan: Enhance research agent with codebase-first approach

## Phase 1: Setup & Analysis
- [ ] Read and analyze the reference `codebase-solution-researcher.md` file from RPI plugin
- [ ] Read current `src/agents/research.ts` to understand existing implementation
- [ ] Read current `src/agents/research.test.ts` to understand test patterns
- [ ] Read `src/agents/planning.ts` to understand agent system prompt patterns
- [ ] Document key differences between current research agent and target behavior

## Phase 2: System Prompt Enhancement
- [ ] Update `RESEARCH_SYSTEM_PROMPT` in `src/agents/research.ts` with structured investigation methodology
- [ ] Add Phase 1: Understand the Problem instructions
- [ ] Add Phase 2: Codebase Analysis instructions (Pattern Discovery, Dependency Analysis, Test Pattern Discovery, Configuration Discovery)
- [ ] Add Phase 3: Architecture Understanding instructions
- [ ] Define required output format structure (5 sections: Problem Overview, Codebase Analysis, Files Requiring Changes, Testing Strategy, Additional Context)
- [ ] Add tool usage guidelines (Glob, Grep, Read, LSP)
- [ ] Add quality standards and specificity requirements
- [ ] Verify prompt follows existing agent patterns (clear role, numbered steps, output format)

## Phase 3: Enhanced Context Gathering - Write Tests First (TDD)
- [ ] Create unit tests for dependency tracing functionality in `src/agents/research.test.ts`
- [ ] Create unit tests for pattern identification functionality
- [ ] Create unit tests for test file discovery functionality
- [ ] Create unit tests for configuration file analysis functionality
- [ ] Create unit tests for architectural pattern detection
- [ ] Verify all new tests fail appropriately (red phase of TDD)

## Phase 4: Enhanced Context Gathering - Implementation
- [ ] Enhance `gatherCodebaseContext()` to trace import/export dependencies
  - [ ] Add function to scan source files for import statements
  - [ ] Map dependency relationships between key files
- [ ] Add pattern identification logic
  - [ ] Scan for similar agent implementations
  - [ ] Identify common utility patterns
  - [ ] Detect architectural patterns (e.g., agent pattern, config pattern)
- [ ] Add test file discovery logic
  - [ ] Glob for `**/*.test.ts` and `tests/**/*.ts`
  - [ ] Map test files to corresponding source files
  - [ ] Identify test utilities and fixtures
- [ ] Add configuration file analysis
  - [ ] Discover type definitions and constants
  - [ ] Identify configuration patterns
- [ ] Increase analysis depth limits (currently 1000 chars, 20 files)
  - [ ] Adjust limits based on research needs vs performance
- [ ] Apply security sanitization to all new context data using existing `sanitizeCodebaseContext()`

## Phase 5: Output Structure Validation
- [ ] Verify research output includes Problem Overview section
- [ ] Verify research output includes Codebase Analysis section with Affected Files table
- [ ] Verify research output includes Files Requiring Changes section
- [ ] Verify research output includes Testing Strategy section
- [ ] Verify research output includes Additional Context section
- [ ] Ensure output remains markdown-formatted for story file compatibility
- [ ] Ensure output remains machine-readable for downstream agents

## Phase 6: Test Verification & Fixes
- [ ] Run all unit tests (`npm test`) - verify new tests pass (green phase of TDD)
- [ ] Run TypeScript compiler (`npm run build`) - fix any type errors
- [ ] Review integration tests in `tests/integration/research-web.test.ts`
- [ ] Verify integration tests pass with enhanced research output
- [ ] Fix any test failures following test-failure-handling guidelines
- [ ] Ensure no test failures remain before proceeding

## Phase 7: Manual Verification & Edge Cases
- [ ] Run research agent on sample story (use existing story or create test story)
- [ ] Verify research output contains all 5 required sections
- [ ] Verify research completes within 2 minutes for typical story
- [ ] Test edge case: Story with no similar existing code
- [ ] Test edge case: Story affecting core types/interfaces
- [ ] Test edge case: Very large codebase (verify performance remains acceptable)
- [ ] Verify no temporary files created during research execution

## Phase 8: Documentation & Cleanup
- [ ] Update inline code comments in `src/agents/research.ts` for enhanced functions
- [ ] Verify no temporary/scratch files exist in project root
- [ ] Verify no shell scripts created during development
- [ ] Update this story file with final implementation notes in Research section

## Phase 9: Final Verification
- [ ] Run `make verify` to ensure all checks pass
- [ ] Run `npm test` - confirm 0 failures
- [ ] Run `npm run build` - confirm successful compilation
- [ ] Review all modified files for adherence to CLAUDE.md guidelines (DRY, SOLID, security patterns)
- [ ] Verify story status accurately reflects completion state
- [ ] Confirm all acceptance criteria are met

---

## Files to Create or Modify

### Modify
- `src/agents/research.ts` - Update system prompt and enhance `gatherCodebaseContext()`
- `src/agents/research.test.ts` - Add unit tests for enhanced context gathering

### Review (No changes expected, but verify compatibility)
- `tests/integration/research-web.test.ts` - Verify integration tests pass
- `src/types/index.ts` - Confirm no type changes needed
- `src/cli/commands.ts` - Confirm research action handler remains compatible

---

## Testing Strategy

### Unit Tests (src/agents/research.test.ts)
- Test dependency tracing identifies imports correctly
- Test pattern identification finds similar implementations
- Test test file discovery locates relevant test files
- Test configuration file analysis discovers config patterns
- Test sanitization applied to all context data
- Test graceful handling of missing files/directories

### Integration Tests (tests/integration/research-web.test.ts)
- Verify existing integration tests pass with enhanced output
- Verify research output structure contains all required sections
- Verify downstream agents can parse enhanced research output

### Manual Verification
- Run research on sample story and inspect output quality
- Verify performance (research completes in <2 minutes)
- Test edge cases (no similar code, core type changes, large codebase)

---

## Success Criteria Checklist
- [ ] Research agent system prompt includes structured investigation patterns
- [ ] Research output includes all 5 required sections
- [ ] `gatherCodebaseContext()` performs dependency tracing
- [ ] `gatherCodebaseContext()` identifies architectural patterns
- [ ] `gatherCodebaseContext()` locates related test files
- [ ] `gatherCodebaseContext()` discovers configuration files
- [ ] Research output written to story file's `## Research` section
- [ ] All existing tests pass (`npm test` with 0 failures)
- [ ] New unit tests cover enhanced functionality
- [ ] `npm run build` succeeds with no type errors
- [ ] `make verify` passes


### Implementation Notes (2026-01-16)

I need permission to read files to begin the implementation. Let me wait for access.
