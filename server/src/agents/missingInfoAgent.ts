// Missing Info Agent — true agentic tool-calling pattern.
// The LLM reads the current TripContext and uses tool-calling to decide
// WHICH clarifying question to ask next (not a hardcoded field-check loop).
// This allows the LLM to prioritise intelligently — e.g. ask for dates and
// budget in one shot when both are missing, rather than one field at a time.

import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { TripContext } from './plannerAgent';
import { withRetry } from '../utils/retry';
import logger from '../utils/logger';
import { createChatModel } from '../utils/llm';
import { getMissingInfoSupervisorPrompt } from '../prompts';

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
  const supervisorPrompt = getMissingInfoSupervisorPrompt(input, missingFields);

  const llm = createChatModel({
    temperature: 0.3,
    tools: [
      askForOriginTool,
      askForDatesTool,
      askForBudgetTool,
      askForTravelersTool,
      askForMultipleTool,
      allFieldsCompleteTool,
    ],
  });

  const response = await withRetry(() => llm.invoke([
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
