// Accommodation Agent — search hotels with 1-hour Redis cache.

import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import redis from '../config/redis';
import { searchHotels } from '../mcp-servers/bookingMCP';
import logger from '../utils/logger';

export const accommodationTool = tool(
  async ({ destination, check_in, check_out, travelers }) => {
    const cacheKey = `hotels:${destination}:${check_in}:${check_out}:${travelers}`;

    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        logger.debug('Cache HIT — hotel options tool', { cacheKey });
        return cached;
      }
    } catch {
      logger.warn('Redis unavailable for hotel cache');
    }

    logger.debug('Cache MISS — hotel options tool fetching from MCP', { cacheKey });
    const data = await searchHotels(destination, check_in, check_out, travelers);

    try {
      await redis.setex(cacheKey, 3600, JSON.stringify(data));
    } catch {
      logger.warn('Could not write hotels to cache');
    }

    return JSON.stringify(data);
  },
  {
    name: 'fetch_accommodation',
    description: 'Search for recommended hotels in a destination city/area for specific dates and guest count.',
    schema: z.object({
      destination: z.string().describe('Destination city/area name'),
      check_in: z.string().describe('Check-in travel date (YYYY-MM-DD)'),
      check_out: z.string().describe('Check-out travel date (YYYY-MM-DD)'),
      travelers: z.number().describe('Number of guests/travelers'),
    }),
  }
);
