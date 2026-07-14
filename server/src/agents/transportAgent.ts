// Transport Agent — search transit options (flights, trains, buses).
// Includes real flights, multiple train classes, and bus options.
// Supports user selection of preferred transport mode.

import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { ChatGroq } from '@langchain/groq';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { getTransportOptions } from '../mcp-servers/transitMCP';
import { withRetry } from '../utils/retry';
import logger from '../utils/logger';

const llm = new ChatGroq({
  apiKey: process.env.GROQ_API_KEY,
  model: 'llama-3.1-8b-instant',
  temperature: 0.3,
});

export const transportTool = tool(
  async ({ origin, destination, travel_date, travelers }) => {
    logger.debug('Transport tool fetching from MCP', { origin, destination, travel_date, travelers });
    const data = await getTransportOptions(origin, destination, travel_date, travelers);

    // Standalone LLM Reasoning Phase
    let reasoning = '';
    try {
      const systemPrompt = `You are TripPlanner's Transport Routing Specialist Agent. 
Analyze the travel transit options from ${origin} to ${destination} for ${travelers} traveler(s) on ${travel_date}.
Options include flights, trains (various classes), and buses.
Briefly explain the best option for speed vs cost, which class is recommended, and any transit tips in 2-3 sentences. Keep it short.`;
      const llmRes = await withRetry(() => llm.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage(JSON.stringify(data)),
      ]));
      reasoning = llmRes.content.toString();
    } catch (err) {
      logger.error('Transport Agent reasoning analysis failed', err);
      reasoning = 'Transit options are scheduled and recommended based on speed and cost.';
    }

    // Default selected option is the cheapest
    const selectedOption = data.options.reduce((cheapest: any, curr: any) =>
      curr.cost_inr < cheapest.cost_inr ? curr : cheapest, data.options[0] || null);

    const finalResult = {
      ...data,
      selected_option: selectedOption,
      reasoning,
    };

    return JSON.stringify(finalResult);
  },
  {
    name: 'fetch_transport',
    description: 'Search transit and travel options (flights, trains in multiple classes, buses) from an origin city to a destination with real pricing and ratings.',
    schema: z.object({
      origin: z.string().describe('Origin city name'),
      destination: z.string().describe('Destination city name'),
      travel_date: z.string().describe('Travel departure date (YYYY-MM-DD)'),
      travelers: z.number().describe('Number of travelers'),
    }),
  }
);
