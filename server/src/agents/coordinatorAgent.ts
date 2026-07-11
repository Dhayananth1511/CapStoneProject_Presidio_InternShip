// Coordinator Agent — the orchestrator and final synthesizer.
// Coordinates dynamic tool execution using LangChain Tool-Calling and compiles the Markdown plan.

import { ChatGroq } from '@langchain/groq';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { TripContext } from './plannerAgent';
import { weatherTool } from './weatherAgent';
import { transportTool } from './transportAgent';
import { accommodationTool } from './accommodationAgent';
import { activityTool } from './activityAgent';
import logger from '../utils/logger';

const llm = new ChatGroq({
  apiKey: process.env.GROQ_API_KEY,
  model: 'llama-3.3-70b-versatile',
  temperature: 0.5,
});

const routerLlm = new ChatGroq({
  apiKey: process.env.GROQ_API_KEY,
  model: 'llama-3.1-8b-instant', // Fast model used for dynamic tool routing
  temperature: 0.1,
});

const modelWithTools = routerLlm.bindTools([
  weatherTool,
  transportTool,
  accommodationTool,
  activityTool,
]);

export async function runParallelAgents(context: TripContext, userMessage: string): Promise<TripContext> {
  const { input } = context;
  const days = input.start_date && input.end_date
    ? (new Date(input.end_date).getTime() - new Date(input.start_date).getTime()) / (1000 * 60 * 60 * 24)
    : 5;

  logger.info('Starting Dynamic LLM Tool router analysis', { userMessage });

  const systemPrompt = `You are an intelligent travel supervisor. Based on the user query and current state, call the appropriate tools.
Rules:
1. If this is the initial planning session (i.e. context contains mostly empty fields or no weather/hotel/transit data is fetched), call ALL four tools:
   - fetch_weather (requires destination, start_date, end_date)
   - fetch_transport (requires origin, destination, travel_date, travelers)
   - fetch_accommodation (requires destination, check_in, check_out, travelers)
   - fetch_activities (requires destination, interests, days)
2. If this is a modification (re-planning) request, call ONLY the tool(s) specific to the user's requirements:
   - "change hotel" or "find different lodging" or choosing a cheaper hotel tier -> call ONLY fetch_accommodation
   - "add food spots" or "new interests" -> call ONLY fetch_activities
   - "change dates" -> dates impact transit, accommodation, and weather, so call fetch_weather, fetch_transport, and fetch_accommodation.
3. For fetch_accommodation, you must pass the optional "tier" parameter based on the user's details:
   - If user asks to choose a cheaper hotel tier, save money on lodging, or requests budget/cheap options, pass tier="budget".
   - If user requests luxury, high-end, premium, or expensive options, pass tier="luxury".
   - If user requests normal, mid-range, average, or moderate options, pass tier="mid-range".
Ensure you populate tool arguments using the current context: destination="${input.destination || ''}", origin="${input.origin || ''}", start_date="${input.start_date || ''}", end_date="${input.end_date || ''}", travelers=${input.travelers || 0}, days=${days}, interests=${JSON.stringify(input.interests || [])}.`;

  const response = await modelWithTools.invoke([
    new SystemMessage(systemPrompt),
    new HumanMessage(`User query: "${userMessage}"\n\nCurrent context state: ${JSON.stringify({
      hasWeather: !!context.weather?.forecast?.length,
      hasTransport: !!context.transport?.options?.length,
      hasAccommodation: !!context.accommodation?.hotels?.length,
      hasActivities: !!context.activities?.attractions?.length,
    })}`)
  ]);

  const toolCalls = response.tool_calls || [];
  logger.info('LLM Router tool selection result', { toolCallsCount: toolCalls.length, toolCalls: toolCalls.map(t => t.name) });

  // If the LLM did not choose any tools despite missing data, fall back to executing all tools
  if (toolCalls.length === 0 && (!context.weather?.forecast?.length || !context.accommodation?.hotels?.length)) {
    logger.warn('LLM chose no tools on empty context. Falling back to executing all tools.');
    toolCalls.push(
      { name: 'fetch_weather', args: { destination: input.destination!, start_date: input.start_date!, end_date: input.end_date! } },
      { name: 'fetch_transport', args: { origin: input.origin!, destination: input.destination!, travel_date: input.start_date!, travelers: input.travelers } },
      { name: 'fetch_accommodation', args: { destination: input.destination!, check_in: input.start_date!, check_out: input.end_date!, travelers: input.travelers } },
      { name: 'fetch_activities', args: { destination: input.destination!, interests: input.interests || [], days } }
    );
  }

  // 1. Prepare dynamic promises based on LLM-selected tool calls
  const promises = toolCalls.map(async (toolCall) => {
    const toolName = toolCall.name;
    const args = toolCall.args;

    let rawResult: any;
    if (toolName === 'fetch_weather') {
      rawResult = await weatherTool.invoke(args as any);
    } else if (toolName === 'fetch_transport') {
      rawResult = await transportTool.invoke(args as any);
    } else if (toolName === 'fetch_accommodation') {
      rawResult = await accommodationTool.invoke(args as any);
    } else if (toolName === 'fetch_activities') {
      rawResult = await activityTool.invoke(args as any);
    } else {
      throw new Error(`Unknown tool chosen by LLM: ${toolName}`);
    }

    const resultString = typeof rawResult === 'string'
      ? rawResult
      : (rawResult && 'content' in rawResult ? String(rawResult.content) : JSON.stringify(rawResult));

    return { name: toolName, value: JSON.parse(resultString) };
  });

  // 2. Concurrently resolve tool execution calls
  const results = await Promise.allSettled(promises);

  // 3. Update only the fields retrieved by the tool calls, leaving other context fields untouched (preserving context)
  const newContext = { ...context };

  results.forEach((res) => {
    if (res.status === 'fulfilled') {
      const { name, value } = res.value;
      if (name === 'fetch_weather') newContext.weather = value;
      else if (name === 'fetch_transport') newContext.transport = value;
      else if (name === 'fetch_accommodation') newContext.accommodation = value;
      else if (name === 'fetch_activities') newContext.activities = value;
    } else {
      const err = res.reason;
      logger.error('Dynamic tool call failed during concurrent execution', { 
        errorMessage: err?.message || String(err), 
        errorStack: err?.stack 
      });
    }
  });

  return newContext;
}

export async function synthesizeTripPlan(context: TripContext): Promise<string> {
  const response = await llm.invoke([
    new SystemMessage(
      `You are a travel content writer. Create a beautiful, structured markdown travel plan.
       Include: trip overview, weather summary, transport details, hotel, day-by-day schedule, 
       budget breakdown table, and packing tips. Use emojis and formatting.`
    ),
    new HumanMessage(JSON.stringify(context, null, 2)),
  ]);

  return response.content.toString();
}
