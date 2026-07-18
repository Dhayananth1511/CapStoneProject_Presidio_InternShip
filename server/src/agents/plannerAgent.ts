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
import { runLocalTransitAgent } from './localTransitAgent';
import { getRestaurantsNearHotel } from '../mcp-servers/mapsMCP';
import { withRetry } from '../utils/retry';
import logger from '../utils/logger';
import { validateTripDates, clampTravelers, clampBudget } from '../utils/inputSanitizer';
import { createChatModel } from '../utils/llm';

const llm = createChatModel({
  temperature: 0.1,
});

import { TripContext, PlannerAgentResult } from '../types';
import { extractJson } from '../utils/jsonHelpers';


export async function runPlannerAgent(
  userMessage: string,
  context: TripContext,
  longTermMemory: string,
  confirmCancel?: boolean
): Promise<PlannerAgentResult> {
  const currentYear = new Date().getFullYear();
  const currentDateStr = new Date().toISOString().split('T')[0];

  // We slice context history up to 12 turns so that earlier requirements (e.g. "5-day trip")
  // are not lost while slot gathering proceeds.
  const recentHistory = context.conversationHistory
    .slice(-12)
    .map((msg) => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
    .join('\n');

  // Step 0: User message classification (Relevance and Cancellation checking)
  const classificationPrompt = `You are an intent classifier for a personalized AI Travel Planner application.
Analyze the user's latest message (and optionally the recent message history) and classify it into one of these intents:
1. "CANCEL": The user explicitly asks to cancel, discard, abort, delete, reset or discard the current trip planning session or planned trip (e.g., "cancel the trip", "discard this", "cancel please", "reset trip", "clear this planning", "delete it", "drop it", "drop").
2. "IRRELEVANT": The user's query is completely unrelated to travel planning, vacations, itineraries, hotel/transport bookings, destination recommendations, or trip budgets.
3. "RELEVANT": The user is planning a trip, discussing destinations, dates, budgets, travelers, transport, accommodations, activities, asking travel questions, or responding to clarifying questions (like providing dates, e.g., "23rd", "23 rd", "23", "july 23 rd", "10 days", "3 travelers").

CRITICAL RULES:
- A user message providing dates or numbers (e.g. "23 rd", "23rd", "23", "15th", "5", "5 days", "₹50000") is a direct answer to a travel planning slot (like travel dates, travelers count, or budget) and must ALWAYS be classified as "RELEVANT". Never classify date/number inputs or short suffix dates as "CANCEL" or "IRRELEVANT".
- Check the Recent History to contextualize short user replies. If the assistant previously asked for travel parameters (dates, budget, destination, interests, travelers) and the user responded with dates or numbers, classify it as "RELEVANT".

You must respond ONLY with a valid JSON block of this exact structure:
{
  "intent": "CANCEL" | "IRRELEVANT" | "RELEVANT",
  "reasoning": "brief explanation"
}`;

  let classificationIntent = "RELEVANT";
  try {
    const classificationResponse = await withRetry(() => llm.invoke([
      new SystemMessage(classificationPrompt),
      new HumanMessage(`User Message: ${userMessage}\n\nRecent History:\n${recentHistory || '(No history)'}`),
    ]));
    const parsedClass = extractJson(classificationResponse.content.toString());
    if (parsedClass && (parsedClass.intent === 'CANCEL' || parsedClass.intent === 'IRRELEVANT')) {
      classificationIntent = parsedClass.intent;
    }
  } catch (err: any) {
    logger.warn('Failed to classify user intent, defaulting to RELEVANT', { error: err.message });
  }

  if (classificationIntent === 'CANCEL') {
    const lowerMsg = userMessage.toLowerCase();
    const hasDateIndicators = /\b(july|june|august|september|october|november|december|january|february|march|april|may)\b/i.test(lowerMsg) ||
      /\b\d{1,2}(st|nd|rd|th)?\b/i.test(lowerMsg) ||
      /\b(start|end|date|dates|budget|travelers|members|people|days|weeks|months)\b/i.test(lowerMsg);
      
    if (hasDateIndicators && !/\b(cancel|abort|discard|delete|remove|clear)\b/i.test(lowerMsg)) {
      logger.info('Supervisor Override: Intent classified as CANCEL, but contains date/parameter keywords. Bypassing CANCEL.', { sessionId: context.sessionId });
      classificationIntent = 'RELEVANT';
    }
  }

  if (classificationIntent === 'CANCEL') {
    if (confirmCancel) {
      logger.info('Supervisor: User requested trip cancellation (confirmed).', { sessionId: context.sessionId });
      // Preserve ALL existing trip data — only mark the status as CANCELLED.
      // Data clearing is reserved for the "Delete Permanently" action only.
      const updatedContext: TripContext = {
        ...context,
        status: 'CANCELLED',
      };
      const cancelMsg = `✅ Understood! Your trip plan to **${context.input?.destination || 'your destination'}** has been cancelled. All your planning details have been saved and you can find it in your Cancelled Trips tab.\n\nLet me know whenever you're ready to plan your next adventure! 🌍`;
      updatedContext.conversationHistory.push({ role: 'assistant', content: cancelMsg });
      return {
        context: updatedContext,
        status: 'NEEDS_INFO',
        clarifyingQuestion: cancelMsg,
      };
    } else {
      logger.info('Supervisor: User cancellation intent detected, requesting confirmation prompt.', { sessionId: context.sessionId });
      // Return a status indicating confirmation is needed without changing the context status.
      return {
        context,
        status: 'NEEDS_CANCEL_CONFIRM',
      };
    }
  }

  if (classificationIntent === 'IRRELEVANT') {
    logger.info('Supervisor: User message classified as irrelevant to travel planning.', { sessionId: context.sessionId });
    const updatedContext: TripContext = { ...context };
    const irrelevantMsg = "I am a dedicated travel assistant. I can only help you with travel-related queries such as suggesting destinations, planning itineraries, managing budgets, and transportation. Please let me know how I can help plan your next trip!";
    updatedContext.conversationHistory.push({ role: 'assistant', content: irrelevantMsg });
    return {
      context: updatedContext,
      status: 'NEEDS_INFO',
      clarifyingQuestion: irrelevantMsg,
    };
  }

  logger.info('Supervisor: Extracting slot parameters from user message', { sessionId: context.sessionId });

  // Step 1: Parameter Slot Extraction
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

  // --- India Location Validation ---
  if (updatedInput.destination && updatedInput.destination.trim() !== '') {
    const inIndia = await checkIfDestinationInIndia(updatedInput.destination);
    if (!inIndia) {
      logger.warn('Validation failed: Non-Indian destination requested', { destination: updatedInput.destination });
      
      // Clear the invalid destination
      updatedInput.destination = undefined;
      updatedContext.input.destination = undefined;
      
      const errorMsg = `⚠️ I can only plan trips for destinations in India. Please specify an Indian destination (e.g. Manali, Ooty, Goa, Kerala, Delhi).`;
      updatedContext.conversationHistory.push({ role: 'assistant', content: errorMsg });
      return {
        context: updatedContext,
        status: 'NEEDS_INFO',
        clarifyingQuestion: errorMsg,
      };
    }
  }

  // --- Destination Change Guard ---
  // If the user has explicitly changed the destination (e.g. "change destination to Mumbai"),
  // all previously cached agent outputs are stale and MUST be cleared.
  // Without this, the old hotel, local transit, weather, transport and activities from the
  // previous destination survive into the new plan because `runParallelAgents` sees
  // `hasExistingPlanData === true` and skips re-fetching, and `local_transport` is never
  // cleared by the chat path (only the reject/replan path clears it).
  const previousDestination = (context.input.destination || '').trim().toLowerCase();
  const newDestination = (updatedInput.destination || '').trim().toLowerCase();
  const destinationChanged =
    previousDestination !== '' &&           // there was a prior destination
    newDestination !== '' &&                // a new destination was extracted
    previousDestination !== newDestination; // and they are different

  const previousStartDate = context.input.start_date;
  const newStartDate = updatedInput.start_date;
  const previousEndDate = context.input.end_date;
  const newEndDate = updatedInput.end_date;

  const datesChanged =
    (previousStartDate && newStartDate && previousStartDate !== newStartDate) ||
    (previousEndDate && newEndDate && previousEndDate !== newEndDate);

  if (destinationChanged || datesChanged) {
    logger.info(
      `Supervisor: ${destinationChanged ? 'Destination' : 'Dates'} changed. Clearing all stale cached agent outputs.`,
      { sessionId: context.sessionId }
    );
    updatedContext.weather = undefined;
    updatedContext.transport = undefined;
    updatedContext.accommodation = undefined;
    updatedContext.activities = undefined;
    updatedContext.budget = undefined;
    updatedContext.itinerary = undefined;
    updatedContext.local_transport = undefined;
    updatedContext.formattedPlan = undefined;
  }

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

  // --- Stale Past-Date Guard (Programmatic Safety Net) ---
  // When the user sends a modification message (e.g. "increase 2 days", "change hotel"),
  // the LLM extractor may accidentally re-emit the *first* start_date the user ever typed
  // (which could already be in the past). Detect this and silently restore the valid
  // start_date that was already approved inside the existing context.
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const extractedStart = updatedContext.input.start_date ? new Date(updatedContext.input.start_date) : null;
  const contextStart = context.input.start_date ? new Date(context.input.start_date) : null;
  if (
    extractedStart &&
    extractedStart < today &&        // Newly extracted date is in the past
    contextStart &&
    contextStart >= today            // But the context already had a valid future date
  ) {
    logger.warn(
      `Stale date guard triggered: LLM re-emitted past start_date "${updatedContext.input.start_date}". ` +
      `Restoring valid context date "${context.input.start_date}".`,
      { sessionId: context.sessionId }
    );
    updatedContext.input.start_date = context.input.start_date;
    // Also restore end_date if it wasn't explicitly extended in this turn
    if (!updatedContext.input.end_date || updatedContext.input.end_date === context.input.end_date) {
      updatedContext.input.end_date = context.input.end_date;
    }
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
    duration_days: z.number().optional().nullable(),
    max_price_per_night: z.number().optional().nullable(),
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
  
  // Run Local Transit Agent — calculates hotel→attraction distances and commute costs.
  // Always re-runs so data stays consistent with the selected hotel and itinerary.
  try {
    const transitResult = await runLocalTransitAgent(itinerary, updatedContext);
    updatedContext.itinerary = transitResult.itinerary;
    updatedContext.budget = transitResult.budget;
    updatedContext.local_transport = transitResult.local_transport;
  } catch (transitErr: any) {
    logger.error('[plannerAgent] LocalTransitAgent failed, using raw itinerary', { error: transitErr.message });
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

async function checkIfDestinationInIndia(destination: string): Promise<boolean> {
  const normalizedDest = destination.trim().toLowerCase();
  if (normalizedDest === '') return true;

  // Set of common Indian cities & regions to skip LLM call
  const commonIndianCities = new Set([
    'mumbai', 'delhi', 'bangalore', 'bengaluru', 'hyderabad', 'ahmedabad', 'chennai', 'kolkata', 'surat', 'pune',
    'jaipur', 'lucknow', 'kanpur', 'indore', 'thane', 'bhopal', 'visakhapatnam', 'patna', 'vadodara', 'ghaziabad',
    'ludhiana', 'agra', 'nashik', 'faridabad', 'meerut', 'rajkot', 'kalyan', 'vasai', 'varanasi', 'srinagar',
    'aurangabad', 'dhanbad', 'amritsar', 'navi mumbai', 'allahabad', 'prayagraj', 'howrah', 'gwalior', 'jabalpur', 'coimbatore',
    'vijayawada', 'jodhpur', 'madurai', 'raipur', 'kota', 'chandigarh', 'guwahati', 'solapur', 'hubli', 'dharwad',
    'bareilly', 'mysore', 'mysuru', 'tiruchirappalli', 'trichy', 'gurgaon', 'gurugram', 'aligarh', 'jalandhar', 'bhubaneswar',
    'salem', 'warangal', 'guntur', 'raurkela', 'rourkela', 'noida', 'kochi', 'cochin', 'thiruvananthapuram', 'trivandrum',
    'dehradun', 'jammu', 'ooty', 'manali', 'shimla', 'goa', 'darjeeling', 'munnar', 'wayanad', 'pondicherry', 'puducherry',
    'rishikesh', 'haridwar', 'varanasi', 'alleppey', 'alappuzha', 'kovalam', 'hampi', 'khajuraho', 'ajanta', 'ellora',
    'udaipur', 'jaisalmer', 'jodhpur', 'pushkar', 'ranthambore', 'kaziranga', 'leh', 'ladakh', 'spiti', 'mussoorie',
    'nainital', 'ranikhet', 'kodaikanal', 'coorg', 'kodagu', 'kumarakom', 'varkala', 'gokarna', 'mahabaleshwar', 'lonavala',
    'shirdi', 'tirupati', 'shillong', 'gangtok', 'cherrapunji', 'tawang', 'dharamshala', 'mcleodganj', 'dalhousie', 'gulmarg',
    'pahalgam', 'sonamarg', 'katra', 'andaman', 'nicobar', 'port blair', 'havelock', 'neil island', 'lakshadweep', 'kavaratti',
    'mahabalipuram', 'mamallapuram', 'madurai', 'rameshwaram', 'kanyakumari', 'tirupati', 'chittuoor', 'nellore', 'tirunelveli',
    'vellore', 'kanchipuram', 'pondicherry', 'trichy', 'tanjore', 'thanjavur', 'chidambaram', 'umbray', 'ooty', 'coonoor',
    'kotagiri', 'yercaud', 'valparai', 'munnar', 'thekkady', 'vagamon', 'alleppey', 'kumarakom', 'varkala', 'kovalam',
    'poovar', 'kollam', 'ashtamudi', 'bekal', 'wayanad', 'kabini', 'bandipur', 'mudumalai', 'nagarhole', 'coorg',
    'chikmagalur', 'gokarna', 'murudeshwar', 'udupi', 'mangalore', 'hampi', 'badami', 'pattadakal', 'aihole', 'bijapur',
    'vijayapura', 'mysore', 'kabini', 'bandipur', 'belur', 'halebidu', 'shravanabelagola', 'jog falls', 'dandeli', 'nandi hills',
    'bengaluru', 'bangalore', 'coimbatore', 'ooty', 'kodaikanal', 'munnar', 'wayanad', 'kerala'
  ]);

  if (commonIndianCities.has(normalizedDest)) {
    return true;
  }

  // Set of common international cities for fast reject
  const commonIntCities = new Set([
    'paris', 'london', 'new york', 'nyc', 'tokyo', 'singapore', 'dubai', 'bangkok', 'phuket', 'bali',
    'sydney', 'melbourne', 'rome', 'milan', 'venice', 'florence', 'barcelona', 'madrid', 'amsterdam', 'berlin',
    'munich', 'frankfurt', 'zurich', 'geneva', 'vienna', 'prague', 'budapest', 'istanbul', 'cairo', 'cape town',
    'rio de janeiro', 'buenos aires', 'toronto', 'vancouver', 'montreal', 'san francisco', 'los angeles', 'la',
    'chicago', 'miami', 'las vegas', 'seattle', 'boston', 'washington', 'dublin', 'edinburgh', 'copenhagen', 'oslo',
    'stockholm', 'helsinki', 'reykjavik', 'athens', 'santorini', 'mykonos', 'split', 'dubrovnik', 'krakow', 'warsaw',
    'moscow', 'st petersburg', 'kyiv', 'seoul', 'beijing', 'shanghai', 'hong kong', 'macau', 'taipei', 'manila',
    'hanoi', 'ho chi minh', 'saigon', 'kuala lumpur', 'jakarta', 'maldives', 'male', 'colombo', 'kathmandu', 'pokhara',
    'lhasa', 'thimphu', 'paro', 'dhaka', 'karachi', 'lahore', 'islamabad', 'tehran', 'baghdad', 'damascus',
    'beirut', 'tel aviv', 'jerusalem', 'amman', 'petra', 'riyadh', 'jeddah', 'doha', 'abu dhabi', 'muscat',
    'nairobi', 'mombasa', 'zanzibar', 'dar es salaam', 'johannesburg', 'cairo', 'marrakesh', 'casablanca', 'tunis', 'algiers'
  ]);

  if (commonIntCities.has(normalizedDest)) {
    return false;
  }

  // Fallback to LLM for other locations
  try {
    const checkLlm = createChatModel({ temperature: 0.1 });
    const systemPrompt = `You are a geographical validation assistant.
Identify if the given location is located in India.
Location: "${destination}"

You must respond ONLY with a valid JSON block of this exact structure:
{
  "isInIndia": true | false,
  "reasoning": "brief explanation"
}`;

    const response = await withRetry(() => checkLlm.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(`Validate location: ${destination}`),
    ]));

    const parsed = extractJson(response.content.toString().trim());
    return parsed.isInIndia === true;
  } catch (err: any) {
    logger.warn('Failed to validate location via LLM, falling back to false for safety', { error: err.message });
    return false;
  }
}
