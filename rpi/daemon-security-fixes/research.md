# Research: Security Fixes for daemon-block-max-retries

## 1. Problem Overview

### Clear Problem Statement
The daemon-block-max-retries feature implementation was rejected in code review due to three security concerns:
1. **XSS/ANSI Injection** - User-controlled review feedback displayed/logged without sanitization
2. **Log Injection** - Console logging includes unsanitized user-controlled strings
3. **Bounds Checking** - Numeric values (retry_count, max_retries) lack validation

### Key Objectives
- Fix all security concerns raised in the code review
- Apply sanitization at ALL output points (following CLAUDE.md guidance)
- Maintain consistency with existing security patterns in the codebase
- Add comprehensive test coverage for security fixes

### Success Criteria
- All user-controlled strings are sanitized before display/logging
- Numeric values have bounds checking (0-999)
- Tests pass (`npm test`)
- Build succeeds (`npm run build`)
- Code review security concerns resolved

## 2. Web Research Findings

### Security Best Practices for CLI Tools

#### Log Injection Prevention
- **Source**: [Snyk: Prevent Log Injection](https://snyk.io/blog/prevent-log-injection-vulnerability-javascript-node-js/)
- **Solution**: Sanitize inputs by replacing newlines with spaces, removing control characters
- **Pattern**:
```typescript
function sanitizeForLogging(text: string): string {
  return text
    .replace(/[\r\n]+/g, ' ')              // Normalize newlines
    .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F-\x9F]/g, ''); // Remove control chars
}
```

#### ANSI Escape Code Sanitization
- **Source**: [MCP Security: ANSI Escape Code Injection](https://modelcontextprotocol-security.io/ttps/prompt-injection/ansi-escape-injection/)
- **Risk**: ANSI sequences can hide malicious instructions, manipulate cursor, create fake links
- **Solution**: Use Node.js built-in `util.stripVTControlCharacters()` (Node 16.17+) or regex:
```typescript
function sanitizeForTerminal(text: string): string {
  return text
    .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')  // ANSI CSI sequences
    .replace(/\x1b\][0-9;]*\x07/g, '')      // OSC sequences
    .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F-\x9F]/g, '');
}
```

#### Numeric Bounds Validation
- **Source**: [TypeScript.tv: Defensive Coding](https://typescript.tv/best-practices/avoid-errors-with-defensive-coding-in-typescript/)
- **Pattern**: Use `Math.max/min` for clamping, check `Number.isFinite()` and `Number.isInteger()`
```typescript
const safeValue = Math.max(0, Math.min(Number(value) || 0, 999));
```

### Key Recommendation
Apply **defense in depth** - sanitize at BOTH input/extraction points AND storage points. This ensures malicious data is caught even if one layer is bypassed.

## 3. Codebase Analysis

### Existing Security Infrastructure
The codebase already has comprehensive security patterns:

1. **`src/cli/formatting.ts`** (line 225):
   - `sanitizeInput(text: string)`: Strips ANSI codes, normalizes Unicode, enforces 10K limit
   - `stripAnsiCodes(text: string)`: Removes terminal control sequences
   - Applied at ALL display points in table rendering

2. **`src/agents/review.ts`** (lines 85-99):
   - `sanitizeCommandOutput()`: Strips ANSI, control chars, redacts secrets
   - `sanitizeErrorMessage()`: Removes paths, stack traces

3. **`src/cli/commands.ts`** (line 1095):
   - `sanitizeStorySlug()`: Removes ANSI codes from slugs

### Problem Areas in Current Implementation

**File: `src/core/kanban.ts` (lines 160-187)**
```typescript
if (atMaxRetries) {
  const retryCount = story.frontmatter.retry_count || 0;  // No bounds check
  const maxRetries = getEffectiveMaxRetries(story, config);
  const latestReview = getLatestReviewAttempt(story);
  const lastFailureSummary = latestReview?.feedback.substring(0, 100) || 'unknown';  // NOT sanitized
  const reason = `Max review retries (${retryCount}/${maxRetries}) reached - last failure: ${lastFailureSummary}`;

  try {
    moveToBlocked(story.path, reason);
    console.log(`Story ${story.frontmatter.id} blocked: ${reason}`);  // Unsanitized output
  } catch (error) {
    console.error(`Failed to move story ${story.frontmatter.id} to blocked:`, error);  // Path leakage
  }
}
```

**Vulnerabilities Identified:**
- Line 165: `lastFailureSummary` from feedback without sanitization
- Lines 162-163: `retryCount` and `maxRetries` not bounds-checked
- Line 173: `console.log()` outputs unsanitized reason
- Line 176: `console.error()` could leak sensitive path info

### Same Pattern in Refinement Blocking (lines 126-152)
The refinement blocking code has the same issues and needs identical fixes for consistency.

## 4. Proposed Solution Approach

### High-Level Strategy
1. Create `sanitizeReasonText()` utility function in `story.ts`
2. Apply sanitization at extraction points in `kanban.ts`
3. Apply bounds checking for numeric values
4. Sanitize at storage point in `moveToBlocked()`
5. Add comprehensive test coverage

### Implementation Order
1. **story.ts** - Add `sanitizeReasonText()` function
2. **story.ts** - Sanitize in `moveToBlocked()` storage
3. **kanban.ts** - Fix review retry blocking (lines 160-187)
4. **kanban.ts** - Fix refinement blocking (lines 126-152)
5. **Tests** - Add security test cases

### Technology Choices
- **No new dependencies** - Use existing regex patterns from `formatting.ts`
- Reuse ANSI stripping pattern already proven in codebase
- Add YAML-specific sanitization for frontmatter storage

## 5. Example Code Snippets

### sanitizeReasonText() Function
```typescript
/**
 * Sanitizes text for safe YAML storage and terminal display.
 * Removes ANSI codes, control characters, and YAML special chars.
 */
export function sanitizeReasonText(text: string): string {
  if (!text) return '';

  let sanitized = text
    // Strip ANSI escape sequences (CSI and OSC)
    .replace(/\x1B\[[^a-zA-Z\x1B]*[a-zA-Z]?|\x1B\][^\x1B]*|\x1B|[\x00-\x08\x0B-\x0C\x0E-\x1A\x1C-\x1F\x7F-\x9F]/g, '')
    // Replace newlines/tabs with spaces
    .replace(/[\n\r\t]/g, ' ')
    // Remove YAML special characters
    .replace(/[`|>]/g, '')
    // Remove remaining control characters
    .replace(/[\x00-\x1F\x7F-\x9F]/g, '');

  // Normalize Unicode
  sanitized = sanitized.normalize('NFC');

  // Enforce max length (200 chars)
  if (sanitized.length > 200) {
    sanitized = sanitized.substring(0, 197) + '...';
  }

  return sanitized.trim();
}
```

### Bounds-Checked Extraction
```typescript
// Bounds checking for numeric values
const retryCount = Math.max(0, Math.min(Number(story.frontmatter.retry_count) || 0, 999));
const maxRetries = Math.max(0, Math.min(getEffectiveMaxRetries(story, config), 999));

// Sanitize feedback
const latestReview = getLatestReviewAttempt(story);
const rawFeedback = latestReview?.feedback || 'unknown';
const sanitizedFeedback = sanitizeReasonText(rawFeedback);
const lastFailureSummary = sanitizedFeedback.substring(0, 100);
```

### Sanitized Logging
```typescript
// Safe console output
console.log(`Story ${sanitizeReasonText(story.frontmatter.id || 'unknown')} blocked: Max review retries (${retryCount}/${maxRetries}) reached`);

// Safe error handling
const errorMsg = error instanceof Error ? error.message : 'Unknown error';
console.error(`Failed to move story ${sanitizeReasonText(story.frontmatter.id || 'unknown')} to blocked: ${sanitizeReasonText(errorMsg)}`);
```

## 6. Next Steps

### Prerequisites
- None - existing codebase patterns are sufficient

### Implementation Order
1. Add `sanitizeReasonText()` to `src/core/story.ts`
2. Add unit tests for `sanitizeReasonText()` in `story.test.ts`
3. Apply sanitization to review retry blocking in `kanban.ts` (lines 160-187)
4. Apply same pattern to refinement blocking in `kanban.ts` (lines 126-152)
5. Sanitize at storage point in `story.ts moveToBlocked()`
6. Add integration tests in `kanban.test.ts` and `kanban-max-retries.test.ts`

### Testing Considerations
- Test ANSI escape sequence removal
- Test newline/control character handling
- Test bounds checking edge cases (negative, huge numbers, NaN, Infinity)
- Test empty/null/undefined inputs
- Test max length enforcement
- Verify existing tests still pass after sanitization

### Files to Modify
| File | Change Type | Lines |
|------|-------------|-------|
| `src/core/story.ts` | Add function | +30 |
| `src/core/story.ts` | Sanitize storage | ~line 115 |
| `src/core/kanban.ts` | Fix retry blocking | lines 160-187 |
| `src/core/kanban.ts` | Fix refinement blocking | lines 126-152 |
| `src/core/story.test.ts` | Add unit tests | +50 |
| `src/core/kanban.test.ts` | Add security tests | +40 |
| `tests/integration/kanban-max-retries.test.ts` | Add integration tests | +30 |

### Risk Mitigations
- Run `npm test` after each change to catch regressions early
- Focus on tests that verify blocked reason format
- Keep sanitization rules minimal to avoid over-sanitization
