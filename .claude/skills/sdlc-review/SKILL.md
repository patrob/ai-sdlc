---
name: sdlc-review
description: Use when reviewing code, verifying implementations, checking security, validating acceptance criteria, or conducting code reviews for a completed implementation.
---

# SDLC Review Skill

This skill provides guidance for conducting comprehensive code reviews during the SDLC review phase.

## Overview

Review is the quality gate before code can be merged. A thorough review evaluates code from multiple perspectives: code quality, security, and requirements fulfillment.

## Review Methodology

### Three-Perspective Review

Evaluate every implementation from these three perspectives:

#### 1. Code Quality (Senior Developer Perspective)

Evaluate:
- Code quality and maintainability
- Following best practices and design patterns
- Potential bugs or logic errors
- Test coverage adequacy and test quality
- Error handling completeness
- Performance considerations

#### 2. Security (Security Engineer Perspective)

Evaluate:
- OWASP Top 10 vulnerabilities
- Input validation and sanitization
- Authentication and authorization issues
- Data exposure risks
- Command/SQL/code injection vulnerabilities
- Secure coding practices

#### 3. Requirements (Product Owner Perspective)

Evaluate:
- Does it meet the acceptance criteria stated in the story?
- Is the user experience appropriate and intuitive?
- Are edge cases and error scenarios handled?
- Is documentation adequate for users and maintainers?
- Does the implementation align with the story goals?

## Issue Severity Levels

### Blocker 🛑
Must be fixed before merging. Examples:
- Security vulnerabilities (injection, auth bypass)
- Data corruption risks
- Broken core functionality
- Missing critical acceptance criteria

### Critical ⚠️
Should be fixed before merging. Examples:
- Major bugs affecting significant use cases
- Poor practices with security implications
- Missing error handling for common failures
- Significant performance regressions

### Major 📋
Should be addressed soon. Examples:
- Code quality issues affecting maintainability
- Missing edge case handling
- Incomplete test coverage
- Minor security concerns

### Minor ℹ️
Nice to have improvements. Examples:
- Style inconsistencies
- Minor optimizations
- Additional documentation
- Code organization suggestions

## Issue Categories

When categorizing issues, use these standard categories:

| Category | Description |
|----------|-------------|
| `security` | Security vulnerabilities, injection risks, auth issues |
| `code_quality` | Maintainability, readability, patterns |
| `testing` | Test coverage, test quality, missing tests |
| `requirements` | Acceptance criteria not met, missing functionality |
| `performance` | Performance regressions, inefficient code |
| `build` | Build failures, compilation errors |
| `tdd_violation` | TDD cycle not followed correctly |

## Review Output Format

Structure review findings as:

```json
{
  "passed": true/false,
  "issues": [
    {
      "severity": "blocker" | "critical" | "major" | "minor",
      "category": "security" | "code_quality" | "testing" | etc,
      "description": "Detailed description of the issue",
      "file": "path/to/file.ts",
      "line": 42,
      "suggestedFix": "How to fix this issue",
      "perspectives": ["code", "security", "po"]
    }
  ]
}
```

## Pass/Fail Decision Matrix

| Condition | Decision |
|-----------|----------|
| Any blocker issues | FAIL |
| 2+ critical issues | FAIL |
| 1 critical + multiple major | Consider FAIL |
| Only major/minor issues | May PASS with notes |
| No blocking issues | PASS |

## TDD Validation (When Enabled)

If TDD mode was enabled for the story, validate that:

1. **RED phase completed** - Failing tests were written first
2. **GREEN phase completed** - Minimal code made tests pass
3. **REFACTOR phase completed** - Code was improved while keeping tests green
4. **No regressions** - All tests still pass after each cycle

TDD violations are categorized as `critical` issues.

## Deduplication Guidelines

**Critical:** Do NOT report the same underlying issue multiple times from different perspectives.

### Bad Example (Duplicate Issues)
```
Issue 1 (code): "No tests exist for login function"
Issue 2 (security): "Login function lacks test coverage for security scenarios"
Issue 3 (po): "Acceptance criteria not verifiable without tests"
```

### Good Example (Deduplicated)
```
Issue 1: "No tests exist for login function"
  - perspectives: ["code", "security", "po"]
  - suggestedFix: "Add unit tests covering happy path, invalid credentials, and rate limiting"
```

## Security Review Checklist

### Input Validation
- [ ] All user inputs are validated and sanitized
- [ ] File paths are validated (no path traversal)
- [ ] SQL queries use parameterized statements
- [ ] Shell commands use safe APIs (spawn, not exec with user input)

### Authentication & Authorization
- [ ] Auth checks on all protected routes
- [ ] Session management is secure
- [ ] Passwords are properly hashed (not stored plaintext)
- [ ] Tokens have appropriate expiration

### Data Protection
- [ ] Sensitive data is not logged
- [ ] Error messages don't leak internal details
- [ ] PII is handled according to policy
- [ ] Secrets are not hardcoded

### OWASP Top 10 Quick Check
- [ ] No injection vulnerabilities (SQL, command, LDAP)
- [ ] Proper authentication mechanisms
- [ ] Sensitive data encrypted in transit and at rest
- [ ] XML/JSON parsers configured securely
- [ ] Access control properly implemented

## Code Quality Checklist

### Readability
- [ ] Functions have clear, single responsibilities
- [ ] Variable names are descriptive
- [ ] Complex logic is commented
- [ ] No magic numbers (use named constants)

### Maintainability
- [ ] Follows existing codebase patterns
- [ ] DRY principle applied (no significant duplication)
- [ ] Dependencies are properly managed
- [ ] Configuration is externalized appropriately

### Error Handling
- [ ] Errors are caught and handled appropriately
- [ ] Error messages are helpful and actionable
- [ ] Failures don't expose sensitive information
- [ ] Recovery paths exist where appropriate

### Testing
- [ ] Unit tests exist for new functionality
- [ ] Edge cases are tested
- [ ] Tests are deterministic (no flaky tests)
- [ ] Test code follows same quality standards as production

## Requirements Review Checklist

### Acceptance Criteria
- [ ] Each AC has been addressed
- [ ] Behavior matches the "Given-When-Then" scenarios
- [ ] Edge cases mentioned in AC are handled
- [ ] Default behaviors are sensible

### User Experience
- [ ] Error messages are user-friendly
- [ ] Feedback is provided for long operations
- [ ] Behavior is intuitive and predictable
- [ ] Documentation is updated if needed

### Completeness
- [ ] No "TODO" or "FIXME" comments for required features
- [ ] All planned files were created/modified
- [ ] No temporary/debug code left behind
- [ ] Feature is complete, not partially implemented

## Tips for Effective Reviews

1. **Be specific** - "Line 42 has SQL injection risk" not "Security issues exist"

2. **Provide fixes** - Don't just identify problems, suggest solutions

3. **Prioritize correctly** - Security issues trump style issues

4. **Check the diff** - Focus on changed code, not unrelated existing issues

5. **Verify tests pass** - Build and tests must pass before detailed review

6. **Consider context** - Is this a quick fix or major feature? Adjust depth accordingly

7. **Be constructive** - Goal is better code, not criticism
