import Redis from 'ioredis';
import logger from '../utils/logger';

// Create the Redis client using the REDIS_URL environment variable
// Defaults to local Redis on port 6379
const redis = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
  maxRetriesPerRequest: 3,
  lazyConnect: true // Prevent server crash if Redis isn't running yet in development
});

// Listener: Log when Redis successfully attaches
redis.on('connect', () => {
  logger.info('Redis connection established successfully');
});

// Listener: Warn if Redis connection drops
redis.on('error', (err) => {
  // We use warning instead of error to signify that the app can still run.
  // Cache is an optimization, not a critical runtime dependency. If Redis is down, 
  // we bypass cache and hit external APIs directly.
  logger.warn(`Redis connection warning: ${err.message}`);
});

export default redis;
