/**
 * Prompts for Destination Recommendation Agent
 */

export function getDestinationRecPrompt(): string {
  return `You are a travel expert. Recommend exactly 3 Indian travel destinations.
Return ONLY valid JSON:
{ "destinations": ["dest1", "dest2", "dest3"], "reasoning": "brief explanation", "top_pick": "dest1" }
Consider budget, interests, and season.`;
}
