# Fix Story Worktree

Analyze and resolve issues in a story worktree.

**Story ID:** $ARGUMENTS

## Phase 1: Navigate to Worktree

Find and navigate to the worktree for story $ARGUMENTS:

```bash
cd .ai-sdlc/worktrees/$ARGUMENTS-story 2>/dev/null || cd .ai-sdlc/worktrees/$ARGUMENTS 2>/dev/null
```

If the worktree doesn't exist, report this and stop.

## Phase 2: Diagnose

Use the **codebase-solution-researcher** agent to analyze:
1. What work has been completed in this worktree?
2. Where did we get stuck? What's blocking progress?
3. Are there test failures, build errors, or implementation gaps?
4. Did we encounter a bug in the main codebase that needs a separate fix?

Check if an existing bug story already covers any issues found.

## Phase 3: Plan the Fix

Use the **tech-lead** agent to:
1. Review the diagnosis
2. Create a concrete plan to unblock the worktree
3. If a separate bug story is needed, identify it or recommend creating one

## Phase 4: Implement Fix

Execute the tech-lead's plan to fix the issues. Run tests and verify the fix works.

## Phase 5: Review

Use both **tech-lead** and **product-owner** agents to review:
- Does the implementation meet the story's acceptance criteria?
- Is the code quality acceptable?
- Are tests passing?

## Phase 6: Complete or Iterate

**If approved:**
1. Commit all changes to the worktree branch
2. Merge into main (from the main repo, not the worktree)
3. Mark the story as Done by updating the frontmatter:
   - Set `status: done`
   - Remove `worktree_path` and `branch` fields if present
   - Keep the story in `.ai-sdlc/stories/` - do NOT move it to a `done/` folder
4. Clean up the worktree: `git worktree remove <path>` and `git branch -d <branch>`
5. Commit the story status update
6. Push to origin

**If not approved:**
Report what needs to be fixed and recommend next steps.
