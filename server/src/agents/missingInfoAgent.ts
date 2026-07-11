// Missing Info Agent — checks the TripContext for critical empty fields.
// If destination, dates, or budget are missing, it generates a natural
// clarifying question to ask the user. This is what creates the conversational
// multi-turn chat experience.

import { ChatGroq } from '@langchain/groq';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { TripContext } from './plannerAgent';

const llm = new ChatGroq({
  apiKey: process.env.GROQ_API_KEY,
  model: 'llama-3.1-8b-instant',
  temperature: 0.3,
  maxRetries: 5,
});

export interface MissingInfoResult {
  complete: boolean;
  missingFields: string[];
  clarifyingQuestion?: string;
}

export async function runMissingInfoAgent(context: TripContext): Promise<MissingInfoResult> {
  const { input } = context;
  const missingFields: string[] = [];

  // Check which critical fields are empty
  if (!input.destination) missingFields.push('destination city');
  if (!input.origin) missingFields.push('departure city');
  if (!input.start_date || !input.end_date) missingFields.push('travel dates');
  if (!input.budget_inr || input.budget_inr === 0) missingFields.push('budget');
  if (!input.travelers || input.travelers === 0) missingFields.push('number of travelers');

  if (missingFields.length === 0) {
    return { complete: true, missingFields: [] };
  }

  // Use LLM to generate a very short, simple question (maximum 15 words)
  const response = await llm.invoke([
    new SystemMessage(
      `You are a concise travel assistant. Generate exactly ONE very short, direct question 
       asking the user for the missing fields: ${missingFields.join(', ')}.
       Rule: Keep the question simple, friendly, and under 15 words. Do not write a long paragraph.`
    ),
    new HumanMessage(
      `Current details known: ${JSON.stringify(input)}. 
       Please ask for the missing: ${missingFields.join(', ')}.`
    ),
  ]);

  return {
    complete: false,
    missingFields,
    clarifyingQuestion: response.content.toString(),
  };
}
