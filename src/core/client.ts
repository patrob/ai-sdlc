import { query } from '@anthropic-ai/claude-agent-sdk';
import { configureAgentSdkAuth, getApiKey, getCredentialType, CredentialType } from './auth.js';
import { loadConfig } from './config.js';
import fs from 'fs';
import path from 'path';

export interface AgentQueryOptions {
  prompt: string;
  systemPrompt?: string;
  workingDirectory?: string;
  model?: string;
}

export interface AgentMessage {
  type: string;
  subtype?: string;
  content?: string | Array<{ type: string; text?: string }>;
  tool_name?: string;
  input?: Record<string, unknown>;
  result?: unknown;
  error?: { message: string };
  session_id?: string;
}

// Constants
const CLAUDE_MD_PATH = '.claude/CLAUDE.md';
const MAX_FILE_SIZE = 1024 * 1024; // 1MB
const HARD_FILE_SIZE_LIMIT = 10 * 1024 * 1024; // 10MB

/**
 * Validate that the working directory is within safe boundaries
 */
function isValidWorkingDirectory(workingDir: string): boolean {
  try {
    const normalized = path.resolve(workingDir);
    const projectRoot = path.resolve(process.cwd());
    // Allow working directory to be the project root or any subdirectory
    return normalized.startsWith(projectRoot) || normalized === projectRoot;
  } catch (error) {
    return false;
  }
}

/**
 * Validate CLAUDE.md file is safe to load
 */
function validateClaudeMdFile(filePath: string, workingDir: string): { valid: boolean; warning?: string; error?: string } {
  try {
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return { valid: true }; // File not existing is not an error
    }

    // Resolve symlinks and verify target is within project boundaries
    const realPath = fs.realpathSync(filePath);
    const normalizedWorkingDir = path.resolve(workingDir);
    if (!realPath.startsWith(normalizedWorkingDir)) {
      return {
        valid: false,
        error: 'CLAUDE.md symlink points outside project directory, ignoring for security'
      };
    }

    // Check file size
    const stats = fs.statSync(filePath);
    if (stats.size > HARD_FILE_SIZE_LIMIT) {
      return {
        valid: false,
        error: `CLAUDE.md file is too large (${stats.size} bytes, max: ${HARD_FILE_SIZE_LIMIT})`
      };
    }
    if (stats.size > MAX_FILE_SIZE) {
      return {
        valid: true,
        warning: `CLAUDE.md is large (${stats.size} bytes, recommended max: ${MAX_FILE_SIZE}). This may affect performance.`
      };
    }

    // Basic content validation
    const content = fs.readFileSync(filePath, 'utf-8');
    // Check for excessive control characters (excluding common ones like newline, tab)
    if (/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(content)) {
      return {
        valid: true,
        warning: 'CLAUDE.md contains unexpected control characters'
      };
    }

    return { valid: true };
  } catch (error: any) {
    if (error.code === 'EACCES') {
      return { valid: false, error: 'Permission denied reading CLAUDE.md' };
    }
    return { valid: false, error: `Error validating CLAUDE.md: ${error.message}` };
  }
}

/**
 * Run an agent query using the Claude Agent SDK.
 * Automatically configures authentication from environment or keychain.
 */
export async function runAgentQuery(options: AgentQueryOptions): Promise<string> {
  // Configure authentication
  const authResult = configureAgentSdkAuth();
  if (!authResult.configured) {
    throw new Error('No API key or OAuth token found. Set ANTHROPIC_API_KEY or sign in to Claude Code.');
  }

  // Validate and normalize working directory
  const workingDir = path.resolve(options.workingDirectory || process.cwd());
  if (!isValidWorkingDirectory(workingDir)) {
    throw new Error('Invalid working directory: path is outside project boundaries');
  }

  // Load configuration to get settingSources
  const config = loadConfig(workingDir);
  const settingSources = config.settingSources || [];

  // Debug logging for CLAUDE.md discovery
  if (settingSources.includes('project')) {
    try {
      const claudeMdPath = path.join(workingDir, CLAUDE_MD_PATH);
      const validation = validateClaudeMdFile(claudeMdPath, workingDir);

      if (!validation.valid) {
        if (validation.error) {
          console.warn(`Warning: ${validation.error}`);
        }
      } else {
        if (fs.existsSync(claudeMdPath)) {
          console.debug('Debug: Found CLAUDE.md in project settings');
          if (validation.warning) {
            console.warn(`Warning: ${validation.warning}`);
          }
        } else {
          console.debug('Debug: CLAUDE.md not found in project settings');
        }
      }
    } catch (error: any) {
      // Log errors for debugging but don't throw
      console.debug(`File system error during CLAUDE.md discovery: ${error.message || 'Unknown error'}`);
    }
  }

  const results: string[] = [];

  const response = query({
    prompt: options.prompt,
    options: {
      model: options.model || 'claude-sonnet-4-5-20250929',
      systemPrompt: options.systemPrompt,
      cwd: workingDir,
      permissionMode: 'acceptEdits',
      settingSources: settingSources,
    },
  });

  for await (const message of response as AsyncGenerator<AgentMessage>) {
    if (message.type === 'assistant') {
      const content = message.content;
      if (typeof content === 'string') {
        results.push(content);
      } else if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === 'text' && block.text) {
            results.push(block.text);
          }
        }
      }
    } else if (message.type === 'result' && message.subtype === 'success') {
      // Final result
      if (typeof message.result === 'string') {
        results.push(message.result);
      }
    } else if (message.type === 'error') {
      throw new Error(message.error?.message || 'Agent error');
    }
  }

  return results.join('\n');
}

/**
 * Get the current credential type being used
 */
export function getCurrentCredentialType(): CredentialType {
  return getCredentialType(getApiKey());
}
