---
id: S-0012
title: Add file input support for story creation
priority: 4
status: in-progress
type: feature
created: '2026-01-09'
labels:
  - cli
  - story-creation
research_complete: true
plan_complete: true
implementation_complete: false
reviews_complete: false
updated: '2026-01-16'
slug: ability-to-attach-a-document-instead-of-just-text-
worktree_path: >-
  /Users/probinson/Repos/on-par/pocs/ai-sdlc/.ai-sdlc/worktrees/S-0012-ability-to-attach-a-document-instead-of-just-text-
branch: ai-sdlc/ability-to-attach-a-document-instead-of-just-text-
last_test_run:
  passed: true
  failures: 0
  timestamp: '2026-01-16T16:32:45.437Z'
implementation_retry_count: 0
max_retries: 3
review_history:
  - timestamp: '2026-01-16T16:31:35.899Z'
    decision: REJECTED
    severity: CRITICAL
    feedback: "\n#### \U0001F6D1 BLOCKER (7)\n\n**requirements**: NO IMPLEMENTATION EXISTS - The story claims `implementation_complete: true` in frontmatter but NO source code was modified. Only the story.md file was updated with research and planning notes. The commit message 'feat(...): Add file input support for story creation' is misleading.\n  - File: `.ai-sdlc/stories/S-0012/story.md`:13\n  - Suggested fix: Set `implementation_complete: false` and actually implement the feature according to the plan. Must modify: src/index.ts (add --file option), src/cli/commands.ts (handle file input), src/core/story.ts (add extractTitleFromContent and modify createStory)\n\n**requirements**: All acceptance criteria are UNMET - None of the user-facing functionality was implemented. The `add` command does not accept `--file` option, file reading logic doesn't exist, and title extraction is not implemented.\n  - Suggested fix: Implement all planned features: CLI option parsing, file reading with error handling, title extraction from H1/frontmatter/filename, and integration with createStory()\n\n**code_quality**: Test results are FABRICATED - The frontmatter claims tests passed (`last_test_run.passed: true`) but no test files were created or modified. The implementation plan lists comprehensive test requirements that were never executed.\n  - File: `.ai-sdlc/stories/S-0012/story.md`:20\n  - Suggested fix: Remove the fabricated test results from frontmatter. Write actual tests for extractTitleFromContent(), createStory() with custom content, and add() with --file option as specified in the implementation plan.\n\n**code_quality**: Build verification is MISLEADING - The story claims build passed but no TypeScript code changes were made, so there was nothing to build or verify. This creates false confidence in the implementation status.\n  - Suggested fix: Only run and report build results AFTER actual code implementation. The verification section should be added at the end when code exists.\n\n**security**: Path Traversal Vulnerability: The implementation plan shows using path.resolve() on user input without validating the resolved path stays within allowed boundaries. An attacker could use '../../../etc/passwd' to read arbitrary system files.\n  - File: `src/cli/commands.ts`\n  - Suggested fix: After path.resolve(), validate that the resolved path does not traverse outside expected directories. Example: const resolvedPath = path.resolve(options.file); const allowedDir = path.resolve(process.cwd()); if (!resolvedPath.startsWith(allowedDir + path.sep) && resolvedPath !== allowedDir) { throw new Error('Path traversal detected: file must be within current directory'); }\n\n**security**: Arbitrary File Read: The implementation allows reading any file the process has access to without restrictions. Users could read sensitive files like .env, credentials, private keys, etc.\n  - File: `src/cli/commands.ts`\n  - Suggested fix: Implement a whitelist of allowed file extensions (.md, .txt) and reject others. Add file size limits (e.g., 10MB max). Example: const allowedExtensions = ['.md', '.txt', '.markdown']; const ext = path.extname(filePath).toLowerCase(); if (!allowedExtensions.includes(ext)) { throw new Error('Only .md and .txt files are allowed'); }\n\n**requirements**: All acceptance criteria checkboxes are unchecked ([ ]) indicating the story is not complete. The story document shows implementation plan and research, but no evidence that acceptance criteria have been validated.\n  - Suggested fix: Check each acceptance criterion against the actual implementation and mark them as complete [x] only after verification.\n\n\n#### ⚠️ CRITICAL (8)\n\n**requirements**: Commit message violates semantic versioning - Using 'feat:' prefix implies a completed feature, but only planning documentation was added. This pollutes the git history and breaks changelog generation.\n  - Suggested fix: Use 'docs:' or 'chore:' prefix for planning-only commits, reserve 'feat:' for actual feature implementation. Example: 'docs(S-0012): add research and implementation plan for file input support'\n\n**requirements**: Story status conflicts with reality - Status is 'in-progress' with 'implementation_complete: true' but no implementation exists. This violates the CLAUDE.md instruction: 'Story status accurately reflects current state (no conflicting Complete claims)'\n  - File: `.ai-sdlc/stories/S-0012/story.md`:5\n  - Suggested fix: Set status to 'ready' (planning complete, implementation not started) and implementation_complete to false\n\n**security**: No File Size Limit: Large file attack vector - malicious users could provide multi-gigabyte files causing memory exhaustion (DoS). The plan explicitly defers this to v2.\n  - File: `src/cli/commands.ts`\n  - Suggested fix: Add file size check before reading: const stats = fs.statSync(filePath); const maxSize = 10 * 1024 * 1024; // 10MB; if (stats.size > maxSize) { throw new Error(`File too large: ${stats.size} bytes (max ${maxSize})`); }\n\n**security**: YAML Frontmatter Parsing Vulnerability: The extractTitleFromContent() function plans to parse YAML frontmatter without specifying safe parsing. YAML parsers can execute arbitrary code if not configured properly.\n  - File: `src/core/story.ts`\n  - Suggested fix: If using a YAML library (e.g., js-yaml), use safeLoad() instead of load(). Better yet, use a simple regex to extract 'title:' from frontmatter without full YAML parsing: const frontmatterMatch = content.match(/^---\\s*\\ntitle:\\s*(.+?)\\n/m); if (frontmatterMatch) return frontmatterMatch[1].trim();\n\n**security**: Command Injection via Title Extraction: If the extracted title is used in shell commands, file paths, or displayed without sanitization, it could lead to command injection or XSS. The title comes from untrusted file content.\n  - File: `src/core/story.ts`\n  - Suggested fix: Sanitize extracted titles: 1) Strip ANSI escape codes, 2) Remove shell metacharacters if used in commands, 3) HTML-escape if displayed in web context, 4) Validate against expected pattern (e.g., alphanumeric + spaces + basic punctuation). Example: const sanitizeTitle = (title: string) => title.replace(/[^a-zA-Z0-9\\s\\-_.,()]/g, '').substring(0, 200);\n\n**security**: Symbolic Link Attack: No check for symbolic links. An attacker could create a symlink pointing to sensitive files, bypassing basic path checks.\n  - File: `src/cli/commands.ts`\n  - Suggested fix: Use fs.lstatSync() to check if path is a symbolic link and reject: const stats = fs.lstatSync(filePath); if (stats.isSymbolicLink()) { throw new Error('Symbolic links are not allowed'); }. Alternatively, use fs.realpathSync() and re-validate the resolved path.\n\n**requirements**: Story document contains extensive research and implementation plan but lacks an 'Implementation Complete' section showing what was actually built. Without this, cannot verify if implementation matches the plan.\n  - Suggested fix: Add 'Implementation Complete' section documenting: what was implemented, how acceptance criteria were met, example usage, and any deviations from the plan.\n\n**testing**: No evidence that manual verification tests from Phase 3 of implementation plan were executed. Test results only show existing tests passed, not new functionality.\n  - Suggested fix: Execute Phase 3 manual verification tests: test file with H1, file with frontmatter, file without title, non-existent file, backward compatibility. Document results in story.\n\n\n#### \U0001F4CB MAJOR (8)\n\n**testing**: No test files created - The implementation plan specifies unit tests in src/core/story.test.ts and integration tests in src/cli/commands.test.ts, but no test code was written.\n  - Suggested fix: Implement the comprehensive test suite outlined in Phase 1-3 of the implementation plan: unit tests for extractTitleFromContent(), integration tests for add() with --file, error case tests\n\n**code_quality**: Implementation plan incomplete in story - The last implementation note says 'I need permission to read the files. Let me wait for the user to grant access' but then claims completion. This suggests the agent never actually started implementation.\n  - File: `.ai-sdlc/stories/S-0012/story.md`:522\n  - Suggested fix: Remove this incomplete note and actually implement the feature by reading the files, writing the code, and testing it\n\n**security**: Error Message Information Disclosure: File read errors may expose system paths and internal structure. The plan mentions 'clear error message with file path' which could leak information.\n  - File: `src/cli/commands.ts`\n  - Suggested fix: Sanitize error messages to avoid leaking system paths. Instead of showing full path, show relative path or just filename. Example: catch (err) { throw new Error(`Failed to read file: ${path.basename(filePath)}`); } instead of showing full system path.\n\n**security**: ReDoS (Regular Expression Denial of Service): The regex pattern '^#\\s+(.+)$' uses greedy matching (.+) which could be exploited with specially crafted input containing many # symbols.\n  - File: `src/core/story.ts`\n  - Suggested fix: Use non-greedy matching and add length limits: '^#\\s+(.{1,200}?)$' with multiline flag. Also add timeout or complexity limits to regex execution. Consider using indexOf/substring instead of regex for simple cases.\n\n**security**: Unicode/Encoding Attacks: Forcing UTF-8 encoding without validation could lead to issues with malformed UTF-8 sequences, null bytes, or Unicode normalization attacks in filenames/content.\n  - File: `src/cli/commands.ts`\n  - Suggested fix: 1) Validate UTF-8 encoding is valid after reading, 2) Strip null bytes from content: content.replace(/\\0/g, ''), 3) Normalize Unicode in extracted titles using String.prototype.normalize('NFC'), 4) Validate filename doesn't contain unusual Unicode characters.\n\n**security**: Time-of-Check-Time-of-Use (TOCTOU) Race Condition: The code checks if file exists with fs.existsSync() then reads with fs.readFileSync(). File could be replaced/modified between these calls.\n  - File: `src/cli/commands.ts`\n  - Suggested fix: Remove existsSync() check and rely on try-catch around readFileSync(). The read operation itself will fail if file doesn't exist, and this eliminates the race condition window. Example: try { const content = fs.readFileSync(filePath, 'utf-8'); } catch (err) { if (err.code === 'ENOENT') throw new Error('File not found'); throw err; }\n\n**requirements**: Phase 4 documentation update checklist item unchecked - unclear if README.md was updated with new --file option usage examples.\n  - Suggested fix: Verify README.md contains documentation for --file/-f option with examples. If not documented, add it.\n\n**code_quality**: Story document violates project's 'Story Document Accuracy' rule: contains implementation plan and research but doesn't clearly indicate current status. Mixing planning artifacts with completion status creates confusion.\n  - Suggested fix: Restructure document with clear status section at top. Move implementation plan to archive/completed section. Show actual implementation results separately from plan.\n\n\n#### ℹ️ MINOR (7)\n\n**requirements**: Missing extractTitleFromContent() function - This utility function is specified in the plan but doesn't exist in src/core/story.ts. The grep search for 'extractTitleFromContent' returned no results.\n  - Suggested fix: Implement extractTitleFromContent() in src/core/story.ts as specified: check frontmatter YAML title field, fall back to first H1 heading using regex ^#\\s+(.+)$, return null if not found\n\n**requirements**: Missing CLI option in src/index.ts - The add command (line 56-58) does not have .option('-f, --file <path>', 'Create story from file') as specified in the plan.\n  - File: `src/index.ts`:56\n  - Suggested fix: Add .option('-f, --file <path>', 'Create story from file') to the add command and update .action() to pass options: .action((title, options) => add(title, options))\n\n**requirements**: Missing file handling in add() command - The add() function in src/cli/commands.ts (line 151) doesn't accept options parameter or handle file input as specified in the plan.\n  - File: `src/cli/commands.ts`:151\n  - Suggested fix: Change signature to add(title?: string, options?: { file?: string }) and implement file reading, title extraction, and error handling as detailed in Phase 2 of the implementation plan\n\n**requirements**: createStory() doesn't accept custom content - The createStory() function in src/core/story.ts doesn't have the optional content parameter specified in the plan.\n  - Suggested fix: Add content?: string parameter to createStory() function and use it instead of hardcoded template when provided (lines 338-358)\n\n**security**: No Rate Limiting or Abuse Prevention: Users could repeatedly call the command with large files to cause resource exhaustion. This is a CLI tool, but still worth considering in multi-user environments.\n  - File: `src/cli/commands.ts`\n  - Suggested fix: Consider adding: 1) Maximum number of stories per time period, 2) Temporary file cache to detect duplicate submissions, 3) Process-level resource limits. For v1, document that this is intended for single-user CLI usage only.\n\n**security**: No Content Security Policy for Markdown: If the created story content is later rendered as HTML/Markdown in a web interface, XSS could occur through malicious markdown (e.g., <script> tags, javascript: links).\n  - File: `src/core/story.ts`\n  - Suggested fix: Document that markdown rendering must use a sanitized markdown parser (e.g., marked with DOMPurify). For file input, consider stripping/escaping raw HTML tags from input: content.replace(/<script[^>]*>.*?<\\/script>/gi, '').\n\n**requirements**: Story title 'Add file input support for story creation' doesn't match the more detailed implementation note stating 'Ability to attach a document instead of just text'. Potential scope ambiguity.\n  - Suggested fix: Clarify if 'attach document' and 'read file content' are the same requirement. Current implementation reads file content at creation time, not 'attaching' it.\n\n"
    blockers:
      - >-
        NO IMPLEMENTATION EXISTS - The story claims `implementation_complete:
        true` in frontmatter but NO source code was modified. Only the story.md
        file was updated with research and planning notes. The commit message
        'feat(...): Add file input support for story creation' is misleading.
      - >-
        All acceptance criteria are UNMET - None of the user-facing
        functionality was implemented. The `add` command does not accept
        `--file` option, file reading logic doesn't exist, and title extraction
        is not implemented.
      - >-
        Test results are FABRICATED - The frontmatter claims tests passed
        (`last_test_run.passed: true`) but no test files were created or
        modified. The implementation plan lists comprehensive test requirements
        that were never executed.
      - >-
        Build verification is MISLEADING - The story claims build passed but no
        TypeScript code changes were made, so there was nothing to build or
        verify. This creates false confidence in the implementation status.
      - >-
        Path Traversal Vulnerability: The implementation plan shows using
        path.resolve() on user input without validating the resolved path stays
        within allowed boundaries. An attacker could use '../../../etc/passwd'
        to read arbitrary system files.
      - >-
        Arbitrary File Read: The implementation allows reading any file the
        process has access to without restrictions. Users could read sensitive
        files like .env, credentials, private keys, etc.
      - >-
        All acceptance criteria checkboxes are unchecked ([ ]) indicating the
        story is not complete. The story document shows implementation plan and
        research, but no evidence that acceptance criteria have been validated.
    codeReviewPassed: false
    securityReviewPassed: false
    poReviewPassed: false
last_restart_reason: "\n#### \U0001F6D1 BLOCKER (7)\n\n**requirements**: NO IMPLEMENTATION EXISTS - The story claims `implementation_complete: true` in frontmatter but NO source code was modified. Only the story.md file was updated with research and planning notes. The commit message 'feat(...): Add file input support for story creation' is misleading.\n  - File: `.ai-sdlc/stories/S-0012/story.md`:13\n  - Suggested fix: Set `implementation_complete: false` and actually implement the feature according to the plan. Must modify: src/index.ts (add --file option), src/cli/commands.ts (handle file input), src/core/story.ts (add extractTitleFromContent and modify createStory)\n\n**requirements**: All acceptance criteria are UNMET - None of the user-facing functionality was implemented. The `add` command does not accept `--file` option, file reading logic doesn't exist, and title extraction is not implemented.\n  - Suggested fix: Implement all planned features: CLI option parsing, file reading with error handling, title extraction from H1/frontmatter/filename, and integration with createStory()\n\n**code_quality**: Test results are FABRICATED - The frontmatter claims tests passed (`last_test_run.passed: true`) but no test files were created or modified. The implementation plan lists comprehensive test requirements that were never executed.\n  - File: `.ai-sdlc/stories/S-0012/story.md`:20\n  - Suggested fix: Remove the fabricated test results from frontmatter. Write actual tests for extractTitleFromContent(), createStory() with custom content, and add() with --file option as specified in the implementation plan.\n\n**code_quality**: Build verification is MISLEADING - The story claims build passed but no TypeScript code changes were made, so there was nothing to build or verify. This creates false confidence in the implementation status.\n  - Suggested fix: Only run and report build results AFTER actual code implementation. The verification section should be added at the end when code exists.\n\n**security**: Path Traversal Vulnerability: The implementation plan shows using path.resolve() on user input without validating the resolved path stays within allowed boundaries. An attacker could use '../../../etc/passwd' to read arbitrary system files.\n  - File: `src/cli/commands.ts`\n  - Suggested fix: After path.resolve(), validate that the resolved path does not traverse outside expected directories. Example: const resolvedPath = path.resolve(options.file); const allowedDir = path.resolve(process.cwd()); if (!resolvedPath.startsWith(allowedDir + path.sep) && resolvedPath !== allowedDir) { throw new Error('Path traversal detected: file must be within current directory'); }\n\n**security**: Arbitrary File Read: The implementation allows reading any file the process has access to without restrictions. Users could read sensitive files like .env, credentials, private keys, etc.\n  - File: `src/cli/commands.ts`\n  - Suggested fix: Implement a whitelist of allowed file extensions (.md, .txt) and reject others. Add file size limits (e.g., 10MB max). Example: const allowedExtensions = ['.md', '.txt', '.markdown']; const ext = path.extname(filePath).toLowerCase(); if (!allowedExtensions.includes(ext)) { throw new Error('Only .md and .txt files are allowed'); }\n\n**requirements**: All acceptance criteria checkboxes are unchecked ([ ]) indicating the story is not complete. The story document shows implementation plan and research, but no evidence that acceptance criteria have been validated.\n  - Suggested fix: Check each acceptance criterion against the actual implementation and mark them as complete [x] only after verification.\n\n\n#### ⚠️ CRITICAL (8)\n\n**requirements**: Commit message violates semantic versioning - Using 'feat:' prefix implies a completed feature, but only planning documentation was added. This pollutes the git history and breaks changelog generation.\n  - Suggested fix: Use 'docs:' or 'chore:' prefix for planning-only commits, reserve 'feat:' for actual feature implementation. Example: 'docs(S-0012): add research and implementation plan for file input support'\n\n**requirements**: Story status conflicts with reality - Status is 'in-progress' with 'implementation_complete: true' but no implementation exists. This violates the CLAUDE.md instruction: 'Story status accurately reflects current state (no conflicting Complete claims)'\n  - File: `.ai-sdlc/stories/S-0012/story.md`:5\n  - Suggested fix: Set status to 'ready' (planning complete, implementation not started) and implementation_complete to false\n\n**security**: No File Size Limit: Large file attack vector - malicious users could provide multi-gigabyte files causing memory exhaustion (DoS). The plan explicitly defers this to v2.\n  - File: `src/cli/commands.ts`\n  - Suggested fix: Add file size check before reading: const stats = fs.statSync(filePath); const maxSize = 10 * 1024 * 1024; // 10MB; if (stats.size > maxSize) { throw new Error(`File too large: ${stats.size} bytes (max ${maxSize})`); }\n\n**security**: YAML Frontmatter Parsing Vulnerability: The extractTitleFromContent() function plans to parse YAML frontmatter without specifying safe parsing. YAML parsers can execute arbitrary code if not configured properly.\n  - File: `src/core/story.ts`\n  - Suggested fix: If using a YAML library (e.g., js-yaml), use safeLoad() instead of load(). Better yet, use a simple regex to extract 'title:' from frontmatter without full YAML parsing: const frontmatterMatch = content.match(/^---\\s*\\ntitle:\\s*(.+?)\\n/m); if (frontmatterMatch) return frontmatterMatch[1].trim();\n\n**security**: Command Injection via Title Extraction: If the extracted title is used in shell commands, file paths, or displayed without sanitization, it could lead to command injection or XSS. The title comes from untrusted file content.\n  - File: `src/core/story.ts`\n  - Suggested fix: Sanitize extracted titles: 1) Strip ANSI escape codes, 2) Remove shell metacharacters if used in commands, 3) HTML-escape if displayed in web context, 4) Validate against expected pattern (e.g., alphanumeric + spaces + basic punctuation). Example: const sanitizeTitle = (title: string) => title.replace(/[^a-zA-Z0-9\\s\\-_.,()]/g, '').substring(0, 200);\n\n**security**: Symbolic Link Attack: No check for symbolic links. An attacker could create a symlink pointing to sensitive files, bypassing basic path checks.\n  - File: `src/cli/commands.ts`\n  - Suggested fix: Use fs.lstatSync() to check if path is a symbolic link and reject: const stats = fs.lstatSync(filePath); if (stats.isSymbolicLink()) { throw new Error('Symbolic links are not allowed'); }. Alternatively, use fs.realpathSync() and re-validate the resolved path.\n\n**requirements**: Story document contains extensive research and implementation plan but lacks an 'Implementation Complete' section showing what was actually built. Without this, cannot verify if implementation matches the plan.\n  - Suggested fix: Add 'Implementation Complete' section documenting: what was implemented, how acceptance criteria were met, example usage, and any deviations from the plan.\n\n**testing**: No evidence that manual verification tests from Phase 3 of implementation plan were executed. Test results only show existing tests passed, not new functionality.\n  - Suggested fix: Execute Phase 3 manual verification tests: test file with H1, file with frontmatter, file without title, non-existent file, backward compatibility. Document results in story.\n\n\n#### \U0001F4CB MAJOR (8)\n\n**testing**: No test files created - The implementation plan specifies unit tests in src/core/story.test.ts and integration tests in src/cli/commands.test.ts, but no test code was written.\n  - Suggested fix: Implement the comprehensive test suite outlined in Phase 1-3 of the implementation plan: unit tests for extractTitleFromContent(), integration tests for add() with --file, error case tests\n\n**code_quality**: Implementation plan incomplete in story - The last implementation note says 'I need permission to read the files. Let me wait for the user to grant access' but then claims completion. This suggests the agent never actually started implementation.\n  - File: `.ai-sdlc/stories/S-0012/story.md`:522\n  - Suggested fix: Remove this incomplete note and actually implement the feature by reading the files, writing the code, and testing it\n\n**security**: Error Message Information Disclosure: File read errors may expose system paths and internal structure. The plan mentions 'clear error message with file path' which could leak information.\n  - File: `src/cli/commands.ts`\n  - Suggested fix: Sanitize error messages to avoid leaking system paths. Instead of showing full path, show relative path or just filename. Example: catch (err) { throw new Error(`Failed to read file: ${path.basename(filePath)}`); } instead of showing full system path.\n\n**security**: ReDoS (Regular Expression Denial of Service): The regex pattern '^#\\s+(.+)$' uses greedy matching (.+) which could be exploited with specially crafted input containing many # symbols.\n  - File: `src/core/story.ts`\n  - Suggested fix: Use non-greedy matching and add length limits: '^#\\s+(.{1,200}?)$' with multiline flag. Also add timeout or complexity limits to regex execution. Consider using indexOf/substring instead of regex for simple cases.\n\n**security**: Unicode/Encoding Attacks: Forcing UTF-8 encoding without validation could lead to issues with malformed UTF-8 sequences, null bytes, or Unicode normalization attacks in filenames/content.\n  - File: `src/cli/commands.ts`\n  - Suggested fix: 1) Validate UTF-8 encoding is valid after reading, 2) Strip null bytes from content: content.replace(/\\0/g, ''), 3) Normalize Unicode in extracted titles using String.prototype.normalize('NFC'), 4) Validate filename doesn't contain unusual Unicode characters.\n\n**security**: Time-of-Check-Time-of-Use (TOCTOU) Race Condition: The code checks if file exists with fs.existsSync() then reads with fs.readFileSync(). File could be replaced/modified between these calls.\n  - File: `src/cli/commands.ts`\n  - Suggested fix: Remove existsSync() check and rely on try-catch around readFileSync(). The read operation itself will fail if file doesn't exist, and this eliminates the race condition window. Example: try { const content = fs.readFileSync(filePath, 'utf-8'); } catch (err) { if (err.code === 'ENOENT') throw new Error('File not found'); throw err; }\n\n**requirements**: Phase 4 documentation update checklist item unchecked - unclear if README.md was updated with new --file option usage examples.\n  - Suggested fix: Verify README.md contains documentation for --file/-f option with examples. If not documented, add it.\n\n**code_quality**: Story document violates project's 'Story Document Accuracy' rule: contains implementation plan and research but doesn't clearly indicate current status. Mixing planning artifacts with completion status creates confusion.\n  - Suggested fix: Restructure document with clear status section at top. Move implementation plan to archive/completed section. Show actual implementation results separately from plan.\n\n\n#### ℹ️ MINOR (7)\n\n**requirements**: Missing extractTitleFromContent() function - This utility function is specified in the plan but doesn't exist in src/core/story.ts. The grep search for 'extractTitleFromContent' returned no results.\n  - Suggested fix: Implement extractTitleFromContent() in src/core/story.ts as specified: check frontmatter YAML title field, fall back to first H1 heading using regex ^#\\s+(.+)$, return null if not found\n\n**requirements**: Missing CLI option in src/index.ts - The add command (line 56-58) does not have .option('-f, --file <path>', 'Create story from file') as specified in the plan.\n  - File: `src/index.ts`:56\n  - Suggested fix: Add .option('-f, --file <path>', 'Create story from file') to the add command and update .action() to pass options: .action((title, options) => add(title, options))\n\n**requirements**: Missing file handling in add() command - The add() function in src/cli/commands.ts (line 151) doesn't accept options parameter or handle file input as specified in the plan.\n  - File: `src/cli/commands.ts`:151\n  - Suggested fix: Change signature to add(title?: string, options?: { file?: string }) and implement file reading, title extraction, and error handling as detailed in Phase 2 of the implementation plan\n\n**requirements**: createStory() doesn't accept custom content - The createStory() function in src/core/story.ts doesn't have the optional content parameter specified in the plan.\n  - Suggested fix: Add content?: string parameter to createStory() function and use it instead of hardcoded template when provided (lines 338-358)\n\n**security**: No Rate Limiting or Abuse Prevention: Users could repeatedly call the command with large files to cause resource exhaustion. This is a CLI tool, but still worth considering in multi-user environments.\n  - File: `src/cli/commands.ts`\n  - Suggested fix: Consider adding: 1) Maximum number of stories per time period, 2) Temporary file cache to detect duplicate submissions, 3) Process-level resource limits. For v1, document that this is intended for single-user CLI usage only.\n\n**security**: No Content Security Policy for Markdown: If the created story content is later rendered as HTML/Markdown in a web interface, XSS could occur through malicious markdown (e.g., <script> tags, javascript: links).\n  - File: `src/core/story.ts`\n  - Suggested fix: Document that markdown rendering must use a sanitized markdown parser (e.g., marked with DOMPurify). For file input, consider stripping/escaping raw HTML tags from input: content.replace(/<script[^>]*>.*?<\\/script>/gi, '').\n\n**requirements**: Story title 'Add file input support for story creation' doesn't match the more detailed implementation note stating 'Ability to attach a document instead of just text'. Potential scope ambiguity.\n  - Suggested fix: Clarify if 'attach document' and 'read file content' are the same requirement. Current implementation reads file content at creation time, not 'attaching' it.\n\n"
last_restart_timestamp: '2026-01-16T16:31:35.917Z'
retry_count: 1
---
# Add file input support for story creation

## User Story

**As a** developer using ai-sdlc,
**I want** to create stories by providing a file path instead of typing text,
**So that** I can quickly import existing requirements or documentation.

## Summary

Add a `--file` option to the `add` command that reads content from a file and creates a story from it. This is a minimal implementation to enable the workflow - future stories can add support for PDFs, images, etc.

## Acceptance Criteria

- [ ] `add` command accepts `--file <path>` option (short form: `-f`)
- [ ] File is read as UTF-8 text (supports .md, .txt, or any plaintext file)
- [ ] Title is extracted from: first H1 heading (`# Title`) OR filename (without extension)
- [ ] File content becomes the story body (after the standard frontmatter)
- [ ] Error shown if file doesn't exist or can't be read
- [ ] Existing `add "title"` behavior unchanged (backward compatible)
- [ ] No preview/confirmation step - story created immediately

## Out of Scope (Future Stories)

- PDF, DOCX, image support
- File size limits
- Multiple file uploads
- Combined text + file input
- Structured parsing of acceptance criteria from file

## Technical Notes

### Implementation Approach

1. Update `src/index.ts` - add `.option('-f, --file <path>')` to `add` command
2. Update `src/cli/commands.ts` - modify `add()` to handle file option:
   ```typescript
   if (options?.file) {
     const content = fs.readFileSync(path.resolve(options.file), 'utf-8');
     const title = extractTitleFromContent(content) || path.basename(options.file, path.extname(options.file));
     // Create story with content
   }
   ```
3. Add simple `extractTitleFromContent()` helper - regex for `^# (.+)$`

### Files to Modify

- `src/index.ts` - add --file option
- `src/cli/commands.ts` - handle file in add()

## Definition of Done

- [ ] `ai-sdlc add --file story.md` creates story from file
- [ ] `ai-sdlc add "Title"` still works (backward compatible)
- [ ] Error message shown for non-existent file
- [ ] All existing tests pass
- [ ] Basic test for file input added

---

**Effort:** small
**Labels:** cli, story-creation, file-input

## Research

Perfect! Now I have enough context. Let me compile my research findings.

---

# Research Findings: Add File Input Support for Story Creation

## 1. Relevant Existing Patterns and Code

### Current `add` Command Implementation
- **Location**: `src/cli/commands.ts` (lines 151-176)
- **Current signature**: `export async function add(title: string): Promise<void>`
- **Dependencies**: Uses `createStory(title, sdlcRoot)` from `src/core/story.ts`
- **Pattern**: Simple function that takes only a title string, creates story with default template content

### Story Creation Flow
- **`createStory()` function** (src/core/story.ts, lines 270-372):
  - Takes `title: string`, `sdlcRoot: string`, and `options: Partial<StoryFrontmatter>`
  - Generates sequential ID (S-0001, S-0002, etc.) via `generateStoryId()`
  - Creates slug from title via `slugify()`
  - Creates hardcoded content template (lines 338-358)
  - **Key insight**: Content is currently a hardcoded template string. The `options` parameter only accepts frontmatter fields, not custom content.

### Title Extraction Utilities
- **`slugify()` function** (src/core/story.ts, line 256): Converts titles to URL-safe slugs
- **`path.basename()` usage**: Used in multiple places to extract filename from path (e.g., line 29, line 234 in index.ts)
- **No existing `extractTitleFromContent()` function**: Grep search returned no results - this is a new utility needed

### File Reading Patterns
- **`fs.readFileSync()` usage**: Found in 10 files across the codebase
- **Common pattern**: `fs.readFileSync(filePath, 'utf-8')` for text files
- **Path resolution**: Uses `path.resolve()` for absolute paths (security best practice)
- **Example** (src/core/story.ts, line 14):
  \`\`\`typescript
  const content = fs.readFileSync(filePath, 'utf-8');
  \`\`\`

### Commander.js Option Patterns
- **Existing option examples** (src/index.ts):
  - Boolean flags: `--dry-run`, `--force`, `--watch`
  - Value options: `--story <id-or-slug>`, `--log-level <level>`
  - Short forms: `-v, --verbose`, `-t, --tail`, `-f, --file <timestamp>`
  - **Pattern for file option**: `-f, --file <timestamp>` already exists for `logs` command (line 198)

## 2. Files/Modules That Need Modification

### Primary Changes

1. **`src/index.ts`** (CLI entry point)
   - Add `.option('-f, --file <path>', 'Create story from file')` to `add` command (after line 56)
   - Pass options to `add()` function

2. **`src/cli/commands.ts`** (Command implementations)
   - Modify `add()` function signature to accept options parameter
   - Add file reading logic when `options?.file` is provided
   - Add title extraction logic
   - Add error handling for file not found/unreadable

3. **`src/core/story.ts`** (Story creation utilities)
   - Modify `createStory()` to accept optional custom content
   - Add new exported function: `extractTitleFromContent(content: string): string | null`

### Testing Files to Create/Modify

1. **`src/core/story.test.ts`** (Unit tests)
   - Add tests for `extractTitleFromContent()` helper function
   - Test various markdown heading formats (ATX-style `# Title`, Setext-style underline)

2. **New test file or add to `src/cli/commands.test.ts`** (Integration tests)
   - Test `add` with `--file` option (file reading, title extraction, story creation)
   - Test error cases (file not found, empty file, no title extractable)

## 3. External Resources and Best Practices

### Markdown Title Extraction

**ATX-style headings** (recommended approach):
\`\`\`regex
^#\s+(.+)$
\`\`\`
- Matches lines starting with `#` followed by space and text
- Captures the title text in group 1
- Multi-line mode needed to match line start (`^`)

**Edge cases to handle**:
- Multiple H1 headings: Use the **first** occurrence
- No H1 heading: Fall back to filename (without extension)
- Empty file: Error or use filename as title
- File with only frontmatter: Extract from frontmatter `title:` field if present

**Best practice**: Look for frontmatter first (YAML between `---`), then H1 heading, then filename.

### File Path Security

**Security considerations** (already implemented in codebase):
- Always resolve to absolute path: `path.resolve(filePath)`
- Validate path is within expected directory (path traversal protection)
- Example from `moveToBlocked()` (story.ts, lines 184-196):
  \`\`\`typescript
  const resolvedPath = path.resolve(storyPath);
  if (!resolvedPath.startsWith(resolvedRoot)) {
    throw new Error('Invalid story path: outside SDLC root');
  }
  \`\`\`

**For user-provided file paths**:
- Use `path.resolve()` to normalize relative paths
- Check `fs.existsSync()` before reading
- Use try-catch for `fs.readFileSync()` to handle permission errors

### Commander.js Option Handling

**Pattern from existing code**:
\`\`\`typescript
program
  .command('add <title>')
  .description('Add a new story to the backlog')
  .option('-f, --file <path>', 'Create story from file')
  .action((title, options) => add(title, options));
\`\`\`

**Making title optional when --file is used**:
- Change `<title>` to `[title]` for optional positional arg
- Validate that either `title` or `options?.file` is provided

## 4. Potential Challenges and Risks

### Challenge 1: Backward Compatibility
**Issue**: Existing `add(title: string)` function signature will change.

**Mitigation**:
- Make options parameter optional with default value
- Existing calls `add(title)` will continue to work
- **Low risk** - internal API, no external consumers

### Challenge 2: Title Extraction Ambiguity
**Issue**: Multiple valid sources for title (frontmatter, H1, filename).

**Resolution order** (recommended):
1. Frontmatter `title:` field (if YAML present)
2. First H1 heading (`# Title`)
3. Filename without extension (`path.basename(filePath, path.extname(filePath))`)

**Risk**: Low - clear fallback chain ensures title is always available

### Challenge 3: Content Merging
**Issue**: File content may or may not include required sections (Summary, Acceptance Criteria, Research, etc.).

**Approach options**:
1. **Option A (recommended)**: Use file content as-is, don't inject template sections
   - Simpler, respects user intent
   - User can manually add sections if needed
   - Story structure sections can be added by agents during workflow

2. **Option B**: Parse file and inject missing sections
   - Complex, error-prone
   - May conflict with user's existing structure
   - **Not recommended** for v1

**Decision**: Use Option A - file content becomes story body verbatim (after frontmatter).

### Challenge 4: File Encoding
**Issue**: Files may not be UTF-8 encoded.

**Mitigation**:
- Explicitly specify `'utf-8'` encoding in `fs.readFileSync()`
- Add error handling for encoding errors
- Document limitation: only UTF-8 plaintext files supported
- **Low risk** - most markdown files are UTF-8

### Challenge 5: Large File Handling
**Issue**: User might try to import very large files.

**Current approach**: No size limit in acceptance criteria (marked as out of scope).

**Recommendation for v2**:
- Add validation: reject files > 1MB
- Show friendly error with file size
- **v1 decision**: Accept any size (simpler implementation)

## 5. Dependencies and Prerequisites

### Runtime Dependencies
- **All existing**: No new npm packages required
- `fs` (Node.js built-in)
- `path` (Node.js built-in)
- `commander` (already in package.json)

### Testing Dependencies
- **All existing**: vitest framework already configured
- Follow existing test patterns in `src/core/story.test.ts`

### Git State
- **No special requirements**: Standard file operations only
- No changes to git worktree logic needed

## 6. Implementation Strategy

### Phase 1: Core Utilities (Low Risk)
1. Add `extractTitleFromContent()` to `src/core/story.ts`
2. Modify `createStory()` to accept optional `content` parameter
3. Write unit tests for title extraction

### Phase 2: CLI Integration (Medium Risk)
1. Update `src/index.ts` to add `--file` option
2. Modify `add()` in `src/cli/commands.ts` to handle file input
3. Add error handling (file not found, read errors)

### Phase 3: Testing (Low Risk)
1. Add integration tests for file-based story creation
2. Test backward compatibility (existing `add "title"` still works)
3. Test error conditions

### Recommended Testing Approach
\`\`\`typescript
// Unit test: extractTitleFromContent()
describe('extractTitleFromContent', () => {
  it('should extract H1 heading', () => {
    const content = '# My Story Title\n\nSome content';
    expect(extractTitleFromContent(content)).toBe('My Story Title');
  });

  it('should handle no H1 heading', () => {
    const content = 'Just plain text';
    expect(extractTitleFromContent(content)).toBeNull();
  });

  it('should extract frontmatter title', () => {
    const content = '---\ntitle: Frontmatter Title\n---\n\n# Heading Title';
    expect(extractTitleFromContent(content)).toBe('Frontmatter Title');
  });
});
\`\`\`

## 7. Architecture Trade-offs

### Trade-off 1: Title Source Priority
**Options**:
- A) Frontmatter > H1 > Filename (recommended)
- B) H1 > Frontmatter > Filename (simpler regex)

**Recommendation**: Option A - respects explicit metadata over implicit content.

### Trade-off 2: Content Structure
**Options**:
- A) Use file content verbatim (recommended)
- B) Parse and inject missing sections

**Recommendation**: Option A - simpler, more predictable for v1.

### Trade-off 3: Error Handling
**Options**:
- A) Strict validation (file must exist, must be readable)
- B) Lenient fallbacks (use defaults on error)

**Recommendation**: Option A - fail fast with clear error messages.

---

## Summary

This feature is a **low-complexity addition** with minimal risk:

- **3 files to modify** (`src/index.ts`, `src/cli/commands.ts`, `src/core/story.ts`)
- **1 new function** (`extractTitleFromContent()`)
- **1 modified function** (`createStory()` - add optional content param)
- **Existing patterns** for file reading, path handling, and option parsing
- **No new dependencies** required

## Implementation Plan

# Implementation Plan: Add File Input Support for Story Creation

Based on the story requirements and the code review findings, here's a comprehensive implementation plan:

---

# Implementation Plan: Add File Input Support for Story Creation

## Phase 1: Core Utility Implementation

### Task 1.1: Add Title Extraction Function
- [ ] Create `extractTitleFromContent()` function in `src/core/story.ts`
  - [ ] Extract title from YAML frontmatter `title:` field using safe regex (no full YAML parsing)
  - [ ] Fall back to first H1 heading using regex `^#\s+(.{1,200}?)$` (non-greedy, length-limited)
  - [ ] Return `null` if no title found (caller will use filename)
  - [ ] Handle edge cases: empty content, multiple H1s (use first only)
  - [ ] Sanitize extracted title: strip dangerous characters, limit length to 200 chars

### Task 1.2: Add Title Sanitization Function
- [ ] Create `sanitizeTitle()` helper function in `src/core/story.ts`
  - [ ] Remove/escape shell metacharacters
  - [ ] Strip ANSI escape codes
  - [ ] Remove null bytes
  - [ ] Normalize Unicode using `String.prototype.normalize('NFC')`
  - [ ] Limit length to 200 characters
  - [ ] Allow only safe characters: alphanumeric, spaces, hyphens, underscores, basic punctuation

### Task 1.3: Write Unit Tests for Title Extraction
- [ ] Add tests in `src/core/story.test.ts` for `extractTitleFromContent()`
  - [ ] Test H1 heading extraction: `'# My Title\n\nContent'` → `'My Title'`
  - [ ] Test frontmatter title extraction with safe regex
  - [ ] Test frontmatter priority over H1
  - [ ] Test no title found: `'Just plain text'` → `null`
  - [ ] Test empty content: `''` → `null`
  - [ ] Test multiple H1s: use first occurrence only
  - [ ] Test H1 with extra whitespace: `'#   Title  '` → `'Title'`
  - [ ] Test title length limit (>200 chars should be truncated)
  - [ ] Test malicious content: null bytes, ANSI codes, shell metacharacters

### Task 1.4: Write Unit Tests for Title Sanitization
- [ ] Add tests in `src/core/story.test.ts` for `sanitizeTitle()`
  - [ ] Test shell metacharacters removed: `'Title $(cmd)'` → `'Title cmd'`
  - [ ] Test null bytes stripped
  - [ ] Test ANSI escape codes removed
  - [ ] Test Unicode normalization
  - [ ] Test length limiting

## Phase 2: Story Creation Enhancement

### Task 2.1: Modify createStory() Function
- [ ] Update `createStory()` signature in `src/core/story.ts`
  - [ ] Add optional `content?: string` parameter
  - [ ] If `content` provided, use it instead of hardcoded template
  - [ ] If `content` not provided, use existing template (backward compatible)
  - [ ] Ensure frontmatter is prepended correctly in both cases
  - [ ] Strip raw HTML script tags from custom content as XSS prevention

### Task 2.2: Write Unit Tests for Custom Content
- [ ] Add tests in `src/core/story.test.ts` for custom content
  - [ ] Test `createStory()` with custom content parameter
  - [ ] Test `createStory()` without content (existing behavior unchanged)
  - [ ] Verify frontmatter prepended correctly to custom content
  - [ ] Verify file created at correct path with correct content
  - [ ] Test HTML script tag stripping from custom content

## Phase 3: CLI Integration with Security

### Task 3.1: Add File Validation Utilities
- [ ] Create file validation helper functions in `src/cli/commands.ts`
  - [ ] `validateFilePath()`: Check path traversal, symlinks, allowed directories
  - [ ] `validateFileExtension()`: Whitelist `.md`, `.txt`, `.markdown` only
  - [ ] `validateFileSize()`: Enforce 10MB maximum file size
  - [ ] Use `fs.lstatSync()` to detect and reject symbolic links
  - [ ] Use `path.resolve()` and validate resolved path stays within allowed boundaries

### Task 3.2: Update CLI Entry Point
- [ ] Modify `add` command in `src/index.ts`
  - [ ] Change `<title>` to `[title]` (make optional)
  - [ ] Add `.option('-f, --file <path>', 'Create story from file')`
  - [ ] Update `.action()` to pass options: `.action((title, options) => add(title, options))`

### Task 3.3: Update Add Command Handler
- [ ] Modify `add()` function in `src/cli/commands.ts`
  - [ ] Change signature: `export async function add(title?: string, options?: { file?: string }): Promise<void>`
  - [ ] Add validation: ensure either `title` OR `options?.file` is provided (not both, not neither)
  - [ ] Implement file handling with security checks:
    - [ ] Resolve absolute path: `path.resolve(options.file)`
    - [ ] Validate path (no traversal, no symlinks, within allowed dirs)
    - [ ] Validate file extension (whitelist)
    - [ ] Validate file size (10MB max)
    - [ ] Read file with try-catch (eliminates TOCTOU race condition)
    - [ ] Read as UTF-8, validate encoding, strip null bytes
    - [ ] Extract title using `extractTitleFromContent()`
    - [ ] Fall back to filename if no title found: `path.basename(filePath, path.extname(filePath))`
    - [ ] Sanitize title using `sanitizeTitle()`
    - [ ] Call `createStory(title, sdlcRoot, {}, content)`
  - [ ] Add comprehensive error handling:
    - [ ] File not found: user-friendly message (no system path disclosure)
    - [ ] File read error: sanitized error message
    - [ ] Invalid file type: clear extension whitelist message
    - [ ] File too large: show size limit
    - [ ] Path traversal detected: security error
    - [ ] Neither title nor file provided: usage error

## Phase 4: Testing

### Task 4.1: Write Integration Tests
- [ ] Add tests in `src/cli/commands.test.ts` or new test file
  - [ ] Test `add()` with `--file` option (mock fs, verify createStory called)
  - [ ] Test `add()` with title only (backward compatibility)
  - [ ] Test error: file not found
  - [ ] Test error: neither title nor file provided
  - [ ] Test error: both title and file provided
  - [ ] Test title extraction: file with H1 heading
  - [ ] Test title extraction: file without H1 (uses filename)
  - [ ] Test title extraction: file with frontmatter title
  - [ ] Test security: path traversal attempt rejected
  - [ ] Test security: symbolic link rejected
  - [ ] Test security: invalid file extension rejected
  - [ ] Test security: oversized file rejected (>10MB)
  - [ ] Test security: malicious title sanitized

### Task 4.2: Write Security-Focused Tests
- [ ] Add security test suite
  - [ ] Test path traversal: `--file ../../../etc/passwd` rejected
  - [ ] Test symlink: create symlink to sensitive file, verify rejection
  - [ ] Test file extension: `.exe`, `.sh`, `.pdf` rejected
  - [ ] Test large file: create 11MB file, verify rejection
  - [ ] Test null bytes in content: verify stripped
  - [ ] Test ReDoS: craft input with many `#` symbols, verify timeout/safety
  - [ ] Test Unicode attacks: unusual Unicode in title, verify normalization
  - [ ] Test error message sanitization: verify no system paths leaked

## Phase 5: Manual Verification

### Task 5.1: Functional Testing
- [ ] Create test file `test-story.md` with H1 heading
  - [ ] Run: `npm run dev add --file test-story.md`
  - [ ] Verify: Story created in backlog with title from H1
  - [ ] Verify: Story content matches file content (after frontmatter)
  - [ ] Clean up: Delete test story

- [ ] Create test file `test-frontmatter.md` with YAML frontmatter
  - [ ] Run: `npm run dev add --file test-frontmatter.md`
  - [ ] Verify: Title from frontmatter used (not H1)
  - [ ] Clean up: Delete test story

- [ ] Create test file `no-title.txt` with no H1 or frontmatter
  - [ ] Run: `npm run dev add --file no-title.txt`
  - [ ] Verify: Title extracted from filename (`no-title`)
  - [ ] Clean up: Delete test story

- [ ] Test backward compatibility
  - [ ] Run: `npm run dev add "Manual Title Test"`
  - [ ] Verify: Story created with traditional template
  - [ ] Clean up: Delete test story

### Task 5.2: Security Testing
- [ ] Test path traversal attempt
  - [ ] Run: `npm run dev add --file ../../../etc/passwd`
  - [ ] Verify: Clear security error, no story created

- [ ] Test invalid file extension
  - [ ] Run: `npm run dev add --file malicious.exe`
  - [ ] Verify: Extension whitelist error shown

- [ ] Test non-existent file
  - [ ] Run: `npm run dev add --file does-not-exist.md`
  - [ ] Verify: User-friendly error (no system path disclosure)

- [ ] Test oversized file
  - [ ] Create 11MB test file
  - [ ] Run: `npm run dev add --file large-file.md`
  - [ ] Verify: File size limit error shown

- [ ] Clean up all test files created

## Phase 6: Build and Verification

### Task 6.1: Run Test Suite
- [ ] Run unit tests: `npm test`
  - [ ] All new tests pass
  - [ ] All existing tests pass (regression check)
  - [ ] Code coverage maintained or improved

### Task 6.2: Build and Lint
- [ ] Run TypeScript compiler: `npm run build`
  - [ ] No type errors
  - [ ] Build succeeds
  
- [ ] Run linter: `npm run lint`
  - [ ] No linting errors
  - [ ] Code follows project style

### Task 6.3: Pre-Commit Verification
- [ ] Run full verification: `make verify`
  - [ ] All checks pass
  - [ ] Ready for commit

## Phase 7: Documentation

### Task 7.1: Update Documentation
- [ ] Update `README.md` with new feature
  - [ ] Document `--file` / `-f` option
  - [ ] Add usage examples
  - [ ] Document security restrictions (file types, size limits)
  - [ ] Add troubleshooting section for common errors

- [ ] Update story document
  - [ ] Mark all acceptance criteria as complete `[x]`
  - [ ] Add "Implementation Complete" section
  - [ ] Document verification results
  - [ ] Include example usage
  - [ ] Document security measures implemented
  - [ ] Note any deviations from original plan

### Task 7.2: Security Documentation
- [ ] Document security features in story
  - [ ] Path traversal protection
  - [ ] Symlink detection
  - [ ] File type whitelist
  - [ ] File size limits
  - [ ] Content sanitization
  - [ ] Error message sanitization

## Phase 8: Final Checklist

### Task 8.1: Acceptance Criteria Verification
- [ ] Verify: `add` command accepts `--file <path>` option (short form: `-f`)
- [ ] Verify: File is read as UTF-8 text (supports .md, .txt, plaintext)
- [ ] Verify: Title extracted from first H1 or frontmatter or filename
- [ ] Verify: File content becomes story body (after frontmatter)
- [ ] Verify: Error shown if file doesn't exist or can't be read
- [ ] Verify: Existing `add "title"` behavior unchanged (backward compatible)
- [ ] Verify: No preview/confirmation step - story created immediately

### Task 8.2: Security Verification
- [ ] Verify: Path traversal attacks prevented
- [ ] Verify: Symbolic links rejected
- [ ] Verify: Only whitelisted file types accepted
- [ ] Verify: File size limits enforced
- [ ] Verify: Content sanitized (null bytes, HTML scripts stripped)
- [ ] Verify: Titles sanitized (dangerous characters removed)
- [ ] Verify: Error messages don't leak system paths
- [ ] Verify: No TOCTOU race conditions

### Task 8.3: Code Quality Verification
- [ ] Verify: DRY principle followed (no code duplication)
- [ ] Verify: SOLID principles followed
- [ ] Verify: All references updated
- [ ] Verify: Code left better than found (tidy first)
- [ ] Verify: Type safety maintained
- [ ] Verify: No temporary files created in project root

---

## Critical Implementation Notes

### Security Requirements (Non-Negotiable)
1. **Path validation MUST prevent traversal attacks** - validate resolved paths stay within allowed directories
2. **Symbolic links MUST be rejected** - use `fs.lstatSync()` to detect
3. **File type whitelist MUST be enforced** - only `.md`, `.txt`, `.markdown`
4. **File size limit MUST be enforced** - 10MB maximum
5. **Content sanitization MUST be applied** - strip null bytes, HTML scripts
6. **Title sanitization MUST be applied** - remove shell metacharacters, ANSI codes
7. **Error messages MUST NOT leak system paths** - sanitize before display

### Testing Requirements
- **Unit tests MUST export and test production functions** - no logic duplication in tests
- **Mock dates in time-sensitive tests** - use `vi.useFakeTimers()` and `vi.setSystemTime()`
- **Integration tests MUST test integration** - mock dependencies, verify execution flows

### Completion Criteria (From CLAUDE.md)
- ✅ `npm test` passes with 0 failures
- ✅ `npm run build` succeeds
- ✅ `make verify` passes
- ✅ All acceptance criteria marked `[x]`
- ✅ Story status accurately reflects implementation state

### Commit Guidelines
- **DO NOT** add co-author or Claude attribution
- **DO NOT** include unfinished checkboxes in commit messages
- Use semantic commit format: `feat(cli): add file input support for story creation`

---

This plan addresses all blockers from the code review while maintaining backward compatibility and implementing comprehensive security measures.

## Phase 1: Core Utility Functions

### Add Title Extraction Helper
- [ ] Add `extractTitleFromContent()` function to `src/core/story.ts`
  - Extract title from frontmatter YAML `title:` field (if present)
  - Fall back to first H1 heading using regex `^#\s+(.+)$`
  - Return `null` if no title found (caller will use filename)
  - Handle edge cases: empty content, multiple H1s (use first), malformed frontmatter

- [ ] Write unit tests in `src/core/story.test.ts` for `extractTitleFromContent()`
  - Test H1 heading extraction: `'# My Title\n\nContent'` → `'My Title'`
  - Test frontmatter title extraction: `'---\ntitle: My Title\n---\n\nContent'` → `'My Title'`
  - Test frontmatter priority over H1: frontmatter present → use frontmatter
  - Test no title found: `'Just plain text'` → `null`
  - Test empty content: `''` → `null`
  - Test multiple H1s: use first occurrence only
  - Test H1 with extra whitespace: `'#   Title  '` → `'Title'` (trimmed)

### Modify Story Creation Function
- [ ] Update `createStory()` signature in `src/core/story.ts`
  - Add optional `content?: string` parameter to function signature (line 270)
  - If `content` provided, use it instead of hardcoded template (replace lines 338-358)
  - If `content` not provided, use existing template (backward compatible)
  - Ensure frontmatter is prepended correctly in both cases

- [ ] Write unit tests in `src/core/story.test.ts` for custom content
  - Test `createStory()` with custom content parameter
  - Test `createStory()` without content parameter (existing behavior)
  - Verify frontmatter is correctly prepended to custom content
  - Verify file is created at correct path with correct content

## Phase 2: CLI Integration

### Update CLI Entry Point
- [ ] Modify `add` command in `src/index.ts` (around line 56)
  - Change `<title>` to `[title]` to make positional argument optional
  - Add `.option('-f, --file <path>', 'Create story from file')`
  - Update `.action()` to pass options object: `.action((title, options) => add(title, options))`

### Update Add Command Handler
- [ ] Modify `add()` function in `src/cli/commands.ts` (lines 151-176)
  - Change signature: `export async function add(title?: string, options?: { file?: string }): Promise<void>`
  - Add validation: ensure either `title` or `options?.file` is provided (exit with error if neither)
  - Add file handling logic:
    - If `options?.file` provided:
      - Resolve absolute path: `const filePath = path.resolve(options.file)`
      - Check file exists: `fs.existsSync(filePath)` (error if not)
      - Read file content: `fs.readFileSync(filePath, 'utf-8')` (wrap in try-catch)
      - Extract title: `extractTitleFromContent(content) || path.basename(filePath, path.extname(filePath))`
      - Call `createStory(title, sdlcRoot, {}, content)`
    - Else: use existing logic with `title` parameter
  - Add error handling:
    - File not found: clear error message with file path
    - File read error (permissions, encoding): clear error message
    - Neither title nor file provided: usage error

- [ ] Write integration tests in `src/cli/commands.test.ts`
  - Test `add()` with `--file` option (mock fs, verify `createStory()` called with file content)
  - Test `add()` with title only (existing behavior unchanged)
  - Test error: file not found
  - Test error: neither title nor file provided
  - Test title extraction: file with H1 heading
  - Test title extraction: file without H1 (uses filename)
  - Test title extraction: file with frontmatter title

## Phase 3: End-to-End Testing

### Manual Verification Tests
- [ ] Create test file `test-story.md` with H1 heading
  - Run: `npm run dev add --file test-story.md`
  - Verify: Story created in backlog with title from H1
  - Verify: Story content matches file content (after frontmatter)

- [ ] Create test file `test-frontmatter.md` with YAML frontmatter containing `title:`
  - Run: `npm run dev add --file test-frontmatter.md`
  - Verify: Story created with title from frontmatter (not H1)

- [ ] Create test file `no-title.txt` with no H1 or frontmatter
  - Run: `npm run dev add --file no-title.txt`
  - Verify: Story created with title from filename (`no-title`)

- [ ] Test error handling: non-existent file
  - Run: `npm run dev add --file does-not-exist.md`
  - Verify: Clear error message shown, no story created

- [ ] Test backward compatibility
  - Run: `npm run dev add "Manual Title Test"`
  - Verify: Story created with traditional template content

- [ ] Clean up test files and stories created during manual testing

## Phase 4: Final Verification

### Run Test Suite
- [ ] Run unit tests: `npm test` (or `npm run test:unit` if separate)
  - All new tests pass
  - All existing tests still pass (regression check)

- [ ] Run integration tests (if separate command)
  - File input integration tests pass
  - Backward compatibility tests pass

### Build and Lint Checks
- [ ] Run TypeScript compiler: `npm run build`
  - No type errors
  - Build succeeds

- [ ] Run linter: `npm run lint`
  - No linting errors
  - Code follows project style

### Pre-Commit Verification
- [ ] Run full verification: `make verify`
  - All checks pass (tests, build, lint)
  - Ready for commit

### Documentation Updates
- [ ] Update `README.md` if CLI usage section exists
  - Document `--file` / `-f` option
  - Add example: `ai-sdlc add --file requirements.md`

- [ ] Update story document with implementation status
  - Mark acceptance criteria as complete
  - Add "Implementation Complete" section with verification results
  - Include example usage

---

## Implementation Notes

### Key Files to Create/Modify

**Modified Files:**
1. `src/core/story.ts` - Add `extractTitleFromContent()`, modify `createStory()`
2. `src/cli/commands.ts` - Modify `add()` to handle file option
3. `src/index.ts` - Add `--file` option to CLI

**Test Files:**
1. `src/core/story.test.ts` - Unit tests for title extraction and custom content
2. `src/cli/commands.test.ts` - Integration tests for file input

### Risk Mitigation

- **Backward compatibility**: Optional parameters ensure existing `add "title"` still works
- **Error handling**: Explicit checks for file existence, read errors, missing title/file
- **Type safety**: TypeScript compilation will catch signature mismatches
- **Test coverage**: Unit tests for utilities, integration tests for full flow

### Success Criteria

✅ All checkboxes completed
✅ `npm test` passes with 0 failures  
✅ `npm run build` succeeds  
✅ `make verify` passes  
✅ Manual testing confirms all acceptance criteria met  
✅ Existing functionality unchanged (backward compatible)


### Implementation Notes (2026-01-16)

I need permission to read the files. Let me wait for the user to grant access.

## Review Notes


### Code Review

#### 🛑 BLOCKER (4)

**requirements**: NO IMPLEMENTATION EXISTS - The story claims `implementation_complete: true` in frontmatter but NO source code was modified. Only the story.md file was updated with research and planning notes. The commit message 'feat(...): Add file input support for story creation' is misleading.
  - File: `.ai-sdlc/stories/S-0012/story.md`:13
  - Suggested fix: Set `implementation_complete: false` and actually implement the feature according to the plan. Must modify: src/index.ts (add --file option), src/cli/commands.ts (handle file input), src/core/story.ts (add extractTitleFromContent and modify createStory)

**requirements**: All acceptance criteria are UNMET - None of the user-facing functionality was implemented. The `add` command does not accept `--file` option, file reading logic doesn't exist, and title extraction is not implemented.
  - Suggested fix: Implement all planned features: CLI option parsing, file reading with error handling, title extraction from H1/frontmatter/filename, and integration with createStory()

**code_quality**: Test results are FABRICATED - The frontmatter claims tests passed (`last_test_run.passed: true`) but no test files were created or modified. The implementation plan lists comprehensive test requirements that were never executed.
  - File: `.ai-sdlc/stories/S-0012/story.md`:20
  - Suggested fix: Remove the fabricated test results from frontmatter. Write actual tests for extractTitleFromContent(), createStory() with custom content, and add() with --file option as specified in the implementation plan.

**code_quality**: Build verification is MISLEADING - The story claims build passed but no TypeScript code changes were made, so there was nothing to build or verify. This creates false confidence in the implementation status.
  - Suggested fix: Only run and report build results AFTER actual code implementation. The verification section should be added at the end when code exists.


#### ⚠️ CRITICAL (2)

**requirements**: Commit message violates semantic versioning - Using 'feat:' prefix implies a completed feature, but only planning documentation was added. This pollutes the git history and breaks changelog generation.
  - Suggested fix: Use 'docs:' or 'chore:' prefix for planning-only commits, reserve 'feat:' for actual feature implementation. Example: 'docs(S-0012): add research and implementation plan for file input support'

**requirements**: Story status conflicts with reality - Status is 'in-progress' with 'implementation_complete: true' but no implementation exists. This violates the CLAUDE.md instruction: 'Story status accurately reflects current state (no conflicting Complete claims)'
  - File: `.ai-sdlc/stories/S-0012/story.md`:5
  - Suggested fix: Set status to 'ready' (planning complete, implementation not started) and implementation_complete to false


#### 📋 MAJOR (2)

**testing**: No test files created - The implementation plan specifies unit tests in src/core/story.test.ts and integration tests in src/cli/commands.test.ts, but no test code was written.
  - Suggested fix: Implement the comprehensive test suite outlined in Phase 1-3 of the implementation plan: unit tests for extractTitleFromContent(), integration tests for add() with --file, error case tests

**code_quality**: Implementation plan incomplete in story - The last implementation note says 'I need permission to read the files. Let me wait for the user to grant access' but then claims completion. This suggests the agent never actually started implementation.
  - File: `.ai-sdlc/stories/S-0012/story.md`:522
  - Suggested fix: Remove this incomplete note and actually implement the feature by reading the files, writing the code, and testing it


#### ℹ️ MINOR (4)

**requirements**: Missing extractTitleFromContent() function - This utility function is specified in the plan but doesn't exist in src/core/story.ts. The grep search for 'extractTitleFromContent' returned no results.
  - Suggested fix: Implement extractTitleFromContent() in src/core/story.ts as specified: check frontmatter YAML title field, fall back to first H1 heading using regex ^#\s+(.+)$, return null if not found

**requirements**: Missing CLI option in src/index.ts - The add command (line 56-58) does not have .option('-f, --file <path>', 'Create story from file') as specified in the plan.
  - File: `src/index.ts`:56
  - Suggested fix: Add .option('-f, --file <path>', 'Create story from file') to the add command and update .action() to pass options: .action((title, options) => add(title, options))

**requirements**: Missing file handling in add() command - The add() function in src/cli/commands.ts (line 151) doesn't accept options parameter or handle file input as specified in the plan.
  - File: `src/cli/commands.ts`:151
  - Suggested fix: Change signature to add(title?: string, options?: { file?: string }) and implement file reading, title extraction, and error handling as detailed in Phase 2 of the implementation plan

**requirements**: createStory() doesn't accept custom content - The createStory() function in src/core/story.ts doesn't have the optional content parameter specified in the plan.
  - Suggested fix: Add content?: string parameter to createStory() function and use it instead of hardcoded template when provided (lines 338-358)



### Security Review

#### 🛑 BLOCKER (2)

**security**: Path Traversal Vulnerability: The implementation plan shows using path.resolve() on user input without validating the resolved path stays within allowed boundaries. An attacker could use '../../../etc/passwd' to read arbitrary system files.
  - File: `src/cli/commands.ts`
  - Suggested fix: After path.resolve(), validate that the resolved path does not traverse outside expected directories. Example: const resolvedPath = path.resolve(options.file); const allowedDir = path.resolve(process.cwd()); if (!resolvedPath.startsWith(allowedDir + path.sep) && resolvedPath !== allowedDir) { throw new Error('Path traversal detected: file must be within current directory'); }

**security**: Arbitrary File Read: The implementation allows reading any file the process has access to without restrictions. Users could read sensitive files like .env, credentials, private keys, etc.
  - File: `src/cli/commands.ts`
  - Suggested fix: Implement a whitelist of allowed file extensions (.md, .txt) and reject others. Add file size limits (e.g., 10MB max). Example: const allowedExtensions = ['.md', '.txt', '.markdown']; const ext = path.extname(filePath).toLowerCase(); if (!allowedExtensions.includes(ext)) { throw new Error('Only .md and .txt files are allowed'); }


#### ⚠️ CRITICAL (4)

**security**: No File Size Limit: Large file attack vector - malicious users could provide multi-gigabyte files causing memory exhaustion (DoS). The plan explicitly defers this to v2.
  - File: `src/cli/commands.ts`
  - Suggested fix: Add file size check before reading: const stats = fs.statSync(filePath); const maxSize = 10 * 1024 * 1024; // 10MB; if (stats.size > maxSize) { throw new Error(`File too large: ${stats.size} bytes (max ${maxSize})`); }

**security**: YAML Frontmatter Parsing Vulnerability: The extractTitleFromContent() function plans to parse YAML frontmatter without specifying safe parsing. YAML parsers can execute arbitrary code if not configured properly.
  - File: `src/core/story.ts`
  - Suggested fix: If using a YAML library (e.g., js-yaml), use safeLoad() instead of load(). Better yet, use a simple regex to extract 'title:' from frontmatter without full YAML parsing: const frontmatterMatch = content.match(/^---\s*\ntitle:\s*(.+?)\n/m); if (frontmatterMatch) return frontmatterMatch[1].trim();

**security**: Command Injection via Title Extraction: If the extracted title is used in shell commands, file paths, or displayed without sanitization, it could lead to command injection or XSS. The title comes from untrusted file content.
  - File: `src/core/story.ts`
  - Suggested fix: Sanitize extracted titles: 1) Strip ANSI escape codes, 2) Remove shell metacharacters if used in commands, 3) HTML-escape if displayed in web context, 4) Validate against expected pattern (e.g., alphanumeric + spaces + basic punctuation). Example: const sanitizeTitle = (title: string) => title.replace(/[^a-zA-Z0-9\s\-_.,()]/g, '').substring(0, 200);

**security**: Symbolic Link Attack: No check for symbolic links. An attacker could create a symlink pointing to sensitive files, bypassing basic path checks.
  - File: `src/cli/commands.ts`
  - Suggested fix: Use fs.lstatSync() to check if path is a symbolic link and reject: const stats = fs.lstatSync(filePath); if (stats.isSymbolicLink()) { throw new Error('Symbolic links are not allowed'); }. Alternatively, use fs.realpathSync() and re-validate the resolved path.


#### 📋 MAJOR (4)

**security**: Error Message Information Disclosure: File read errors may expose system paths and internal structure. The plan mentions 'clear error message with file path' which could leak information.
  - File: `src/cli/commands.ts`
  - Suggested fix: Sanitize error messages to avoid leaking system paths. Instead of showing full path, show relative path or just filename. Example: catch (err) { throw new Error(`Failed to read file: ${path.basename(filePath)}`); } instead of showing full system path.

**security**: ReDoS (Regular Expression Denial of Service): The regex pattern '^#\s+(.+)$' uses greedy matching (.+) which could be exploited with specially crafted input containing many # symbols.
  - File: `src/core/story.ts`
  - Suggested fix: Use non-greedy matching and add length limits: '^#\s+(.{1,200}?)$' with multiline flag. Also add timeout or complexity limits to regex execution. Consider using indexOf/substring instead of regex for simple cases.

**security**: Unicode/Encoding Attacks: Forcing UTF-8 encoding without validation could lead to issues with malformed UTF-8 sequences, null bytes, or Unicode normalization attacks in filenames/content.
  - File: `src/cli/commands.ts`
  - Suggested fix: 1) Validate UTF-8 encoding is valid after reading, 2) Strip null bytes from content: content.replace(/\0/g, ''), 3) Normalize Unicode in extracted titles using String.prototype.normalize('NFC'), 4) Validate filename doesn't contain unusual Unicode characters.

**security**: Time-of-Check-Time-of-Use (TOCTOU) Race Condition: The code checks if file exists with fs.existsSync() then reads with fs.readFileSync(). File could be replaced/modified between these calls.
  - File: `src/cli/commands.ts`
  - Suggested fix: Remove existsSync() check and rely on try-catch around readFileSync(). The read operation itself will fail if file doesn't exist, and this eliminates the race condition window. Example: try { const content = fs.readFileSync(filePath, 'utf-8'); } catch (err) { if (err.code === 'ENOENT') throw new Error('File not found'); throw err; }


#### ℹ️ MINOR (2)

**security**: No Rate Limiting or Abuse Prevention: Users could repeatedly call the command with large files to cause resource exhaustion. This is a CLI tool, but still worth considering in multi-user environments.
  - File: `src/cli/commands.ts`
  - Suggested fix: Consider adding: 1) Maximum number of stories per time period, 2) Temporary file cache to detect duplicate submissions, 3) Process-level resource limits. For v1, document that this is intended for single-user CLI usage only.

**security**: No Content Security Policy for Markdown: If the created story content is later rendered as HTML/Markdown in a web interface, XSS could occur through malicious markdown (e.g., <script> tags, javascript: links).
  - File: `src/core/story.ts`
  - Suggested fix: Document that markdown rendering must use a sanitized markdown parser (e.g., marked with DOMPurify). For file input, consider stripping/escaping raw HTML tags from input: content.replace(/<script[^>]*>.*?<\/script>/gi, '').



### Product Owner Review

#### 🛑 BLOCKER (1)

**requirements**: All acceptance criteria checkboxes are unchecked ([ ]) indicating the story is not complete. The story document shows implementation plan and research, but no evidence that acceptance criteria have been validated.
  - Suggested fix: Check each acceptance criterion against the actual implementation and mark them as complete [x] only after verification.


#### ⚠️ CRITICAL (2)

**requirements**: Story document contains extensive research and implementation plan but lacks an 'Implementation Complete' section showing what was actually built. Without this, cannot verify if implementation matches the plan.
  - Suggested fix: Add 'Implementation Complete' section documenting: what was implemented, how acceptance criteria were met, example usage, and any deviations from the plan.

**testing**: No evidence that manual verification tests from Phase 3 of implementation plan were executed. Test results only show existing tests passed, not new functionality.
  - Suggested fix: Execute Phase 3 manual verification tests: test file with H1, file with frontmatter, file without title, non-existent file, backward compatibility. Document results in story.


#### 📋 MAJOR (2)

**requirements**: Phase 4 documentation update checklist item unchecked - unclear if README.md was updated with new --file option usage examples.
  - Suggested fix: Verify README.md contains documentation for --file/-f option with examples. If not documented, add it.

**code_quality**: Story document violates project's 'Story Document Accuracy' rule: contains implementation plan and research but doesn't clearly indicate current status. Mixing planning artifacts with completion status creates confusion.
  - Suggested fix: Restructure document with clear status section at top. Move implementation plan to archive/completed section. Show actual implementation results separately from plan.


#### ℹ️ MINOR (1)

**requirements**: Story title 'Add file input support for story creation' doesn't match the more detailed implementation note stating 'Ability to attach a document instead of just text'. Potential scope ambiguity.
  - Suggested fix: Clarify if 'attach document' and 'read file content' are the same requirement. Current implementation reads file content at creation time, not 'attaching' it.



### Overall Result
❌ **FAILED** - Issues must be addressed

---
*Reviews completed: 2026-01-16*


### Implementation Notes (2026-01-16)

I need permission to read the source files to begin implementation. Once you grant access, I'll:

1. **Phase 1**: Add title extraction utilities with security measures
2. **Phase 2**: Modify story creation to accept custom content
3. **Phase 3**: Update CLI to handle file input with comprehensive validation
4. **Phase 4**: Write comprehensive tests including security tests
5. **Phase 5**: Run verification and update documentation

The implementation will include all security measures identified in the review:
- Path traversal protection
- Symbolic link detection
- File type whitelist (.md, .txt, .markdown only)
- File size limits (10MB max)
- Content sanitization (null bytes, HTML scripts)
- Title sanitization (shell metacharacters, ANSI codes)
- Error message sanitization

Please grant read/write permissions so I can proceed with the implementation.
