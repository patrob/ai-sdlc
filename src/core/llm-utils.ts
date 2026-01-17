import { z, ZodSchema } from 'zod';
import yaml from 'js-yaml';
import { getLogger } from './logger.js';

/**
 * Result of structured response extraction
 */
export interface ExtractionResult<T> {
  success: boolean;
  data?: T;
  strategy?: ExtractionStrategy;
  error?: string;
  rawResponse?: string;
}

/**
 * Extraction strategies in priority order
 */
export type ExtractionStrategy =
  | 'direct_json'
  | 'markdown_json_block'
  | 'stripped_json'
  | 'yaml_fallback';

/**
 * Options for structured response extraction
 */
export interface ExtractionOptions {
  /** Maximum retry attempts if extraction fails (default: 0 - no retries) */
  maxRetries?: number;
  /** Function to call LLM for retry (required if maxRetries > 0) */
  retryFn?: (clarificationPrompt: string) => Promise<string>;
  /** Log raw response on failure for debugging (default: true) */
  logOnFailure?: boolean;
}

/**
 * Try to extract JSON directly from the response
 */
function tryDirectJson<T>(
  response: string,
  schema: ZodSchema<T>
): ExtractionResult<T> {
  try {
    const trimmed = response.trim();
    // Must start with { or [ to be valid JSON
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
      return { success: false, error: 'Response does not start with JSON' };
    }

    const parsed = JSON.parse(trimmed);
    const result = schema.safeParse(parsed);

    if (result.success) {
      return { success: true, data: result.data, strategy: 'direct_json' };
    }

    return {
      success: false,
      error: `Schema validation failed: ${result.error.message}`,
    };
  } catch (e) {
    return {
      success: false,
      error: `JSON parse error: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

/**
 * Try to extract JSON from markdown code blocks
 * Supports ```json, ```JSON, and plain ``` blocks
 */
function tryMarkdownJsonBlock<T>(
  response: string,
  schema: ZodSchema<T>
): ExtractionResult<T> {
  // Match JSON in code blocks: ```json ... ``` or ``` ... ```
  const codeBlockRegex = /```(?:json|JSON)?\s*\n?([\s\S]*?)```/g;
  const matches = [...response.matchAll(codeBlockRegex)];

  for (const match of matches) {
    const content = match[1].trim();
    if (!content) continue;

    try {
      const parsed = JSON.parse(content);
      const result = schema.safeParse(parsed);

      if (result.success) {
        return { success: true, data: result.data, strategy: 'markdown_json_block' };
      }
    } catch {
      // Try next match
      continue;
    }
  }

  return {
    success: false,
    error: 'No valid JSON found in markdown code blocks',
  };
}

/**
 * Try to extract JSON by stripping leading/trailing text
 * Finds the first { and last } to extract potential JSON
 */
function tryStrippedJson<T>(
  response: string,
  schema: ZodSchema<T>
): ExtractionResult<T> {
  const firstBrace = response.indexOf('{');
  const lastBrace = response.lastIndexOf('}');

  if (firstBrace === -1 || lastBrace === -1 || firstBrace >= lastBrace) {
    // Try array format
    const firstBracket = response.indexOf('[');
    const lastBracket = response.lastIndexOf(']');

    if (firstBracket === -1 || lastBracket === -1 || firstBracket >= lastBracket) {
      return { success: false, error: 'No JSON object or array found in response' };
    }

    try {
      const jsonStr = response.substring(firstBracket, lastBracket + 1);
      const parsed = JSON.parse(jsonStr);
      const result = schema.safeParse(parsed);

      if (result.success) {
        return { success: true, data: result.data, strategy: 'stripped_json' };
      }

      return {
        success: false,
        error: `Schema validation failed: ${result.error.message}`,
      };
    } catch (e) {
      return {
        success: false,
        error: `Stripped JSON parse error: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  }

  try {
    const jsonStr = response.substring(firstBrace, lastBrace + 1);
    const parsed = JSON.parse(jsonStr);
    const result = schema.safeParse(parsed);

    if (result.success) {
      return { success: true, data: result.data, strategy: 'stripped_json' };
    }

    return {
      success: false,
      error: `Schema validation failed: ${result.error.message}`,
    };
  } catch (e) {
    return {
      success: false,
      error: `Stripped JSON parse error: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

/**
 * Try to parse response as YAML
 */
function tryYamlFallback<T>(
  response: string,
  schema: ZodSchema<T>
): ExtractionResult<T> {
  try {
    // First try to extract YAML from code blocks
    const yamlBlockRegex = /```(?:yaml|YAML|yml|YML)\s*\n?([\s\S]*?)```/g;
    const matches = [...response.matchAll(yamlBlockRegex)];

    for (const match of matches) {
      const content = match[1].trim();
      if (!content) continue;

      try {
        const parsed = yaml.load(content);
        const result = schema.safeParse(parsed);

        if (result.success) {
          return { success: true, data: result.data, strategy: 'yaml_fallback' };
        }
      } catch {
        continue;
      }
    }

    // Try parsing the whole response as YAML (after stripping obvious non-YAML parts)
    // Skip lines that look like prose (sentences without colons)
    const lines = response.split('\n');
    const yamlLines: string[] = [];
    let inYamlSection = false;

    for (const line of lines) {
      const trimmed = line.trim();

      // Start of YAML-like content
      if (trimmed.includes(':') || trimmed.startsWith('-') || inYamlSection) {
        yamlLines.push(line);
        inYamlSection = true;
      }

      // Empty line might end YAML section if we haven't found valid content
      if (trimmed === '' && yamlLines.length > 0) {
        inYamlSection = false;
      }
    }

    if (yamlLines.length > 0) {
      const yamlContent = yamlLines.join('\n');
      const parsed = yaml.load(yamlContent);
      const result = schema.safeParse(parsed);

      if (result.success) {
        return { success: true, data: result.data, strategy: 'yaml_fallback' };
      }
    }

    return { success: false, error: 'No valid YAML found in response' };
  } catch (e) {
    return {
      success: false,
      error: `YAML parse error: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

/**
 * Generate a clarification prompt for retry attempts
 */
function generateClarificationPrompt(
  schema: ZodSchema<unknown>,
  attemptNumber: number,
  lastError: string
): string {
  // Get schema shape for the prompt
  let schemaDescription = 'the expected JSON structure';
  try {
    if (schema instanceof z.ZodObject) {
      const shape = schema.shape;
      const fields = Object.keys(shape).join(', ');
      schemaDescription = `an object with fields: ${fields}`;
    }
  } catch {
    // Fall back to generic description
  }

  return `Your previous response could not be parsed. Attempt ${attemptNumber} failed with: ${lastError}

Please respond with ONLY valid JSON matching ${schemaDescription}.

Rules:
1. Start your response directly with { or [
2. Do not include any text before or after the JSON
3. Ensure all strings are properly escaped
4. Ensure all required fields are present

Try again:`;
}

/**
 * Extract structured response from LLM output using multiple strategies
 *
 * Tries extraction strategies in order:
 * 1. Direct JSON parse (response is pure JSON)
 * 2. JSON within markdown code blocks (\`\`\`json ... \`\`\`)
 * 3. JSON with leading/trailing text stripped
 * 4. YAML format fallback
 *
 * If all strategies fail and retries are configured, prompts the LLM
 * to try again with clearer instructions.
 *
 * @param response - Raw LLM response string
 * @param schema - Zod schema to validate against
 * @param options - Extraction options including retry configuration
 * @returns ExtractionResult with success status, data, and metadata
 *
 * @example
 * ```typescript
 * const ReviewSchema = z.object({
 *   passed: z.boolean(),
 *   issues: z.array(z.object({
 *     severity: z.enum(['blocker', 'critical', 'major', 'minor']),
 *     description: z.string(),
 *   })),
 * });
 *
 * const result = await extractStructuredResponse(llmResponse, ReviewSchema, {
 *   maxRetries: 2,
 *   retryFn: async (prompt) => await callLLM(prompt),
 * });
 *
 * if (result.success) {
 *   console.log('Parsed review:', result.data);
 * } else {
 *   console.error('Failed to parse:', result.error);
 * }
 * ```
 */
export async function extractStructuredResponse<T>(
  response: string,
  schema: ZodSchema<T>,
  options: ExtractionOptions = {}
): Promise<ExtractionResult<T>> {
  const { maxRetries = 0, retryFn, logOnFailure = true } = options;
  const logger = getLogger();

  // Store all errors for debugging
  const errors: string[] = [];

  // Strategy 1: Direct JSON
  const directResult = tryDirectJson(response, schema);
  if (directResult.success) {
    return directResult;
  }
  errors.push(`direct_json: ${directResult.error}`);

  // Strategy 2: Markdown JSON block
  const markdownResult = tryMarkdownJsonBlock(response, schema);
  if (markdownResult.success) {
    return markdownResult;
  }
  errors.push(`markdown_json_block: ${markdownResult.error}`);

  // Strategy 3: Stripped JSON
  const strippedResult = tryStrippedJson(response, schema);
  if (strippedResult.success) {
    return strippedResult;
  }
  errors.push(`stripped_json: ${strippedResult.error}`);

  // Strategy 4: YAML fallback
  const yamlResult = tryYamlFallback(response, schema);
  if (yamlResult.success) {
    return yamlResult;
  }
  errors.push(`yaml_fallback: ${yamlResult.error}`);

  // All strategies failed - try retries if configured
  if (maxRetries > 0 && retryFn) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      logger.info('llm-utils', `Retry attempt ${attempt}/${maxRetries} for structured response extraction`);

      const clarificationPrompt = generateClarificationPrompt(
        schema,
        attempt,
        errors[errors.length - 1]
      );

      try {
        const retryResponse = await retryFn(clarificationPrompt);

        // Try all strategies again on retry response
        const retryDirectResult = tryDirectJson(retryResponse, schema);
        if (retryDirectResult.success) {
          return retryDirectResult;
        }

        const retryMarkdownResult = tryMarkdownJsonBlock(retryResponse, schema);
        if (retryMarkdownResult.success) {
          return retryMarkdownResult;
        }

        const retryStrippedResult = tryStrippedJson(retryResponse, schema);
        if (retryStrippedResult.success) {
          return retryStrippedResult;
        }

        const retryYamlResult = tryYamlFallback(retryResponse, schema);
        if (retryYamlResult.success) {
          return retryYamlResult;
        }

        errors.push(`retry_${attempt}: All strategies failed`);
      } catch (e) {
        errors.push(`retry_${attempt}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  // All attempts failed
  const finalError = `All extraction strategies failed:\n${errors.join('\n')}`;

  if (logOnFailure) {
    logger.error('llm-utils', 'Failed to extract structured response', {
      errors,
      responsePreview: response.substring(0, 500),
    });
  }

  return {
    success: false,
    error: finalError,
    rawResponse: response,
  };
}

/**
 * Synchronous version of extractStructuredResponse without retry support
 *
 * Useful when you don't need retry functionality or are in a synchronous context.
 *
 * @param response - Raw LLM response string
 * @param schema - Zod schema to validate against
 * @param logOnFailure - Whether to log the raw response on failure (default: true)
 * @returns ExtractionResult with success status, data, and metadata
 */
export function extractStructuredResponseSync<T>(
  response: string,
  schema: ZodSchema<T>,
  logOnFailure = true
): ExtractionResult<T> {
  const logger = getLogger();
  const errors: string[] = [];

  // Strategy 1: Direct JSON
  const directResult = tryDirectJson(response, schema);
  if (directResult.success) {
    return directResult;
  }
  errors.push(`direct_json: ${directResult.error}`);

  // Strategy 2: Markdown JSON block
  const markdownResult = tryMarkdownJsonBlock(response, schema);
  if (markdownResult.success) {
    return markdownResult;
  }
  errors.push(`markdown_json_block: ${markdownResult.error}`);

  // Strategy 3: Stripped JSON
  const strippedResult = tryStrippedJson(response, schema);
  if (strippedResult.success) {
    return strippedResult;
  }
  errors.push(`stripped_json: ${strippedResult.error}`);

  // Strategy 4: YAML fallback
  const yamlResult = tryYamlFallback(response, schema);
  if (yamlResult.success) {
    return yamlResult;
  }
  errors.push(`yaml_fallback: ${yamlResult.error}`);

  // All attempts failed
  const finalError = `All extraction strategies failed:\n${errors.join('\n')}`;

  if (logOnFailure) {
    logger.error('llm-utils', 'Failed to extract structured response', {
      errors,
      responsePreview: response.substring(0, 500),
    });
  }

  return {
    success: false,
    error: finalError,
    rawResponse: response,
  };
}

// Export individual strategies for testing
export const extractionStrategies = {
  tryDirectJson,
  tryMarkdownJsonBlock,
  tryStrippedJson,
  tryYamlFallback,
};
