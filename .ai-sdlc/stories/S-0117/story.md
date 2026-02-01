---
id: S-0117
title: OpenAI Tool Mapping Layer
priority: 4
status: backlog
type: feature
created: '2026-02-01'
labels:
  - provider-integration
  - openai
  - epic-openai-integration
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
slug: openai-tool-mapper
dependencies:
  - S-0116
  - S-0092
---
# OpenAI Tool Mapping Layer

## User Story

**As a** developer using ai-sdlc with OpenAI
**I want** SDLC tools to work seamlessly with OpenAI's function calling
**So that** agents can use file operations, git commands, and other tools regardless of provider

## Summary

This story implements the tool mapping layer that translates ai-sdlc's tool definitions to OpenAI's function calling format and handles function call responses. This enables the same agent workflows to work across different providers.

## Technical Context

**Current State:**
- Tools defined for Claude's tool use format
- No translation layer for other providers

**Target State:**
- Bidirectional tool format mapping
- OpenAI function call execution
- Response mapping back to provider-agnostic format
- Tool result handling

## Acceptance Criteria

### Tool Mapper Class

- [ ] Create `src/providers/openai/tool-mapper.ts` with:
  - [ ] `toOpenAITools(tools: AgentTool[])` - Convert ai-sdlc tools to OpenAI format
  - [ ] `fromOpenAIFunctionCall(call)` - Parse OpenAI function calls
  - [ ] `toOpenAIToolResult(result)` - Format tool results for OpenAI

### Tool Definition Mapping

- [ ] Map tool names to function names
- [ ] Map tool descriptions to function descriptions
- [ ] Map tool input schemas to JSON Schema parameters
- [ ] Handle required vs optional parameters

### Function Call Handling

- [ ] Parse function call from OpenAI response
- [ ] Extract function name and arguments
- [ ] Execute corresponding ai-sdlc tool
- [ ] Format result for OpenAI continuation

### Supported Tools

- [ ] File read/write operations
- [ ] Git operations
- [ ] Shell command execution
- [ ] Search/grep operations

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/providers/openai/tool-mapper.ts` | Create | Tool format translation |
| `src/providers/openai/openai-provider.ts` | Modify | Integrate tool mapper |

## Implementation Specification

```typescript
// src/providers/openai/tool-mapper.ts

import OpenAI from 'openai';

export interface AgentTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ToolCallResult {
  toolName: string;
  result: unknown;
  error?: string;
}

export class OpenAIToolMapper {
  /**
   * Convert ai-sdlc tools to OpenAI function format
   */
  toOpenAITools(tools: AgentTool[]): OpenAI.ChatCompletionTool[] {
    return tools.map((tool) => ({
      type: 'function',
      function: {
        name: this.sanitizeFunctionName(tool.name),
        description: tool.description,
        parameters: tool.inputSchema,
      },
    }));
  }

  /**
   * Parse OpenAI function call into executable format
   */
  fromOpenAIFunctionCall(
    toolCall: OpenAI.ChatCompletionMessageToolCall
  ): { name: string; arguments: Record<string, unknown> } {
    return {
      name: toolCall.function.name,
      arguments: JSON.parse(toolCall.function.arguments),
    };
  }

  /**
   * Format tool execution result for OpenAI
   */
  toOpenAIToolMessage(
    toolCallId: string,
    result: ToolCallResult
  ): OpenAI.ChatCompletionToolMessageParam {
    return {
      role: 'tool',
      tool_call_id: toolCallId,
      content: result.error
        ? JSON.stringify({ error: result.error })
        : JSON.stringify(result.result),
    };
  }

  private sanitizeFunctionName(name: string): string {
    // OpenAI function names must match: ^[a-zA-Z0-9_-]{1,64}$
    return name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
  }
}
```

## Testing Requirements

- [ ] Unit test: Tool definition conversion
- [ ] Unit test: Function name sanitization
- [ ] Unit test: Function call parsing
- [ ] Unit test: Tool result formatting
- [ ] Unit test: Round-trip conversion (tool -> OpenAI -> tool)
- [ ] `npm test` passes
- [ ] `npm run build` succeeds

## Definition of Done

- [ ] `OpenAIToolMapper` class implemented
- [ ] All mapping methods working correctly
- [ ] Integrated with `OpenAIProvider`
- [ ] Edge cases handled (empty tools, invalid JSON, etc.)
- [ ] Unit tests with full coverage
- [ ] `make verify` passes

## References

- OpenAI Function Calling: https://platform.openai.com/docs/guides/function-calling
- OpenAI Tools API: https://platform.openai.com/docs/api-reference/chat/create#chat-create-tools
- Depends on: S-0116, S-0092 (Adapter Framework)
