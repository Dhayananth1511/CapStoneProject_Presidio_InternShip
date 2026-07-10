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

export async function runParallelAgents(context: TripContext): Promise<TripContext> {
  const { input } = context;
  const days = input.start_date && input.end_date
    ? (new Date(input.end_date).getTime() - new Date(input.start_date).getTime()) / (1000 * 60 * 60 * 24)
    : 5;

  logger.info('Starting parallel agent execution', {
    destination: input.destination,
    agents: ['weather', 'transport', 'accommodation', 'activity'],
  });

  // Promise.allSettled means all 4 run simultaneously but we wait for ALL to finish
  // Even if one fails, the others continue — resilient parallel execution
  const [weatherResult, transportResult, accomResult, activityResult] = await Promise.allSettled([
    runWeatherAgent(input.destination!, input.start_date!, input.end_date!),
    runTransportAgent(input.origin || 'Chennai', input.destination!, input.start_date!, input.travelers || 1),
    runAccommodationAgent(input.destination!, input.start_date!, input.end_date!, input.travelers || 1),
    runActivityAgent(input.destination!, input.interests || [], days),
  ]);

  // Extract results, log any failures (don't crash — partial data is still useful)
  return {
    ...context,
    weather: weatherResult.status === 'fulfilled' ? weatherResult.value : { forecast: [] },
    transport: transportResult.status === 'fulfilled' ? transportResult.value : { options: [], estimated_cost_inr: 1500 },
    accommodation: accomResult.status === 'fulfilled' ? accomResult.value : { hotels: [], recommended: 'TBD', price_per_night: 2000 },
    activities: activityResult.status === 'fulfilled' ? activityResult.value : { attractions: [], restaurants: [], timings: '', entry_fees: '₹0' },
  };
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
