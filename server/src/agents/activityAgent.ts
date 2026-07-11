// Activity Agent — search local attractions with 24-hour Redis cache.

import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { ChatGroq } from '@langchain/groq';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import redis from '../config/redis';
import { getPlacesNearby } from '../mcp-servers/mapsMCP';
import logger from '../utils/logger';

const llm = new ChatGroq({
  apiKey: process.env.GROQ_API_KEY,
  model: 'llama-3.1-8b-instant',
  temperature: 0.3,
});

export const activityTool = tool(
  async ({ destination, interests, days }) => {
    const cacheKey = `activities:${destination}:${interests.join('-')}:${days}d`;

    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        logger.debug('Cache HIT — activities tool', { cacheKey });
        return cached;
      }
    } catch {
      logger.warn('Redis unavailable for activities cache');
    }

    logger.debug('Cache MISS — activities tool fetching from MCP', { cacheKey });
    const data = await getPlacesNearby(destination, interests, days);

    // Standalone LLM Reasoning Phase
    let reasoning = '';
    try {
      const systemPrompt = `You are VoyageFlow's Local Sightseeing & Activities Specialist Agent. 
Analyze the suggested places in ${destination} for a ${days}-day trip matching traveler interests: ${interests.join(', ')}.
Briefly explain if these matches fit traveler preferences, and highlight 2-3 key landmark recommendations in 2-3 sentences. Keep it short.`;
      const llmRes = await llm.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage(JSON.stringify(data)),
      ]);
      reasoning = llmRes.content.toString();
    } catch (err) {
      logger.error('Activity Agent reasoning analysis failed', err);
      reasoning = 'Local sight-seeing options align with generic adventure preferences.';
    }

    const finalResult = {
      ...data,
      reasoning,
    };

    const finalResultString = JSON.stringify(finalResult);
    try {
      await redis.setex(cacheKey, 86450, finalResultString);
    } catch {
      logger.warn('Could not write activities to cache');
    }

    return finalResultString;
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
