---
id: story-mk6y2frt-fvnh
title: >-
  Handle stale workflow state: when story path in state no longer exists,
  re-lookup story by ID and update path, or gracefully skip and log warning
priority: 6
status: ready
type: feature
created: '2026-01-09'
labels:
  - s
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
updated: '2026-01-09'
---
# Handle stale workflow state: when story path in state no longer exists, re-lookup story by ID and update path, or gracefully skip and log warning

## User Story

As a **developer using the workflow system**, I want the system to **automatically handle cases where a story file path in the workflow state no longer exists** so that **the workflow can continue without crashing and I can understand what happened through clear logging**.

## Summary

When a workflow resumes or continues execution, it may reference story file paths stored in its state. If a story file has been moved, renamed, or deleted since the workflow last ran, the current path becomes stale. The system should detect this condition, attempt to relocate the story by its ID, update the state with the new path if found, or gracefully skip the story with appropriate warning logging if it cannot be recovered.

## Acceptance Criteria

- [ ] When a story path from workflow state doesn't exist, the system attempts to re-lookup the story by its ID
- [ ] If the story is found at a new location, the workflow state is updated with the correct path and execution continues
- [ ] If the story cannot be found by ID, the system logs a clear warning message including the story ID and stale path
- [ ] When a story cannot be found, the workflow gracefully skips that story and continues processing other stories (doesn't crash)
- [ ] The warning log includes sufficient context: story ID, original path, timestamp, and workflow context
- [ ] The path update mechanism preserves all other story metadata in the workflow state
- [ ] Changes are covered by unit tests for both successful recovery and graceful failure scenarios
- [ ] Edge case handled: Story ID lookup returns multiple matches (log error and skip)
- [ ] Edge case handled: Story ID format is invalid or corrupted in state (log error and skip)

## Constraints & Edge Cases

**Constraints:**
- Must not break existing workflows that have valid paths
- Should handle concurrent workflows that might be accessing the same stories
- Performance: story lookup by ID should be efficient (consider caching if needed)

**Edge Cases:**
- Story file was deleted intentionally and should not be recovered
- Story file was renamed multiple times between workflow runs
- Multiple story files claim the same ID (data corruption scenario)
- Story ID is missing or null in the workflow state
- Workflow state format is corrupted or uses legacy schema
- File system permissions prevent reading the new location even if found

## Research

<!-- Populated by research agent -->

## Implementation Plan

<!-- Populated by planning agent -->

## Review Notes

<!-- Populated by review agents -->

---

**Effort:** medium

**Labels:** reliability, error-handling, workflow, technical-debt, enhancement
