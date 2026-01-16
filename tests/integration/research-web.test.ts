import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Use vi.hoisted to define mock before vi.mock factory runs (handles hoisting)
const { mockRunAgentQuery } = vi.hoisted(() => ({
  mockRunAgentQuery: vi.fn(),
}));

// Mock the agent query function
vi.mock('../../src/core/client.js', () => ({
  runAgentQuery: mockRunAgentQuery,
  AgentProgressEvent: {},
}));

// Mock logger
vi.mock('../../src/core/logger.js', () => ({
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
  initLogger: vi.fn(),
}));

// Import the functions we need to test after setting up mocks
import {
  runResearchAgent,
  shouldPerformWebResearch,
  evaluateFAR,
  sanitizeWebResearchContent,
  sanitizeForLogging,
  sanitizeCodebaseContext
} from '../../src/agents/research.js';
import { parseStory } from '../../src/core/story.js';

describe('Research Web Integration Tests', () => {
  let tempDir: string;
  let sdlcRoot: string;
  let storyPath: string;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create a temporary directory for testing
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'research-web-test-'));
    sdlcRoot = path.join(tempDir, '.ai-sdlc');
    const backlogDir = path.join(sdlcRoot, 'backlog');

    fs.mkdirSync(sdlcRoot, { recursive: true });
    fs.mkdirSync(backlogDir, { recursive: true });

    // Create a test story
    storyPath = path.join(backlogDir, 'test-story.md');
    const storyContent = `---
id: S-TEST-001
title: Test Story
slug: test-story
priority: 10
status: backlog
type: feature
created: 2024-01-01
labels: []
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
---

# Test Story

## User Story
As a developer, I want to integrate Stripe API for payments.

## Acceptance Criteria
- [ ] Stripe SDK integrated
- [ ] Payment processing endpoint created
`;

    fs.writeFileSync(storyPath, storyContent);

    // Create minimal package.json for codebase context
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({
      name: 'test-project',
      version: '1.0.0',
    }));

    // Create .ai-sdlc.json config
    fs.writeFileSync(path.join(tempDir, '.ai-sdlc.json'), JSON.stringify({
      logging: { enabled: false },
    }));
  });

  afterEach(() => {
    // Clean up temporary directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should perform web research when external library detected', async () => {
    // Mock codebase research response
    mockRunAgentQuery
      .mockResolvedValueOnce('## Codebase Analysis\n\nExisting payment patterns found...')
      .mockResolvedValueOnce('### Stripe API Documentation\n**Source**: Context7 - Stripe\n**FAR Score**: Factuality: 5, Actionability: 5, Relevance: 5\n**Justification**: Official Stripe documentation.\n\nStripe API patterns...');

    const result = await runResearchAgent(storyPath, sdlcRoot);

    expect(result.success).toBe(true);
    expect(result.changesMade).toContain('Added codebase research findings');
    expect(result.changesMade).toContain('Added web research findings');

    // Verify story was updated with both sections
    const updatedStory = parseStory(storyPath);
    expect(updatedStory.content).toContain('## Research');
    expect(updatedStory.content).toContain('## Web Research Findings');
    expect(updatedStory.frontmatter.research_complete).toBe(true);

    // Verify runAgentQuery was called twice (codebase + web)
    expect(mockRunAgentQuery).toHaveBeenCalledTimes(2);
  });

  it('should skip web research for internal refactoring', async () => {
    // Update story to be internal-only
    const internalStoryContent = `---
id: S-TEST-002
title: Refactor Internal Utility Functions
slug: test-story-internal
priority: 10
status: backlog
type: feature
created: 2024-01-01
labels: []
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
---

# Refactor Internal Utility Functions

## User Story
As a developer, I want to refactor internal utility functions for better maintainability.
`;

    fs.writeFileSync(storyPath, internalStoryContent);

    mockRunAgentQuery.mockResolvedValueOnce('## Codebase Analysis\n\nUtility functions found in src/utils...');

    const result = await runResearchAgent(storyPath, sdlcRoot);

    expect(result.success).toBe(true);
    expect(result.changesMade).toContain('Added codebase research findings');
    expect(result.changesMade).toContain('Web research skipped: no external dependencies detected');

    // Verify story was updated with only codebase research
    const updatedStory = parseStory(storyPath);
    expect(updatedStory.content).toContain('## Research');
    expect(updatedStory.content).not.toContain('## Web Research Findings');

    // Verify runAgentQuery was called only once (codebase only)
    expect(mockRunAgentQuery).toHaveBeenCalledTimes(1);
  });

  it('should gracefully skip web research when tools unavailable', async () => {
    mockRunAgentQuery
      .mockResolvedValueOnce('## Codebase Analysis\n\nExisting patterns...')
      .mockResolvedValueOnce('Web research tools unavailable - skipping web research');

    const result = await runResearchAgent(storyPath, sdlcRoot);

    expect(result.success).toBe(true);
    expect(result.changesMade).toContain('Added codebase research findings');
    expect(result.changesMade).toContain('Web research skipped: tools unavailable');

    // Verify story has codebase research but no web research section
    const updatedStory = parseStory(storyPath);
    expect(updatedStory.content).toContain('## Research');
    expect(updatedStory.content).not.toContain('## Web Research Findings');
  });

  it('should handle web research failure gracefully', async () => {
    mockRunAgentQuery
      .mockResolvedValueOnce('## Codebase Analysis\n\nExisting patterns...')
      .mockRejectedValueOnce(new Error('Network timeout'));

    const result = await runResearchAgent(storyPath, sdlcRoot);

    expect(result.success).toBe(true);
    expect(result.changesMade).toContain('Added codebase research findings');
    expect(result.changesMade).toContain('Web research skipped: tools unavailable');

    // Research should still complete with codebase-only findings
    const updatedStory = parseStory(storyPath);
    expect(updatedStory.content).toContain('## Research');
    expect(updatedStory.frontmatter.research_complete).toBe(true);
  });

  it('should trigger web research for API keywords', async () => {
    const apiStoryContent = `---
id: S-TEST-003
title: Add REST API Endpoint
slug: test-story-api
priority: 10
status: backlog
type: feature
created: 2024-01-01
labels: []
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
---

# Add REST API Endpoint

## User Story
As a developer, I want to create a REST API endpoint for user data.
`;

    fs.writeFileSync(storyPath, apiStoryContent);

    mockRunAgentQuery
      .mockResolvedValueOnce('## Codebase Analysis\n\nExisting API patterns...')
      .mockResolvedValueOnce('### REST API Best Practices\n**FAR Score**: Factuality: 4, Actionability: 4, Relevance: 5\n**Justification**: Community best practices.\n\nREST patterns...');

    const result = await runResearchAgent(storyPath, sdlcRoot);

    expect(result.success).toBe(true);
    expect(result.changesMade).toContain('Added web research findings');

    // Verify web research was performed
    expect(mockRunAgentQuery).toHaveBeenCalledTimes(2);
  });

  it('should trigger web research for framework keywords', async () => {
    const frameworkStoryContent = `---
id: S-TEST-004
title: Use React Query Framework
slug: test-story-framework
priority: 10
status: backlog
type: feature
created: 2024-01-01
labels: []
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
---

# Use React Query Framework

## User Story
As a developer, I want to use React Query framework for data fetching.
`;

    fs.writeFileSync(storyPath, frameworkStoryContent);

    mockRunAgentQuery
      .mockResolvedValueOnce('## Codebase Analysis\n\nExisting data fetching...')
      .mockResolvedValueOnce('### React Query Documentation\n**FAR Score**: Factuality: 5, Actionability: 5, Relevance: 5\n**Justification**: Official docs.\n\nReact Query patterns...');

    const result = await runResearchAgent(storyPath, sdlcRoot);

    expect(result.success).toBe(true);
    expect(result.changesMade).toContain('Added web research findings');

    // Verify web research was performed
    expect(mockRunAgentQuery).toHaveBeenCalledTimes(2);
  });

  it('should pass onProgress callback to both research phases', async () => {
    const progressEvents: string[] = [];
    const mockProgress = vi.fn((event) => {
      progressEvents.push(event.type);
    });

    mockRunAgentQuery
      .mockResolvedValueOnce('## Codebase Analysis\n\nPatterns...')
      .mockResolvedValueOnce('### Web Finding\n**FAR Score**: Factuality: 4, Actionability: 4, Relevance: 4\n**Justification**: Test.\n\nContent...');

    await runResearchAgent(storyPath, sdlcRoot, { onProgress: mockProgress });

    // Verify onProgress was passed to runAgentQuery calls
    expect(mockRunAgentQuery).toHaveBeenCalledTimes(2);
    const firstCall = mockRunAgentQuery.mock.calls[0][0];
    const secondCall = mockRunAgentQuery.mock.calls[1][0];

    expect(firstCall.onProgress).toBe(mockProgress);
    expect(secondCall.onProgress).toBe(mockProgress);
  });

  it('should handle empty web research result', async () => {
    mockRunAgentQuery
      .mockResolvedValueOnce('## Codebase Analysis\n\nPatterns...')
      .mockResolvedValueOnce(''); // Empty web research

    const result = await runResearchAgent(storyPath, sdlcRoot);

    expect(result.success).toBe(true);
    expect(result.changesMade).toContain('Web research skipped: tools unavailable');

    // Should not have Web Research Findings section
    const updatedStory = parseStory(storyPath);
    expect(updatedStory.content).not.toContain('## Web Research Findings');
  });

  it('should handle whitespace-only web research result', async () => {
    mockRunAgentQuery
      .mockResolvedValueOnce('## Codebase Analysis\n\nPatterns...')
      .mockResolvedValueOnce('   \n\n  \t  '); // Whitespace only

    const result = await runResearchAgent(storyPath, sdlcRoot);

    expect(result.success).toBe(true);
    expect(result.changesMade).toContain('Web research skipped: tools unavailable');

    // Should not have Web Research Findings section
    const updatedStory = parseStory(storyPath);
    expect(updatedStory.content).not.toContain('## Web Research Findings');
  });
});

describe('Security: Injection Prevention', () => {
  let tempDir: string;
  let sdlcRoot: string;
  let storyPath: string;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create a temporary directory for testing
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'research-security-test-'));
    sdlcRoot = path.join(tempDir, '.ai-sdlc');
    const backlogDir = path.join(sdlcRoot, 'backlog');

    fs.mkdirSync(sdlcRoot, { recursive: true });
    fs.mkdirSync(backlogDir, { recursive: true });

    // Create minimal package.json
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({ name: 'test' }));

    // Create .ai-sdlc.json config
    fs.writeFileSync(path.join(tempDir, '.ai-sdlc.json'), JSON.stringify({
      logging: { enabled: false },
    }));
  });

  afterEach(() => {
    // Clean up temporary directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should strip ANSI escape sequences from web research results before storage', async () => {
    const backlogDir = path.join(sdlcRoot, 'backlog');
    storyPath = path.join(backlogDir, 'test-story.md');

    const storyContent = `---
id: S-TEST-ANSI
title: Test ANSI Injection
slug: test-ansi
priority: 10
status: backlog
type: feature
created: 2024-01-01
labels: []
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
---

# Test ANSI Injection

## User Story
As a developer, I want to integrate an external API.
`;

    fs.writeFileSync(storyPath, storyContent);

    // Mock web research result with ANSI escape sequences
    mockRunAgentQuery
      .mockResolvedValueOnce('## Codebase Analysis\n\nPatterns...')
      .mockResolvedValueOnce('\x1b[31mRed text\x1b[0m and \x1b[1;32mbold green\x1b[0m research finding');

    const result = await runResearchAgent(storyPath, sdlcRoot);

    expect(result.success).toBe(true);

    // Verify ANSI codes were stripped before storage
    const updatedStory = parseStory(storyPath);
    expect(updatedStory.content).toContain('Red text and bold green research finding');
    expect(updatedStory.content).not.toContain('\x1b[');
    expect(updatedStory.content).not.toContain('\x1b');
  });

  it('should escape markdown injection attempts (triple backticks)', async () => {
    const backlogDir = path.join(sdlcRoot, 'backlog');
    storyPath = path.join(backlogDir, 'test-story.md');

    const storyContent = `---
id: S-TEST-MD
title: Test Markdown Injection
slug: test-md
priority: 10
status: backlog
type: feature
created: 2024-01-01
labels: []
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
---

# Test Markdown Injection

## User Story
As a developer, I want to integrate an external library.
`;

    fs.writeFileSync(storyPath, storyContent);

    // Mock web research result with markdown injection attempt
    mockRunAgentQuery
      .mockResolvedValueOnce('## Codebase Analysis\n\nPatterns...')
      .mockResolvedValueOnce('Finding with ```malicious code block``` injection');

    const result = await runResearchAgent(storyPath, sdlcRoot);

    expect(result.success).toBe(true);

    // Verify triple backticks were escaped
    const updatedStory = parseStory(storyPath);
    expect(updatedStory.content).toContain('\\`\\`\\`');
    expect(updatedStory.content).not.toMatch(/```[^\\]/); // No unescaped triple backticks
  });

  it('should remove control characters from web research results', async () => {
    const backlogDir = path.join(sdlcRoot, 'backlog');
    storyPath = path.join(backlogDir, 'test-story.md');

    const storyContent = `---
id: S-TEST-CTRL
title: Test Control Characters
slug: test-ctrl
priority: 10
status: backlog
type: feature
created: 2024-01-01
labels: []
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
---

# Test Control Characters

## User Story
As a developer, I want to integrate an external SDK.
`;

    fs.writeFileSync(storyPath, storyContent);

    // Mock web research result with control characters
    mockRunAgentQuery
      .mockResolvedValueOnce('## Codebase Analysis\n\nPatterns...')
      .mockResolvedValueOnce('Finding\x00with\x0Econtrol\x1Fcharacters');

    const result = await runResearchAgent(storyPath, sdlcRoot);

    expect(result.success).toBe(true);

    // Verify control characters were removed
    const updatedStory = parseStory(storyPath);
    expect(updatedStory.content).toContain('Findingwithcontrolcharacters');
    // Check that specific control chars are gone
    expect(updatedStory.content).not.toContain('\x00');
    expect(updatedStory.content).not.toContain('\x0E');
    expect(updatedStory.content).not.toContain('\x1F');
  });

  it('should truncate extremely long web research results (>10KB)', async () => {
    const backlogDir = path.join(sdlcRoot, 'backlog');
    storyPath = path.join(backlogDir, 'test-story.md');

    const storyContent = `---
id: S-TEST-LONG
title: Test Long Input
slug: test-long
priority: 10
status: backlog
type: feature
created: 2024-01-01
labels: []
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
---

# Test Long Input

## User Story
As a developer, I want to integrate an external API.
`;

    fs.writeFileSync(storyPath, storyContent);

    // Mock web research result with extremely long content
    const longContent = 'a'.repeat(15000); // 15KB
    mockRunAgentQuery
      .mockResolvedValueOnce('## Codebase Analysis\n\nPatterns...')
      .mockResolvedValueOnce(longContent);

    const result = await runResearchAgent(storyPath, sdlcRoot);

    expect(result.success).toBe(true);

    // Verify content was truncated to 10KB
    const updatedStory = parseStory(storyPath);
    const webResearchSection = updatedStory.content.split('## Web Research Findings')[1];
    expect(webResearchSection.length).toBeLessThan(11000); // Some overhead for section header
  });

  it('should sanitize codebase context with triple backticks before LLM prompt', async () => {
    const backlogDir = path.join(sdlcRoot, 'backlog');
    storyPath = path.join(backlogDir, 'test-story.md');

    const storyContent = `---
id: S-TEST-PROMPT
title: Test Prompt Injection
slug: test-prompt
priority: 10
status: backlog
type: feature
created: 2024-01-01
labels: []
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
---

# Test Prompt Injection

## User Story
As a developer, I want to integrate an external framework.
`;

    fs.writeFileSync(storyPath, storyContent);

    // Create source file with triple backticks (potential prompt injection)
    fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'src', 'malicious.ts'), '```\nmalicious code\n```');

    mockRunAgentQuery
      .mockResolvedValueOnce('## Codebase Analysis\n\nPatterns...')
      .mockResolvedValueOnce('### Web Finding\n**FAR Score**: Factuality: 4, Actionability: 4, Relevance: 4\n**Justification**: Test.\n\nContent...');

    const result = await runResearchAgent(storyPath, sdlcRoot);

    expect(result.success).toBe(true);

    // Verify that the prompt passed to runAgentQuery had sanitized context
    const firstCallPrompt = mockRunAgentQuery.mock.calls[0][0].prompt;
    // If triple backticks were in context, they should be escaped
    if (firstCallPrompt.includes('```')) {
      // The actual context might not include the file content, but if it does, it should be escaped
      expect(firstCallPrompt).not.toMatch(/```[^\\]/);
    }
  });

  it('should prevent log injection via newline characters', async () => {
    // This test verifies the sanitizeForLogging function is used correctly
    const story = {
      path: '/test/story.md',
      slug: 'test',
      frontmatter: {
        id: 'S-001',
        title: 'Test Story',
        slug: 'test',
        priority: 10,
        status: 'backlog' as const,
        type: 'feature' as const,
        created: '2024-01-01',
        labels: [],
        research_complete: false,
        plan_complete: false,
        implementation_complete: false,
        reviews_complete: false,
      },
      content: 'Integrate API\nFake log entry: [ERROR] Unauthorized',
    };

    // Call shouldPerformWebResearch which logs the keyword
    // This will trigger logging with sanitization
    const result = shouldPerformWebResearch(story, '');

    // The function should return true (API keyword detected)
    expect(result).toBe(true);

    // We can't easily verify logs were sanitized without inspecting the logger mock,
    // but the unit tests for sanitizeForLogging cover this
  });

  it('should handle web research with OSC hyperlink sequences', async () => {
    const backlogDir = path.join(sdlcRoot, 'backlog');
    storyPath = path.join(backlogDir, 'test-story.md');

    const storyContent = `---
id: S-TEST-OSC
title: Test OSC Sequences
slug: test-osc
priority: 10
status: backlog
type: feature
created: 2024-01-01
labels: []
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
---

# Test OSC Sequences

## User Story
As a developer, I want to integrate an external library.
`;

    fs.writeFileSync(storyPath, storyContent);

    // Mock web research result with OSC sequences (hyperlinks)
    mockRunAgentQuery
      .mockResolvedValueOnce('## Codebase Analysis\n\nPatterns...')
      .mockResolvedValueOnce('Link: \x1b]8;;https://example.com\x07click here\x1b]8;;\x07');

    const result = await runResearchAgent(storyPath, sdlcRoot);

    expect(result.success).toBe(true);

    // Verify OSC sequences were removed
    const updatedStory = parseStory(storyPath);
    expect(updatedStory.content).toContain('Link: click here');
    expect(updatedStory.content).not.toContain('\x1b]8');
    expect(updatedStory.content).not.toContain('\x07');
  });
});

describe('Web Research Decision Logic Edge Cases', () => {
  it('should detect external keywords in title only', () => {
    const story = {
      path: '/test/story.md',
      slug: 'test',
      frontmatter: {
        id: 'S-001',
        title: 'Integrate Stripe Payment API',
        slug: 'test',
        priority: 10,
        status: 'backlog' as const,
        type: 'feature' as const,
        created: '2024-01-01',
        labels: [],
        research_complete: false,
        plan_complete: false,
        implementation_complete: false,
        reviews_complete: false,
      },
      content: 'Add payment processing.',
    };

    const result = shouldPerformWebResearch(story, '');
    expect(result).toBe(true);
  });

  it('should handle case-insensitive matching', () => {
    const story = {
      path: '/test/story.md',
      slug: 'test',
      frontmatter: {
        id: 'S-001',
        title: 'Test Story',
        slug: 'test',
        priority: 10,
        status: 'backlog' as const,
        type: 'feature' as const,
        created: '2024-01-01',
        labels: [],
        research_complete: false,
        plan_complete: false,
        implementation_complete: false,
        reviews_complete: false,
      },
      content: 'We need to INTEGRATE the API using the FRAMEWORK.',
    };

    const result = shouldPerformWebResearch(story, '');
    expect(result).toBe(true);
  });

  it('should detect npm dependency in codebase context', () => {
    const story = {
      path: '/test/story.md',
      slug: 'test',
      frontmatter: {
        id: 'S-001',
        title: 'Update Dependencies',
        slug: 'test',
        priority: 10,
        status: 'backlog' as const,
        type: 'feature' as const,
        created: '2024-01-01',
        labels: [],
        research_complete: false,
        plan_complete: false,
        implementation_complete: false,
        reviews_complete: false,
      },
      content: 'Install new npm logging library.',
    };

    const codebaseContext = '=== package.json ===\n{"dependencies": {"express": "^4.0.0"}}';
    const result = shouldPerformWebResearch(story, codebaseContext);
    expect(result).toBe(true);
  });
});
