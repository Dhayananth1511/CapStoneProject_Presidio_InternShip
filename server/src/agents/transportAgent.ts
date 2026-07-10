import redis from '../config/redis';
import { getTransportOptions } from '../mcp-servers/transitMCP';
import logger from '../utils/logger';

export async function runTransportAgent(
  origin: string, 
  destination: string, 
  travel_date: string, 
  travelers: number = 1
) {
  const cacheKey = `transport:${origin}:${destination}:${travel_date}:t${travelers}`;

  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      logger.debug('Cache HIT — transport', { cacheKey });
      return JSON.parse(cached);
    }
  } catch { 
    logger.warn('Redis unavailable for transport cache'); 
  }

  const data = await getTransportOptions(origin, destination, travel_date, travelers);

  try {
    // 12-hour cache — transport schedules are stable within a day
    await redis.setex(cacheKey, 43200, JSON.stringify(data));
  } catch { 
    logger.warn('Could not write transport to cache'); 
  }

  return data;
}
