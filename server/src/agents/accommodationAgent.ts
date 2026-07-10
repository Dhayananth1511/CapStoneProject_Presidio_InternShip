import redis from '../config/redis';
import { searchHotels } from '../mcp-servers/bookingMCP';
import logger from '../utils/logger';

export async function runAccommodationAgent(
  destination: string,
  check_in: string,
  check_out: string,
  travelers: number
) {
  const cacheKey = `hotels:${destination}:${check_in}:${check_out}:${travelers}`;

  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      logger.debug('Cache HIT — hotel options', { cacheKey });
      return JSON.parse(cached);
    }
  } catch { 
    logger.warn('Redis unavailable for hotel cache'); 
  }

  const data = await searchHotels(destination, check_in, check_out, travelers);

  try {
    // 1-hour cache TTL because hotel pricing changes faster
    await redis.setex(cacheKey, 3600, JSON.stringify(data));
  } catch { 
    logger.warn('Could not write hotels to cache'); 
  }

  return data;
}
