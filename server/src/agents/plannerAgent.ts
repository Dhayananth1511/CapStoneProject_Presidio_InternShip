// Planner Agent — The swarm Supervisor.
// Rather than using static controller steps, the Planner Agent acts as a Supervisor model,
// extracting user inputs and dynamically selecting which child agent tool to route to.

import { ChatGroq } from '@langchain/groq';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { runMissingInfoAgent } from './missingInfoAgent';
import { runDestinationRecAgent } from './destinationRecAgent';
import { runParallelAgents, synthesizeTripPlan } from './coordinatorAgent';
import { runBudgetAgent } from './budgetAgent';
import { runItineraryAgent } from './itineraryAgent';
import logger from '../utils/logger';

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
1. Identify if a location mentioned is the "origin" (departure city) or the "destination". Use the recent chat history to determine this (e.g., if the assistant asked "What is your departure city?" and the user replies "Coimbatore", then "Coimbatore" is the "origin", NOT the "destination"). Do NOT overwrite the existing destination with the origin.
2. If the user mentions a relative date like "15th july", format it as "${currentYear}-07-15" using the Reference Year ${currentYear}.
3. If you can determine the trip duration (e.g., "5-day trip") and have the start_date (e.g., "${currentYear}-07-15"), please calculate and populate the end_date accordingly (e.g., 5 days from July 15 is "${currentYear}-07-20").
4. If the user asks to adjust the dates, shorten the trip, or reduce the duration (e.g. "Reduce duration of trip by 1 or 2 days" or "shorten dates"), you must compute a new end_date by subtracting the specified number of days from the current end_date (for example, if current end_date is "2026-07-23" and user requests to reduce by 1 day, you must output "2026-07-22").
5. Return ONLY valid JSON with this exact structure (leave fields empty string or 0 if missing):
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

  const extractionResponse = await llm.invoke([
    new SystemMessage(extractionPrompt),
    new HumanMessage(userMessage),
  ]);

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

  // Step 2: Supervisor delegation using Tool Binding
  const supervisorPrompt = `You are the lead travel coordinator supervisor. Examine the current trip input parameters and choose the appropriate child agent tool.

Current trip variables: ${JSON.stringify(updatedContext.input)}

Delegation Guidelines:
1. If any critical variables (destination, start_date, end_date, budget_inr, travelers) are missing or 0, you MUST delegate to "validate_trip_inputs".
2. If destination is empty/missing, you can call "recommend_destination".
3. If all trip parameters are present and complete, delegate to "orchestrate_and_generate_trip_plan" to build the travel itinerary.

You must invoke exactly one tool.`;

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
    description: 'Analyzes inputs, identifies missing slots, and generates helpful questions for missing dates/budget/travelers.',
    schema: supervisorArgsSchema,
  });

  const recommendDestinationTool = tool(async () => {}, {
    name: 'recommend_destination',
    description: 'Triggers when no destination is chosen, presenting selection lists to the user.',
    schema: supervisorArgsSchema,
  });

  const orchestrateAndGenerateTripPlanTool = tool(async () => {}, {
    name: 'orchestrate_and_generate_trip_plan',
    description: 'Triggers when all parameters are ready, coordinating concurrent API requests, safety checks, and printing the itinerary.',
    schema: supervisorArgsSchema,
  });

  const supervisorWithTools = llm.bindTools([
    validateTripInputsTool,
    recommendDestinationTool,
    orchestrateAndGenerateTripPlanTool,
  ]);

  const supervisorResponse = await supervisorWithTools.invoke([
    new SystemMessage(supervisorPrompt),
    new HumanMessage('Delegate the next workflow executor tool call.')
  ]);

  const toolCalls = supervisorResponse.tool_calls || [];
  let selectedTool = toolCalls[0]?.name || 'validate_trip_inputs';

  // Defensive validation guard: Ensure critical fields exist before executing plan coordination.
  // This prevents LLM tool-calling hallucinations from crashing the downstream MCP APIs.
  const fieldsToCheck = [
    updatedContext.input.destination,
    updatedContext.input.start_date,
    updatedContext.input.end_date,
    updatedContext.input.budget_inr,
    updatedContext.input.travelers
  ];
  const hasMissingCriticalFields = fieldsToCheck.some(field => field === undefined || field === '' || field === 0);

  if (selectedTool === 'orchestrate_and_generate_trip_plan' && hasMissingCriticalFields) {
    logger.warn('Supervisor hallucinated plan generation but critical fields are missing. Overriding selection to validation.');
    selectedTool = 'validate_trip_inputs';
  }

  logger.info(`Supervisor: Delegating task execution to tool: ${selectedTool}`);

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

    // Validate parameters again after completing destination recommend list
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
