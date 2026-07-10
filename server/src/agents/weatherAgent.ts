// Weather Agent — fetches forecast data and checks the Redis cache first.
// Cache key is destination+date range. TTL is 6 hours because weather
// forecasts don't change that rapidly. This saves OpenMeteo API calls.

import redis from '../config/redis';
import { getWeatherForecast } from '../mcp-servers/weatherMCP';
import logger from '../utils/logger';

export async function runWeatherAgent(
  destination: string,
  start_date: string,
  end_date: string
): Promise<{ forecast: any[] }> {
  // Redis key format: weather:Chennai:2025-10-15:2025-10-20
  const cacheKey = `weather:${destination}:${start_date}:${end_date}`;

  try {
    // Check cache first — if it's there, use it (avoids external API call)
    const cached = await redis.get(cacheKey);
    if (cached) {
      logger.debug('Cache HIT — weather', { cacheKey });
      return JSON.parse(cached);
    }
  } catch {
    // Redis is down — continue without cache, directly call MCP
    logger.warn('Redis unavailable, bypassing weather cache');
  }

  // Cache miss — fetch from OpenMeteo via MCP
  logger.debug('Cache MISS — fetching weather from MCP', { cacheKey });
  const weatherData = await getWeatherForecast(destination, start_date, end_date);

  try {
    // Store in Redis with 6-hour TTL (21600 seconds)
    await redis.setex(cacheKey, 21600, JSON.stringify(weatherData));
  } catch {
    logger.warn('Could not write weather to Redis cache');
  }

  return weatherData;
}
