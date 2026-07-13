// Missing Info Agent — true agentic tool-calling pattern.
// The LLM reads the current TripContext and uses tool-calling to decide
// WHICH clarifying question to ask next (not a hardcoded field-check loop).
// This allows the LLM to prioritise intelligently — e.g. ask for dates and
// budget in one shot when both are missing, rather than one field at a time.

import { ChatGroq } from '@langchain/groq';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { TripContext } from './plannerAgent';
import { withRetry } from '../utils/retry';
import logger from '../utils/logger';

const llm = new ChatGroq({
  apiKey: process.env.GROQ_API_KEY,
  model: 'llama-3.1-8b-instant',
  temperature: 0.3,
});

export interface MissingInfoResult {
  complete: boolean;
  missingFields: string[];
  clarifyingQuestion?: string;
}

// --- Tool Definitions ---
// Each tool represents a specific clarifying question the LLM can choose to ask.

const questionSchema = z.object({
  question: z.string().describe('A short, friendly question to ask the user (under 20 words).'),
  missingFields: z.array(z.string()).optional().describe('Which fields this question is asking about.'),
});

const askForOriginTool = tool(async () => {}, {
  name: 'ask_for_origin',
  description: 'Ask the user for their departure / starting city.',
  schema: questionSchema,
});

const askForDatesTool = tool(async () => {}, {
  name: 'ask_for_dates',
  description: 'Ask the user for their travel start and end dates.',
  schema: questionSchema,
});

const askForBudgetTool = tool(async () => {}, {
  name: 'ask_for_budget',
  description: 'Ask the user for their total travel budget in INR.',
  schema: questionSchema,
});

const askForTravelersTool = tool(async () => {}, {
  name: 'ask_for_travelers',
  description: 'Ask the user how many people will be traveling.',
  schema: questionSchema,
});

const askForMultipleTool = tool(async () => {}, {
  name: 'ask_for_multiple',
  description: 'Ask the user for multiple missing fields in one concise message.',
  schema: questionSchema,
});

const allFieldsCompleteTool = tool(async () => {}, {
  name: 'all_fields_complete',
  description: 'Signal that all required trip parameters are present — no question needed.',
  schema: z.object({}),
});

export async function runMissingInfoAgent(context: TripContext): Promise<MissingInfoResult> {
  const { input } = context;

  // Fast-path: if all critical fields are present, skip LLM call entirely
  const missingFields: string[] = [];
  if (!input.origin) missingFields.push('departure city (origin)');
  if (!input.start_date || !input.end_date) missingFields.push('travel dates (start & end)');
  if (!input.budget_inr || input.budget_inr === 0) missingFields.push('budget in INR');
  if (!input.travelers || input.travelers === 0) missingFields.push('number of travelers');

  if (missingFields.length === 0) {
    return { complete: true, missingFields: [] };
  }

  // LLM tool-calling: let the agent decide which question to ask
  const supervisorPrompt = `You are a friendly travel assistant. Check the current trip parameters and choose the BEST tool to ask for the most important missing information.

Current trip parameters: ${JSON.stringify(input)}
Missing fields identified: ${missingFields.join(', ')}

Rules:
1. If only ONE field is missing → call the specific tool for that field and ask for it politely.
2. If TWO OR MORE fields are missing → call "ask_for_multiple" and ask a single friendly question that explicitly lists every single missing field (e.g., departure city, travel dates, or number of travelers) so the user knows exactly what parameters you need in a single response.
3. If ALL fields are present → call "all_fields_complete".
4. The question MUST clearly list all of the missing fields (e.g. "To plan your trip, could you please provide your departure city, travel dates, and number of travelers?"). Do NOT ask generic questions like "Can you please provide the missing details?".

You MUST invoke exactly one tool.`;

  const agentWithTools = llm.bindTools([
    askForOriginTool,
    askForDatesTool,
    askForBudgetTool,
    askForTravelersTool,
    askForMultipleTool,
    allFieldsCompleteTool,
  ]);

  const response = await withRetry(() => agentWithTools.invoke([
    new SystemMessage(supervisorPrompt),
    new HumanMessage('Which question should I ask the user next?'),
  ]));

  const toolCalls = response.tool_calls || [];
  const selectedCall = toolCalls[0];

  logger.info('MissingInfoAgent tool selected', { tool: selectedCall?.name, missingFields });

  if (!selectedCall || selectedCall.name === 'all_fields_complete') {
    return { complete: true, missingFields: [] };
  }

  const args = selectedCall.args as { question?: string; missingFields?: string[] };
  const question = args.question || `Could you please provide your ${missingFields.join(' and ')}?`;
  const reportedMissing = args.missingFields || missingFields;

  return {
    complete: false,
    missingFields: reportedMissing,
    clarifyingQuestion: question,
  };
}
