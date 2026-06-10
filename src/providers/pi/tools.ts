/**
 * File and shell tools for the Pi agentic engine.
 *
 * These {@link AgentTool}s back the implement phase: they let any Pi-routed
 * provider (OpenAI, Codex, OpenRouter, Ollama, Copilot) read, write, edit, and
 * inspect files and run commands inside a real working directory via Pi's
 * {@link ExecutionEnv}. The toolset is intentionally small and audited (read /
 * write / edit / list / bash), mirroring the minimal core Pi's own coding agent
 * ships with.
 */

import path from 'path';
import { Type } from '@earendil-works/pi-ai';
import type { AgentTool, AgentToolResult, ExecutionEnv } from '@earendil-works/pi-agent-core';

/** Structural form of Pi's `Result` (declared locally to avoid barrel name clashes). */
type PiResult<T> = { ok: true; value: T } | { ok: false; error: { message?: string } };

/** Build a plain-text tool result. */
function textResult(text: string): AgentToolResult<undefined> {
  return { content: [{ type: 'text', text }], details: undefined };
}

/** Resolve a possibly-relative path against the execution environment's cwd. */
function resolvePath(env: ExecutionEnv, p: string): string {
  return path.isAbsolute(p) ? p : path.join(env.cwd, p);
}

/** Unwrap a Pi `Result`, throwing on failure (tools signal errors by throwing). */
function unwrap<T>(result: PiResult<T>): T {
  if (result.ok) {
    return result.value;
  }
  throw new Error(result.error?.message ?? 'execution environment error');
}

/**
 * Create the file/shell toolset bound to a working directory.
 *
 * @param env - Pi execution environment (e.g. `NodeExecutionEnv({ cwd })`)
 * @returns AgentTools the Pi agent loop can call during a turn
 */
export function createFileTools(env: ExecutionEnv): AgentTool[] {
  const readFile: AgentTool = {
    name: 'read_file',
    label: 'Read File',
    description: 'Read the full text contents of a file in the working directory.',
    parameters: Type.Object({
      path: Type.String({ description: 'File path, relative to the working directory or absolute.' }),
    }),
    execute: async (_id, params) => {
      const { path: p } = params as { path: string };
      const content = unwrap(await env.readTextFile(resolvePath(env, p)));
      return textResult(content);
    },
  };

  const writeFile: AgentTool = {
    name: 'write_file',
    label: 'Write File',
    description: 'Create or overwrite a file with the given contents.',
    parameters: Type.Object({
      path: Type.String({ description: 'File path, relative to the working directory or absolute.' }),
      content: Type.String({ description: 'Full file contents to write.' }),
    }),
    execute: async (_id, params) => {
      const { path: p, content } = params as { path: string; content: string };
      unwrap(await env.writeFile(resolvePath(env, p), content));
      return textResult(`Wrote ${p}`);
    },
  };

  const editFile: AgentTool = {
    name: 'edit_file',
    label: 'Edit File',
    description:
      'Replace an exact substring in a file with new text. The old text must appear exactly once.',
    parameters: Type.Object({
      path: Type.String({ description: 'File path, relative to the working directory or absolute.' }),
      old_string: Type.String({ description: 'Exact text to replace (must be unique in the file).' }),
      new_string: Type.String({ description: 'Replacement text.' }),
    }),
    execute: async (_id, params) => {
      const { path: p, old_string, new_string } = params as {
        path: string;
        old_string: string;
        new_string: string;
      };
      const abs = resolvePath(env, p);
      const original = unwrap(await env.readTextFile(abs));
      const occurrences = original.split(old_string).length - 1;
      if (occurrences === 0) {
        throw new Error(`edit_file: old_string not found in ${p}`);
      }
      if (occurrences > 1) {
        throw new Error(
          `edit_file: old_string is not unique in ${p} (found ${occurrences} occurrences)`
        );
      }
      unwrap(await env.writeFile(abs, original.replace(old_string, new_string)));
      return textResult(`Edited ${p}`);
    },
  };

  const listDir: AgentTool = {
    name: 'list_dir',
    label: 'List Directory',
    description: 'List the entries in a directory in the working directory.',
    parameters: Type.Object({
      path: Type.Optional(
        Type.String({ description: 'Directory path. Defaults to the working directory.' })
      ),
    }),
    execute: async (_id, params) => {
      const { path: p } = params as { path?: string };
      const target = p ? resolvePath(env, p) : env.cwd;
      const entries = unwrap(await env.listDir(target));
      const names = entries.map((e) => (e.kind === 'directory' ? `${e.name}/` : e.name));
      return textResult(names.join('\n'));
    },
  };

  const bash: AgentTool = {
    name: 'bash',
    label: 'Run Command',
    description: 'Run a shell command in the working directory and return stdout/stderr.',
    parameters: Type.Object({
      command: Type.String({ description: 'Shell command to execute.' }),
    }),
    execute: async (_id, params, signal) => {
      const { command } = params as { command: string };
      const result = unwrap(await env.exec(command, { abortSignal: signal }));
      const parts: string[] = [];
      if (result.stdout) parts.push(result.stdout);
      if (result.stderr) parts.push(result.stderr);
      parts.push(`[exit code: ${result.exitCode}]`);
      return textResult(parts.join('\n'));
    },
  };

  return [readFile, writeFile, editFile, listDir, bash];
}
