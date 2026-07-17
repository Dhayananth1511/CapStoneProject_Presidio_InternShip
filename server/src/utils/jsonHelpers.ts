/**
 * Shared utility functions to extract JSON payload blocks from LLM text responses.
 */

export function extractJson(text: string): any {
  // Try to find all blocks starting with { and ending with } using non-greedy global search
  const regex = /\{[\s\S]*?\}/g;
  let match;
  let lastParsed = null;
  while ((match = regex.exec(text)) !== null) {
    try {
      lastParsed = JSON.parse(match[0]);
    } catch (e) {
      // ignore invalid json fragments
    }
  }
  if (lastParsed) return lastParsed;

  // Fallback: try greedy matching if non-greedy didn't yield a valid object
  const greedyMatch = text.match(/\{[\s\S]*\}/);
  if (greedyMatch) {
    return JSON.parse(greedyMatch[0]);
  }
  throw new Error("No valid JSON found in response");
}

export function extractJsonObject(text: string): any {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON object found in LLM recommendation fallback');
  return JSON.parse(match[0]);
}
