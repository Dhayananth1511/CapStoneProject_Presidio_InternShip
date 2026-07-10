// Activity Agent — search local attractions with 24-hour Redis cache.

import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import redis from '../config/redis';
import { getPlacesNearby } from '../mcp-servers/mapsMCP';
import logger from '../utils/logger';

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

    try {
      await redis.setex(cacheKey, 86400, JSON.stringify(data));
    } catch {
      logger.warn('Could not write activities to cache');
    }

    return JSON.stringify(data);
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
