import ora from 'ora';
import { getSdlcRoot, loadConfig } from '../../core/config.js';
import { kanbanExists } from '../../core/kanban.js';
import { createStory, findStoryById } from '../../core/story.js';
import { getThemedChalk } from '../../core/theme.js';
import { parseGitHubIssueUrl, isGhAvailable } from '../../services/gh-cli.js';
import { createTicketProvider } from '../../services/ticket-provider/index.js';
import { Story } from '../../types/index.js';

/**
 * Import a GitHub Issue as a new story.
 *
 * @param issueUrl GitHub issue URL in various formats
 */
export async function importIssue(issueUrl: string): Promise<void> {
  const spinner = ora('Importing GitHub Issue...').start();

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
      console.log(c.dim('Or run: ai-sdlc config set ticketing.provider github'));
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

    // Check if issue is already imported
    const existingStories = await findStoriesByTicketId(sdlcRoot, ticket.id);
    if (existingStories.length > 0) {
      spinner.warn(`Issue #${parsed.number} is already imported`);
      console.log(c.dim(`Existing story: ${existingStories[0].slug}`));
      console.log(c.dim(`Use 'ai-sdlc link ${existingStories[0].slug} ${issueUrl}' to update the link`));
      return;
    }

    // Create the story
    spinner.text = 'Creating story...';
    const storyTitle = ticket.title;
    const storyContent = ticket.description;

    const story = await createStory(storyTitle, sdlcRoot, {
      ticket_provider: 'github',
      ticket_id: ticket.id,
      ticket_url: ticket.url,
      ticket_synced_at: new Date().toISOString(),
    }, storyContent);

    spinner.succeed(c.success(`Created story: ${story.slug} - ${story.frontmatter.title}`));
    console.log(c.dim(`Linked to: ${ticket.url}`));
    console.log();
    console.log(c.info('Next steps:'));
    console.log(c.dim(`  ai-sdlc details ${story.slug}`));
    console.log(c.dim(`  ai-sdlc run --story ${story.slug}`));
  } catch (error) {
    spinner.fail('Failed to import issue');
    if (error instanceof Error) {
      console.error(error.message);
    } else {
      console.error(error);
    }
    process.exit(1);
  }
}

/**
 * Find stories by ticket_id.
 *
 * @param sdlcRoot Root directory of .ai-sdlc
 * @param ticketId Ticket ID to search for
 * @returns Array of stories with matching ticket_id
 */
async function findStoriesByTicketId(sdlcRoot: string, ticketId: string): Promise<Story[]> {
  const fs = await import('fs');
  const path = await import('path');
  const { parseStory } = await import('../../core/story.js');

  const storiesDir = path.join(sdlcRoot, 'stories');
  const result: Story[] = [];

  if (!fs.existsSync(storiesDir)) {
    return result;
  }

  const entries = fs.readdirSync(storiesDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const storyPath = path.join(storiesDir, entry.name, 'story.md');
      if (fs.existsSync(storyPath)) {
        try {
          const story = parseStory(storyPath);
          if (story.frontmatter.ticket_id === ticketId) {
            result.push(story);
          }
        } catch {
          // Skip invalid stories
        }
      }
    }
  }

  return result;
}
