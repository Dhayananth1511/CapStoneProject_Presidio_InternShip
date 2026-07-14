// Activity Agent — search local attractions and restaurants.

import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { ChatGroq } from '@langchain/groq';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { searchHotelbedsActivities } from '../mcp-servers/hotelbedsActivitiesMCP';
import { getPlacesNearby } from '../mcp-servers/mapsMCP';
import { withRetry } from '../utils/retry';
import logger from '../utils/logger';

const llm = new ChatGroq({
  apiKey: process.env.GROQ_API_KEY,
  model: 'llama-3.1-8b-instant',
  temperature: 0.3,
});

export const activityTool = tool(
  async ({ destination, interests, days, travelers }) => {
    logger.debug('Activity tool fetching from MCP', { destination, interests, days });
    let data: any;
    try {
      data = await searchHotelbedsActivities(destination, interests, days, travelers || 1);
      const nearby = await getPlacesNearby(destination, interests, days);
      data = {
        ...data,
        restaurants: nearby.restaurants,
        restaurant_options: (nearby as any).restaurant_options || [],
        attraction_options: (nearby as any).attraction_options || [],
        timings: nearby.timings,
      };
    } catch {
      data = await getPlacesNearby(destination, interests, days);
    }

    // Standalone LLM Reasoning Phase
    let reasoning = '';
    try {
      const systemPrompt = `You are TripPlanner's Local Sightseeing & Activities Specialist Agent. 
Analyze the suggested places in ${destination} for a ${days}-day trip matching traveler interests: ${interests.join(', ')}.
Briefly explain if these matches fit traveler preferences, and highlight 2-3 key landmark recommendations in 2-3 sentences. Keep it short.`;
      const llmRes = await withRetry(() => llm.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage(JSON.stringify(data)),
      ]));
      reasoning = llmRes.content.toString();
    } catch (err) {
      logger.error('Activity Agent reasoning analysis failed', err);
      reasoning = 'Local sight-seeing options align with generic adventure preferences.';
    }

    const finalResult = {
      ...data,
      reasoning,
    };

    return JSON.stringify(finalResult);
  },
  {
    name: 'fetch_activities',
    description: 'Search for restaurants, attractions, local sightseeing locations, and food spots near a destination city matching interests.',
    schema: z.object({
      destination: z.string().describe('Destination city name'),
      interests: z.array(z.string()).describe('List of traveler interest categories'),
      days: z.number().describe('Duration of the trip in days'),
      travelers: z.number().optional().describe('Number of travelers'),
    }),
  }
);
