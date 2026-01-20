import fs from 'fs';
import path from 'path';
import { glob } from 'glob';
import { parseStory, writeStory, updateStoryField, writeSectionContent, readSectionContent } from '../core/story.js';
import { runAgentQuery, AgentProgressCallback } from '../core/client.js';
import { Story, AgentResult, FARScore } from '../types/index.js';
import { getLogger } from '../core/logger.js';

const RESEARCH_SYSTEM_PROMPT = `You are a technical research specialist analyzing how to implement a user story by deeply examining the existing codebase.

## Research Methodology

**Phase 1: Problem Understanding**
- Parse the story requirements to extract core needs
- Identify key terms and concepts that map to codebase elements
- Clarify the scope: what is being asked vs what is NOT being asked

**Phase 2: Codebase Exploration**
- Use the provided codebase context to locate relevant code
- Trace dependencies and call chains from entry points
- Identify architectural boundaries and interfaces
- Find similar implementations that can serve as templates

**Phase 3: Solution Mapping**
- Map story requirements to specific code locations
- Identify the change surface area (all affected files)
- Consider alternative approaches and trade-offs
- Determine the sequence of changes (what depends on what)

## Required Output Structure

Your research MUST include these five sections:

### Problem Summary
[Restate the problem in your own words to confirm understanding. What is the core goal?]

### Codebase Context
[Describe relevant architecture, patterns, and existing implementations you found. Reference specific files and patterns.]

### Files Requiring Changes

For each file that needs modification:
- **Path**: \`path/to/file\`
- **Change Type**: [Create New | Modify Existing | Delete]
- **Reason**: [Why this file needs to change]
- **Specific Changes**: [What aspects need modification]
- **Dependencies**: [What other changes must happen first]

### Testing Strategy
- **Test Files to Modify**: [Existing test files that need updates]
- **New Tests Needed**: [New test files or test cases required]
- **Test Scenarios**: [Specific scenarios to cover: happy path, edge cases, error handling]

### Additional Context
- **Relevant Patterns**: [Existing code patterns to follow for consistency]
- **Potential Risks**: [Things to watch out for, breaking changes]
- **Performance Considerations**: [If applicable]
- **Security Implications**: [If applicable]

## Quality Standards
- Be SPECIFIC about file paths (e.g., \`src/core/story.ts:42\` not just "the story module")
- Reference existing patterns when suggesting new code
- Identify at least 3-5 relevant files in the codebase
- Provide concrete examples, not abstract concepts
- If you cannot find relevant code, say so explicitly`;

/**
 * Keywords that indicate a story is purely internal and does not require web research.
 * These keywords suggest refactoring, code organization, or internal maintenance tasks.
 */
const WEB_RESEARCH_INTERNAL_KEYWORDS = [
  'refactor internal',
  'move function',
  'rename variable',
  'rename function',
  'move utility',
  'internal refactor',
  'move code',
  'reorganize internal',
];

/**
 * Keywords that indicate external dependencies or integrations requiring web research.
 * These keywords suggest the need for library documentation, API references, or best practices.
 */
const WEB_RESEARCH_EXTERNAL_KEYWORDS = [
  'integrate',
  'api',
  'library',
  'framework',
  'best practices',
  'npm package',
  'external',
  'third-party',
  'sdk',
  'documentation',
  'webhook',
  'rest api',
  'graphql',
  'oauth',
  'authentication provider',
];

/**
 * Web research prompt template for supplementary research phase.
 * Instructs the agent on tool usage, FAR evaluation, and output formatting.
 */
const WEB_RESEARCH_PROMPT_TEMPLATE = (storyTitle: string, storyContent: string, codebaseContext: string) => `You are performing supplementary web research for a software development story.

**Story Title**: ${storyTitle}

**Story Content**:
${storyContent}

**Codebase Context** (already analyzed):
${codebaseContext}... [truncated]

---

## Web Research Instructions

You have access to these web research tools:

1. **Context7** (if available) - Use FIRST for library/framework documentation
   - Best for: npm packages, Python libraries, popular frameworks
   - Example: "Search Context7 for React Query documentation on data fetching"

2. **WebSearch** - Use for community knowledge and best practices
   - Best for: Stack Overflow patterns, blog posts, tutorials
   - Example: "Search the web for TypeScript error handling best practices"

3. **WebFetch** - Use to read specific authoritative URLs
   - Best for: Official documentation, specific articles
   - Example: "Fetch https://docs.anthropic.com/claude/reference"

## Research Strategy

- Try Context7 FIRST for any npm packages or popular frameworks mentioned in the story
- Fall back to WebSearch for general solutions and community patterns
- Use WebFetch only when you have specific authoritative URLs to read
- Limit research to 3-5 high-quality sources to avoid information overload
- Focus on actionable information that directly addresses the story requirements

## Output Format

For EACH finding, provide:

### [Topic Name]
**Source**: [Context7 - Library Name] or [Web Search Result] or [URL]
**FAR Score**: Factuality: [1-5], Actionability: [1-5], Relevance: [1-5]
**Justification**: [Why these scores? How does this help the story?]

[Finding content with code examples, patterns, or instructions]

---

## FAR Scale Definitions

**Factuality (1-5)**: How accurate and verifiable is the information?
- 1: Unverified/speculative
- 3: Community knowledge (Stack Overflow, blogs)
- 5: Official documentation or peer-reviewed

**Actionability (1-5)**: Can this be directly applied to the task?
- 1: Abstract concepts only
- 3: General patterns or approaches
- 5: Copy-paste code examples or step-by-step instructions

**Relevance (1-5)**: How closely does this match the story requirements?
- 1: Tangentially related
- 3: Related but not specific to story
- 5: Directly addresses a story acceptance criterion

## Important Notes

- If web tools are unavailable (offline, not configured), simply state: "Web research tools unavailable - skipping web research"
- If a finding contradicts patterns in the codebase context, note the discrepancy and defer to local patterns
- Focus on NEW information not already present in codebase analysis

Begin web research now. Provide 3-5 high-quality findings with FAR evaluations.`;

export interface AgentOptions {
  /** Context from a previous review failure - must address these issues */
  reworkContext?: string;
  /** Callback for real-time progress updates from agent execution */
  onProgress?: AgentProgressCallback;
}

/**
 * Research Agent
 *
 * Researches how to implement a story by analyzing the codebase
 * and gathering relevant information.
 */
export async function runResearchAgent(
  storyPath: string,
  sdlcRoot: string,
  options: AgentOptions = {}
): Promise<AgentResult> {
  const story = parseStory(storyPath);
  const changesMade: string[] = [];

  try {
    // Gather codebase context
    const codebaseContext = await gatherCodebaseContext(sdlcRoot);

    // Sanitize codebase context before including in prompt (prevent prompt injection)
    const sanitizedContext = sanitizeCodebaseContext(codebaseContext);

    // Build the prompt, including rework context if this is a refinement iteration
    let prompt = `Please research how to implement this story:

Title: ${story.frontmatter.title}

Story content:
${story.content}

Codebase context:
${sanitizedContext}`;

    if (options.reworkContext) {
      prompt += `

---
${options.reworkContext}
---

IMPORTANT: This is a refinement iteration. The previous implementation did not pass review.
You MUST address all the issues listed above in your research. Focus on finding solutions
to the specific problems identified by reviewers.`;
    }

    prompt += `

Provide research findings including:
1. Relevant existing patterns and code to reference
2. Files/modules that likely need modification
3. External resources or best practices to follow
4. Potential challenges or risks
5. Any dependencies or prerequisites

Format your response as markdown for the Research section of the story.`;

    const researchContent = await runAgentQuery({
      prompt,
      systemPrompt: RESEARCH_SYSTEM_PROMPT,
      workingDirectory: path.dirname(sdlcRoot),
      onProgress: options.onProgress,
    });

    // Sanitize research content before storage (prevent ANSI/markdown injection)
    const sanitizedResearch = sanitizeWebResearchContent(researchContent);

    // Determine if this is an iteration (rework context implies previous attempt)
    const isIteration = !!options.reworkContext;
    const iterationNum = isIteration ? (story.frontmatter.refinement_count || 0) + 1 : 1;

    // Write codebase research to section file
    await writeSectionContent(storyPath, 'research', sanitizedResearch, {
      append: isIteration,
      iteration: iterationNum,
      isRework: isIteration,
    });
    changesMade.push('Added codebase research findings');

    // Phase 2: Web Research (conditional)
    if (shouldPerformWebResearch(story, sanitizedContext)) {
      const webResearchContent = await performWebResearch(
        story,
        sanitizedContext,
        path.dirname(sdlcRoot),
        options.onProgress
      );

      if (webResearchContent.trim()) {
        // Sanitize web research content before storage (prevent ANSI/markdown injection)
        const sanitizedWebResearch = sanitizeWebResearchContent(webResearchContent);

        // Read existing research and append web findings
        const existingResearch = await readSectionContent(storyPath, 'research');
        const combinedResearch = existingResearch + '\n\n## Web Research Findings\n\n' + sanitizedWebResearch;
        await writeSectionContent(storyPath, 'research', combinedResearch);
        changesMade.push('Added web research findings');
      } else {
        getLogger().info('web-research', 'Web research returned empty - tools may be unavailable');
        changesMade.push('Web research skipped: tools unavailable');
      }
    } else {
      changesMade.push('Web research skipped: no external dependencies detected');
    }

    // Mark research as complete - re-parse to get latest content including web research
    const finalStory = parseStory(storyPath);
    await updateStoryField(finalStory, 'research_complete', true);
    changesMade.push('Marked research_complete: true');

    return {
      success: true,
      story: parseStory(storyPath), // Re-read to get updated content
      changesMade,
    };
  } catch (error) {
    return {
      success: false,
      story,
      changesMade,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Gather context about the codebase for research.
 *
 * Collects information about:
 * - Project configuration files (package.json, tsconfig.json, etc.)
 * - Directory structure
 * - Source files
 * - Test files (for understanding testing patterns)
 * - Configuration files (for discovering config patterns)
 *
 * @param sdlcRoot - Path to the .ai-sdlc directory
 * @returns Formatted context string with codebase information
 */
export async function gatherCodebaseContext(sdlcRoot: string): Promise<string> {
  const workingDir = path.dirname(sdlcRoot);
  const context: string[] = [];

  // Check for common project files
  const projectFiles = [
    'package.json',
    'tsconfig.json',
    'pyproject.toml',
    'Cargo.toml',
    'go.mod',
  ];

  for (const file of projectFiles) {
    const filePath = path.join(workingDir, file);
    if (fs.existsSync(filePath)) {
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        context.push(`=== ${file} ===\n${content.substring(0, 1000)}`);
      } catch {
        // Ignore read errors
      }
    }
  }

  // Get directory structure (top level)
  try {
    const entries = fs.readdirSync(workingDir, { withFileTypes: true });
    const dirs = entries
      .filter(e => e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules')
      .map(e => e.name);
    const files = entries
      .filter(e => e.isFile() && !e.name.startsWith('.'))
      .map(e => e.name);

    context.push(`=== Directory Structure ===\nDirectories: ${dirs.join(', ')}\nFiles: ${files.join(', ')}`);
  } catch {
    // Ignore errors
  }

  // Look for source files
  try {
    const sourceFiles = await glob('src/**/*.{ts,js,py,go,rs}', {
      cwd: workingDir,
      ignore: ['node_modules/**', 'dist/**', 'build/**'],
    });

    if (sourceFiles.length > 0) {
      context.push(`=== Source Files ===\n${sourceFiles.slice(0, 20).join('\n')}`);
    }
  } catch {
    // Ignore glob errors
  }

  // Look for test files (helps identify testing patterns)
  try {
    const testFiles = await glob('**/*.test.{ts,js,tsx,jsx}', {
      cwd: workingDir,
      ignore: ['node_modules/**', 'dist/**', 'build/**'],
    });

    // Also look for tests in dedicated test directories
    const testDirFiles = await glob('{tests,test,__tests__}/**/*.{ts,js,tsx,jsx}', {
      cwd: workingDir,
      ignore: ['node_modules/**'],
    });

    const allTestFiles = [...new Set([...testFiles, ...testDirFiles])];

    if (allTestFiles.length > 0) {
      context.push(`=== Test Files ===\n${allTestFiles.slice(0, 15).join('\n')}`);
    }
  } catch {
    // Ignore glob errors
  }

  // Look for configuration files (helps identify config patterns)
  try {
    const configFiles = await glob('**/*.config.{ts,js,json,mjs,cjs}', {
      cwd: workingDir,
      ignore: ['node_modules/**', 'dist/**'],
    });

    // Also look for common config file patterns
    const commonConfigs = await glob('{.eslintrc*,.prettierrc*,jest.config.*,vitest.config.*,vite.config.*}', {
      cwd: workingDir,
      dot: true,
    });

    const allConfigFiles = [...new Set([...configFiles, ...commonConfigs])];

    if (allConfigFiles.length > 0) {
      context.push(`=== Config Files ===\n${allConfigFiles.slice(0, 10).join('\n')}`);
    }
  } catch {
    // Ignore glob errors
  }

  return context.join('\n\n') || 'No codebase context available.';
}

/**
 * Determine if web research would add value based on story content and codebase context.
 *
 * Web research is triggered when:
 * 1. External dependencies are referenced (libraries, APIs, frameworks)
 * 2. Unfamiliar APIs/patterns are mentioned
 * 3. Library-specific documentation is needed
 * 4. Best practices are requested
 *
 * Web research is skipped when:
 * - Topic is purely internal (refactoring, moving code, internal utilities)
 * - No external dependencies mentioned
 */
export function shouldPerformWebResearch(story: Story, codebaseContext: string): boolean {
  const content = story.content.toLowerCase();
  const title = story.frontmatter.title.toLowerCase();
  const combinedText = `${title} ${content}`;

  // Skip if purely internal keywords are dominant
  for (const keyword of WEB_RESEARCH_INTERNAL_KEYWORDS) {
    if (combinedText.includes(keyword)) {
      // Sanitize keyword for logging (prevent log injection)
      getLogger().info('web-research', `Skipping web research: purely internal topic detected (${sanitizeForLogging(keyword)})`);
      return false;
    }
  }

  // Trigger if external library/API/framework mentioned
  for (const keyword of WEB_RESEARCH_EXTERNAL_KEYWORDS) {
    if (combinedText.includes(keyword)) {
      // Sanitize keyword for logging (prevent log injection)
      getLogger().info('web-research', `Web research triggered: external keyword detected (${sanitizeForLogging(keyword)})`);
      return true;
    }
  }

  // Check for package.json mentions (suggests npm dependencies)
  if (codebaseContext.includes('package.json') &&
      (combinedText.includes('npm') || combinedText.includes('install') || combinedText.includes('dependency'))) {
    getLogger().info('web-research', 'Web research triggered: npm dependency context detected');
    return true;
  }

  // Default: skip web research for codebase-only topics
  getLogger().info('web-research', 'Skipping web research: no external dependencies detected');
  return false;
}

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
  // eslint-disable-next-line no-control-regex
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

/**
 * Parse FAR evaluation from web research finding text.
 * Expected format from LLM:
 * **FAR Score**: Factuality: 5, Actionability: 4, Relevance: 5
 * **Justification**: Official documentation provides...
 *
 * Returns default scores (2, 2, 2) with parsingSucceeded: false if parsing fails.
 * Default of 2 (rather than 3) indicates uncertainty rather than average quality.
 *
 * @param finding - Web research finding text to parse
 * @returns FARScore with parsed or default values and parsing status
 */
export function evaluateFAR(finding: string): FARScore {
  // Enforce maximum length to prevent ReDoS attacks
  if (finding.length > MAX_INPUT_LENGTH) {
    finding = finding.substring(0, MAX_INPUT_LENGTH);
  }

  try {
    // Look for FAR score pattern
    const scoreMatch = finding.match(/\*\*FAR Score\*\*:.*?Factuality:\s*(\d+).*?Actionability:\s*(\d+).*?Relevance:\s*(\d+)/i);
    const justificationMatch = finding.match(/\*\*Justification\*\*:\s*(.+?)(?:\n\n|\n#|$)/is);

    if (scoreMatch && justificationMatch) {
      const factuality = parseInt(scoreMatch[1], 10) as 1 | 2 | 3 | 4 | 5;
      const actionability = parseInt(scoreMatch[2], 10) as 1 | 2 | 3 | 4 | 5;
      const relevance = parseInt(scoreMatch[3], 10) as 1 | 2 | 3 | 4 | 5;
      const justification = justificationMatch[1].trim();

      // Validate scores are in range 1-5
      if ([factuality, actionability, relevance].every(s => s >= 1 && s <= 5)) {
        return {
          factuality,
          actionability,
          relevance,
          justification,
          parsingSucceeded: true,
        };
      } else {
        getLogger().warn('web-research', 'FAR scores out of valid range (1-5), using defaults');
      }
    } else if (scoreMatch && !justificationMatch) {
      getLogger().warn('web-research', 'FAR justification missing, using defaults');
    } else if (!scoreMatch && justificationMatch) {
      getLogger().warn('web-research', 'FAR scores not found in finding, using defaults');
    } else {
      getLogger().warn('web-research', 'FAR scores and justification not found in finding, using defaults');
    }

    // If parsing failed, return default scores (2/5 indicates uncertainty)
    return {
      factuality: 2,
      actionability: 2,
      relevance: 2,
      justification: 'FAR scores could not be parsed from finding. Default scores (2/5) applied.',
      parsingSucceeded: false,
    };
  } catch (error) {
    getLogger().error('web-research', 'Error parsing FAR scores', { error });
    return {
      factuality: 2,
      actionability: 2,
      relevance: 2,
      justification: 'Error parsing FAR evaluation',
      parsingSucceeded: false,
    };
  }
}

/**
 * Perform web research using Context7/WebSearch/WebFetch.
 * Returns formatted markdown with FAR evaluations, or empty string if all tools unavailable.
 */
async function performWebResearch(
  story: Story,
  codebaseContext: string,
  workingDir: string,
  onProgress?: AgentProgressCallback
): Promise<string> {
  const logger = getLogger();
  logger.info('web-research', 'Starting web research phase', { storyId: story.frontmatter.id });

  try {
    const sanitizedContext = sanitizeCodebaseContext(codebaseContext.substring(0, 2000));
    const webResearchPrompt = WEB_RESEARCH_PROMPT_TEMPLATE(
      story.frontmatter.title,
      story.content,
      sanitizedContext
    );

    const webResearchResult = await runAgentQuery({
      prompt: webResearchPrompt,
      systemPrompt: 'You are a web research specialist. Use available tools to find authoritative documentation and best practices.',
      workingDirectory: workingDir,
      onProgress,
    });

    // Check if web tools were unavailable
    if (webResearchResult.toLowerCase().includes('web research tools unavailable')) {
      logger.info('web-research', 'Web research tools unavailable, skipping');
      return '';
    }

    logger.info('web-research', 'Web research completed successfully');
    return webResearchResult;

  } catch (error) {
    logger.error('web-research', 'Web research failed', { error });
    // Gracefully degrade - return empty string to continue with codebase-only research
    return '';
  }
}
