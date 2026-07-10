// Planner Agent — the "brain" that reads the raw user message and extracts
// structured trip parameters. It uses the Groq LLM to parse natural language
// like "I want to go to Manali for 5 days with ₹25,000 next month" into
// a clean TripContext object with destination, dates, budget, etc.

import { ChatGroq } from '@langchain/groq';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';

const llm = new ChatGroq({
  apiKey: process.env.GROQ_API_KEY,
  model: 'llama3-8b-8192', // Fast, free, good for structured extraction
  temperature: 0.1, // Low temperature = deterministic, consistent outputs
});

export interface TripContext {
  sessionId: string;
  userId: string;
  status: 'DRAFT' | 'PLANNED' | 'CONFIRMED' | 'CANCELLED';
  input: {
    destination?: string;
    origin?: string;
    start_date?: string;
    end_date?: string;
    travelers?: number;
    budget_inr?: number;
    interests?: string[];
  };
  weather?: any;
  transport?: any;
  accommodation?: any;
  activities?: any;
  local_transport?: any;
  budget?: any;
  itinerary?: any;
  booking?: any;
  formattedPlan?: string;
  conversationHistory: Array<{ role: string; content: string }>;
}

export async function runPlannerAgent(
  userMessage: string,
  context: TripContext,
  longTermMemory: string
): Promise<TripContext> {
  const systemPrompt = `You are a travel planning assistant. Extract trip parameters from the user's message.
Return ONLY valid JSON with this exact structure (leave fields empty string or 0 if missing):
{
  "destination": "string or empty",
  "origin": "string or empty",  
  "start_date": "YYYY-MM-DD or empty",
  "end_date": "YYYY-MM-DD or empty",
  "travelers": number or 0,
  "budget_inr": number or 0,
  "interests": ["array", "of", "strings"]
}

User's travel history context: ${longTermMemory || 'No history yet.'}
Current extracted params: ${JSON.stringify(context.input)}`;

  const response = await llm.invoke([
    new SystemMessage(systemPrompt),
    new HumanMessage(userMessage),
  ]);

  try {
    // Extract JSON from LLM response
    const jsonMatch = response.content.toString().match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');
    
    const extracted = JSON.parse(jsonMatch[0]);
    
    // Merge with existing context — don't overwrite non-empty fields unless new value provided
    return {
      ...context,
      input: {
        ...context.input,
        ...Object.fromEntries(
          Object.entries(extracted).filter(([_, v]) => v !== '' && v !== 0 && (Array.isArray(v) ? v.length > 0 : true))
        ),
      },
    };
  } catch {
    // If LLM returns malformed JSON, return context unchanged and let Missing Info Agent handle it
    return context;
  }
}
