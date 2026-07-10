// Transport Agent — search transit options with 12-hour Redis cache.

import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import redis from '../config/redis';
import { getTransportOptions } from '../mcp-servers/transitMCP';
import logger from '../utils/logger';

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

    try {
      await redis.setex(cacheKey, 43200, JSON.stringify(data));
    } catch {
      logger.warn('Could not write transport to cache');
    }

    return JSON.stringify(data);
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
