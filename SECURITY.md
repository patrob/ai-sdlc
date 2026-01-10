# Security Policy

## Supported Versions

The following versions of this project are currently supported with security updates:

| Version | Supported          |
| ------- | ------------------ |
| 1.x     | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

We take security seriously and appreciate the community's help in identifying and reporting vulnerabilities responsibly.

### How to Report

Please report security vulnerabilities by using GitHub's Security Advisory feature:

1. Go to the project repository
2. Click the "Security" tab
3. Select "Report a vulnerability" or "Advisories"
4. Follow the guided process to submit your report

Alternatively, if you prefer not to use GitHub's interface, you may email security details to the maintainers (contact information available in the README.md).

**Do not open a public issue for security vulnerabilities.**

### What to Include

When reporting a vulnerability, please provide:

- A clear description of the vulnerability
- Steps to reproduce (if applicable)
- Potential impact assessment
- Suggested remediation (if you have one)
- Your contact information for follow-up questions

### Response Timeline

We commit to the following response times:

- **Initial acknowledgment**: Within 48 hours of report submission
- **Status updates**: At least weekly until the issue is resolved
- **Resolution target**: Actively work toward a fix; timeline depends on severity

Severity levels:

- **Critical**: Remote code execution, authentication bypass - fix within days
- **High**: Significant security impact - fix within 1-2 weeks
- **Medium**: Limited impact or requiring specific conditions - fix within 1 month
- **Low**: Minor issues, defense-in-depth improvements - fix in next release

## Responsible Disclosure

We request that you:

- Give us reasonable time to develop and release a fix before public disclosure
- Avoid accessing or modifying data that isn't yours
- Avoid disrupting service availability
- Conduct testing only in authorized environments

We commit to:

- Working diligently to understand and address reported vulnerabilities
- Keeping you informed of our progress
- Providing credit for the discovery (if desired)
- Not taking legal action against researchers following responsible disclosure

## Public Disclosure

Once a fix is available and released, we will:

1. Publish a security advisory describing the vulnerability and impact
2. Credit the reporter (unless anonymity is requested)
3. Provide guidance on upgrading or applying the fix

We ask that you allow us to coordinate the timing of public disclosure and will typically disclose 7-14 days after a fix is released.

## Security Best Practices

When using this project:

- Keep your version up to date
- Review and follow the project's documentation
- Report any security concerns immediately rather than delaying
- Use appropriate security practices in your own implementation

## Security Implementation Details

### Command Injection Prevention

#### Configuration Commands (`testCommand`, `buildCommand`)

The system validates and sanitizes all command strings in configuration files:

**Whitelist of Allowed Executables:**
- `npm`, `yarn`, `pnpm` - Node.js package managers
- `node`, `npx` - Node.js runtime and package executor
- `bun` - Alternative JavaScript runtime
- `make` - Build automation tool
- `mvn`, `gradle` - Java build tools

**Validation Rules:**
1. Only whitelisted executables are allowed
2. Dangerous shell metacharacters are rejected: `;`, `|`, `&`, `` ` ``, `$()`, `${}`
3. Commands containing these patterns will be removed from configuration with a warning

**Example - Valid Configuration:**
```json
{
  "testCommand": "npm test",
  "buildCommand": "npm run build"
}
```

**Example - Invalid Configuration (Rejected):**
```json
{
  "testCommand": "npm test; curl malicious.com",
  "buildCommand": "npm run build && rm -rf /"
}
```

#### Git Branch Names

Branch names are validated to prevent command injection in git operations:

**Allowed characters:** Alphanumeric, hyphens (`-`), underscores (`_`), forward slashes (`/`)

**Pattern:** `/^[a-zA-Z0-9/_-]+$/`

#### Shell Command Execution

1. **No shell interpretation:** Commands are executed without `shell: true` to prevent shell injection
2. **Argument escaping:** When shell execution is required (e.g., for `gh` CLI), arguments are properly escaped
3. **Path validation:** Working directories are validated to prevent path traversal attacks

### Path Traversal Prevention

Working directory paths are validated before any file operations:

1. Must be absolute paths
2. Cannot contain `../` or `..\` sequences
3. Must exist and be an actual directory
4. Path normalization applied using `path.resolve()`

### Input Sanitization

#### Command Output

All command output (test results, build output) is sanitized before display:

1. **ANSI escape codes** are stripped (prevents terminal manipulation)
2. **Control characters** are removed (except newlines and tabs)
3. **Potential secrets** are redacted:
   - API keys matching pattern: `(api_key|token|password|secret)=<value>`
   - Long alphanumeric strings after sensitive keywords are replaced with `[REDACTED]`

#### Error Messages

Error messages are sanitized to prevent information leakage:

1. Absolute paths are replaced with `[PROJECT_ROOT]`
2. Home directory paths are replaced with `~`
3. Stack traces are truncated (only first 3 lines kept)
4. Environment variable values are not exposed

### LLM Response Validation

Review responses from LLM agents are validated using Zod schemas to prevent malicious or malformed JSON from causing issues.

**Benefits:**
- Prevents malformed JSON from causing crashes
- Enforces field length limits to prevent memory exhaustion
- Validates data types to prevent type confusion attacks
- Rejects unexpected fields

### Timeout Limits

Configuration timeout values are enforced with hard limits:

- **Minimum:** 5 seconds (5,000ms)
- **Maximum:** 1 hour (3,600,000ms)
- **Invalid values** (NaN, Infinity, negative) are rejected

This prevents:
- Resource exhaustion from excessively long timeouts
- Premature failures from too-short timeouts
- Denial of service attacks

### Environment Variable Validation

Environment variable overrides are strictly validated:

#### `AGENTIC_SDLC_MAX_RETRIES`
- Must be an integer between 0 and 10
- Invalid values are ignored with a warning
- Overrides are logged for audit trail

#### `AGENTIC_SDLC_AUTO_COMPLETE` / `AGENTIC_SDLC_AUTO_RESTART`
- Must be exactly `"true"` or `"false"` (strings)
- Other values are rejected
- Overrides are logged

### Prototype Pollution Prevention

Configuration parsing includes checks for prototype pollution attempts. Objects with `__proto__`, `constructor`, or `prototype` properties are rejected.

## Configuration Security Guidelines

### 1. Limit Command Scope

Only use whitelisted executables in your configuration. Use npm scripts in `package.json` to chain commands instead of shell operators.

### 2. Validate Branch Names

Use only alphanumeric characters, hyphens, and slashes in branch names.

### 3. Review Configuration Files

Treat `.agentic-sdlc.json` as security-sensitive:

1. Review changes in pull requests
2. Don't copy configuration from untrusted sources
3. Validate commands before committing

### 4. Monitor Logs

The system logs warnings for security-related issues. Review logs regularly for suspicious activity.

## Security Changelog

### 2026-01-10 - Security Hardening Release

- **Added:** Command validation with executable whitelist
- **Added:** Git branch name validation
- **Added:** Shell argument escaping for PR creation
- **Added:** Working directory path validation
- **Added:** Zod schema validation for LLM responses
- **Added:** Command output sanitization (ANSI, secrets)
- **Added:** Error message sanitization
- **Fixed:** Removed `shell: true` from spawn() calls
- **Fixed:** Enforced hard limits on timeout values (5s - 1hr)
- **Fixed:** Enhanced environment variable validation (strict type checking)
- **Removed:** Deprecated `runVerification()` function

## Compliance

This project follows security best practices including:

- **OWASP Top 10** mitigation strategies
- **CWE-78** (OS Command Injection) prevention
- **CWE-22** (Path Traversal) prevention
- **CWE-94** (Code Injection) prevention
- **CWE-400** (Resource Exhaustion) prevention

---

For additional questions about security, please reach out to the maintainers.
