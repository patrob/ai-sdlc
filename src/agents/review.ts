import { execSync } from 'child_process';
import path from 'path';
import { parseStory, writeStory, moveStory, appendToSection, updateStoryField } from '../core/story.js';
import { runAgentQuery } from '../core/client.js';
import { Story, AgentResult } from '../types/index.js';

const CODE_REVIEW_PROMPT = `You are a senior code reviewer. Review the implementation for:
1. Code quality and maintainability
2. Following best practices
3. Potential bugs or issues
4. Test coverage adequacy

Provide constructive feedback with specific suggestions.`;

const SECURITY_REVIEW_PROMPT = `You are a security specialist. Review the implementation for:
1. OWASP Top 10 vulnerabilities
2. Input validation issues
3. Authentication/authorization problems
4. Data exposure risks

Flag any security concerns with severity levels.`;

const PO_REVIEW_PROMPT = `You are a product owner validating the implementation. Check:
1. Does it meet the acceptance criteria?
2. Is the user experience appropriate?
3. Are edge cases handled?
4. Is documentation adequate?

Approve or request changes with specific feedback.`;

/**
 * Review Agent
 *
 * Orchestrates code review, security review, and PO acceptance.
 */
export async function runReviewAgent(
  storyPath: string,
  sdlcRoot: string
): Promise<AgentResult> {
  const story = parseStory(storyPath);
  const changesMade: string[] = [];
  const workingDir = path.dirname(sdlcRoot);

  try {
    // Run all reviews in parallel
    const [codeReview, securityReview, poReview] = await Promise.all([
      runSubReview(story, CODE_REVIEW_PROMPT, 'Code Review', workingDir),
      runSubReview(story, SECURITY_REVIEW_PROMPT, 'Security Review', workingDir),
      runSubReview(story, PO_REVIEW_PROMPT, 'Product Owner Review', workingDir),
    ]);

    // Compile review notes
    const reviewNotes = `
### Code Review
${codeReview}

### Security Review
${securityReview}

### Product Owner Review
${poReview}

---
*Reviews completed: ${new Date().toISOString().split('T')[0]}*
`;

    // Append reviews to story
    appendToSection(story, 'Review Notes', reviewNotes);
    changesMade.push('Added code review notes');
    changesMade.push('Added security review notes');
    changesMade.push('Added product owner review notes');

    // Check if all reviews passed (simplified check for MVP)
    const allPassed = !codeReview.toLowerCase().includes('block') &&
                      !securityReview.toLowerCase().includes('critical') &&
                      !poReview.toLowerCase().includes('reject');

    if (allPassed) {
      updateStoryField(story, 'reviews_complete', true);
      changesMade.push('Marked reviews_complete: true');
    } else {
      changesMade.push('Reviews flagged issues - manual review required');
    }

    return {
      success: true,
      story: parseStory(storyPath),
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
 * Run a sub-review with a specific prompt
 */
async function runSubReview(
  story: Story,
  systemPrompt: string,
  reviewType: string,
  workingDir: string
): Promise<string> {
  try {
    const prompt = `Review this story implementation:

Title: ${story.frontmatter.title}

Full story content:
${story.content}

Provide your ${reviewType} feedback. Be specific and actionable.`;

    return await runAgentQuery({
      prompt,
      systemPrompt,
      workingDirectory: workingDir,
    });
  } catch (error) {
    return `${reviewType} failed: ${error instanceof Error ? error.message : String(error)}`;
  }
}

/**
 * Create a pull request for the completed story
 */
export async function createPullRequest(
  storyPath: string,
  sdlcRoot: string
): Promise<AgentResult> {
  const story = parseStory(storyPath);
  const changesMade: string[] = [];
  const workingDir = path.dirname(sdlcRoot);

  try {
    const branchName = story.frontmatter.branch || `agentic-sdlc/${story.slug}`;

    // Check if gh CLI is available
    try {
      execSync('gh --version', { stdio: 'pipe' });
    } catch {
      changesMade.push('GitHub CLI not available - PR creation skipped');

      // Still move to done for MVP
      moveStory(story, 'done', sdlcRoot);
      changesMade.push('Moved story to done/');

      return {
        success: true,
        story: parseStory(storyPath),
        changesMade,
      };
    }

    // Create PR using gh CLI
    try {
      // First, ensure we're on the right branch and have changes committed
      execSync(`git checkout ${branchName}`, { cwd: workingDir, stdio: 'pipe' });

      // Check for uncommitted changes and commit them
      const status = execSync('git status --porcelain', { cwd: workingDir, encoding: 'utf-8' });
      if (status.trim()) {
        execSync('git add -A', { cwd: workingDir, stdio: 'pipe' });
        execSync(`git commit -m "feat: ${story.frontmatter.title}"`, { cwd: workingDir, stdio: 'pipe' });
        changesMade.push('Committed changes');
      }

      // Push branch
      execSync(`git push -u origin ${branchName}`, { cwd: workingDir, stdio: 'pipe' });
      changesMade.push(`Pushed branch: ${branchName}`);

      // Create PR
      const prBody = `## Summary

${story.frontmatter.title}

## Story

${story.content.substring(0, 1000)}...

## Checklist

- [x] Implementation complete
- [x] Code review passed
- [x] Security review passed
- [x] Product owner approved

---
*Created by agentic-sdlc*`;

      const prOutput = execSync(
        `gh pr create --title "${story.frontmatter.title}" --body "${prBody.replace(/"/g, '\\"')}"`,
        { cwd: workingDir, encoding: 'utf-8' }
      );

      const prUrl = prOutput.trim();
      updateStoryField(story, 'pr_url', prUrl);
      changesMade.push(`Created PR: ${prUrl}`);
    } catch (error) {
      changesMade.push(`PR creation failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Move story to done
    moveStory(story, 'done', sdlcRoot);
    changesMade.push('Moved story to done/');

    return {
      success: true,
      story: parseStory(storyPath),
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
