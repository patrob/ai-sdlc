import ora from 'ora';
import * as readline from 'readline';
import { getSdlcRoot, loadConfig } from '../../core/config.js';
import { kanbanExists } from '../../core/kanban.js';
import { getStory, findStoryById, writeStory } from '../../core/story.js';
import { getThemedChalk } from '../../core/theme.js';
import { parseGitHubIssueUrl, isGhAvailable } from '../../services/gh-cli.js';
import { createTicketProvider } from '../../services/ticket-provider/index.js';

/**
 * Link an existing story to a GitHub Issue.
 *
 * @param storyId Story ID or slug
 * @param issueUrl GitHub issue URL
 * @param options Command options
 */
export async function linkIssue(
  storyId: string,
  issueUrl: string,
  options?: { noSync?: boolean }
): Promise<void> {
  const spinner = ora('Linking story to GitHub Issue...').start();

  try {
    const config = loadConfig();
    const sdlcRoot = getSdlcRoot();
    const c = getThemedChalk(config);

    // Check if ai-sdlc is initialized
    if (!kanbanExists(sdlcRoot)) {
      spinner.fail('ai-sdlc not initialized. Run `ai-sdlc init` first.');
      return;
    }

    // Check if GitHub provider is configured
    if (config.ticketing?.provider !== 'github') {
      spinner.fail('GitHub provider not configured.');
      console.log(c.dim('Set ticketing.provider = "github" in .ai-sdlc/config.yaml'));
      return;
    }

    // Parse the issue URL
    const parsed = parseGitHubIssueUrl(issueUrl);
    if (!parsed) {
      spinner.fail('Invalid GitHub issue URL');
      console.log(c.dim('Supported formats:'));
      console.log(c.dim('  https://github.com/owner/repo/issues/123'));
      console.log(c.dim('  github.com/owner/repo/issues/123'));
      console.log(c.dim('  owner/repo#123'));
      return;
    }

    // Find the story
    spinner.text = 'Finding story...';
    let story = null;
    try {
      // Try as ID first (S-0074 format)
      story = findStoryById(sdlcRoot, storyId);
    } catch {
      // Try as slug
      try {
        story = getStory(sdlcRoot, storyId);
      } catch {
        spinner.fail(`Story not found: ${storyId}`);
        return;
      }
    }

    // TypeScript guard: story must be defined at this point
    if (!story) {
      spinner.fail(`Story not found: ${storyId}`);
      return;
    }

    // Check if gh CLI is available
    spinner.text = 'Checking GitHub CLI availability...';
    const ghAvailable = await isGhAvailable();
    if (!ghAvailable) {
      spinner.fail('GitHub CLI (gh) is not installed or not authenticated.');
      console.log(c.dim('Install gh CLI: https://cli.github.com/'));
      console.log(c.dim('Authenticate: gh auth login'));
      return;
    }

    // Fetch issue details
    spinner.text = `Fetching issue #${parsed.number} from ${parsed.owner}/${parsed.repo}...`;
    const provider = createTicketProvider(config);
    const ticket = await provider.get(parsed.number.toString());

    // Check if story is already linked to a different issue
    if (story.frontmatter.ticket_id && story.frontmatter.ticket_id !== ticket.id) {
      spinner.warn(`Story is already linked to issue #${story.frontmatter.ticket_id}`);
      const shouldContinue = await askYesNo(
        'Do you want to overwrite the existing link?',
        false
      );
      if (!shouldContinue) {
        console.log(c.dim('Link cancelled.'));
        return;
      }
    }

    // Ask about syncing title/description if not --no-sync
    let shouldSync = false;
    if (!options?.noSync) {
      spinner.stop();
      console.log();
      console.log(c.info('Issue details:'));
      console.log(c.dim(`  Title: ${ticket.title}`));
      console.log(c.dim(`  Status: ${ticket.status}`));
      console.log();
      console.log(c.info('Current story:'));
      console.log(c.dim(`  Title: ${story.frontmatter.title}`));
      console.log();

      shouldSync = await askYesNo(
        'Do you want to sync the story title and description from the issue?',
        false
      );

      spinner.start('Linking story...');
    }

    // Update story with ticket fields
    story.frontmatter.ticket_provider = 'github';
    story.frontmatter.ticket_id = ticket.id;
    story.frontmatter.ticket_url = ticket.url;
    story.frontmatter.ticket_synced_at = new Date().toISOString();

    // Optionally sync title and description
    if (shouldSync) {
      story.frontmatter.title = ticket.title;
      // Only update content if the story doesn't have detailed content
      if (!story.content || story.content.trim().length < 50) {
        story.content = ticket.description;
      }
    }

    // Write the updated story
    await writeStory(story);

    spinner.succeed(c.success(`Linked ${story.slug} to GitHub Issue #${ticket.id}`));
    console.log(c.dim(`Issue URL: ${ticket.url}`));
    if (shouldSync) {
      console.log(c.dim('Synced: title and description'));
    }
  } catch (error) {
    spinner.fail('Failed to link issue');
    if (error instanceof Error) {
      console.error(error.message);
    } else {
      console.error(error);
    }
    process.exit(1);
  }
}

/**
 * Ask a yes/no question and return the response.
 */
async function askYesNo(question: string, defaultValue: boolean): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    const defaultText = defaultValue ? 'Y/n' : 'y/N';
    rl.question(`${question} (${defaultText}): `, (answer) => {
      rl.close();
      const normalized = answer.trim().toLowerCase();
      if (normalized === '') {
        resolve(defaultValue);
      } else {
        resolve(normalized === 'y' || normalized === 'yes');
      }
    });
  });
}
