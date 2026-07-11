// Transport Agent — search transit options with 12-hour Redis cache.

import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { ChatGroq } from '@langchain/groq';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import redis from '../config/redis';
import { getTransportOptions } from '../mcp-servers/transitMCP';
import logger from '../utils/logger';

const llm = new ChatGroq({
  apiKey: process.env.GROQ_API_KEY,
  model: 'llama-3.1-8b-instant',
  temperature: 0.3,
});

export const transportTool = tool(
  async ({ origin, destination, travel_date, travelers }) => {
    const cacheKey = `transport:${origin}:${destination}:${travel_date}:t${travelers}`;

    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        logger.debug('Cache HIT — transport options tool', { cacheKey });
        return cached;
      }
    } catch {
      logger.warn('Redis unavailable for transport cache');
    }

    logger.debug('Cache MISS — transport options tool fetching from MCP', { cacheKey });
    const data = await getTransportOptions(origin, destination, travel_date, travelers);

    // Standalone LLM Reasoning Phase
    let reasoning = '';
    try {
      const systemPrompt = `You are VoyageFlow's Transport Routing Specialist Agent. 
Analyze the travel transit options from ${origin} to ${destination} for ${travelers} travelers on ${travel_date}.
Briefly explain if the pricing is reasonable, which option is fastest/best, and any transit tips in 2-3 sentences. Keep it short.`;
      const llmRes = await llm.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage(JSON.stringify(data)),
      ]);
      reasoning = llmRes.content.toString();
    } catch (err) {
      logger.error('Transport Agent reasoning analysis failed', err);
      reasoning = 'Transit options are scheduled and recommended based on speed.';
    }

    const finalResult = {
      ...data,
      reasoning,
    };

    const finalResultString = JSON.stringify(finalResult);
    try {
      await redis.setex(cacheKey, 43200, finalResultString);
    } catch {
      logger.warn('Could not write transport to cache');
    }

    return finalResultString;
  },
  {
    name: 'fetch_transport',
    description: 'Search transit and travel options (cars, trains, flights) from an origin city to a destination.',
    schema: z.object({
      origin: z.string().describe('Origin city name'),
      destination: z.string().describe('Destination city name'),
      travel_date: z.string().describe('Travel departure date (YYYY-MM-DD)'),
      travelers: z.number().describe('Number of travelers'),
    }),
  }
);
