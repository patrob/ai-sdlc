---
id: S-0077
title: Progress comments on milestones
priority: 70
status: backlog
type: feature
created: '2026-01-19'
labels:
  - github
  - comments
  - visibility
  - ticketing
  - epic-ticketing-integration
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
slug: progress-comments-on-milestones
dependencies:
  - S-0075
---
# Progress comments on milestones

## User Story

**As a** stakeholder
**I want** progress comments posted to issues at milestones
**So that** I can follow progress without CLI access

## Summary

This story adds automatic progress comments to linked GitHub Issues at key milestones in the SDLC workflow. This provides visibility to team members and stakeholders who follow issues but don't use the CLI directly.

## Context

### Milestone Comments

When ai-sdlc reaches certain milestones, it posts a structured comment to the linked GitHub Issue:

```
🔬 Research Complete

Summary:
- Analyzed existing authentication patterns
- Identified 3 implementation approaches
- Recommended: JWT with refresh tokens

Next: Planning phase
```

### Configuration

```json
{
  "ticketing": {
    "provider": "github",
    "postProgressComments": true
  }
}
```

## Acceptance Criteria

### Comment Triggers

- [ ] Post comment when **research completes**:
  ```markdown
  ## 🔬 Research Complete

  **Summary:**
  [First 2-3 sentences of research findings]

  **Key findings:**
  - [Bullet points extracted from research]

  **Next:** Planning phase

  ---
  *Posted by ai-sdlc*
  ```

- [ ] Post comment when **plan completes**:
  ```markdown
  ## 📋 Implementation Plan Ready

  **Approach:**
  [Brief description of implementation approach]

  **Tasks:**
  - [ ] Task 1
  - [ ] Task 2
  - [ ] Task 3

  **Estimated scope:** [X files, Y changes]

  **Next:** Implementation phase

  ---
  *Posted by ai-sdlc*
  ```

- [ ] Post comment when **review completes** (approved):
  ```markdown
  ## ✅ Review Passed

  **Review summary:**
  - Code quality: ✅ Passed
  - Security: ✅ Passed
  - Requirements: ✅ Passed

  **PR:** #456

  ---
  *Posted by ai-sdlc*
  ```

- [ ] Post comment when **review requires changes**:
  ```markdown
  ## 🔄 Changes Requested

  **Review feedback:**
  - [Issue 1]
  - [Issue 2]

  **Action:** Rework in progress (attempt 1/3)

  ---
  *Posted by ai-sdlc*
  ```

- [ ] Post comment when **blocked**:
  ```markdown
  ## ⚠️ Story Blocked

  **Reason:** [blocked_reason from frontmatter]

  **Action required:** [What needs to happen to unblock]

  ---
  *Posted by ai-sdlc*
  ```

### Implementation

- [ ] Add `postMilestoneComment()` method:
  ```typescript
  async function postMilestoneComment(
    story: Story,
    milestone: 'research' | 'plan' | 'review_passed' | 'review_rejected' | 'blocked',
    details: MilestoneDetails
  ): Promise<void> {
    if (!config.ticketing?.postProgressComments) return;
    if (!story.frontmatter.ticket_id) return;

    const comment = formatMilestoneComment(milestone, details);
    await provider.addComment(story.frontmatter.ticket_id, comment);
  }
  ```

- [ ] Integrate with agent completion hooks:
  - [ ] Research agent: call on research_complete
  - [ ] Planning agent: call on plan_complete
  - [ ] Review agent: call on review decision
  - [ ] Status updates: call when story becomes blocked

### Content Extraction

- [ ] Extract summary from research document:
  ```typescript
  function extractResearchSummary(story: Story): string {
    // Find ## Summary or ## Key Findings section
    // Return first 2-3 sentences
    // Truncate to 500 characters max
  }
  ```

- [ ] Extract tasks from implementation plan:
  ```typescript
  function extractPlanTasks(story: Story): string[] {
    // Find task checkboxes in plan
    // Return first 5-10 tasks
  }
  ```

- [ ] Extract review summary:
  ```typescript
  function extractReviewSummary(reviewResult: ReviewResult): string {
    // Format pass/fail for each perspective
    // Include key feedback points
  }
  ```

### Comment Formatting

- [ ] Use GitHub-flavored markdown
- [ ] Include emoji for visual scanning
- [ ] Keep comments concise (under 1000 characters)
- [ ] Include "Posted by ai-sdlc" footer for attribution
- [ ] Use collapsible sections for longer content:
  ```markdown
  <details>
  <summary>Full research findings</summary>

  [Longer content here]

  </details>
  ```

### Testing

- [ ] Unit test: formatMilestoneComment generates correct markdown
- [ ] Unit test: extractResearchSummary extracts summary correctly
- [ ] Unit test: extractPlanTasks extracts tasks correctly
- [ ] Unit test: comments not posted when postProgressComments is false
- [ ] Unit test: comments not posted when no ticket_id
- [ ] Integration test: research completion posts comment
- [ ] Integration test: plan completion posts comment
- [ ] Integration test: review completion posts comment

### Documentation

- [ ] Document `postProgressComments` configuration option
- [ ] Document milestone comment formats
- [ ] Show example comments in documentation
- [ ] Note that comments are optional and can be disabled

## Technical Details

### Comment Templates

Store templates in `src/services/ticket-provider/comment-templates.ts`:

```typescript
export const MILESTONE_TEMPLATES = {
  research: `## 🔬 Research Complete

**Summary:**
{{summary}}

**Key findings:**
{{findings}}

**Next:** Planning phase

---
*Posted by ai-sdlc*`,

  plan: `## 📋 Implementation Plan Ready
...`,

  // etc.
};
```

### Integration Points

Add calls in:
- `src/agents/research.ts` - after setting research_complete
- `src/agents/planning.ts` - after setting plan_complete
- `src/agents/review.ts` - after review decision
- `src/core/story.ts` - in updateStoryStatus when status becomes 'blocked'

### Rate Limiting

Be mindful of GitHub API rate limits:
- Don't post duplicate comments (check last comment before posting)
- Batch updates if multiple milestones hit quickly
- Log failures but don't retry aggressively

## Out of Scope

- Interactive comments (reactions, replies)
- Updating previous comments (always post new)
- Custom comment templates per project
- Slack/Discord/other notification integrations

## Definition of Done

- [ ] Milestone comments post at research, plan, review, blocked events
- [ ] Comments are well-formatted GitHub markdown
- [ ] Content extraction works for summaries and tasks
- [ ] Comments can be disabled via configuration
- [ ] All unit and integration tests pass
- [ ] Documentation updated
- [ ] `make verify` passes
