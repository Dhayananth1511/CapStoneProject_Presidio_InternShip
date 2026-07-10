// Coordinator Agent — the orchestrator and final synthesizer.
// Stage 1: dispatches parallel agents using Promise.allSettled()
// Stage 2: collects results and builds the final markdown plan
// It's the "manager" that other agents report their outputs to.

import { ChatGroq } from '@langchain/groq';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { TripContext } from './plannerAgent';
import { runWeatherAgent } from './weatherAgent';
import { runTransportAgent } from './transportAgent';
import { runAccommodationAgent } from './accommodationAgent';
import { runActivityAgent } from './activityAgent';
import logger from '../utils/logger';

const llm = new ChatGroq({
  apiKey: process.env.GROQ_API_KEY,
  model: 'llama3-70b-8192',
  temperature: 0.5,
});

const routerLlm = new ChatGroq({
  apiKey: process.env.GROQ_API_KEY,
  model: 'llama3-8b-8192',
  temperature: 0.1,
});

export async function runParallelAgents(context: TripContext, userMessage: string): Promise<TripContext> {
  const { input } = context;
  const days = input.start_date && input.end_date
    ? (new Date(input.end_date).getTime() - new Date(input.start_date).getTime()) / (1000 * 60 * 60 * 24)
    : 5;

  logger.info('Starting router analysis for concurrent agents', { userMessage });

  // 1. Prompt router LLM to analyze the user message and identify necessary tool calls
  const systemPrompt = `You are a travel agent orchestrator routing user updates to the appropriate tools.
Your job is to decide which agents must run to fetch or modify data.
Available agents:
- "weather" (runs for weather forecast lookup for destination and date range)
- "transport" (runs for trains, buses, and flight schedule search)
- "accommodation" (runs for hotel search)
- "activities" (runs for sights, restaurants, and attraction suggestions)

Rules:
1. If this is the initial planning session (i.e. context contains mostly empty fields or no weather/transport/hotel is populated), execute ALL four agents.
2. If this is a modification (replanning) request, select ONLY the agents that must be updated. For example:
   - "change hotel" or "find cheap lodging" -> ONLY "accommodation"
   - "change travel date" or "go on other days" -> requires updating "weather", "transport", and "accommodation" (since dates change all these)
   - "add food spots" or "new sightseeing interests" -> ONLY "activities"
   - "change budget" -> "accommodation" (to re-evaluate hotel selection tiers)
3. Return ONLY a valid JSON object with the exact layout: { "execute": ["agent1", "agent2"] }`;

  const response = await routerLlm.invoke([
    new SystemMessage(systemPrompt),
    new HumanMessage(`User query: "${userMessage}"\n\nCurrent context state: ${JSON.stringify({
      hasWeather: !!context.weather?.forecast?.length,
      hasTransport: !!context.transport?.options?.length,
      hasAccommodation: !!context.accommodation?.hotels?.length,
      hasActivities: !!context.activities?.attractions?.length,
      input: context.input
    })}`)
  ]);

  let agentsToRun = ['weather', 'transport', 'accommodation', 'activities']; // default fallback
  try {
    const jsonMatch = response.content.toString().match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed.execute)) {
        agentsToRun = parsed.execute;
      }
    }
  } catch (error) {
    logger.warn('Failed to parse router decision, defaulting to running all agents', { error });
  }

  logger.info('Orchestration decision computed', { agentsToRun });

  // 2. Prepare execution promises dynamically based on routing decision
  const promises: Promise<any>[] = [];
  const activeAgentNames: string[] = [];

  if (agentsToRun.includes('weather')) {
    promises.push(runWeatherAgent(input.destination!, input.start_date!, input.end_date!));
    activeAgentNames.push('weather');
  }
  if (agentsToRun.includes('transport')) {
    promises.push(runTransportAgent(input.origin || 'Chennai', input.destination!, input.start_date!, input.travelers || 1));
    activeAgentNames.push('transport');
  }
  if (agentsToRun.includes('accommodation')) {
    promises.push(runAccommodationAgent(input.destination!, input.start_date!, input.end_date!, input.travelers || 1));
    activeAgentNames.push('accommodation');
  }
  if (agentsToRun.includes('activities')) {
    promises.push(runActivityAgent(input.destination!, input.interests || [], days));
    activeAgentNames.push('activities');
  }

  // 3. Multi-agent concurrent execution
  const results = await Promise.allSettled(promises);

  // 4. Update the TripContext, keeping previous values if they were not re-run
  const newContext = { ...context };

  results.forEach((result, index) => {
    const name = activeAgentNames[index];
    if (result.status === 'fulfilled') {
      (newContext as any)[name] = result.value;
    } else {
      logger.error(`Agent failed in flight: ${name}`, { reason: result.reason });
      // Keep previous or write empty fallback
      if (!(newContext as any)[name]) {
        if (name === 'weather') newContext.weather = { forecast: [] };
        else if (name === 'transport') newContext.transport = { options: [], estimated_cost_inr: 1500 };
        else if (name === 'accommodation') newContext.accommodation = { hotels: [], recommended: 'TBD', price_per_night: 2000 };
        else if (name === 'activities') newContext.activities = { attractions: [], restaurants: [], timings: '', entry_fees: '₹0' };
      }
    }
  });

  return newContext;
}

export async function synthesizeTripPlan(context: TripContext): Promise<string> {
  // Takes the complete TripContext and asks the LLM to write a beautiful markdown summary
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
