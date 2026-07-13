// Exponential backoff retry wrapper.
// We wrap ALL MCP/external API calls in this.
// Why? External APIs fail. This gives them 3 chances with increasing wait times
// before we give up and return a cached or graceful fallback.

import logger from './logger';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface RetryOptions {
  maxRetries?: number;   // Default: 3 attempts total
  baseDelay?: number;    // Default: 2000ms between attempts
  backoffFactor?: number; // Default: 2x (2s → 4s → 8s)
  timeout?: number;       // Default: 8000ms per attempt
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  let {
    maxRetries = 4,
    baseDelay = 2000,
    backoffFactor = 2,
    timeout = 10000,
  } = options;

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    let timeoutId: any;
    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('Request timeout')), timeout);
      });

      const result = await Promise.race([
        fn(),
        timeoutPromise,
      ]);
      clearTimeout(timeoutId);
      return result;
    } catch (error: any) {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      lastError = error as Error;

      // Detect Groq or general API rate limits (HTTP 429)
      const errObj = error as any;
      const errMsg = String(
        errObj?.message || 
        errObj?.error?.error?.message || 
        errObj?.error?.message || 
        ''
      );
      
      const isRateLimit = 
        errObj?.status === 429 || 
        errObj?.name === 'RateLimitQuotaExhaustedError' || 
        errMsg.toLowerCase().includes('rate limit') || 
        errMsg.toLowerCase().includes('rate_limit_exceeded');

      if (isRateLimit) {
        // Boost max retries dynamically to ensure we get through the rate limit window
        if (maxRetries < 5) {
          maxRetries = 5;
        }

        // Try to parse wait time (e.g., "try again in 3.35s")
        let delayMs = 4000;
        const match = errMsg.match(/try again in ([\d\.]+)s/i) || errMsg.match(/try again after ([\d\.]+)s/i);
        if (match) {
          delayMs = Math.ceil(parseFloat(match[1]) * 1000) + 1000; // Add 1s safety buffer
        }
        
        logger.warn(`Rate limit hit during API call (attempt ${attempt}/${maxRetries}). Backing off for ${delayMs}ms.`, {
          message: errMsg.slice(0, 150)
        });

        if (attempt < maxRetries) {
          await sleep(delayMs);
          continue;
        }
      }

      if (attempt < maxRetries) {
        // Standard exponential backoff + jitter
        const delay = baseDelay * Math.pow(backoffFactor, attempt - 1);
        const jitter = Math.random() * 1000 - 500;
        await sleep(Math.max(0, delay + jitter));
      }
    }
  }

  throw lastError;
}
