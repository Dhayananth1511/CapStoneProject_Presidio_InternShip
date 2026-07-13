// Replanning Agent — handles HITL rejection ("I want cheaper hotel" / "change dates")
// True agentic tool-calling pattern: the LLM reads the rejection reason and
// invokes the specific replan tool that matches what the user wants changed.
// Key insight: we PRESERVE everything that was expensive to compute and
// ONLY re-run what the user wants changed. This saves API calls and time.

import { ChatGroq } from '@langchain/groq';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { TripContext } from './plannerAgent';
import { withRetry } from '../utils/retry';
import logger from '../utils/logger';

const llm = new ChatGroq({
  apiKey: process.env.GROQ_API_KEY,
  model: 'llama-3.3-70b-versatile', // Smarter tool-routing for replan decisions
  temperature: 0.1,
});

// --- Tool Definitions ---
// Each tool maps to a specific replan action the LLM can invoke.

const replanSchema = z.object({
  reason: z.string().describe('Brief explanation of what will be replanned and why.'),
});

const replanAccommodationTool = tool(async () => {}, {
  name: 'replan_accommodation',
  description: 'User wants a different or cheaper hotel. Clears accommodation data so it is re-fetched.',
  schema: replanSchema,
});

const replanDatesTool = tool(async () => {}, {
  name: 'replan_dates',
  description: 'User wants to change travel dates. Clears weather, transport, accommodation, itinerary so they are re-fetched with new dates.',
  schema: replanSchema,
});

const replanBudgetTool = tool(async () => {}, {
  name: 'replan_budget',
  description: 'User wants to increase or decrease the budget. Clears budget breakdown so it is recalculated.',
  schema: replanSchema,
});

const replanActivitiesTool = tool(async () => {}, {
  name: 'replan_activities',
  description: 'User wants different activities, attractions, or restaurants. Clears activities data.',
  schema: replanSchema,
});

const replanItineraryTool = tool(async () => {}, {
  name: 'replan_itinerary',
  description: 'User wants a different day-by-day schedule. Clears itinerary and formatted plan.',
  schema: replanSchema,
});

const replanFullTripTool = tool(async () => {}, {
  name: 'replan_full_trip',
  description: 'User wants a complete re-plan (destination changed or major overhaul). Clears everything.',
  schema: replanSchema,
});

export async function runReplanningAgent(
  context: TripContext,
  rejectionReason: string
): Promise<{ updatedContext: TripContext; whatChanged: string[] }> {

  const supervisorPrompt = `You are a travel replanning supervisor. The user rejected the current travel plan.
Read their rejection reason carefully and invoke the MOST APPROPRIATE replan tool.

Current plan context:
- Destination: ${context.input.destination}
- Budget: ₹${context.input.budget_inr}
- Dates: ${context.input.start_date} → ${context.input.end_date}
- Hotel: ${context.accommodation?.recommended || 'N/A'}
- Travelers: ${context.input.travelers}

Tool selection rules:
1. Mentions cheaper hotel / different lodging / budget hotel → invoke "replan_accommodation"
2. Mentions change dates / different time / shorter trip / extend trip → invoke "replan_dates"
3. Mentions increase budget / more money / different budget → invoke "replan_budget"
4. Mentions different activities / sightseeing / restaurants / things to do → invoke "replan_activities"
5. Mentions different schedule / itinerary / day plan → invoke "replan_itinerary"
6. Mentions change destination / completely different trip / start over → invoke "replan_full_trip"
7. Vague rejection with no specific target → invoke "replan_itinerary" as safe default

You MUST invoke exactly one tool.`;

  const agentWithTools = llm.bindTools([
    replanAccommodationTool,
    replanDatesTool,
    replanBudgetTool,
    replanActivitiesTool,
    replanItineraryTool,
    replanFullTripTool,
  ]);

  const response = await withRetry(() => agentWithTools.invoke([
    new SystemMessage(supervisorPrompt),
    new HumanMessage(`User rejection reason: "${rejectionReason}"`),
  ]));

  const toolCalls = response.tool_calls || [];
  const selectedTool = toolCalls[0]?.name || 'replan_itinerary';

  logger.info('ReplanningAgent tool selected', { selectedTool, rejectionReason });

  // Build updated context: clear ONLY the agent outputs that the selected tool targets
  const updatedContext = { ...context };
  const whatChanged: string[] = [];

  switch (selectedTool) {
    case 'replan_accommodation':
      updatedContext.accommodation = {};
      updatedContext.budget = {};
      updatedContext.formattedPlan = '';
      whatChanged.push('accommodation', 'budget');
      break;

    case 'replan_dates':
      // Dates impact everything downstream
      updatedContext.weather = {};
      updatedContext.transport = {};
      updatedContext.accommodation = {};
      updatedContext.budget = {};
      updatedContext.itinerary = {};
      updatedContext.formattedPlan = '';
      whatChanged.push('dates', 'weather', 'transport', 'accommodation', 'budget', 'itinerary');
      break;

    case 'replan_budget':
      updatedContext.budget = {};
      updatedContext.formattedPlan = '';
      whatChanged.push('budget');
      break;

    case 'replan_activities':
      updatedContext.activities = {};
      updatedContext.itinerary = {};
      updatedContext.formattedPlan = '';
      whatChanged.push('activities', 'itinerary');
      break;

    case 'replan_itinerary':
      updatedContext.itinerary = {};
      updatedContext.formattedPlan = '';
      whatChanged.push('itinerary');
      break;

    case 'replan_full_trip':
      // Full reset — clear all computed agent outputs
      updatedContext.weather = {};
      updatedContext.transport = {};
      updatedContext.accommodation = {};
      updatedContext.activities = {};
      updatedContext.budget = {};
      updatedContext.itinerary = {};
      updatedContext.formattedPlan = '';
      whatChanged.push('destination', 'weather', 'transport', 'accommodation', 'activities', 'budget', 'itinerary');
      break;

    default:
      // Safe fallback
      updatedContext.itinerary = {};
      updatedContext.formattedPlan = '';
      whatChanged.push('itinerary');
      logger.warn('ReplanningAgent: Unknown tool selected, defaulting to itinerary replan.', { selectedTool });
  }

  return { updatedContext, whatChanged };
}
