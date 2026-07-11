// Destination Recommendation Agent — when the user has no specific destination
// in mind, this agent suggests top 3 places based on budget, interests, and
// past travel history stored in long-term memory.

import { ChatGroq } from '@langchain/groq';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { TripContext } from './plannerAgent';
import { withRetry } from '../utils/retry';

const llm = new ChatGroq({
  apiKey: process.env.GROQ_API_KEY,
  model: 'llama-3.1-8b-instant',
  temperature: 0.7, // Higher temperature = more creative recommendations
});

export async function runDestinationRecAgent(
  context: TripContext,
  longTermMemory: string
): Promise<{ recommendedDestinations: string[]; reasoning: string; selectedDestination: string }> {
  const response = await withRetry(() => llm.invoke([
    new SystemMessage(
      `You are a travel expert. Recommend exactly 3 Indian travel destinations.
       Return ONLY valid JSON:
       { "destinations": ["dest1", "dest2", "dest3"], "reasoning": "brief explanation", "top_pick": "dest1" }
       Consider budget, interests, and season.`
    ),
    new HumanMessage(
      `Budget: ₹${context.input.budget_inr}, Interests: ${context.input.interests?.join(', ')}, 
       Travel period: ${context.input.start_date} to ${context.input.end_date}, 
       Travelers: ${context.input.travelers}.
       Past preferences: ${longTermMemory || 'First-time user'}`
    ),
  ]));

  try {
    const jsonMatch = response.content.toString().match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in destination recommendation response');
    const data = JSON.parse(jsonMatch[0]);

    if (!data.destinations?.length || !data.top_pick) {
      throw new Error('Destination recommendation response was incomplete');
    }

    return {
      recommendedDestinations: data.destinations,
      reasoning: data.reasoning || '',
      selectedDestination: data.top_pick || data.destinations[0],
    };
  } catch (err) {
    // Do NOT silently fabricate a destination — surface the failure so the
    // system asks the user to specify one explicitly (brief: "no fabricated responses")
    throw new Error(
      `Destination recommendation failed: ${(err as Error).message}. Please specify a destination directly.`
    );
  }
}
