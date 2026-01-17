import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import {
  extractStructuredResponse,
  extractStructuredResponseSync,
  extractionStrategies,
  ExtractionResult,
} from './llm-utils.js';

// Mock the logger
vi.mock('./logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

// Test schema matching review.ts ReviewResponseSchema
const ReviewSchema = z.object({
  passed: z.boolean(),
  issues: z.array(
    z.object({
      severity: z.enum(['blocker', 'critical', 'major', 'minor']),
      category: z.string(),
      description: z.string(),
    })
  ),
});

type ReviewResponse = z.infer<typeof ReviewSchema>;

describe('llm-utils', () => {
  describe('extractStructuredResponseSync', () => {
    describe('Strategy 1: Direct JSON', () => {
      it('parses pure JSON response', () => {
        const response = '{"passed": true, "issues": []}';
        const result = extractStructuredResponseSync(response, ReviewSchema);

        expect(result.success).toBe(true);
        expect(result.data).toEqual({ passed: true, issues: [] });
        expect(result.strategy).toBe('direct_json');
      });

      it('parses JSON with whitespace', () => {
        const response = `
          {
            "passed": false,
            "issues": [
              {
                "severity": "critical",
                "category": "security",
                "description": "SQL injection vulnerability"
              }
            ]
          }
        `;
        const result = extractStructuredResponseSync(response, ReviewSchema);

        expect(result.success).toBe(true);
        expect(result.data?.passed).toBe(false);
        expect(result.data?.issues).toHaveLength(1);
        expect(result.strategy).toBe('direct_json');
      });

      it('fails for completely unparseable content', () => {
        const response = 'This contains no JSON or YAML at all, just plain text without structure.';
        const result = extractStructuredResponseSync(response, ReviewSchema, false);

        expect(result.success).toBe(false);
        expect(result.error).toContain('All extraction strategies failed');
      });

      it('fails for non-JSON starting text', () => {
        const response = 'Here is my review: {"passed": true, "issues": []}';
        // Direct JSON should fail, but other strategies should catch it
        const result = extractionStrategies.tryDirectJson(response, ReviewSchema);

        expect(result.success).toBe(false);
      });
    });

    describe('Strategy 2: Markdown JSON Block', () => {
      it('extracts JSON from ```json code block', () => {
        const response = `Here is my review:

\`\`\`json
{
  "passed": true,
  "issues": []
}
\`\`\`

That's my assessment.`;

        const result = extractStructuredResponseSync(response, ReviewSchema);

        expect(result.success).toBe(true);
        expect(result.data?.passed).toBe(true);
        expect(result.strategy).toBe('markdown_json_block');
      });

      it('extracts JSON from plain ``` code block', () => {
        const response = `
\`\`\`
{"passed": false, "issues": [{"severity": "major", "category": "testing", "description": "No tests"}]}
\`\`\`
`;
        const result = extractStructuredResponseSync(response, ReviewSchema);

        expect(result.success).toBe(true);
        expect(result.data?.passed).toBe(false);
        expect(result.strategy).toBe('markdown_json_block');
      });

      it('handles multiple code blocks, finding valid one', () => {
        const response = `
\`\`\`bash
npm test
\`\`\`

\`\`\`json
{"passed": true, "issues": []}
\`\`\`
`;
        const result = extractStructuredResponseSync(response, ReviewSchema);

        expect(result.success).toBe(true);
        expect(result.data?.passed).toBe(true);
      });

      it('handles uppercase JSON marker', () => {
        const response = `
\`\`\`JSON
{"passed": true, "issues": []}
\`\`\`
`;
        const result = extractStructuredResponseSync(response, ReviewSchema);

        expect(result.success).toBe(true);
        expect(result.strategy).toBe('markdown_json_block');
      });
    });

    describe('Strategy 3: Stripped JSON', () => {
      it('extracts JSON with leading text', () => {
        const response = 'Based on my review, here is the result: {"passed": true, "issues": []}';
        const result = extractStructuredResponseSync(response, ReviewSchema);

        expect(result.success).toBe(true);
        expect(result.data?.passed).toBe(true);
        expect(result.strategy).toBe('stripped_json');
      });

      it('extracts JSON with trailing text', () => {
        const response = '{"passed": false, "issues": [{"severity": "minor", "category": "style", "description": "Naming"}]} Hope this helps!';
        const result = extractStructuredResponseSync(response, ReviewSchema);

        expect(result.success).toBe(true);
        expect(result.data?.passed).toBe(false);
      });

      it('extracts JSON with both leading and trailing text', () => {
        const response = `
Review complete!

{"passed": true, "issues": []}

Let me know if you have questions.
`;
        const result = extractStructuredResponseSync(response, ReviewSchema);

        expect(result.success).toBe(true);
        expect(result.data?.passed).toBe(true);
      });

      it('handles array format', () => {
        const SimpleArraySchema = z.array(z.string());
        const response = 'Here are the items: ["one", "two", "three"] - done!';
        const result = extractStructuredResponseSync(response, SimpleArraySchema);

        expect(result.success).toBe(true);
        expect(result.data).toEqual(['one', 'two', 'three']);
      });
    });

    describe('Strategy 4: YAML Fallback', () => {
      it('extracts YAML from code block', () => {
        const response = `
Here is my review:

\`\`\`yaml
passed: true
issues: []
\`\`\`
`;
        const result = extractStructuredResponseSync(response, ReviewSchema);

        expect(result.success).toBe(true);
        expect(result.data?.passed).toBe(true);
        expect(result.strategy).toBe('yaml_fallback');
      });

      it('handles yml code block marker', () => {
        const response = `
\`\`\`yml
passed: false
issues:
  - severity: critical
    category: security
    description: XSS vulnerability found
\`\`\`
`;
        const result = extractStructuredResponseSync(response, ReviewSchema);

        expect(result.success).toBe(true);
        expect(result.data?.passed).toBe(false);
        expect(result.data?.issues).toHaveLength(1);
        expect(result.strategy).toBe('yaml_fallback');
      });
    });

    describe('Schema Validation', () => {
      it('fails when required field is missing', () => {
        const response = '{"passed": true}'; // missing issues
        const result = extractStructuredResponseSync(response, ReviewSchema, false);

        expect(result.success).toBe(false);
        expect(result.error).toContain('Schema validation failed');
      });

      it('fails when field type is wrong', () => {
        const response = '{"passed": "yes", "issues": []}'; // passed should be boolean
        const result = extractStructuredResponseSync(response, ReviewSchema, false);

        expect(result.success).toBe(false);
        expect(result.error).toContain('Schema validation failed');
      });

      it('fails when enum value is invalid', () => {
        const response = '{"passed": false, "issues": [{"severity": "extreme", "category": "test", "description": "desc"}]}';
        const result = extractStructuredResponseSync(response, ReviewSchema, false);

        expect(result.success).toBe(false);
        expect(result.error).toContain('Schema validation failed');
      });
    });

    describe('Error Handling', () => {
      it('returns rawResponse on failure', () => {
        const response = 'This is not valid JSON or YAML at all!';
        const result = extractStructuredResponseSync(response, ReviewSchema, false);

        expect(result.success).toBe(false);
        expect(result.rawResponse).toBe(response);
      });

      it('returns all strategy errors on failure', () => {
        const response = 'Invalid response';
        const result = extractStructuredResponseSync(response, ReviewSchema, false);

        expect(result.success).toBe(false);
        expect(result.error).toContain('direct_json');
        expect(result.error).toContain('markdown_json_block');
        expect(result.error).toContain('stripped_json');
        expect(result.error).toContain('yaml_fallback');
      });
    });
  });

  describe('extractStructuredResponse (async with retries)', () => {
    it('succeeds on first try without retry', async () => {
      const response = '{"passed": true, "issues": []}';
      const result = await extractStructuredResponse(response, ReviewSchema);

      expect(result.success).toBe(true);
      expect(result.data?.passed).toBe(true);
    });

    it('retries when parsing fails', async () => {
      const retryFn = vi.fn()
        .mockResolvedValueOnce('still invalid')
        .mockResolvedValueOnce('{"passed": true, "issues": []}');

      const result = await extractStructuredResponse(
        'invalid response',
        ReviewSchema,
        { maxRetries: 2, retryFn }
      );

      expect(result.success).toBe(true);
      expect(retryFn).toHaveBeenCalledTimes(2);
    });

    it('fails after max retries exhausted', async () => {
      const retryFn = vi.fn().mockResolvedValue('still invalid');

      const result = await extractStructuredResponse(
        'invalid response',
        ReviewSchema,
        { maxRetries: 2, retryFn, logOnFailure: false }
      );

      expect(result.success).toBe(false);
      expect(retryFn).toHaveBeenCalledTimes(2);
      expect(result.error).toContain('retry_1');
      expect(result.error).toContain('retry_2');
    });

    it('handles retry function errors', async () => {
      const retryFn = vi.fn().mockRejectedValue(new Error('API error'));

      const result = await extractStructuredResponse(
        'invalid response',
        ReviewSchema,
        { maxRetries: 1, retryFn, logOnFailure: false }
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('API error');
    });

    it('does not retry when maxRetries is 0', async () => {
      const retryFn = vi.fn();

      const result = await extractStructuredResponse(
        'invalid response',
        ReviewSchema,
        { maxRetries: 0, retryFn, logOnFailure: false }
      );

      expect(result.success).toBe(false);
      expect(retryFn).not.toHaveBeenCalled();
    });
  });

  describe('Real-world malformed responses', () => {
    it('handles LLM adding explanation before JSON', () => {
      const response = `I've analyzed the code and here's my assessment:

{"passed": false, "issues": [{"severity": "blocker", "category": "security", "description": "Potential SQL injection in user input handling"}]}

This is a serious security concern that should be addressed immediately.`;

      const result = extractStructuredResponseSync(response, ReviewSchema);

      expect(result.success).toBe(true);
      expect(result.data?.passed).toBe(false);
      expect(result.data?.issues[0].severity).toBe('blocker');
    });

    it('handles nested JSON in prose', () => {
      const response = `The review found the following:

\`\`\`json
{
  "passed": true,
  "issues": []
}
\`\`\`

Overall, the implementation looks good!`;

      const result = extractStructuredResponseSync(response, ReviewSchema);

      expect(result.success).toBe(true);
      expect(result.data?.passed).toBe(true);
    });

    it('handles JSON with unicode characters', () => {
      const response = '{"passed": false, "issues": [{"severity": "minor", "category": "i18n", "description": "Missing translations for: こんにちは, مرحبا"}]}';

      const result = extractStructuredResponseSync(response, ReviewSchema);

      expect(result.success).toBe(true);
      expect(result.data?.issues[0].description).toContain('こんにちは');
    });

    it('handles JSON with escaped quotes', () => {
      const response = '{"passed": false, "issues": [{"severity": "major", "category": "code", "description": "Don\'t use \\"eval\\" function"}]}';

      const result = extractStructuredResponseSync(response, ReviewSchema);

      expect(result.success).toBe(true);
      expect(result.data?.issues[0].description).toContain('eval');
    });

    it('handles YAML with complex nested structure', () => {
      const response = `
\`\`\`yaml
passed: false
issues:
  - severity: critical
    category: architecture
    description: |
      The following issues were found:
      1. Circular dependency detected
      2. Missing error boundaries
      3. No retry logic for API calls
\`\`\`
`;
      const result = extractStructuredResponseSync(response, ReviewSchema);

      expect(result.success).toBe(true);
      expect(result.data?.issues[0].description).toContain('Circular dependency');
    });

    it('handles completely empty response', () => {
      const response = '';
      const result = extractStructuredResponseSync(response, ReviewSchema, false);

      expect(result.success).toBe(false);
    });

    it('handles whitespace-only response', () => {
      const response = '   \n\n\t  ';
      const result = extractStructuredResponseSync(response, ReviewSchema, false);

      expect(result.success).toBe(false);
    });
  });

  describe('Individual extraction strategies', () => {
    describe('tryDirectJson', () => {
      it('succeeds with valid JSON object', () => {
        const result = extractionStrategies.tryDirectJson(
          '{"passed": true, "issues": []}',
          ReviewSchema
        );
        expect(result.success).toBe(true);
      });

      it('fails when response starts with text', () => {
        const result = extractionStrategies.tryDirectJson(
          'Response: {"passed": true, "issues": []}',
          ReviewSchema
        );
        expect(result.success).toBe(false);
      });
    });

    describe('tryMarkdownJsonBlock', () => {
      it('finds JSON in code block', () => {
        const result = extractionStrategies.tryMarkdownJsonBlock(
          '```json\n{"passed": true, "issues": []}\n```',
          ReviewSchema
        );
        expect(result.success).toBe(true);
      });

      it('returns error when no code blocks present', () => {
        const result = extractionStrategies.tryMarkdownJsonBlock(
          '{"passed": true, "issues": []}',
          ReviewSchema
        );
        expect(result.success).toBe(false);
      });
    });

    describe('tryStrippedJson', () => {
      it('finds JSON between braces', () => {
        const result = extractionStrategies.tryStrippedJson(
          'text {"passed": true, "issues": []} more text',
          ReviewSchema
        );
        expect(result.success).toBe(true);
      });

      it('handles nested braces correctly', () => {
        const response = 'prefix {"passed": true, "issues": [{"severity": "minor", "category": "test", "description": "desc"}]} suffix';
        const result = extractionStrategies.tryStrippedJson(response, ReviewSchema);
        expect(result.success).toBe(true);
        expect(result.data?.issues).toHaveLength(1);
      });
    });

    describe('tryYamlFallback', () => {
      it('parses YAML code block', () => {
        const result = extractionStrategies.tryYamlFallback(
          '```yaml\npassed: true\nissues: []\n```',
          ReviewSchema
        );
        expect(result.success).toBe(true);
      });

      it('handles YML marker', () => {
        const result = extractionStrategies.tryYamlFallback(
          '```YML\npassed: true\nissues: []\n```',
          ReviewSchema
        );
        expect(result.success).toBe(true);
      });
    });
  });
});
