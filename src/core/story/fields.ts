import { type Story, type StoryFrontmatter } from '../../types/index.js';
import { parseStory, readSectionContent,writeStory } from './io.js';

/**
 * Update story frontmatter field
 */
export async function updateStoryField<K extends keyof StoryFrontmatter>(
  story: Story,
  field: K,
  value: StoryFrontmatter[K]
): Promise<Story> {
  story.frontmatter[field] = value;
  story.frontmatter.updated = new Date().toISOString().split('T')[0];
  await writeStory(story);
  return story;
}

/**
 * Append content to a section in the story
 * @deprecated Use writeSectionContent() for new code. This function writes to story.md.
 */
export async function appendToSection(story: Story, section: string, content: string): Promise<Story> {
  const sectionHeader = `## ${section}`;
  const sectionIndex = story.content.indexOf(sectionHeader);

  if (sectionIndex === -1) {
    // Section doesn't exist, add it at the end
    story.content += `\n\n${sectionHeader}\n\n${content}`;
  } else {
    // Find the next section or end of content
    const afterHeader = sectionIndex + sectionHeader.length;
    const nextSectionMatch = story.content.substring(afterHeader).match(/\n## /);
    const insertPoint = nextSectionMatch
      ? afterHeader + nextSectionMatch.index!
      : story.content.length;

    // Insert content before next section
    story.content =
      story.content.substring(0, insertPoint).trimEnd() +
      '\n\n' +
      content +
      '\n' +
      story.content.substring(insertPoint);
  }

  story.frontmatter.updated = new Date().toISOString().split('T')[0];
  await writeStory(story);
  return story;
}

/**
 * Get story context including all section files.
 * Useful for agents that need to read other phases' output.
 *
 * @param storyPath - Path to the story.md file
 * @returns Object with story and all section content
 */
export async function getStoryContext(storyPath: string): Promise<{
  story: Story;
  research: string;
  plan: string;
  review: string;
}> {
  const story = parseStory(storyPath);
  const [research, plan, review] = await Promise.all([
    readSectionContent(storyPath, 'research'),
    readSectionContent(storyPath, 'plan'),
    readSectionContent(storyPath, 'review'),
  ]);

  return { story, research, plan, review };
}
