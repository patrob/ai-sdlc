import fs from 'fs';
import path from 'path';
import { glob } from 'glob';
import { parseStory, writeStory, appendToSection, updateStoryField } from '../core/story.js';
import { runAgentQuery, AgentProgressCallback } from '../core/client.js';
import { Story, AgentResult, FARScore } from '../types/index.js';
import { getLogger } from '../core/logger.js';

const RESEARCH_SYSTEM_PROMPT = `You are a technical research specialist. Your job is to research how to implement a user story by analyzing the existing codebase and external best practices.

When researching a story, you should:
1. Identify relevant existing code patterns in the codebase
2. Suggest which files/modules need to be modified
3. Research external best practices if applicable
4. Identify potential challenges or risks
5. Note any dependencies or prerequisites

Output your research findings in markdown format. Be specific about file paths and code patterns.`;

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

    // Build the prompt, including rework context if this is a refinement iteration
    let prompt = `Please research how to implement this story:

Title: ${story.frontmatter.title}

Story content:
${story.content}

Codebase context:
${codebaseContext}`;

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

    // Append codebase research to the story
    await appendToSection(story, 'Research', researchContent);
    changesMade.push('Added codebase research findings');

    // Phase 2: Web Research (conditional)
    if (shouldPerformWebResearch(story, codebaseContext)) {
      const webResearchContent = await performWebResearch(
        story,
        codebaseContext,
        path.dirname(sdlcRoot),
        options.onProgress
      );

      if (webResearchContent.trim()) {
        // Re-parse story to get updated content after codebase research
        const updatedStory = parseStory(storyPath);
        await appendToSection(updatedStory, 'Research', '\n## Web Research Findings\n\n' + webResearchContent);
        changesMade.push('Added web research findings');
      } else {
        getLogger().info('web-research', 'Web research returned empty - tools may be unavailable');
        changesMade.push('Web research skipped: tools unavailable');
      }
    } else {
      changesMade.push('Web research skipped: no external dependencies detected');
    }

    // Mark research as complete
    await updateStoryField(story, 'research_complete', true);
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
 * Gather context about the codebase for research
 */
async function gatherCodebaseContext(sdlcRoot: string): Promise<string> {
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
  const internalKeywords = [
    'refactor internal',
    'move function',
    'rename variable',
    'rename function',
    'move utility',
    'internal refactor',
    'move code',
    'reorganize internal',
  ];

  for (const keyword of internalKeywords) {
    if (combinedText.includes(keyword)) {
      getLogger().info('web-research', `Skipping web research: purely internal topic detected (${keyword})`);
      return false;
    }
  }

  // Trigger if external library/API/framework mentioned
  const externalKeywords = [
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

  for (const keyword of externalKeywords) {
    if (combinedText.includes(keyword)) {
      getLogger().info('web-research', `Web research triggered: external keyword detected (${keyword})`);
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
 * Parse FAR evaluation from web research finding text.
 * Expected format from LLM:
 * **FAR Score**: Factuality: 5, Actionability: 4, Relevance: 5
 * **Justification**: Official documentation provides...
 *
 * Returns a default low score if parsing fails.
 */
export function evaluateFAR(finding: string): FARScore {
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
        return { factuality, actionability, relevance, justification };
      }
    }

    // If parsing failed, return a default low score
    getLogger().warn('web-research', 'Failed to parse FAR scores from finding, using defaults');
    return {
      factuality: 3,
      actionability: 3,
      relevance: 3,
      justification: 'Unable to parse FAR evaluation from finding',
    };
  } catch (error) {
    getLogger().error('web-research', 'Error parsing FAR scores', { error });
    return {
      factuality: 3,
      actionability: 3,
      relevance: 3,
      justification: 'Error parsing FAR evaluation',
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
    const webResearchPrompt = `You are performing supplementary web research for a software development story.

**Story Title**: ${story.frontmatter.title}

**Story Content**:
${story.content}

**Codebase Context** (already analyzed):
${codebaseContext.substring(0, 2000)}... [truncated]

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
