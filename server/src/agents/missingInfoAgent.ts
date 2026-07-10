// Missing Info Agent — checks the TripContext for critical empty fields.
// If destination, dates, or budget are missing, it generates a natural
// clarifying question to ask the user. This is what creates the conversational
// multi-turn chat experience.

import { ChatGroq } from '@langchain/groq';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { TripContext } from './plannerAgent';

const llm = new ChatGroq({
  apiKey: process.env.GROQ_API_KEY,
  model: 'llama3-8b-8192',
  temperature: 0.3,
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
  if (!input.destination) missingFields.push('destination');
  if (!input.start_date || !input.end_date) missingFields.push('travel dates');
  if (!input.budget_inr || input.budget_inr === 0) missingFields.push('budget');
  if (!input.travelers || input.travelers === 0) missingFields.push('number of travelers');

  if (missingFields.length === 0) {
    return { complete: true, missingFields: [] };
  }

  // Use LLM to generate a natural-sounding question (not robotic "MISSING FIELDS: ...")
  const response = await llm.invoke([
    new SystemMessage(
      `You are a friendly travel planning assistant. Generate ONE natural conversational question 
       to ask the user for the missing trip information. Be warm and helpful.`
    ),
    new HumanMessage(
      `Missing information: ${missingFields.join(', ')}. 
       Already know: ${JSON.stringify(input)}. 
       Generate a friendly question.`
    ),
  ]);

  return {
    complete: false,
    missingFields,
    clarifyingQuestion: response.content.toString(),
  };
}
