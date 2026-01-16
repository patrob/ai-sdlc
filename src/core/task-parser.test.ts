import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseImplementationTasks, formatImplementationTasks, validateTaskFormat } from './task-parser.js';
import { ImplementationTask, TaskStatus } from '../types/index.js';

describe('parseImplementationTasks', () => {
  describe('basic parsing', () => {
    it('parses single task with all metadata', () => {
      const content = `## Implementation Tasks

- [ ] **T1**: Create user authentication service
  - Files: \`src/services/auth.ts\`, \`src/types/auth.ts\`
  - Dependencies: none`;

      const tasks = parseImplementationTasks(content);

      expect(tasks).toHaveLength(1);
      expect(tasks[0]).toEqual({
        id: 'T1',
        description: 'Create user authentication service',
        status: 'pending',
        files: ['src/services/auth.ts', 'src/types/auth.ts'],
        dependencies: [],
      });
    });

    it('parses multiple tasks with varying metadata', () => {
      const content = `## Implementation Tasks

- [ ] **T1**: Create types
  - Files: \`src/types.ts\`
  - Dependencies: none

- [x] **T2**: Create service
  - Files: \`src/service.ts\`
  - Dependencies: T1

- [ ] **T3**: Add tests
  - Dependencies: T1, T2`;

      const tasks = parseImplementationTasks(content);

      expect(tasks).toHaveLength(3);
      expect(tasks[0].id).toBe('T1');
      expect(tasks[0].status).toBe('pending');
      expect(tasks[0].files).toEqual(['src/types.ts']);
      expect(tasks[0].dependencies).toEqual([]);

      expect(tasks[1].id).toBe('T2');
      expect(tasks[1].status).toBe('completed');
      expect(tasks[1].dependencies).toEqual(['T1']);

      expect(tasks[2].id).toBe('T3');
      expect(tasks[2].files).toBeUndefined();
      expect(tasks[2].dependencies).toEqual(['T1', 'T2']);
    });

    it('extracts task ID from **T{n}**: format', () => {
      const content = `## Implementation Tasks
- [ ] **T1**: Task one
- [ ] **T2**: Task two
- [ ] **T10**: Task ten`;

      const tasks = parseImplementationTasks(content);

      expect(tasks.map(t => t.id)).toEqual(['T1', 'T2', 'T10']);
    });

    it('extracts Files metadata as array', () => {
      const content = `## Implementation Tasks
- [ ] **T1**: Task with multiple files
  - Files: \`file1.ts\`, \`file2.ts\`, \`file3.ts\``;

      const tasks = parseImplementationTasks(content);

      expect(tasks[0].files).toEqual(['file1.ts', 'file2.ts', 'file3.ts']);
    });

    it('extracts Dependencies metadata as array', () => {
      const content = `## Implementation Tasks
- [ ] **T1**: Task with dependencies
  - Dependencies: T2, T3, T4`;

      const tasks = parseImplementationTasks(content);

      expect(tasks[0].dependencies).toEqual(['T2', 'T3', 'T4']);
    });

    it('defaults status to pending for unchecked tasks', () => {
      const content = `## Implementation Tasks
- [ ] **T1**: Unchecked task`;

      const tasks = parseImplementationTasks(content);

      expect(tasks[0].status).toBe('pending');
    });

    it('sets status to completed for checked tasks', () => {
      const content = `## Implementation Tasks
- [x] **T1**: Checked task`;

      const tasks = parseImplementationTasks(content);

      expect(tasks[0].status).toBe('completed');
    });
  });

  describe('edge cases', () => {
    it('returns empty array when no tasks section exists', () => {
      const content = `# Some Story

This is a story without an Implementation Tasks section.

## Research

Some research content.`;

      const tasks = parseImplementationTasks(content);

      expect(tasks).toEqual([]);
    });

    it('handles content without tasks section gracefully', () => {
      const content = `# Story without tasks`;
      const tasks = parseImplementationTasks(content);

      expect(tasks).toEqual([]);
      // Note: actual implementation logs warning via logger
    });

    it('skips malformed task ID and continues parsing', () => {
      const content = `## Implementation Tasks
- [ ] **T1**: Valid task
- [ ] Invalid task without ID format
- [ ] **T2**: Another valid task`;

      const tasks = parseImplementationTasks(content);

      expect(tasks).toHaveLength(2);
      expect(tasks[0].id).toBe('T1');
      expect(tasks[1].id).toBe('T2');
    });

    it('handles tasks with no metadata fields', () => {
      const content = `## Implementation Tasks
- [ ] **T1**: Simple task without metadata`;

      const tasks = parseImplementationTasks(content);

      expect(tasks[0]).toEqual({
        id: 'T1',
        description: 'Simple task without metadata',
        status: 'pending',
        files: undefined,
        dependencies: undefined,
      });
    });

    it('handles mixed indentation (spaces/tabs)', () => {
      const content = `## Implementation Tasks
- [ ] **T1**: Task with spaces
  - Files: \`file1.ts\`
- [ ] **T2**: Task with tabs
\t- Files: \`file2.ts\``;

      const tasks = parseImplementationTasks(content);

      expect(tasks).toHaveLength(2);
      expect(tasks[0].files).toEqual(['file1.ts']);
      expect(tasks[1].files).toEqual(['file2.ts']);
    });

    it('handles empty Files field (sets undefined)', () => {
      const content = `## Implementation Tasks
- [ ] **T1**: Task
  - Files:
  - Dependencies: none`;

      const tasks = parseImplementationTasks(content);

      expect(tasks[0].files).toBeUndefined();
    });

    it('handles case-insensitive metadata field names', () => {
      const content = `## Implementation Tasks
- [ ] **T1**: Task one
  - files: \`file1.ts\`
- [ ] **T2**: Task two
  - FILES: \`file2.ts\`
- [ ] **T3**: Task three
  - dependencies: T1`;

      const tasks = parseImplementationTasks(content);

      expect(tasks[0].files).toEqual(['file1.ts']);
      expect(tasks[1].files).toEqual(['file2.ts']);
      expect(tasks[2].dependencies).toEqual(['T1']);
    });

    it('handles dependencies with extra whitespace', () => {
      const content = `## Implementation Tasks
- [ ] **T1**: Task
  - Dependencies:  T2  ,  T3  ,  T4  `;

      const tasks = parseImplementationTasks(content);

      expect(tasks[0].dependencies).toEqual(['T2', 'T3', 'T4']);
    });

    it('handles files without backticks', () => {
      const content = `## Implementation Tasks
- [ ] **T1**: Task
  - Files: src/file1.ts, src/file2.ts`;

      const tasks = parseImplementationTasks(content);

      expect(tasks[0].files).toEqual(['src/file1.ts', 'src/file2.ts']);
    });
  });
});

describe('formatImplementationTasks', () => {
  it('formats single task with all metadata to markdown', () => {
    const tasks: ImplementationTask[] = [
      {
        id: 'T1',
        description: 'Create auth service',
        status: 'pending',
        files: ['src/auth.ts', 'src/types.ts'],
        dependencies: ['T2'],
      },
    ];

    const result = formatImplementationTasks(tasks);

    expect(result).toContain('## Implementation Tasks');
    expect(result).toContain('- [ ] **T1**: Create auth service');
    expect(result).toContain('- Files: `src/auth.ts`, `src/types.ts`');
    expect(result).toContain('- Dependencies: T2');
  });

  it('formats multiple tasks correctly', () => {
    const tasks: ImplementationTask[] = [
      { id: 'T1', description: 'Task one', status: 'pending' },
      { id: 'T2', description: 'Task two', status: 'completed' },
    ];

    const result = formatImplementationTasks(tasks);

    expect(result).toContain('**T1**: Task one');
    expect(result).toContain('**T2**: Task two');
  });

  it('uses correct checkbox state for task status', () => {
    const tasks: ImplementationTask[] = [
      { id: 'T1', description: 'Pending', status: 'pending' },
      { id: 'T2', description: 'Completed', status: 'completed' },
      { id: 'T3', description: 'In progress', status: 'in_progress' },
      { id: 'T4', description: 'Failed', status: 'failed' },
    ];

    const result = formatImplementationTasks(tasks);

    expect(result).toMatch(/- \[ \] \*\*T1\*\*: Pending/);
    expect(result).toMatch(/- \[x\] \*\*T2\*\*: Completed/);
    expect(result).toMatch(/- \[ \] \*\*T3\*\*: In progress/);
    expect(result).toMatch(/- \[ \] \*\*T4\*\*: Failed/);
  });

  it('wraps file paths in backticks', () => {
    const tasks: ImplementationTask[] = [
      {
        id: 'T1',
        description: 'Task',
        status: 'pending',
        files: ['src/file.ts'],
      },
    ];

    const result = formatImplementationTasks(tasks);

    expect(result).toContain('`src/file.ts`');
  });

  it('outputs "none" when dependencies array is empty', () => {
    const tasks: ImplementationTask[] = [
      {
        id: 'T1',
        description: 'Task',
        status: 'pending',
        dependencies: [],
      },
    ];

    const result = formatImplementationTasks(tasks);

    expect(result).toContain('- Dependencies: none');
  });

  it('comma-separates multiple files and dependencies', () => {
    const tasks: ImplementationTask[] = [
      {
        id: 'T1',
        description: 'Task',
        status: 'pending',
        files: ['file1.ts', 'file2.ts', 'file3.ts'],
        dependencies: ['T2', 'T3', 'T4'],
      },
    ];

    const result = formatImplementationTasks(tasks);

    expect(result).toContain('`file1.ts`, `file2.ts`, `file3.ts`');
    expect(result).toContain('T2, T3, T4');
  });

  it('omits Files line when files is undefined', () => {
    const tasks: ImplementationTask[] = [
      {
        id: 'T1',
        description: 'Task',
        status: 'pending',
        files: undefined,
        dependencies: ['T2'],
      },
    ];

    const result = formatImplementationTasks(tasks);

    expect(result).not.toContain('Files:');
    expect(result).toContain('Dependencies:');
  });

  it('omits Dependencies line when dependencies is undefined', () => {
    const tasks: ImplementationTask[] = [
      {
        id: 'T1',
        description: 'Task',
        status: 'pending',
        files: ['file.ts'],
        dependencies: undefined,
      },
    ];

    const result = formatImplementationTasks(tasks);

    expect(result).toContain('Files:');
    expect(result).not.toContain('Dependencies:');
  });

  it('round-trip test: parse → format → parse yields same result', () => {
    const originalContent = `## Implementation Tasks

- [ ] **T1**: Create types
  - Files: \`src/types.ts\`
  - Dependencies: none

- [x] **T2**: Create service
  - Files: \`src/service.ts\`
  - Dependencies: T1`;

    const parsed1 = parseImplementationTasks(originalContent);
    const formatted = formatImplementationTasks(parsed1);
    const parsed2 = parseImplementationTasks(formatted);

    expect(parsed2).toEqual(parsed1);
  });
});

describe('validateTaskFormat', () => {
  it('validates task list with no dependencies (valid)', () => {
    const content = `## Implementation Tasks
- [ ] **T1**: Task one
- [ ] **T2**: Task two`;

    const result = validateTaskFormat(content);

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('validates linear dependency chain T1→T2→T3 (valid)', () => {
    const content = `## Implementation Tasks
- [ ] **T1**: Task one
  - Dependencies: none
- [ ] **T2**: Task two
  - Dependencies: T1
- [ ] **T3**: Task three
  - Dependencies: T2`;

    const result = validateTaskFormat(content);

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('detects circular dependency T1→T2→T1 (error)', () => {
    const content = `## Implementation Tasks
- [ ] **T1**: Task one
  - Dependencies: T2
- [ ] **T2**: Task two
  - Dependencies: T1`;

    const result = validateTaskFormat(content);

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('Circular');
  });

  it('detects self-dependency T1→T1 (error)', () => {
    const content = `## Implementation Tasks
- [ ] **T1**: Task one
  - Dependencies: T1`;

    const result = validateTaskFormat(content);

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('Circular');
  });

  it('detects missing dependency reference T3→T5 where T5 missing (warning)', () => {
    const content = `## Implementation Tasks
- [ ] **T1**: Task one
- [ ] **T2**: Task two
- [ ] **T3**: Task three
  - Dependencies: T1, T5`;

    const result = validateTaskFormat(content);

    expect(result.valid).toBe(true); // Still valid, just a warning
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('T5');
  });

  it('allows multiple tasks depending on same task (valid)', () => {
    const content = `## Implementation Tasks
- [ ] **T1**: Base task
- [ ] **T2**: Depends on T1
  - Dependencies: T1
- [ ] **T3**: Also depends on T1
  - Dependencies: T1`;

    const result = validateTaskFormat(content);

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('handles empty task list (valid)', () => {
    const content = `## Implementation Tasks

`;

    const result = validateTaskFormat(content);

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('reports multiple errors and warnings correctly', () => {
    const content = `## Implementation Tasks
- [ ] **T1**: Task one
  - Dependencies: T2
- [ ] **T2**: Task two
  - Dependencies: T1
- [ ] **T3**: Task three
  - Dependencies: T99`;

    const result = validateTaskFormat(content);

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0); // Circular dependency
    expect(result.warnings.length).toBeGreaterThan(0); // Missing T99
  });
});
