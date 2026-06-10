/**
 * Maximum input length to prevent DoS attacks.
 * Set to 10,000 chars to accommodate long research findings
 * while preventing memory exhaustion from malicious inputs.
 */
const MAX_INPUT_LENGTH = 10000;

/**
 * Maximum log string length for readability and security.
 * Prevents log injection and maintains log file readability.
 */
const MAX_LOG_LENGTH = 200;

/**
 * Sanitize web research content for safe storage and display.
 * Removes ANSI escape sequences, control characters, and potential injection vectors.
 *
 * Security rationale: Web research content comes from external sources (LLM, web tools)
 * and must be sanitized before storage to prevent:
 * - ANSI injection (terminal control sequence attacks)
 * - Markdown injection (malicious formatting)
 * - Control character injection (null bytes, bell characters, etc.)
 *
 * @param text - Raw web research content from external source
 * @returns Sanitized text safe for storage in markdown files
 */
export function sanitizeWebResearchContent(text: string): string {
  if (!text) return '';

  // Enforce maximum length to prevent DoS
  if (text.length > MAX_INPUT_LENGTH) {
    text = text.substring(0, MAX_INPUT_LENGTH);
  }

  // Remove ANSI CSI sequences (colors, cursor movement) - e.g., \x1B[31m
  text = text.replace(/\x1B\[[^a-zA-Z\x1B]*[a-zA-Z]?/g, '');

  // Remove OSC sequences (hyperlinks, window titles) - terminated by BEL (\x07) or ST (\x1B\\)
  text = text.replace(/\x1B\][^\x07]*\x07/g, '');
  text = text.replace(/\x1B\][^\x1B]*\x1B\\/g, '');

  // Remove any remaining standalone escape characters
  text = text.replace(/\x1B/g, '');

  // Remove control characters (0x00-0x08, 0x0B-0x0C, 0x0E-0x1F, 0x7F-0x9F)
  text = text.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F-\x9F]/g, '');

  // Normalize Unicode to prevent homograph attacks and ensure consistent representation
  text = text.normalize('NFC');

  // Validate markdown structure - escape dangerous patterns
  // Triple backticks could be used to break out of code blocks
  text = text.replace(/```/g, '\\`\\`\\`');

  return text;
}

/**
 * Sanitize text for logging to prevent log injection attacks.
 * Replaces newlines with spaces and truncates for readability.
 *
 * Security rationale: Log injection attacks use newlines to inject fake log entries.
 * By replacing newlines with spaces, we ensure each log() call produces exactly one log line.
 *
 * @param text - Raw text that will be logged
 * @returns Sanitized text safe for logging (single line, truncated)
 */
export function sanitizeForLogging(text: string): string {
  if (!text) return '';

  // Remove ANSI escape sequences
  text = text.replace(/\x1B\[[^a-zA-Z\x1B]*[a-zA-Z]?/g, '');
  text = text.replace(/\x1B\][^\x07]*\x07/g, '');
  text = text.replace(/\x1B\][^\x1B]*\x1B\\/g, '');
  text = text.replace(/\x1B/g, '');

  // Replace newlines and carriage returns with spaces to prevent log injection
  text = text.replace(/[\n\r]/g, ' ');

  // Truncate to reasonable length for logs
  if (text.length > MAX_LOG_LENGTH) {
    text = text.substring(0, MAX_LOG_LENGTH) + '...';
  }

  return text.trim();
}

/**
 * Sanitize codebase context before including in LLM prompts.
 * Escapes dangerous patterns that could cause prompt injection.
 *
 * Security rationale: Codebase files may contain malicious content from:
 * - Compromised dependencies
 * - Malicious commits
 * - Untrusted contributors
 *
 * We must prevent prompt injection by escaping patterns that could:
 * - Terminate the prompt early (triple backticks)
 * - Inject commands or instructions
 * - Confuse the LLM's understanding of structure
 *
 * @param text - Raw codebase context
 * @returns Sanitized text safe for LLM prompts
 */
export function sanitizeCodebaseContext(text: string): string {
  if (!text) return '';

  // Remove ANSI escape sequences
  text = text.replace(/\x1B\[[^a-zA-Z\x1B]*[a-zA-Z]?/g, '');
  text = text.replace(/\x1B\][^\x07]*\x07/g, '');
  text = text.replace(/\x1B\][^\x1B]*\x1B\\/g, '');
  text = text.replace(/\x1B/g, '');

  // Escape triple backticks to prevent breaking out of code blocks
  text = text.replace(/```/g, '\\`\\`\\`');

  // Validate UTF-8 boundaries at truncation points
  // If we need to truncate, ensure we don't split multi-byte characters
  if (text.length > MAX_INPUT_LENGTH) {
    // Use substring which is UTF-16 safe, then validate
    let truncated = text.substring(0, MAX_INPUT_LENGTH);

    // Check if we split a surrogate pair (0xD800-0xDFFF)
    const lastCharCode = truncated.charCodeAt(truncated.length - 1);
    if (lastCharCode >= 0xD800 && lastCharCode <= 0xDFFF) {
      // We split a surrogate pair, remove the incomplete character
      truncated = truncated.substring(0, truncated.length - 1);
    }

    text = truncated;
  }

  return text;
}
