// Planner Agent — The swarm Supervisor.
// Rather than using static controller steps, the Planner Agent acts as a Supervisor model,
// extracting user inputs and dynamically selecting which child agent tool to route to.

import { ChatGroq } from '@langchain/groq';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { runMissingInfoAgent } from './missingInfoAgent';
import { runDestinationRecAgent } from './destinationRecAgent';
import { runParallelAgents, synthesizeTripPlan } from './coordinatorAgent';
import { runBudgetAgent } from './budgetAgent';
import { runItineraryAgent } from './itineraryAgent';
import { withRetry } from '../utils/retry';
import logger from '../utils/logger';
import { validateTripDates, clampTravelers, clampBudget } from '../utils/inputSanitizer';

const llm = new ChatGroq({
  apiKey: process.env.GROQ_API_KEY,
  model: 'llama-3.1-8b-instant', // Fast model for slots and supervisor routing
  temperature: 0.1,
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

  const recentHistory = context.conversationHistory
    .slice(-4)
    .map((msg) => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
    .join('\n');

  const extractionPrompt = `You are a travel planning assistant. Analyze the latest user reply and context to extract travel parameters.
  
Today's Date: ${currentDateStr}
Reference Year: ${currentYear}

Slot definitions to extract:
- destination: The target vacation/visit city (e.g. "Manali").
- origin: The departure/starting city (e.g. "Coimbatore").
- start_date: Start date of travel (YYYY-MM-DD format).
- end_date: End date of travel (YYYY-MM-DD format).
- travelers: Total count of travelers (integer).
- budget_inr: Budget limit in INR (integer).
- interests: User interests (array of strings).

Crucial Rules:
0. **Destination Override (HIGHEST PRIORITY):** If the user explicitly states they want to travel TO a specific named city or place — using phrases like "I want to go to X", "take me to X", "plan a trip to X", "destination is X", "X instead", "change to X", "I prefer X" — you MUST extract that place as the "destination", overriding any previously set destination. This applies even if a destination is already set in the current known parameters.
1. For all OTHER location mentions (not prefixed with destination intent), identify if it is the "origin" (departure city) or the "destination" using recent chat history (e.g., if assistant asked "What is your departure city?" and user replies "Coimbatore", that is the "origin"). Do NOT overwrite the existing destination with the origin.
2. If the user mentions a relative date like "15th july", format it as "${currentYear}-07-15" using the Reference Year ${currentYear}.
3. If you can determine the trip duration (e.g., "5-day trip") and have the start_date (e.g., "${currentYear}-07-15"), please calculate and populate the end_date accordingly (e.g., 5 days from July 15 is "${currentYear}-07-20").
4. If the user asks to adjust the dates, shorten the trip, or reduce the duration (e.g. "Reduce duration of trip by 1 or 2 days" or "shorten dates"), you must compute a new end_date by subtracting the specified number of days from the current end_date (for example, if current end_date is "2026-07-23" and user requests to reduce by 1 day, you must output "2026-07-22").
5. The "destination" must be a concrete, specific city, town, or tourist spot (like "Manali", "Shimla", "Gulmarg", "Ooty", "Goa"). If the user specifies a general region, category, environment, or description (like "snow hill station", "beach side", "mountains", "desert"), do NOT put it in destination. Instead, add it to the "interests" array (e.g., ["snow hill station"]) and leave "destination" as an empty string ("").
6. Return ONLY valid JSON with this exact structure (leave fields empty string or 0 if missing):
{
  "destination": "string or empty",
  "origin": "string or empty",  
  "start_date": "YYYY-MM-DD or empty",
  "end_date": "YYYY-MM-DD or empty",
  "travelers": number or 0,
  "budget_inr": number or 0,
  "interests": ["array", "of", "strings"]
}

Current known parameters: ${JSON.stringify(context.input)}
Recent chat context:
${recentHistory || '(No history yet)'}
`;

  const extractionResponse = await withRetry(() => llm.invoke([
    new SystemMessage(extractionPrompt),
    new HumanMessage(userMessage),
  ]));

  let updatedInput = { ...context.input };
  try {
    const jsonMatch = extractionResponse.content.toString().match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const extracted = JSON.parse(jsonMatch[0]);
      // Merge values (do not overwrite with empty values)
      updatedInput = {
        ...context.input,
        ...Object.fromEntries(
          Object.entries(extracted).filter(([_, v]) => v !== '' && v !== 0 && (Array.isArray(v) ? v.length > 0 : true))
        )
      };
    }
  } catch (err) {
    logger.warn('Failed to parse json slots inside Supervisor extractor');
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

  // Step 2: Deterministic supervisor routing — no LLM needed here.
  // Rule 1: If no destination is set, always recommend one first.
  // Rule 2: If destination exists but other critical fields are missing, ask for them.
  // Rule 3: If all fields are present, generate the full plan.
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

  let selectedTool: string;
  if (!hasDestination) {
    selectedTool = 'recommend_destination';
  } else if (hasMissingCriticalFields) {
    selectedTool = 'validate_trip_inputs';
  } else {
    selectedTool = 'orchestrate_and_generate_trip_plan';
  }

  logger.info(`Supervisor: Deterministic routing → ${selectedTool}`, {
    hasDestination,
    hasMissingCriticalFields,
    destination: updatedContext.input.destination,
  });

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

  // Trigger parallel API data-retrievals dynamically routed by the coordinator LLM
  updatedContext = await runParallelAgents(updatedContext, userMessage);

  // Evaluate budget feasibility programmatically
  const budgetBreakdown = await runBudgetAgent(updatedContext);
  updatedContext.budget = budgetBreakdown;

  if (!budgetBreakdown.is_feasible) {
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

  // Generate day-by-day JSON schedule
  const itinerary = await runItineraryAgent(updatedContext);
  updatedContext.itinerary = itinerary;

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
