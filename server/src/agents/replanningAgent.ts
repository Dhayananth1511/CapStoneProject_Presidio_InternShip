// Replanning Agent — handles HITL rejection ("I want cheaper hotel" / "change dates")
// True agentic tool-calling pattern: the LLM reads the rejection reason and
// invokes the specific replan tool that matches what the user wants changed.
// Key insight: we PRESERVE everything that was expensive to compute and
// ONLY re-run what the user wants changed. This saves API calls and time.

import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { TripContext } from './plannerAgent';
import { withRetry } from '../utils/retry';
import logger from '../utils/logger';
import { createChatModel } from '../utils/llm';
import { getReplanningSupervisorPrompt } from '../prompts';

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

  const supervisorPrompt = getReplanningSupervisorPrompt(
    context.input.destination || '',
    context.input.budget_inr || 0,
    context.input.start_date || '',
    context.input.end_date || '',
    context.accommodation?.recommended || 'N/A',
    context.input.travelers || 0
  );

  const llm = createChatModel({
    temperature: 0.1,
    tools: [
      replanAccommodationTool,
      replanDatesTool,
      replanBudgetTool,
      replanActivitiesTool,
      replanItineraryTool,
      replanFullTripTool,
    ],
  });

  const response = await withRetry(() => llm.invoke([
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
      updatedContext.accommodation = undefined;
      updatedContext.budget = undefined;
      updatedContext.itinerary = undefined;         // itinerary references hotel — must regenerate
      updatedContext.local_transport = undefined;   // transit is hotel-specific — always clear
      updatedContext.formattedPlan = undefined;
      whatChanged.push('accommodation', 'budget', 'itinerary', 'local_transport');
      break;

    case 'replan_dates':
      // Dates impact everything downstream
      updatedContext.weather = undefined;
      updatedContext.transport = undefined;
      updatedContext.accommodation = undefined;
      updatedContext.budget = undefined;
      updatedContext.itinerary = undefined;
      updatedContext.local_transport = undefined;   // dates affect itinerary → transit must reset
      updatedContext.formattedPlan = undefined;
      whatChanged.push('dates', 'weather', 'transport', 'accommodation', 'budget', 'itinerary', 'local_transport');
      break;

    case 'replan_budget':
      updatedContext.budget = undefined;
      updatedContext.formattedPlan = undefined;
      whatChanged.push('budget');
      break;

    case 'replan_activities':
      updatedContext.activities = undefined;
      updatedContext.itinerary = undefined;
      updatedContext.local_transport = undefined;   // activities affect itinerary locations → transit must reset
      updatedContext.formattedPlan = undefined;
      whatChanged.push('activities', 'itinerary', 'local_transport');
      break;

    case 'replan_itinerary':
      updatedContext.itinerary = undefined;
      updatedContext.local_transport = undefined;   // itinerary changed → transit must reset
      updatedContext.formattedPlan = undefined;
      whatChanged.push('itinerary', 'local_transport');
      break;

    case 'replan_full_trip':
      // Full reset — clear all computed agent outputs
      updatedContext.weather = undefined;
      updatedContext.transport = undefined;
      updatedContext.accommodation = undefined;
      updatedContext.activities = undefined;
      updatedContext.budget = undefined;
      updatedContext.itinerary = undefined;
      updatedContext.local_transport = undefined;
      updatedContext.formattedPlan = undefined;
      whatChanged.push('destination', 'weather', 'transport', 'accommodation', 'activities', 'budget', 'itinerary', 'local_transport');
      break;

    default:
      // Safe fallback
      updatedContext.itinerary = undefined;
      updatedContext.local_transport = undefined;
      updatedContext.formattedPlan = undefined;
      whatChanged.push('itinerary', 'local_transport');
      logger.warn('ReplanningAgent: Unknown tool selected, defaulting to itinerary replan.', { selectedTool });
  }

  return { updatedContext, whatChanged };
}
