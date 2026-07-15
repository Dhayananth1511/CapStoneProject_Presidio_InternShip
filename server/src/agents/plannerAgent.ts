// Planner Agent — The swarm Supervisor.
// Rather than using static controller steps, the Planner Agent acts as a Supervisor model,
// extracting user inputs and dynamically selecting which child agent tool to route to.

import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { runMissingInfoAgent } from './missingInfoAgent';
import { getPlannerExtractionPrompt, getPlannerSupervisorPrompt } from '../prompts';
import { runDestinationRecAgent } from './destinationRecAgent';
import { runParallelAgents, synthesizeTripPlan } from './coordinatorAgent';
import { runBudgetAgent } from './budgetAgent';
import { runItineraryAgent } from './itineraryAgent';
import { enrichItineraryWithLocalTransport } from '../utils/localTransitEnricher';
import { getRestaurantsNearHotel } from '../mcp-servers/mapsMCP';
import { withRetry } from '../utils/retry';
import logger from '../utils/logger';
import { validateTripDates, clampTravelers, clampBudget } from '../utils/inputSanitizer';
import { createChatModel } from '../utils/llm';

const llm = createChatModel({
  temperature: 0.1,
});

function extractJson(text: string): any {
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
    duration_days?: number;
    max_price_per_night?: number;
  };
  weather?: any;
  transport?: any;
  accommodation?: any;
  activities?: any;
  budget?: any;
  itinerary?: any;
  local_transport?: any;
  booking?: any;
  formattedPlan?: string;
  conversationHistory: Array<{ role: string; content: string }>;
}

export interface PlannerAgentResult {
  context: TripContext;
  status: 'NEEDS_INFO' | 'PLANNED' | 'ERROR';
  clarifyingQuestion?: string;
  plan?: string;
  budgetFeasible?: boolean;
  budgetAlternatives?: string[];
}

export async function runPlannerAgent(
  userMessage: string,
  context: TripContext,
  longTermMemory: string
): Promise<PlannerAgentResult> {
  logger.info('Supervisor: Extracting slot parameters from user message', { sessionId: context.sessionId });

  // Step 1: Parameter Slot Extraction
  const currentYear = new Date().getFullYear();
  const currentDateStr = new Date().toISOString().split('T')[0];

  // We slice context history up to 12 turns so that earlier requirements (e.g. "5-day trip")
  // are not lost while slot gathering proceeds.
  const recentHistory = context.conversationHistory
    .slice(-12)
    .map((msg) => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
    .join('\n');

  const extractionPrompt = getPlannerExtractionPrompt(currentDateStr, currentYear, recentHistory, context.input);

  const extractionResponse = await withRetry(() => llm.invoke([
    new SystemMessage(extractionPrompt),
    new HumanMessage(userMessage),
  ]));

  let updatedInput = { ...context.input };
  try {
    const rawContent = extractionResponse.content.toString();
    const extracted = extractJson(rawContent);
    logger.info('Supervisor extracted slots successfully', { extracted, rawLength: rawContent.length });
    // Merge values (do not overwrite with empty values)
    updatedInput = {
      ...context.input,
      ...Object.fromEntries(
        Object.entries(extracted).filter(([_, v]) => v !== '' && v !== 0 && (Array.isArray(v) ? v.length > 0 : true))
      )
    };
  } catch (err: any) {
    logger.warn('Failed to parse json slots inside Supervisor extractor', { error: err.message, rawContent: extractionResponse.content.toString() });
  }

  // Programmatically extract lodging price ceiling from userMessage
  const priceCeilingMatch = userMessage.match(/(?:below|under|less than|within|max|maximum|upto|up to)\s*[₹]?\s*(\d+)/i);
  if (priceCeilingMatch) {
    const parsedVal = parseInt(priceCeilingMatch[1], 10);
    // Only lock to hotel price constraint if the message indicates lodging/hotels/stay
    if (/(?:hotel|stay|night|accommodation|lodging|room)/i.test(userMessage.toLowerCase())) {
      logger.info(`Context update: Set max_price_per_night programmatically to ₹${parsedVal}`);
      updatedInput.max_price_per_night = parsedVal;
    }
  }

  // Clear max_price_per_night if they explicitly ask for luxury or mid-range
  if (/(?:luxury|mid-range|mid range|premium|expensive|high end|five star|5 star)/i.test(userMessage.toLowerCase())) {
    logger.info(`Context update: Clearing max_price_per_night programmatically since dynamic tier change requested`);
    delete updatedInput.max_price_per_night;
  }

  let updatedContext: TripContext = {
    ...context,
    input: updatedInput
  };

  // --- Programmatic Input Clamping (applied AFTER LLM extraction, BEFORE supervisor routing) ---
  // These guards cannot be bypassed by the LLM because they run on the extracted output.
  if (updatedContext.input.travelers !== undefined) {
    const { value, warning } = clampTravelers(updatedContext.input.travelers);
    if (warning) logger.warn('Travelers clamped', { original: updatedContext.input.travelers, clamped: value });
    updatedContext.input.travelers = value;
  }
  if (updatedContext.input.budget_inr !== undefined && updatedContext.input.budget_inr !== 0) {
    const { value, warning } = clampBudget(updatedContext.input.budget_inr);
    if (warning) logger.warn('Budget clamped', { original: updatedContext.input.budget_inr, clamped: value });
    updatedContext.input.budget_inr = value;
  }

  // --- Date Sanity Check ---
  if (updatedContext.input.start_date && updatedContext.input.end_date) {
    const dateCheck = validateTripDates(updatedContext.input.start_date, updatedContext.input.end_date);
    if (!dateCheck.valid) {
      logger.warn('Date validation failed', { reason: dateCheck.reason });
      // Clear invalid dates so the missingInfoAgent will prompt the user to re-enter them
      updatedContext.input.start_date = undefined;
      updatedContext.input.end_date = undefined;
      const errorMsg = `⚠️ ${dateCheck.reason} Please provide valid travel dates.`;
      updatedContext.conversationHistory.push({ role: 'assistant', content: errorMsg });
      return {
        context: updatedContext,
        status: 'NEEDS_INFO',
        clarifyingQuestion: errorMsg,
      };
    }
  }

  // Step 2: LLM Supervisor — true agentic tool-calling routing.
  // The supervisor LLM reads the current context and decides which child agent to invoke.
  // Defensive guards below prevent hallucination-induced crashes.
  const hasDestination = !!(updatedContext.input.destination && updatedContext.input.destination.trim() !== '');

  const criticalFields = [
    updatedContext.input.origin,
    updatedContext.input.start_date,
    updatedContext.input.end_date,
    updatedContext.input.budget_inr,
    updatedContext.input.travelers,
  ];
  const hasMissingCriticalFields = criticalFields.some(
    (field) => field === undefined || field === '' || field === 0
  );

  const supervisorPrompt = getPlannerSupervisorPrompt(updatedContext.input);

  const supervisorArgsSchema = z.object({
    destination: z.string().optional().nullable(),
    origin: z.string().optional().nullable(),
    start_date: z.string().optional().nullable(),
    end_date: z.string().optional().nullable(),
    travelers: z.number().optional().nullable(),
    budget_inr: z.number().optional().nullable(),
    interests: z.array(z.string()).optional().nullable(),
  });

  const validateTripInputsTool = tool(async () => {}, {
    name: 'validate_trip_inputs',
    description: 'Identifies missing trip fields (origin, dates, budget, travelers) and asks the user for them.',
    schema: supervisorArgsSchema,
  });

  const recommendDestinationTool = tool(async () => {}, {
    name: 'recommend_destination',
    description: 'Triggers when no destination is set — suggests top destinations based on interests and budget.',
    schema: supervisorArgsSchema,
  });

  const orchestrateAndGenerateTripPlanTool = tool(async () => {}, {
    name: 'orchestrate_and_generate_trip_plan',
    description: 'Triggers when all trip parameters are complete — runs the full agent swarm to generate the itinerary.',
    schema: supervisorArgsSchema,
  });

  const supervisorLlm = createChatModel({
    temperature: 0.1,
    tools: [
      validateTripInputsTool,
      recommendDestinationTool,
      orchestrateAndGenerateTripPlanTool,
    ],
  });

  const supervisorResponse = await withRetry(() => supervisorLlm.invoke([
    new SystemMessage(supervisorPrompt),
    new HumanMessage('Choose the correct tool to invoke now.'),
  ]));

  const toolCalls = supervisorResponse.tool_calls || [];
  let selectedTool = toolCalls[0]?.name || 'validate_trip_inputs';

  logger.info(`Supervisor LLM selected tool: ${selectedTool}`, { destination: updatedContext.input.destination });

  // --- Defensive Hallucination Guards ---
  // Guard 1: LLM must not skip destination recommendation when destination is missing.
  if (selectedTool !== 'recommend_destination' && !hasDestination) {
    logger.warn('Supervisor hallucinated — destination missing but LLM skipped recommend_destination. Overriding.');
    selectedTool = 'recommend_destination';
  }
  // Guard 2: LLM must not trigger plan generation when critical fields are still missing.
  if (selectedTool === 'orchestrate_and_generate_trip_plan' && hasMissingCriticalFields) {
    logger.warn('Supervisor hallucinated — critical fields missing but LLM chose plan generation. Overriding to validate.');
    selectedTool = 'validate_trip_inputs';
  }
  // Guard 3: LLM must not route to validate when all critical fields are already present.
  // This prevents replanning being stuck in NEEDS_INFO when the user sends a short modification
  // message (e.g., "add 1 day") that doesn't contain all the trip details.
  if (selectedTool === 'validate_trip_inputs' && hasDestination && !hasMissingCriticalFields) {
    logger.warn('Supervisor chose validate_trip_inputs despite all params being present. Overriding to orchestrate.');
    selectedTool = 'orchestrate_and_generate_trip_plan';
  }

  // Flow A: Check for missing info
  if (selectedTool === 'validate_trip_inputs') {
    const checkResult = await runMissingInfoAgent(updatedContext);
    if (!checkResult.complete) {
      updatedContext.status = 'DRAFT';
      const question = checkResult.clarifyingQuestion || 'Could you please provide the missing travel details?';
      updatedContext.conversationHistory.push({ role: 'assistant', content: question });
      return {
        context: updatedContext,
        status: 'NEEDS_INFO',
        clarifyingQuestion: question
      };
    }
  }

  // Flow B: Suggest a destination
  if (selectedTool === 'recommend_destination') {
    const recommendation = await runDestinationRecAgent(updatedContext, longTermMemory);
    updatedContext.input.destination = recommendation.selectedDestination;

    const recommendedListStr = recommendation.recommendedDestinations
      .map((dest, i) => `${i + 1}. **${dest}**${dest === recommendation.selectedDestination ? ' (Recommended Top Pick)' : ''}`)
      .join('\n');

    const recommendationMessage = `🌴 **Destination Recommendations**:\n${recommendedListStr}\n\n*Why these?* ${recommendation.reasoning}\n\nI've pre-selected **${recommendation.selectedDestination}** as your destination. If you'd like a different place, just tell me — for example: *"I want to go to Chennai instead"* and I'll update it right away. Otherwise, let's fill in the remaining details!`;

    // Validate parameters again after completing destination recommend list
    const checkResult = await runMissingInfoAgent(updatedContext);
    if (!checkResult.complete) {
      updatedContext.status = 'DRAFT';
      const clarifyingQ = checkResult.clarifyingQuestion || 'Could you please provide the missing travel details?';
      const fullResponse = `${recommendationMessage}\n\nTo move forward, **${clarifyingQ}**`;
      
      updatedContext.conversationHistory.push({ role: 'assistant', content: fullResponse });
      return {
        context: updatedContext,
        status: 'NEEDS_INFO',
        clarifyingQuestion: fullResponse
      };
    } else {
      updatedContext.conversationHistory.push({ role: 'assistant', content: recommendationMessage });
    }
  }

  // Flow C: Run scheduling swarm (Parallel Retrieve + Budget + Itinerary + Synthesize)
  logger.info('Supervisor: Executing full swarm generation flow');

  // Detect if the user accepted the "Increase limit to ₹X" budget suggestion.
  // In this case we skip the early pre-enrichment infeasibility gate because:
  //  1. The suggested amount already includes a 30% buffer over raw trip costs (set in budgetAgent).
  //  2. That buffer is sufficient to cover the local-transport costs added by the enricher.
  //  3. The post-enrichment check below is still the authoritative feasibility guard.
  const isIncreaseLimitAction = /increase limit to/i.test(userMessage);

  // Trigger parallel API data-retrievals dynamically routed by the coordinator LLM
  updatedContext = await runParallelAgents(updatedContext, userMessage);

  // If a hotel is selected/recommended, fetch restaurants near it to replace general destination dining options
  const hotelQueryName = updatedContext.accommodation?.recommended || updatedContext.accommodation?.selected_hotel?.name;
  if (hotelQueryName && hotelQueryName !== 'Self Arranged' && updatedContext.input.destination) {
    try {
      logger.info(`Supervisor: Fetching restaurants near selected hotel: ${hotelQueryName}`);
      const nearHotel = await getRestaurantsNearHotel(hotelQueryName, updatedContext.input.destination);
      if (nearHotel && nearHotel.restaurants && nearHotel.restaurants.length > 0) {
        updatedContext.activities = {
          ...(updatedContext.activities || {}),
          restaurants: nearHotel.restaurants,
          restaurant_options: nearHotel.restaurant_options,
        };
        logger.info(`Supervisor: Enriched activities with ${nearHotel.restaurants.length} restaurants near ${hotelQueryName}`);
      }
    } catch (e: any) {
      logger.warn('Failed to fetch restaurants near hotel, using destination defaults', { error: e.message });
    }
  }

  // Evaluate budget feasibility programmatically
  const budgetBreakdown = await runBudgetAgent(updatedContext);
  updatedContext.budget = budgetBreakdown;

  if (!budgetBreakdown.is_feasible && !isIncreaseLimitAction) {
    updatedContext.status = 'DRAFT';
    const altMessage = `⚠️ **Budget Constraint Exceeded!**\n\nYour defined travel budget of **₹${updatedContext.input.budget_inr?.toLocaleString()}** is exceeded. The AI agents estimated the minimum trip costs to be **₹${budgetBreakdown.total_cost_inr?.toLocaleString()}**.\n\n### Recommended Suggestions:\n${(budgetBreakdown.alternatives || []).map(alt => `* 💸 ${alt}`).join('\n')}\n\n**What would you like to do?** You can select one of the saving suggestions above in the inspector panel, or reply here to adjust parameters (e.g., increase budget, reduce travelers, or shorten dates).`;
    
    const lastMsg = updatedContext.conversationHistory[updatedContext.conversationHistory.length - 1];
    if (!lastMsg || lastMsg.content !== altMessage) {
      updatedContext.conversationHistory.push({ role: 'assistant', content: altMessage });
    }
    
    return {
      context: updatedContext,
      status: 'NEEDS_INFO',
      clarifyingQuestion: altMessage,
      budgetFeasible: false,
      budgetAlternatives: budgetBreakdown.alternatives
    };
  }

  if (isIncreaseLimitAction && !budgetBreakdown.is_feasible) {
    logger.info('Budget-increase action detected: bypassing pre-enrichment gate, proceeding to itinerary generation.', {
      userBudget: updatedContext.input.budget_inr,
      estimatedCost: budgetBreakdown.total_cost_inr,
    });
    // Force the budget to reflect as feasible for the remaining steps — the enrichment step
    // will re-evaluate with the full cost (including local transport) and serve as the real gate.
    updatedContext.budget = { ...budgetBreakdown, is_feasible: true };
  }

  // Generate day-by-day JSON schedule
  const itinerary = await runItineraryAgent(updatedContext);
  
  // Enrich itinerary with local transportation costs & calibrate the budget to match!
  try {
    const enrichment = await enrichItineraryWithLocalTransport(itinerary, updatedContext);
    updatedContext.itinerary = enrichment.itinerary;
    updatedContext.budget = enrichment.budget;
    updatedContext.local_transport = enrichment.local_transport;
  } catch (enrichErr: any) {
    logger.error('Failed to post-process local travel expenses for itinerary', { error: enrichErr.message });
    updatedContext.itinerary = itinerary;
  }

  // Double check budget feasibility after local transport enrichment
  if (updatedContext.budget && !updatedContext.budget.is_feasible) {
    updatedContext.status = 'DRAFT';
    const altMessage = `⚠️ **Budget Constraint Exceeded!**\n\nYour defined travel budget of **₹${updatedContext.input.budget_inr?.toLocaleString()}** is exceeded. The AI agents estimated the minimum trip costs to be **₹${updatedContext.budget.total_cost_inr?.toLocaleString()}** (including ₹${updatedContext.budget.local_transport?.toLocaleString()} for local commutes).\n\n### Recommended Suggestions:\n${(updatedContext.budget.alternatives || []).map((alt: string) => `* 💸 ${alt}`).join('\n')}\n\n**What would you like to do?** You can select one of the saving suggestions above in the inspector panel, or reply here to adjust parameters (e.g., increase budget, reduce travelers, or shorten dates).`;
    
    const lastMsg = updatedContext.conversationHistory[updatedContext.conversationHistory.length - 1];
    if (!lastMsg || lastMsg.content !== altMessage) {
      updatedContext.conversationHistory.push({ role: 'assistant', content: altMessage });
    }
    
    return {
      context: updatedContext,
      status: 'NEEDS_INFO',
      clarifyingQuestion: altMessage,
      budgetFeasible: false,
      budgetAlternatives: updatedContext.budget.alternatives
    };
  }

  // Synthesize final Markdown planner presentation
  const formattedPlan = await synthesizeTripPlan(updatedContext);
  updatedContext.formattedPlan = formattedPlan;
  updatedContext.status = 'PLANNED';

  // Push assistant response to conversation history to retain context
  updatedContext.conversationHistory.push({ role: 'assistant', content: `Here is your trip plan:\n\n${formattedPlan}` });

  return {
    context: updatedContext,
    status: 'PLANNED',
    plan: formattedPlan,
    budgetFeasible: true
  };
}
