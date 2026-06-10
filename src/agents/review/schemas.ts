import { z } from 'zod';

/**
 * Security: Zod schema for validating LLM review responses
 * Prevents malicious or malformed JSON from causing issues
 */
export const ReviewIssueSchema = z.object({
  severity: z.enum(['blocker', 'critical', 'major', 'minor']),
  category: z.string().max(100),
  description: z.string().max(5000),
  // Use .nullish() to accept both null and undefined, then transform to undefined for consistency
  // This handles LLM responses that return {"line": null} instead of omitting the field
  file: z.string().nullish().transform(v => v ?? undefined),
  line: z.number().int().positive().nullish().transform(v => v ?? undefined),
  suggestedFix: z.string().max(5000).nullish().transform(v => v ?? undefined),
  // Perspectives field for unified review (optional for backward compatibility)
  // Normalize case and filter invalid values instead of failing validation
  // This handles LLM responses that return ["Code", "Security"] instead of lowercase
  perspectives: z.array(z.string())
    .optional()
    .transform(arr => {
      if (!arr) return undefined;
      const validValues = ['code', 'security', 'po'] as const;
      const normalized = arr
        .map(v => v.toLowerCase().trim())
        .filter((v): v is 'code' | 'security' | 'po' => validValues.includes(v as typeof validValues[number]));
      return normalized.length > 0 ? normalized : undefined;
    }),
});

export const ReviewResponseSchema = z.object({
  passed: z.boolean(),
  issues: z.array(ReviewIssueSchema),
});
