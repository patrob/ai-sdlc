import { getLogger } from '../../core/logger.js';
import type { FARScore } from '../../types/index.js';

/**
 * Maximum input length to prevent DoS attacks.
 * Set to 10,000 chars to accommodate long research findings
 * while preventing memory exhaustion from malicious inputs.
 */
const MAX_INPUT_LENGTH = 10000;

/**
 * Parse FAR evaluation from web research finding text.
 * Expected format from LLM:
 * **FAR Score**: Factuality: 5, Actionability: 4, Relevance: 5
 * **Justification**: Official documentation provides...
 *
 * Returns default scores (2, 2, 2) with parsingSucceeded: false if parsing fails.
 * Default of 2 (rather than 3) indicates uncertainty rather than average quality.
 *
 * @param finding - Web research finding text to parse
 * @returns FARScore with parsed or default values and parsing status
 */
export function evaluateFAR(finding: string): FARScore {
  // Enforce maximum length to prevent ReDoS attacks
  if (finding.length > MAX_INPUT_LENGTH) {
    finding = finding.substring(0, MAX_INPUT_LENGTH);
  }

  try {
    // Look for FAR score pattern
    const scoreMatch = finding.match(/\*\*FAR Score\*\*:.*?Factuality:\s*(\d+).*?Actionability:\s*(\d+).*?Relevance:\s*(\d+)/i);
    const justificationMatch = finding.match(/\*\*Justification\*\*:\s*(.+?)(?:\n\n|\n#|$)/is);

    if (scoreMatch && justificationMatch) {
      const factuality = parseInt(scoreMatch[1], 10) as 1 | 2 | 3 | 4 | 5;
      const actionability = parseInt(scoreMatch[2], 10) as 1 | 2 | 3 | 4 | 5;
      const relevance = parseInt(scoreMatch[3], 10) as 1 | 2 | 3 | 4 | 5;
      const justification = justificationMatch[1].trim();

      // Validate scores are in range 1-5
      if ([factuality, actionability, relevance].every(s => s >= 1 && s <= 5)) {
        return {
          factuality,
          actionability,
          relevance,
          justification,
          parsingSucceeded: true,
        };
      } else {
        getLogger().warn('web-research', 'FAR scores out of valid range (1-5), using defaults');
      }
    } else if (scoreMatch && !justificationMatch) {
      getLogger().warn('web-research', 'FAR justification missing, using defaults');
    } else if (!scoreMatch && justificationMatch) {
      getLogger().warn('web-research', 'FAR scores not found in finding, using defaults');
    } else {
      getLogger().warn('web-research', 'FAR scores and justification not found in finding, using defaults');
    }

    // If parsing failed, return default scores (2/5 indicates uncertainty)
    return {
      factuality: 2,
      actionability: 2,
      relevance: 2,
      justification: 'FAR scores could not be parsed from finding. Default scores (2/5) applied.',
      parsingSucceeded: false,
    };
  } catch (error) {
    getLogger().error('web-research', 'Error parsing FAR scores', { error });
    return {
      factuality: 2,
      actionability: 2,
      relevance: 2,
      justification: 'Error parsing FAR evaluation',
      parsingSucceeded: false,
    };
  }
}
