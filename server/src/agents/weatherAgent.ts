// Weather Agent — exposes a LangChain tool to fetch forecast data with Redis caching.
// Cache TTL is 6 hours to save OpenMeteo API calls.

import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import redis from '../config/redis';
import { getWeatherForecast } from '../mcp-servers/weatherMCP';
import logger from '../utils/logger';

export const weatherTool = tool(
  async ({ destination, start_date, end_date }) => {
    const cacheKey = `weather:${destination}:${start_date}:${end_date}`;

    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        logger.debug('Cache HIT — weather tool', { cacheKey });
        return cached; // Return string format for the LLM
      }
    } catch {
      logger.warn('Redis unavailable, bypassing weather cache');
    }

    logger.debug('Cache MISS — weather tool fetching from MCP', { cacheKey });
    const weatherData = await getWeatherForecast(destination, start_date, end_date);

    try {
      await redis.setex(cacheKey, 21600, JSON.stringify(weatherData));
    } catch {
      logger.warn('Could not write weather to Redis cache');
    }

    return JSON.stringify(weatherData);
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
