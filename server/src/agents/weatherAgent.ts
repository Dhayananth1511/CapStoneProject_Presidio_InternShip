// Weather Agent — exposes a LangChain tool to fetch forecast data with Redis caching.
// Cache TTL is 6 hours to save OpenMeteo API calls.

import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { ChatGroq } from '@langchain/groq';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import redis from '../config/redis';
import { getWeatherForecast } from '../mcp-servers/weatherMCP';
import logger from '../utils/logger';

const llm = new ChatGroq({
  apiKey: process.env.GROQ_API_KEY,
  model: 'llama-3.1-8b-instant', // Fast, low-latency reasoning model for micro-agent tasks
  temperature: 0.3,
});

export const weatherTool = tool(
  async ({ destination, start_date, end_date }) => {
    const cacheKey = `weather:${destination}:${start_date}:${end_date}`;

    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        logger.debug('Cache HIT — weather tool', { cacheKey });
        return cached; 
      }
    } catch {
      logger.warn('Redis unavailable, bypassing weather cache');
    }

    logger.debug('Cache MISS — weather tool fetching from MCP', { cacheKey });
    const weatherData = await getWeatherForecast(destination, start_date, end_date);

    // Standalone LLM Reasoning Phase
    let reasoning = '';
    try {
      const systemPrompt = `You are VoyageFlow's Climate Specialist Agent. 
Analyze the following raw weather forecast data for ${destination} from ${start_date} to ${end_date}.
Briefly explain if the conditions are favorable for travel, note the average temperature, and give minor clothing/packing advice in 2-3 friendly sentences. Keep it short.`;
      const llmRes = await llm.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage(JSON.stringify(weatherData)),
      ]);
      reasoning = llmRes.content.toString();
    } catch (err) {
      logger.error('Weather Agent reasoning analysis failed', err);
      reasoning = 'Weather parameters are favorable for local activities.';
    }

    const finalResult = {
      ...weatherData,
      reasoning,
    };

    const finalResultString = JSON.stringify(finalResult);
    try {
      await redis.setex(cacheKey, 21600, finalResultString);
    } catch {
      logger.warn('Could not write weather to Redis cache');
    }

    return finalResultString;
  },
  {
    name: 'fetch_weather',
    description: 'Fetch the weather forecast for a destination city within a start and end date range.',
    schema: z.object({
      destination: z.string().describe('The destination city name'),
      start_date: z.string().describe('Starting travel date (YYYY-MM-DD)'),
      end_date: z.string().describe('Ending travel date (YYYY-MM-DD)'),
    }),
  }
);
