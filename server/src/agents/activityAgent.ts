import redis from '../config/redis';
import { getPlacesNearby } from '../mcp-servers/mapsMCP';
import logger from '../utils/logger';

export async function runActivityAgent(destination: string, interests: string[], days: number) {
  const cacheKey = `activities:${destination}:${interests.join('-')}:${days}d`;

  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      logger.debug('Cache HIT — activities', { cacheKey });
      return JSON.parse(cached);
    }
  } catch { 
    logger.warn('Redis unavailable for activities cache'); 
  }

  const data = await getPlacesNearby(destination, interests, days);

  try {
    // 24-hour cache for attractions and restaurants since they remain stable
    await redis.setex(cacheKey, 86400, JSON.stringify(data));
  } catch { 
    logger.warn('Could not write activities to cache'); 
  }

  return data;
}
